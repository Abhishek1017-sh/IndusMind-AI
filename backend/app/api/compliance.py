"""
Compliance Intelligence API. Compliance status is INFERRED from the user's
uploaded documents only — SOPs, inspection reports, audit reports, safety
procedures and regulatory documents detected by auto-classification, assessed
against each other by the compliance agent over retrieved chunks. No hardcoded
pass/fail rules, no predefined SOPs, no demo data.
"""
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.document import Document, DocumentStatus
from app.models.user import User, UserRole
from app.agents.compliance_agent import compliance_agent
from app.services.vector_store import vector_store
from app.services.document_classifier import COMPLIANCE_CATEGORIES
from app.api.deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


def _risk_level(score: int) -> str:
    if score >= 85:
        return "Low"
    if score >= 60:
        return "Medium"
    if score >= 40:
        return "High"
    return "Critical"


def _owned_documents(db: Session, current_user: User) -> List[Document]:
    query = db.query(Document)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Document.uploaded_by == current_user.id)
    return query.order_by(Document.created_at.desc()).all()


@router.post("/check")
def run_compliance_check(
    query: str,
    current_user: User = Depends(get_current_user)
):
    """
    Triggers an immediate compliance check against SOPs for a specific query/asset.
    """
    # Retrieve relevant vector chunks, scoped to this user's own documents
    chunks = vector_store.search(query, k=8, user_id=str(current_user.id))
    report = compliance_agent.evaluate_compliance(query, chunks)
    return report


def _build_overview(db: Session, current_user: User) -> Dict[str, Any]:
    """
    Auto-populates the Compliance dashboard: detects compliance-related
    documents from the shared Postgres catalog, runs an aggregate assessment
    over retrieved chunks (compliance agent, grounded only in uploaded
    content), and derives score, passed/failed checks, deviations, risk level
    and missing document types. Explains why when the user has uploaded no
    compliance-related documents.
    """
    user_id = str(current_user.id)
    all_docs = _owned_documents(db, current_user)
    compliance_docs = [d for d in all_docs if (d.category or "") in COMPLIANCE_CATEGORIES]

    # Document-driven readiness + applicable regulations detected across the
    # corpus (see module_router / regulation_detector).
    from app.services import module_router
    from app.services.compliance_engine import cross_document_findings, build_timeline
    infos = [d.intelligence for d in all_docs if d.intelligence]
    readiness = module_router.compute_readiness(infos)["compliance"]
    reg_map: Dict[str, Dict[str, Any]] = {}
    for i in infos:
        for r in (i.get("regulations") or []):
            code = r.get("code")
            if code and (code not in reg_map or (r.get("confidence") or 0) > (reg_map[code].get("confidence") or 0)):
                reg_map[code] = r
    applicable_regulations = sorted(reg_map.values(), key=lambda r: -(r.get("confidence") or 0))

    # Cross-document validation: pool every document's requirements and
    # observations, then validate them against each other (e.g. an SOP's
    # "inspect every 30 days" vs a log's "last inspected 72 days ago").
    all_requirements: List[Dict[str, Any]] = []
    all_observations: List[Dict[str, Any]] = []
    for i in infos:
        comp = i.get("compliance") or {}
        all_requirements.extend(comp.get("requirements") or [])
        all_observations.extend(comp.get("observations") or [])
    findings = cross_document_findings(all_requirements, all_observations)
    violations = [f for f in findings if f["type"] in ("overdue", "missing_evidence")]
    timeline = build_timeline(all_observations, findings)

    generated_at = datetime.now(timezone.utc).isoformat()
    category_counts: Dict[str, int] = {}
    for d in compliance_docs:
        category_counts[d.category] = category_counts.get(d.category, 0) + 1

    # Missing document types: which compliance document classes are absent.
    # Inferred purely from what the user has vs. hasn't uploaded — e.g. if
    # inspections exist but no SOPs, adherence can't be fully verified.
    present_categories = set(category_counts.keys())
    missing_documents = sorted(COMPLIANCE_CATEGORIES - present_categories)

    if not compliance_docs:
        completed = any(d.status == DocumentStatus.COMPLETED for d in all_docs)
        if not all_docs:
            message = ("No documents uploaded yet. Upload SOPs, inspection reports, audit reports, "
                       "safety procedures or regulatory documents to generate a compliance assessment.")
        elif not completed:
            message = "Your documents are still being processed. Compliance assessment will appear once processing completes."
        else:
            message = ("No compliance-related documents detected among your uploads. Upload SOPs, "
                       "inspection reports, audit reports, safety procedures or regulatory documents "
                       "so compliance can be assessed.")
        return {
            "has_data": False,
            "message": message,
            "readiness": readiness,
            "applicable_regulations": applicable_regulations,
            "findings": findings,
            "violations": violations,
            "timeline": timeline,
            "compliance_score": 0,
            "risk_level": "Unknown",
            "summary": message,
            "passed_checks": 0,
            "failed_checks": 0,
            "checklist": [],
            "corrective_actions": [],
            "deviations": [],
            "detected_documents": [],
            "category_counts": {},
            "missing_documents": sorted(COMPLIANCE_CATEGORIES),
            "citations": [],
            "confidence_score": 0.0,
            "generated_at": generated_at,
        }

    # Aggregate assessment: retrieve compliance-focused chunks from the SAME
    # FAISS index and let the compliance agent evaluate them. The query steers
    # retrieval toward SOP/inspection/audit/safety content; the agent stays
    # grounded strictly in whatever chunks come back.
    assessment_query = ("Assess compliance: verify inspection results and work against SOP limits, "
                        "safety procedures, audit findings and regulatory requirements. "
                        "Identify deviations and non-conformances.")
    chunks = vector_store.search(assessment_query, k=10, user_id=user_id)
    report = compliance_agent.evaluate_compliance(assessment_query, chunks)

    checklist = report.get("checklist", []) or []
    passed = sum(1 for c in checklist if c.get("status") == "COMPLIANT")
    failed = sum(1 for c in checklist if c.get("status") == "NON_COMPLIANT")
    deviations = [c for c in checklist if c.get("status") == "NON_COMPLIANT"]
    score = int(report.get("compliance_score", 0) or 0)

    citations: List[Dict[str, Any]] = []
    if report.get("confidence_score", 0) > 0:
        seen = set()
        for chunk in chunks:
            meta = chunk.get("metadata", {})
            fname = meta.get("filename", "Unknown Document")
            if fname in seen:
                continue
            seen.add(fname)
            citations.append({"document_name": fname, "page_number": meta.get("chunk_index"),
                              "text": (chunk.get("page_content") or "")[:200]})

    return {
        "has_data": True,
        "message": f"Assessed {len(compliance_docs)} compliance document(s).",
        "readiness": readiness,
        "applicable_regulations": applicable_regulations,
        "findings": findings,
        "violations": violations,
        "timeline": timeline,
        "compliance_score": score,
        "risk_level": _risk_level(score),
        "summary": report.get("summary", ""),
        "passed_checks": passed,
        "failed_checks": failed,
        "checklist": checklist,
        "corrective_actions": report.get("corrective_actions", []) or [],
        "deviations": deviations,
        "detected_documents": [
            {"id": str(d.id), "filename": d.filename, "category": d.category}
            for d in compliance_docs
        ],
        "category_counts": category_counts,
        "missing_documents": missing_documents,
        "citations": citations,
        "confidence_score": report.get("confidence_score", 0.0),
        "generated_at": generated_at,
    }


