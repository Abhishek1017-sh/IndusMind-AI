"""
Maintenance aggregation service.

All the logic that turns the shared knowledge base (Neo4j graph + Postgres
document catalog + FAISS) into the maintenance asset register, KPIs and asset
dossiers lives here, so the API layer (app.api.maintenance) stays thin and the
same logic isn't duplicated across endpoints. Generic and schema-driven — see
app.services.entity_classifier / asset_taxonomy — with no per-document logic.
"""
import uuid as uuid_mod
import logging
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.user import User, UserRole
from app.services.graph_db import graph_db
from app.services.entity_classifier import classify_entity
from app.services.asset_taxonomy import GROUP_EVENT, GROUP_PARTY, MAINTAINABLE_GROUPS
from app.services.document_classifier import MAINTENANCE_CATEGORIES
from app.services import asset_store

logger = logging.getLogger(__name__)

_HIDDEN_PROPS = {"id", "label", "user_id", "document_ids", "document_id", "name", "title"}
_FAILURE_REL = {"HAS_FAILURE", "AFFECTED", "FAILED", "HAS_INCIDENT"}


def owned_documents(db: Session, user: User) -> List[Document]:
    q = db.query(Document)
    if user.role != UserRole.ADMIN:
        q = q.filter(Document.uploaded_by == user.id)
    return q.order_by(Document.created_at.desc()).all()


def doc_out(doc: Document) -> Dict[str, Any]:
    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "category": doc.category,
        "status": doc.status.value if isinstance(doc.status, DocumentStatus) else doc.status,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def node_name(node: Dict[str, Any]) -> str:
    d = node.get("data", {})
    return str(d.get("name") or d.get("title") or d.get("id") or "")


def _risk_from_signals(failure_links: int, incident_links: int) -> str:
    """Evidence-based risk level from how many failures/incidents touch the asset."""
    issues = failure_links + incident_links
    if incident_links >= 1 and failure_links >= 1 or issues >= 3:
        return "Critical"
    if issues == 2:
        return "High"
    if issues == 1:
        return "Medium"
    return "Low"


def build_register(db: Session, user: User) -> Dict[str, Any]:
    """
    Classifies every graph entity into the asset register. Returns the enriched
    asset entries plus the failure/incident/vendor buckets and the raw graph
    (reused by KPI computation and dossiers).
    """
    user_id = str(user.id)
    graph = graph_db.get_owned_graph(user_id)
    nodes = graph.get("nodes", [])
    edges = graph.get("relationships", [])
    nodes_by_id = {n["id"]: n for n in nodes}

    # Classify every node once.
    cls_by_id: Dict[str, Any] = {}
    for node in nodes:
        name = node_name(node)
        if not name:
            continue
        data = node.get("data", {})
        doc_ids = data.get("document_ids") or []
        cls_by_id[node["id"]] = classify_entity(node.get("type"), name, data,
                                                 corroborating_documents=len(doc_ids) or 1)

    event_ids = {nid for nid, c in cls_by_id.items() if c and c.group == GROUP_EVENT}

    # Count, per asset, how many distinct failure/incident nodes (or failure
    # relationships) touch it — the evidence behind its risk level.
    fail_links: Dict[str, int] = {}
    for e in edges:
        if e.get("label") == "MENTIONS":
            continue
        label = str(e.get("label", "")).upper()
        src, tgt = e["source"], e["target"]
        pairs = [(src, tgt), (tgt, src)]
        for asset_end, other_end in pairs:
            if other_end in event_ids or label in _FAILURE_REL:
                fail_links[asset_end] = fail_links.get(asset_end, 0) + 1

    assets, failures, incidents, vendors = [], [], [], []
    for node in nodes:
        name = node_name(node)
        if not name:
            continue
        data = node.get("data", {})
        doc_ids = data.get("document_ids") or []
        result = cls_by_id.get(node["id"])
        if result is None:
            continue

        entry = {
            "id": node["id"],
            "name": name,
            "type": node.get("type"),                 # raw graph node type (compat)
            "asset_type": result.asset_type,          # specific taxonomy type
            "group": result.group,
            "confidence": result.confidence,
            "confidence_band": result.confidence_band,
            "reason": result.reason,
            "doc_count": len(doc_ids) if isinstance(doc_ids, list) else 0,
            "document_ids": doc_ids if isinstance(doc_ids, list) else [],
            "properties": {k: v for k, v in data.items() if k not in _HIDDEN_PROPS and v not in (None, "")},
        }
        # Legacy `category` key kept for backward compatibility.
        entry["category"] = _legacy_category(result.asset_type)

        if result.group in MAINTAINABLE_GROUPS:
            f = fail_links.get(node["id"], 0)
            entry["incident_count"] = f
            entry["risk_level"] = _risk_from_signals(f, 0)
            entry["status"] = str(data.get("status") or "").strip() or "Unknown"
            entry["location"] = _linked_location(node["id"], edges, nodes_by_id)
            assets.append(entry)
        elif result.group == GROUP_EVENT:
            (incidents if result.asset_type == "Incident" else failures).append(entry)
        elif result.group == GROUP_PARTY:
            vendors.append(entry)
        # activity / risk groups are intentionally not shown as asset cards.

    # Enrich maintainable assets with the PostgreSQL asset store (source of
    # truth for aliases, per-field metadata + provenance, criticality and
    # structured incidents). The graph supplies discovery + relationships;
    # Postgres supplies the durable asset record.
    store_by_key = {a.canonical_key: a for a in asset_store.list_assets(db, str(user.id))}
    for entry in assets:
        st = store_by_key.get(asset_store.canonical_key(entry["name"]))
        if st is None:
            entry.update({"persisted": False, "aliases": [], "metadata": {}, "incidents": []})
            continue
        store_incidents = asset_store.incidents_for_asset(db, st)
        entry["persisted"] = True
        entry["aliases"] = [al.alias for al in st.aliases if al.alias != entry["name"]]
        entry["metadata"] = asset_store.metadata_dict(st)
        entry["incidents"] = store_incidents
        if st.criticality:
            entry["criticality"] = st.criticality
        # Prefer structured incidents (source of truth) for the count + risk.
        count = max(entry.get("incident_count", 0), len(store_incidents))
        entry["incident_count"] = count
        entry["risk_level"] = _risk_from_signals(count, len(store_incidents))

    assets.sort(key=lambda a: (-a.get("incident_count", 0), -a["doc_count"], a["name"].lower()))
    return {
        "assets": assets, "failures": failures, "incidents": incidents, "vendors": vendors,
        "_graph": graph, "_nodes_by_id": nodes_by_id, "_edges": edges,
    }


