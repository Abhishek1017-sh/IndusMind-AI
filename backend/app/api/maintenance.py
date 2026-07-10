"""
Maintenance Intelligence API — an industrial asset register built entirely from
the EXISTING knowledge base:

  • Neo4j   — entities + relationships extracted at ingestion (the asset graph)
  • Postgres — the document catalog (filenames, categories, upload times)
  • FAISS   — retrieved chunks that ground the RCA

Entities are run through app.services.asset_classifier so only genuinely
maintainable assets appear, and Facilities / Failures / Incidents / Vendors are
kept in their own buckets rather than mixed into the machine list. Nothing here
is hardcoded — an asset exists only because it was extracted from a document
the user uploaded.
"""
import logging
import uuid as uuid_mod
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.document import Document, DocumentStatus
from app.models.user import User, UserRole
from app.services.graph_db import graph_db
from app.services.vector_store import vector_store
from app.services.document_classifier import MAINTENANCE_CATEGORIES
from app.services.asset_classifier import (
    classify_asset, ASSET_CATEGORIES, MAINTAINABLE_CATEGORIES,
    FAILURES, INCIDENTS, VENDORS,
)
from app.agents.maintenance_agent import maintenance_agent
from app.api.deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

# Documents whose category represents an incident/failure event worth surfacing.
_INCIDENT_DOC_CATEGORIES = {"Incident Report", "Inspection Report"}

# Node properties that are noise on an asset card.
_HIDDEN_PROPS = {"id", "label", "user_id", "document_ids", "document_id", "name", "title"}


def _owned_documents(db: Session, current_user: User) -> List[Document]:
    query = db.query(Document)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Document.uploaded_by == current_user.id)
    return query.order_by(Document.created_at.desc()).all()


def _doc_out(doc: Document) -> Dict[str, Any]:
    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "category": doc.category,
        "status": doc.status.value if isinstance(doc.status, DocumentStatus) else doc.status,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def _node_name(node: Dict[str, Any]) -> str:
    d = node.get("data", {})
    return str(d.get("name") or d.get("title") or d.get("id") or "")


def _asset_entry(node: Dict[str, Any], category: str) -> Dict[str, Any]:
    data = node.get("data", {})
    doc_ids = data.get("document_ids") or []
    properties = {k: v for k, v in data.items() if k not in _HIDDEN_PROPS and v not in (None, "")}
    return {
        "id": node["id"],
        "type": node.get("type"),          # graph node type (API compatibility)
        "category": category,              # semantic asset category
        "name": _node_name(node),
        "doc_count": len(doc_ids) if isinstance(doc_ids, list) else 0,
        "document_ids": doc_ids if isinstance(doc_ids, list) else [],
        "properties": properties,
    }


def _classified_assets(user_id: str) -> List[Dict[str, Any]]:
    """Every graph entity that the classifier recognises as an asset-register entry."""
    graph = graph_db.get_owned_graph(user_id)
    entries = []
    for node in graph.get("nodes", []):
        name = _node_name(node)
        if not name:
            continue
        category = classify_asset(node.get("type"), name, node.get("data", {}))
        if category is None:
            continue  # people, skills, SOPs, business regions, records — not assets
        entries.append(_asset_entry(node, category))
    entries.sort(key=lambda a: (-a["doc_count"], a["name"].lower()))
    return entries


