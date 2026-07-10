"""
Shared report-generation service. Builds a real PDF report from the existing
knowledge base (FAISS chunks + Neo4j relationships, via the maintenance/
compliance/knowledge agents), persists a Report row, and returns it. Used by
BOTH the /reports/generate endpoint and the AI chat's REPORTS intent, so a
report requested in chat actually appears in the Reports section (rather than
the old stub that only claimed to).
"""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.report import Report, ReportType
from app.models.user import User
from app.services.report_generator import generate_pdf_report
from app.services.vector_store import vector_store
from app.services.graph_db import graph_db
from app.agents.compliance_agent import compliance_agent
from app.agents.maintenance_agent import maintenance_agent
from app.agents.knowledge_agent import knowledge_agent

logger = logging.getLogger(__name__)


def infer_report_type(text: str) -> ReportType:
    """
    Picks the most fitting report type from a free-text request (used when a
    report is asked for in chat, which has no explicit type selector).
    """
    t = text.lower()
    if any(k in t for k in ("root cause", "rca", "why did", "failure analysis")):
        return ReportType.RCA
    if any(k in t for k in ("compliance", "audit", "sop adherence", "deviation")):
        return ReportType.COMPLIANCE
    if any(k in t for k in ("maintenance", "work order", "servicing", "repair history")):
        return ReportType.MAINTENANCE
    if any(k in t for k in ("inspection", "checklist", "condition")):
        return ReportType.INSPECTION
    # "annual report", "summary", "overview", "performance", etc.
    return ReportType.EXECUTIVE


def gather_context(query: str, user_id: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """
    Pulls the shared knowledge base for a report: retrieved chunks (FAISS),
    per-source citations, and graph relationship triples (Neo4j) relevant to
    the query. Reused across every report type.
    """
    chunks = vector_store.search(query, k=8, user_id=user_id)

    citations: List[Dict[str, Any]] = []
    seen = set()
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        fname = meta.get("filename", "Unknown Document")
        if fname in seen:
            continue
        seen.add(fname)
        citations.append({
            "document_name": fname,
            "page_number": meta.get("chunk_index"),
            "text": (chunk.get("page_content") or "")[:200],
        })

    # Graph relationships from the SAME Neo4j graph, matched to the query's
    # named entities where possible, otherwise a representative sample.
    graph = graph_db.get_owned_graph(user_id)
    nodes_by_id = {n["id"]: n for n in graph.get("nodes", [])}
    query_lower = query.lower()

    def node_label(n):
        d = n.get("data", {})
        return f"{n.get('type')}: {d.get('name') or d.get('title') or d.get('id')}"

    matched, other = [], []
    for e in graph.get("relationships", []):
        if e.get("label") == "MENTIONS":
            continue  # provenance edges aren't meaningful in a narrative report
        s, t = nodes_by_id.get(e["source"]), nodes_by_id.get(e["target"])
        if not s or not t:
            continue
        triple = f"{node_label(s)} —{e['label']}→ {node_label(t)}"
        s_name = str(s.get("data", {}).get("name", "")).lower()
        t_name = str(t.get("data", {}).get("name", "")).lower()
        if (s_name and s_name in query_lower) or (t_name and t_name in query_lower):
            matched.append(triple)
        else:
            other.append(triple)
    graph_triples = (matched or other)[:12]

    return chunks, citations, graph_triples


def create_report(db: Session, user: User, title: str, report_type: ReportType) -> Tuple[Report, Dict[str, Any]]:
    """
    Generates a PDF report grounded in the user's uploaded documents, persists
    the Report row, and returns (report, report_data). Raises on PDF failure.
    """
    unique_id = uuid.uuid4()
    pdf_filename = f"{unique_id}_{report_type.value.lower()}_report.pdf"
    user_id = str(user.id)

    chunks, citations, graph_triples = gather_context(title, user_id)

    # Route to the right agent, all grounded strictly in the retrieved chunks.
    if report_type == ReportType.COMPLIANCE:
        report_data = compliance_agent.evaluate_compliance(title, chunks)
    elif report_type in (ReportType.RCA, ReportType.MAINTENANCE):
        report_data = maintenance_agent.generate_rca(title, chunks)
    else:  # INSPECTION / EXECUTIVE — narrative synthesis grounded in chunks.
        report_data = knowledge_agent.retrieve_sop_or_manual(title, chunks)

    report_data = {
        **report_data,
        "citations": citations,
        "graph_relationships": graph_triples,
        "confidence_score": report_data.get("confidence_score", 0.0),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "generated_by": user.full_name,
        "source_count": len(citations),
    }

    pdf_path = generate_pdf_report(
        filename=pdf_filename,
        title=title,
        report_type=report_type.value,
        data=report_data,
    )

    db_report = Report(
        id=unique_id,
        title=title,
        report_type=report_type.value,
        file_path=pdf_path,
        generated_by=user.id,
    )
    # The DB row is the source of truth. If persisting it fails, delete the
    # PDF we just wrote so we never leave an orphaned file on disk (a file with
    # no row can never appear in the Reports list — exactly the leftover we're
    # cleaning up).
    try:
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
    except Exception:
        db.rollback()
        if os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
            except OSError:
                pass
        raise
    logger.info(f"Generated {report_type.value} report '{title}' for user {user_id} ({len(citations)} source(s)).")
    return db_report, report_data


def reconcile_report_files(db: Session) -> None:
    """
    Removes PDF files in REPORT_DIR that have no corresponding Report row —
    the reports equivalent of the vector/graph reconciliation. This self-heals
    orphaned report files left behind by the old silent-SQLite-fallback era (a
    report row written to a now-abandoned database, its PDF stranded on disk),
    so the reports folder always matches the Postgres source of truth.
    """
    report_dir = settings.REPORT_DIR
    if not os.path.isdir(report_dir):
        return
    valid_paths = {os.path.normcase(os.path.abspath(p)) for (p,) in db.query(Report.file_path).all()}
    removed = 0
    for fname in os.listdir(report_dir):
        if not fname.lower().endswith(".pdf"):
            continue
        fpath = os.path.abspath(os.path.join(report_dir, fname))
        if os.path.normcase(fpath) not in valid_paths:
            try:
                os.remove(fpath)
                removed += 1
            except OSError as e:
                logger.warning(f"Could not remove orphaned report file {fname}: {e}")
    if removed:
        logger.info(f"Reconciled reports folder: removed {removed} orphaned PDF file(s) with no database row.")