def _linked_location(node_id: str, edges: List[Dict[str, Any]], nodes_by_id: Dict[str, Any]) -> Optional[str]:
    for e in edges:
        if str(e.get("label", "")).upper() in ("LOCATED_IN", "INSTALLED_IN") and e["source"] == node_id:
            other = nodes_by_id.get(e["target"])
            if other:
                return node_name(other)
    return None


def compute_kpis(db: Session, user: User, register: Dict[str, Any]) -> Dict[str, int]:
    """The six maintenance KPIs, all derived from real graph/document signals."""
    assets = register["assets"]
    docs = owned_documents(db, user)
    maint_docs = [d for d in docs if (d.category or "") in MAINTENANCE_CATEGORIES]
    # An asset is "covered" by maintenance if any of its documents is a
    # maintenance-class document.
    maint_doc_ids = {str(d.id) for d in maint_docs}
    missing_maintenance = sum(
        1 for a in assets if not (set(a["document_ids"]) & maint_doc_ids)
    )
    # Open incidents: the structured incident table is the source of truth;
    # fall back to the graph event buckets when no structured incidents exist
    # (e.g. Gemini offline during ingestion).
    store_incidents = asset_store.open_incident_count(db, str(user.id))
    open_incidents = store_incidents or (len(register["incidents"]) + len(register["failures"]))
    return {
        "total_assets": len(assets),
        "critical_assets": sum(1 for a in assets if a.get("risk_level") in ("Critical", "High")),
        "open_incidents": open_incidents,
        "high_risk_assets": sum(1 for a in assets if a.get("risk_level") == "Critical"),
        "assets_missing_maintenance": missing_maintenance,
        "assets_with_alerts": sum(1 for a in assets if a.get("incident_count", 0) > 0),
    }


def related_documents(db: Session, user: User, document_ids: List[str]) -> List[Dict[str, Any]]:
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
    q = db.query(Document).filter(Document.id.in_(parsed))
    if user.role != UserRole.ADMIN:
        q = q.filter(Document.uploaded_by == user.id)
    return [doc_out(d) for d in q.order_by(Document.created_at.desc()).all()]


def related_graph_nodes(register: Dict[str, Any], node_id: str) -> List[Dict[str, Any]]:
    nodes_by_id = register["_nodes_by_id"]
    related, seen = [], set()
    for edge in register["_edges"]:
        if edge.get("label") == "MENTIONS":
            continue
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
            "id": other["id"], "type": other.get("type"), "name": node_name(other),
            "relationship": edge.get("label"), "direction": direction,
        })
    return related


def _legacy_category(asset_type: str) -> Optional[str]:
    from app.services.asset_classifier import _TYPE_TO_CATEGORY
    return _TYPE_TO_CATEGORY.get(asset_type)