@router.get("/overview")
def maintenance_overview(
    q: Optional[str] = Query(None, description="Search assets by name"),
    category: Optional[str] = Query(None, description="Filter by asset category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-populates the Maintenance dashboard from the shared knowledge base.
    Maintainable assets (machines, equipment, servers, vehicles, facilities,
    spare parts) are returned in `assets`; failures, incidents and vendors are
    kept separate so they never pollute the asset register. Supports name
    search (`q`) and category filtering (`category`).
    """
    user_id = str(current_user.id)
    all_entries = _classified_assets(user_id)

    category_counts: Dict[str, int] = {}
    for e in all_entries:
        category_counts[e["category"]] = category_counts.get(e["category"], 0) + 1

    # Legacy graph-type counts, kept for API compatibility.
    asset_counts: Dict[str, int] = {}
    for e in all_entries:
        asset_counts[e["type"]] = asset_counts.get(e["type"], 0) + 1

    maintainable = [e for e in all_entries if e["category"] in MAINTAINABLE_CATEGORIES]
    failures = [e for e in all_entries if e["category"] == FAILURES]
    incidents = [e for e in all_entries if e["category"] == INCIDENTS]
    vendors = [e for e in all_entries if e["category"] == VENDORS]

    # Apply search + category filter to the asset register only.
    assets = maintainable
    if category and category in ASSET_CATEGORIES:
        pool = all_entries if category not in MAINTAINABLE_CATEGORIES else maintainable
        assets = [e for e in pool if e["category"] == category]
    if q:
        needle = q.strip().lower()
        assets = [e for e in assets if needle in e["name"].lower()]

    all_docs = _owned_documents(db, current_user)
    maintenance_docs = [d for d in all_docs if (d.category or "") in MAINTENANCE_CATEGORIES]
    recent_incidents = [
        _doc_out(d) for d in maintenance_docs if (d.category or "") in _INCIDENT_DOC_CATEGORIES
    ][:10]

    # Recurring entities across documents, restricted to real assets.
    asset_names = {e["name"].lower() for e in all_entries}
    patterns = [
        p for p in graph_db.find_recurring_entities(user_id)
        if str(p.get("name", "")).lower() in asset_names
    ]

    has_data = bool(all_entries or maintenance_docs)
    if not has_data:
        completed = any(d.status == DocumentStatus.COMPLETED for d in all_docs)
        if not all_docs:
            message = ("No documents uploaded yet. Upload maintenance logs, machine manuals, "
                       "inspection or incident reports to automatically populate this dashboard.")
        elif not completed:
            message = "Your documents are still being processed. Maintenance intelligence will appear once processing completes."
        else:
            message = ("No maintainable assets were detected in your uploads. Upload machine manuals, "
                       "maintenance logs, inspection or incident reports to populate the asset register.")
    else:
        message = (f"{len(maintainable)} maintainable asset(s) across "
                   f"{len(maintenance_docs)} maintenance document(s).")

    return {
        "has_data": has_data,
        "message": message,
        "assets": assets,
        "asset_counts": asset_counts,
        "category_counts": category_counts,
        "categories": ASSET_CATEGORIES,
        "failures": failures,
        "incidents": incidents,
        "vendors": vendors,
        "documents": [_doc_out(d) for d in maintenance_docs],
        "recent_incidents": recent_incidents,
        "recurring_patterns": patterns,
    }


def _related_documents(db: Session, current_user: User, document_ids: List[str]) -> List[Dict[str, Any]]:
    """Resolves the graph node's document_ids into real Postgres document rows."""
    if not document_ids:
        return []
    parsed = []
    for d in document_ids:
        try:
            parsed.append(uuid_mod.UUID(str(d)))
        except (ValueError, AttributeError):
            continue
    if not parsed:
        return []
    query = db.query(Document).filter(Document.id.in_(parsed))
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Document.uploaded_by == current_user.id)
    return [_doc_out(d) for d in query.order_by(Document.created_at.desc()).all()]


def _related_graph_nodes(user_id: str, node_id: str) -> List[Dict[str, Any]]:
    """Immediate neighbourhood of the asset in the knowledge graph."""
    graph = graph_db.get_owned_graph(user_id)
    nodes_by_id = {n["id"]: n for n in graph.get("nodes", [])}
    related = []
    seen = set()
    for edge in graph.get("relationships", []):
        if edge.get("label") == "MENTIONS":
            continue  # provenance edge, surfaced as "related documents" instead
        if edge["source"] == node_id:
            other, direction = nodes_by_id.get(edge["target"]), "outgoing"
        elif edge["target"] == node_id:
            other, direction = nodes_by_id.get(edge["source"]), "incoming"
        else:
            continue
        if not other or other["id"] in seen:
            continue
        seen.add(other["id"])
        related.append({
            "id": other["id"],
            "type": other.get("type"),
            "name": _node_name(other),
            "relationship": edge.get("label"),
            "direction": direction,
        })
    return related


def _maintenance_history(rca: Dict[str, Any], related_docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Chronological maintenance history for the asset, assembled from the RCA
    timeline extracted from document text plus the maintenance documents that
    reference this asset. Purely derived — nothing is invented.
    """
    history: List[Dict[str, Any]] = []
    for evt in rca.get("timeline", []) or []:
        if not isinstance(evt, dict):
            continue
        history.append({
            "date": evt.get("time", ""),
            "event": evt.get("event", ""),
            "status": evt.get("status", "normal"),
            "detail": evt.get("detail", ""),
            "source_document": None,
        })
    for doc in related_docs:
        if (doc.get("category") or "") not in MAINTENANCE_CATEGORIES:
            continue
        history.append({
            "date": (doc.get("created_at") or "")[:10],
            "event": doc.get("category") or "Document",
            "status": "normal",
            "detail": f"Referenced in {doc['filename']}",
            "source_document": doc["filename"],
        })
    history.sort(key=lambda h: str(h.get("date") or ""), reverse=True)
    return history


@router.get("/asset/{asset_name}")
def maintenance_asset_detail(
    asset_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full asset dossier, assembled on demand: overview + related documents
    (Postgres) + related graph nodes (Neo4j) + maintenance history + RCA and
    recommendations grounded in retrieved chunks (FAISS). The user clicks an
    asset instead of typing a query.
    """
    user_id = str(current_user.id)

    # Locate the asset in the graph (case-insensitive) to build its dossier.
    entries = _classified_assets(user_id)
    match = next((e for e in entries if e["name"].lower() == asset_name.lower()), None)

    chunks = vector_store.search(asset_name, k=8, user_id=user_id)
    rca = maintenance_agent.generate_rca(asset_name, chunks)
    grounded = rca.get("confidence_score", 0) > 0

    citations = []
    seen = set()
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        fname = meta.get("filename", "Unknown Document")
        if fname in seen:
            continue
        seen.add(fname)
        citations.append({"document_name": fname, "page_number": meta.get("chunk_index"),
                          "text": (chunk.get("page_content") or "")[:200]})

    related_docs = _related_documents(db, current_user, match["document_ids"]) if match else []
    related_nodes = _related_graph_nodes(user_id, match["id"]) if match else []

    overview = {
        "name": match["name"] if match else asset_name,
        "category": match["category"] if match else None,
        "type": match["type"] if match else None,
        "properties": match["properties"] if match else {},
        "document_count": len(related_docs),
        "related_node_count": len(related_nodes),
    }

    return {
        # Compatibility keys (unchanged shape for existing callers)
        "asset": asset_name,
        "report": rca,
        "citations": citations if grounded else [],
        # Enriched dossier
        "overview": overview,
        "related_documents": related_docs,
        "related_graph_nodes": related_nodes,
        "maintenance_history": _maintenance_history(rca, related_docs),
        "recommendations": rca.get("preventive_recommendations", []) or [],
    }