@router.get("/overview")
def compliance_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compliance dashboard data (see _build_overview)."""
    return _build_overview(db, current_user)


@router.post("/audit-report")
def generate_audit_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    One-click AI Compliance Audit Report: compiles the current compliance
    picture — score, applicable regulations, cross-document findings with
    evidence, missing document types and the compliance timeline — into a
    grounded PDF, persists it as a Report (so it also appears in the Reports
    section) and returns the record for download.
    """
    import uuid
    from fastapi import HTTPException, status
    from app.models.report import Report
    from app.services.report_generator import generate_pdf_report

    ov = _build_overview(db, current_user)
    report_id = uuid.uuid4()
    pdf_filename = f"{report_id}_compliance_audit_report.pdf"

    data = {
        "summary": ov.get("summary") or ov.get("message", ""),
        "compliance_score": ov.get("compliance_score", 0),
        "checklist": ov.get("checklist", []),
        "corrective_actions": ov.get("corrective_actions", []),
        # Rich audit sections (rendered by report_generator when present):
        "applicable_regulations": ov.get("applicable_regulations", []),
        "compliance_findings": ov.get("findings", []),
        "compliance_timeline": ov.get("timeline", []),
        "missing_documents": ov.get("missing_documents", []),
        "risk_level": ov.get("risk_level", ""),
        "readiness": ov.get("readiness", {}),
        "citations": ov.get("citations", []),
        "confidence_score": ov.get("confidence_score", 0.0),
        "source_count": len(ov.get("detected_documents", [])),
        "generated_by": current_user.full_name,
    }
    from datetime import datetime as _dt, timezone as _tz
    data["generated_at"] = _dt.now(_tz.utc).strftime("%Y-%m-%d %H:%M UTC")

    try:
        pdf_path = generate_pdf_report(
            filename=pdf_filename,
            title="Compliance Audit Report",
            report_type="COMPLIANCE",
            data=data,
        )
    except Exception as err:
        logger.error(f"Failed to generate compliance audit PDF: {err}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Failed to compile audit report: {err}")

    try:
        db_report = Report(id=report_id, title="Compliance Audit Report",
                           report_type="COMPLIANCE", file_path=pdf_path, generated_by=current_user.id)
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
    except Exception as err:
        db.rollback()
        logger.error(f"Failed to persist compliance audit report: {err}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Failed to save audit report: {err}")
    return {"id": str(db_report.id), "title": db_report.title, "report_type": db_report.report_type}
