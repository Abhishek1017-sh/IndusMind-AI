"""
Document-grounded starter questions for the AI Chat empty state.

The chat welcome screen used to show four hardcoded demo prompts ("Pump P-101",
"Jamnagar refinery"…) that had nothing to do with what the user uploaded. This
builds the suggestions from the user's OWN documents instead — real equipment
names from the asset store, regulations actually detected in the documents, the
document categories and filenames. Rule-based and deterministic, so it is always
grounded (never invents an asset or standard that isn't present) and works with
no LLM / offline.

Returns [] when the user has no processed documents — the frontend then shows an
"upload a document first" hint rather than misleading demo questions.
"""
import logging
from typing import List

from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.user import User, UserRole
from app.services import asset_store

logger = logging.getLogger(__name__)

# Asset groups that are NOT maintainable equipment (organizations, people,
# vendors…) — we never build a "maintenance history of X" question from these.
_NON_EQUIPMENT_GROUPS = {
    "party", "organization", "business", "vendor", "customer", "person",
    "people", "location", "region", "document", "record",
}

_COMPLIANCE_HINTS = ("complian", "sop", "audit", "inspection", "safety", "regulat", "procedure")


def _owned_completed_documents(db: Session, user: User) -> List[Document]:
    query = db.query(Document)
    if user.role != UserRole.ADMIN:
        query = query.filter(Document.uploaded_by == user.id)
    return (
        query.filter(Document.status == DocumentStatus.COMPLETED)
        .order_by(Document.created_at.desc())
        .all()
    )


def _asset_priority(asset) -> tuple:
    incidents = len(asset.incident_links or [])
    risk = {"critical": 3, "high": 2, "medium": 1}.get((asset.risk_level or "").lower(), 0)
    return (incidents, risk)


def generate_suggestions(db: Session, user: User, limit: int = 4) -> List[str]:
    """
    Build up to `limit` starter questions grounded in this user's documents.
    Ordered by usefulness: real assets (RCA / maintenance) → detected
    regulations → compliance summary → per-document summary → general.
    """
    docs = _owned_completed_documents(db, user)
    if not docs:
        return []

    suggestions: List[str] = []

    # 1. Real equipment/assets → maintenance & root-cause questions.
    try:
        assets = asset_store.list_assets(db, str(user.id))
    except Exception as e:
        logger.warning("Could not load assets for chat suggestions: %s", e)
        assets = []

    equipment = [
        a for a in assets
        if a.name and (a.asset_group or "").lower() not in _NON_EQUIPMENT_GROUPS
    ]
    equipment.sort(key=_asset_priority, reverse=True)

    for asset in equipment:
        if len(suggestions) >= limit:
            break
        if len(asset.incident_links or []) > 0:
            suggestions.append(f"What was the root cause of the {asset.name} failure?")
        else:
            suggestions.append(f"What is the maintenance history of {asset.name}?")

    # 2. Regulations actually referenced in the documents → compliance question.
    regulations: List[str] = []
    for d in docs:
        for reg in ((d.intelligence or {}).get("regulations") or []):
            code = reg.get("code") or reg.get("name")
            if code and code not in regulations:
                regulations.append(code)
    if regulations and len(suggestions) < limit:
        suggestions.append(f"Am I compliant with {regulations[0]}?")

    # 3. Compliance-flavoured documents → an audit summary question.
    categories = {(d.category or "").lower() for d in docs if d.category}
    if len(suggestions) < limit and any(
        any(h in c for h in _COMPLIANCE_HINTS) for c in categories
    ):
        suggestions.append("Summarize the compliance findings across my documents.")

    # 4. Summarize the most recently uploaded document (by real filename).
    if len(suggestions) < limit:
        suggestions.append(f"Summarize {docs[0].filename}.")

    # 5. General grounded fillers (still about the user's own corpus).
    for filler in (
        "What are the key findings across my uploaded documents?",
        "What equipment and entities are mentioned in my documents?",
        "Give me an overview of everything I've uploaded.",
    ):
        if len(suggestions) >= limit:
            break
        suggestions.append(filler)

    # De-duplicate, preserve order, cap.
    out: List[str] = []
    for s in suggestions:
        if s not in out:
            out.append(s)
    return out[:limit]
