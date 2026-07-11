"""
Maintenance Intelligence API — a thin HTTP layer over
app.services.maintenance_service. All asset/KPI/dossier logic lives in the
service so it isn't duplicated here; this module only handles request/response.

Everything is derived from the shared knowledge base (Neo4j graph + Postgres
catalog + FAISS) via the schema-driven classifier — no hardcoded, per-document
logic. Backward-compatible response keys are preserved.
"""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.graph_db import graph_db
from app.services.vector_store import vector_store
from app.services import maintenance_service as ms
from app.services.asset_classifier import ASSET_CATEGORIES
from app.agents.maintenance_agent import maintenance_agent
from app.api.deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

_INCIDENT_DOC_CATEGORIES = {"Incident Report", "Inspection Report"}


def _matches_filter(asset: Dict[str, Any], category: Optional[str]) -> bool:
    if not category:
        return True
    return category in (asset.get("asset_type"), asset.get("category"), asset.get("group"))


@router.get("/overview")
def maintenance_overview(
    q: Optional[str] = Query(None, description="Search assets by name"),
    category: Optional[str] = Query(None, description="Filter by asset type or category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-populates the Maintenance dashboard: KPIs, the maintainable asset
    register (with asset type, confidence band, risk level and incident count),
    and separate failure/incident/vendor buckets. Supports name search (`q`)
    and asset-type/category filtering (`category`).
    """
    register = ms.build_register(db, current_user)
    all_assets = register["assets"]
    kpis = ms.compute_kpis(db, current_user, register)

    type_counts: Dict[str, int] = {}
    category_counts: Dict[str, int] = {}
    for a in all_assets:
        type_counts[a["asset_type"]] = type_counts.get(a["asset_type"], 0) + 1
        if a.get("category"):
            category_counts[a["category"]] = category_counts.get(a["category"], 0) + 1

    assets = [a for a in all_assets if _matches_filter(a, category)]
    if q:
        needle = q.strip().lower()
        assets = [a for a in assets if needle in a["name"].lower()]

    all_docs = ms.owned_documents(db, current_user)
    from app.services.document_classifier import MAINTENANCE_CATEGORIES
    maintenance_docs = [d for d in all_docs if (d.category or "") in MAINTENANCE_CATEGORIES]
    recent_incidents = [
        ms.doc_out(d) for d in maintenance_docs if (d.category or "") in _INCIDENT_DOC_CATEGORIES
    ][:10]

    asset_names = {a["name"].lower() for a in all_assets}
    patterns = [
        p for p in graph_db.find_recurring_entities(str(current_user.id))
        if str(p.get("name", "")).lower() in asset_names
    ]

    has_data = bool(all_assets or maintenance_docs)
    if not has_data:
        completed = any(getattr(d.status, "value", d.status) == "COMPLETED" for d in all_docs)
        if not all_docs:
            message = ("No documents uploaded yet. Upload maintenance logs, machine manuals, "
                       "inspection or incident reports to automatically populate this dashboard.")
        elif not completed:
            message = "Your documents are still being processed. Maintenance intelligence will appear once processing completes."
        else:
            message = ("No maintainable assets were detected in your uploads. Upload machine manuals, "
                       "maintenance logs, inspection or incident reports to populate the asset register.")
    else:
        message = f"{len(all_assets)} maintainable asset(s) across {len(maintenance_docs)} maintenance document(s)."

    return {
        "has_data": has_data,
        "message": message,
        "kpis": kpis,
        "assets": assets,
        "type_counts": type_counts,
        "category_counts": category_counts,
        "asset_types": sorted(type_counts.keys()),
        "categories": ASSET_CATEGORIES,          # legacy, for compatibility
        "asset_counts": type_counts,             # legacy alias
        "failures": register["failures"],
        "incidents": register["incidents"],
        "vendors": register["vendors"],
        "documents": [ms.doc_out(d) for d in maintenance_docs],
        "recent_incidents": recent_incidents,
        "recurring_patterns": patterns,
    }


@router.get("/asset/{asset_name}")
def maintenance_asset_detail(
    asset_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full asset dossier: overview + related documents (Postgres) + related graph
    nodes (Neo4j) + maintenance history + RCA and recommendations grounded in
    retrieved chunks (FAISS). Backward-compatible keys (asset/report/citations)
    are preserved alongside the enriched fields.
    """
    user_id = str(current_user.id)
    register = ms.build_register(db, current_user)
    match = next((a for a in (register["assets"] + register["failures"] + register["incidents"])
                  if a["name"].lower() == asset_name.lower()), None)

    chunks = vector_store.search(asset_name, k=8, user_id=user_id)
    rca = maintenance_agent.generate_rca(asset_name, chunks)
    grounded = rca.get("confidence_score", 0) > 0

    citations, seen = [], set()
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        fname = meta.get("filename", "Unknown Document")
        if fname in seen:
            continue
        seen.add(fname)
        citations.append({"document_name": fname, "page_number": meta.get("chunk_index"),
                          "text": (chunk.get("page_content") or "")[:200]})

    related_docs = ms.related_documents(db, current_user, match["document_ids"]) if match else []
    related_nodes = ms.related_graph_nodes(register, match["id"]) if match else []

    overview = {
        "name": match["name"] if match else asset_name,
        "asset_type": match.get("asset_type") if match else None,
        "category": match.get("category") if match else None,
        "type": match.get("type") if match else None,
        "confidence": match.get("confidence") if match else None,
        "confidence_band": match.get("confidence_band") if match else None,
        "risk_level": match.get("risk_level") if match else None,
        "criticality": match.get("criticality") if match else None,
        "status": match.get("status") if match else None,
        "location": match.get("location") if match else None,
        "incident_count": match.get("incident_count", 0) if match else 0,
        "persisted": match.get("persisted", False) if match else False,
        "properties": match.get("properties", {}) if match else {},
        "document_count": len(related_docs),
        "related_node_count": len(related_nodes),
    }

    return {
        "asset": asset_name,
        "report": rca,
        "citations": citations if grounded else [],
        "overview": overview,
        # Persisted asset store data (source of truth) — metadata w/ provenance,
        # name aliases (merged duplicates), and structured incidents.
        "metadata": match.get("metadata", {}) if match else {},
        "aliases": match.get("aliases", []) if match else [],
        "incidents": match.get("incidents", []) if match else [],
        "related_documents": related_docs,
        "related_graph_nodes": related_nodes,
        "maintenance_history": _maintenance_history(rca, related_docs),
        "recommendations": rca.get("preventive_recommendations", []) or [],
    }


def _maintenance_history(rca: Dict[str, Any], related_docs) -> list:
    from app.services.document_classifier import MAINTENANCE_CATEGORIES
    history = []
    for evt in rca.get("timeline", []) or []:
        if not isinstance(evt, dict):
            continue
        history.append({
            "date": evt.get("time", ""), "event": evt.get("event", ""),
            "status": evt.get("status", "normal"), "detail": evt.get("detail", ""),
            "source_document": None,
        })
    for doc in related_docs:
        if (doc.get("category") or "") not in MAINTENANCE_CATEGORIES:
            continue
        history.append({
            "date": (doc.get("created_at") or "")[:10], "event": doc.get("category") or "Document",
            "status": "normal", "detail": f"Referenced in {doc['filename']}", "source_document": doc["filename"],
        })
    history.sort(key=lambda h: str(h.get("date") or ""), reverse=True)
    return history
