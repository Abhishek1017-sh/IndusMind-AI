"""
Chat starter questions must be grounded in the user's own uploaded documents —
never the old hardcoded demo prompts, and empty when nothing is uploaded.
"""
import io
import uuid

from conftest import register_user, auth_headers


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


_DEMO_PROMPTS = {
    "Why did Pump P-101 fail?",
    "Show SOP for Boiler-02",
    "Compare E-201 and E-202 records",
    "Summarize Jamnagar refinery compliance",
}


def test_no_documents_returns_no_suggestions(client):
    token = register_user(client, unique_email("sugg-empty"))
    resp = client.get("/api/v1/chat/suggestions", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["suggestions"] == []


def test_suggestions_reference_the_uploaded_document(client):
    token = register_user(client, unique_email("sugg-doc"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("TurbineInspection.txt", io.BytesIO(
            b"Inspection Report per ISO 9001. The gas turbine was inspected every 30 days."
        ), "text/plain")})

    resp = client.get("/api/v1/chat/suggestions", headers=headers)
    assert resp.status_code == 200, resp.text
    suggestions = resp.json()["suggestions"]

    assert suggestions, "should produce grounded suggestions once a document exists"
    # None of the old hardcoded demo prompts leak through.
    assert not (_DEMO_PROMPTS & set(suggestions))
    # At least one suggestion references something real from THIS document
    # (its filename, or the ISO 9001 standard it cites).
    blob = " ".join(suggestions).lower()
    assert "turbineinspection" in blob or "iso 9001" in blob or "compliance" in blob
