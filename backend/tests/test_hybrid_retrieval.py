"""
Hybrid AI-Chat retrieval: alias normalization, BM25 keyword ranking, and the
end-to-end fix for "the data exists but the question fails" — e.g. asking for
the "2026 R&D budget" when the document says "Research and Development
allocation for fiscal year 2026". Fully offline (no Gemini, SQLite backend).
"""
import io
import uuid

from conftest import register_user, auth_headers
from app.services.query_normalizer import expand_query
from app.services.gemini_service import not_found_message


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


# ── Alias normalization ──────────────────────────────────────────────────────

def test_expand_query_maps_rnd_to_research_and_development():
    exp = expand_query("What is the 2026 R&D budget?")
    # The acronym is expanded to its full form for lexical + semantic matching.
    assert "research" in exp.lexical_terms
    assert "development" in exp.lexical_terms
    assert "budget" in exp.lexical_terms
    assert "2026" in exp.lexical_terms          # numbers are preserved
    assert "research and development" in exp.semantic_query.lower()
    assert exp.matched_aliases                  # recorded for debug logging


def test_expand_query_handles_underscore_and_spaced_forms():
    for variant in ("R_and_D spend", "R and D spend", "Research & Development spend"):
        exp = expand_query(variant)
        assert "research" in exp.lexical_terms and "development" in exp.lexical_terms


def test_expand_query_covers_domain_acronyms():
    assert "repair" in expand_query("MTTR target").lexical_terms          # Mean Time To Repair
    assert "capital" in expand_query("CapEx plan").lexical_terms          # Capital Expenditure
    assert "expenditure" in expand_query("CapEx plan").lexical_terms


def test_expand_query_passthrough_when_no_alias():
    exp = expand_query("pump vibration reading")
    assert exp.semantic_query == "pump vibration reading"
    assert not exp.matched_aliases


# ── BM25 keyword ranking over the Postgres/SQLite source of truth ────────────

def test_bm25_ranks_the_chunk_that_contains_the_terms(client):
    """BM25 (via query_normalizer terms) should surface the exact chunk."""
    from app.db.session import SessionLocal
    from app.services import lexical_search

    token = register_user(client, unique_email("bm25"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("budget.txt", io.BytesIO(
            b"Company overview and mission statement.\n\n"
            b"The Research and Development allocation for fiscal year 2026 is 4.2 million USD.\n\n"
            b"Marketing spend is unrelated boilerplate text about brand awareness."
        ), "text/plain")})

    exp = expand_query("What is the 2026 R&D budget?")
    db = SessionLocal()
    try:
        # We need this user's id to scope retrieval.
        from app.models.user import User
        me = db.query(User).filter(User.email.like("bm25-%")).order_by(User.created_at.desc()).first()
        hits = lexical_search.bm25_search(db, exp.lexical_terms, str(me.id), k=5)
    finally:
        db.close()

    assert hits, "BM25 must retrieve at least one chunk"
    assert "Research and Development allocation" in hits[0]["page_content"]


# ── End-to-end chat: the headline failure case ──────────────────────────────

def test_chat_answers_rnd_budget_question_though_wording_differs(client):
    token = register_user(client, unique_email("chat-rnd"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("finance.txt", io.BytesIO(
            b"Annual Financial Plan.\n\n"
            b"The Research and Development allocation for fiscal year 2026 is 4.2 million USD, "
            b"an increase over the prior year to fund new product lines."
        ), "text/plain")})

    resp = client.post("/api/v1/chat/", headers=headers, json={"message": "What is the 2026 R&D budget?"})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # The question must NOT fail with "not found" — retrieval + alias expansion
    # bridge "R&D budget" ↔ "Research and Development allocation".
    assert body["response"].strip() != not_found_message("What is the 2026 R&D budget?")
    assert "4.2 million" in body["response"] or "Research and Development" in body["response"]
    # And the answer is grounded in the actual source document.
    assert any(c["document_name"] == "finance.txt" for c in body["citations"])


def test_chat_still_says_not_found_when_data_truly_absent(client):
    """Grounding is preserved: an unrelated question is not answered from thin air."""
    token = register_user(client, unique_email("chat-absent"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("safety.txt", io.BytesIO(
            b"Fire drill procedure. Evacuate via the north stairwell every quarter."
        ), "text/plain")})

    resp = client.post("/api/v1/chat/", headers=headers,
                       json={"message": "What is the 2026 R&D budget?"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["response"].strip() == not_found_message("What is the 2026 R&D budget?")
    assert body["citations"] == []
