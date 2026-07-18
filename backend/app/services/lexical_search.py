"""
Lexical retrieval over the PostgreSQL source of truth (`document_chunks`).

FAISS handles semantic similarity, but pure-lexical retrievers are what catch
exact codes, acronyms, numbers and dates ("2026", "R&D", "P-102") that
embedding similarity routinely under-ranks. This module adds two of them, both
reading directly from Postgres (never a side copy), so retrieval always
reflects exactly what is stored:

  • PostgreSQL Full-Text Search — `to_tsvector` / `to_tsquery` with `ts_rank`
    (Postgres only; skipped on SQLite used by the test suite).
  • BM25 — classic Okapi BM25 keyword ranking, computed in Python over the
    user's chunks; works on every backend (Postgres and SQLite).

Both are scoped to the requesting user's own documents and return records in
the same shape as the FAISS retriever ({page_content, metadata, score}) so the
reciprocal-rank-fusion reranker can merge them uniformly.
"""
import logging
import math
import re
import uuid
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentChunk

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
# to_tsquery is strict about its input; only alphanumeric lexemes are safe to
# feed it, OR-joined for maximum recall ("never say not-found prematurely").
_TSQUERY_SAFE_RE = re.compile(r"^[a-z0-9]+$")


def _coerce_uuid(user_id: Any) -> Any:
    """Accept a str or UUID user id; return something the ORM can bind."""
    if isinstance(user_id, uuid.UUID):
        return user_id
    try:
        return uuid.UUID(str(user_id))
    except (ValueError, TypeError):
        return user_id


def _record(row_content: str, document_id: Any, chunk_index: Any, filename: str,
            user_id: Any, score: float, retriever: str) -> Dict[str, Any]:
    return {
        "page_content": row_content,
        "metadata": {
            "document_id": str(document_id) if document_id is not None else None,
            "chunk_index": chunk_index,
            "filename": filename,
            "user_id": str(user_id) if user_id is not None else None,
        },
        "score": float(score),
        "retriever": retriever,
    }


def postgres_fts_search(
    db: Session, terms: List[str], user_id: Any, k: int = 15
) -> List[Dict[str, Any]]:
    """
    PostgreSQL native full-text search over the user's chunks. Returns [] on any
    non-Postgres backend (e.g. the SQLite test DB) or when no term is usable.
    """
    if db is None:
        return []
    try:
        if db.get_bind().dialect.name != "postgresql":
            return []
    except Exception:
        return []

    safe_terms = [t for t in terms if _TSQUERY_SAFE_RE.match(t)]
    if not safe_terms:
        return []
    tsquery = " | ".join(safe_terms)  # OR for recall; ts_rank orders relevance

    sql = text(
        """
        SELECT dc.content AS content,
               dc.document_id AS document_id,
               dc.chunk_index AS chunk_index,
               d.filename AS filename,
               ts_rank(to_tsvector('english', dc.content),
                       to_tsquery('english', :tsq)) AS rank
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE d.uploaded_by = :uid
          AND to_tsvector('english', dc.content) @@ to_tsquery('english', :tsq)
        ORDER BY rank DESC
        LIMIT :k
        """
    )
    try:
        rows = db.execute(sql, {"tsq": tsquery, "uid": _coerce_uuid(user_id), "k": k}).fetchall()
    except Exception as e:  # malformed tsquery, etc. — degrade gracefully
        logger.warning("PostgreSQL FTS query failed (%s); skipping FTS retriever.", e)
        return []

    return [
        _record(r.content, r.document_id, r.chunk_index, r.filename, user_id,
                float(r.rank or 0.0), "postgres_fts")
        for r in rows
    ]


def _load_user_chunks(db: Session, user_id: Any) -> List[Dict[str, Any]]:
    rows = (
        db.query(
            DocumentChunk.content,
            DocumentChunk.document_id,
            DocumentChunk.chunk_index,
            Document.filename,
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(Document.uploaded_by == _coerce_uuid(user_id))
        .all()
    )
    return [
        {"content": r.content, "document_id": r.document_id,
         "chunk_index": r.chunk_index, "filename": r.filename}
        for r in rows
    ]


def bm25_search(
    db: Session, terms: List[str], user_id: Any, k: int = 15,
    k1: float = 1.5, b: float = 0.75,
) -> List[Dict[str, Any]]:
    """
    Okapi BM25 keyword ranking over the user's chunks (works on any DB backend).

    BM25 is the industry-standard sparse retriever: it rewards chunks where the
    query terms are frequent but discounts terms that are common across the
    whole corpus, and normalizes for chunk length — so a short chunk that is
    squarely about "R&D budget 2026" outranks a long one that merely mentions
    "budget" in passing.
    """
    query_terms = [t for t in terms if t]
    if db is None or not query_terms:
        return []

    try:
        chunks = _load_user_chunks(db, user_id)
    except Exception as e:
        logger.warning("BM25 could not load chunks (%s); skipping BM25 retriever.", e)
        return []
    if not chunks:
        return []

    tokenized = [_TOKEN_RE.findall(c["content"].lower()) for c in chunks]
    doc_len = [len(toks) for toks in tokenized]
    avgdl = (sum(doc_len) / len(doc_len)) or 1.0
    n_docs = len(chunks)

    # Document frequency per query term.
    q_set = set(query_terms)
    df: Dict[str, int] = {t: 0 for t in q_set}
    doc_tf: List[Dict[str, int]] = []
    for toks in tokenized:
        tf: Dict[str, int] = {}
        present = set()
        for tok in toks:
            if tok in q_set:
                tf[tok] = tf.get(tok, 0) + 1
                present.add(tok)
        doc_tf.append(tf)
        for tok in present:
            df[tok] += 1

    idf = {
        t: math.log(1 + (n_docs - df[t] + 0.5) / (df[t] + 0.5))
        for t in q_set
    }

    scored = []
    for i, tf in enumerate(doc_tf):
        if not tf:
            continue
        score = 0.0
        for t, f in tf.items():
            denom = f + k1 * (1 - b + b * doc_len[i] / avgdl)
            score += idf[t] * (f * (k1 + 1)) / (denom or 1.0)
        if score > 0:
            scored.append((score, i))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, i in scored[:k]:
        c = chunks[i]
        results.append(
            _record(c["content"], c["document_id"], c["chunk_index"], c["filename"],
                    user_id, score, "bm25")
        )
    return results
