"""
Asset store service — all reads/writes of the PostgreSQL asset source of truth.

Responsibilities:
  • canonicalize + de-duplicate assets across documents (req 8, 9)
  • track name aliases (Server A / server-a / SERVER_A → one asset)
  • persist per-field metadata with provenance (req 3, 11)
  • persist structured incidents linked to affected assets (req 5)
  • keep the store in sync with uploaded documents (delete cascade, backfill)

Assets are discovered from the knowledge graph (already classified by
entity_classifier); this service persists and enriches them. Nothing is
invented — an asset exists only because it was extracted from a document.
"""
import re
import uuid as uuid_mod
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Iterable

from sqlalchemy.orm import Session

from app.models.asset import (
    Asset, AssetAlias, AssetMetadata, AssetDocument, Incident, IncidentAsset,
)
from app.services.entity_classifier import classify_entity
from app.services.asset_taxonomy import MAINTAINABLE_GROUPS

logger = logging.getLogger(__name__)

_CANON_RE = re.compile(r"[^a-z0-9]+")

# The enrichable metadata fields (req 3). Missing => no row => NULL.
METADATA_FIELDS = [
    "location", "manufacturer", "vendor", "model", "serial_number", "asset_tag",
    "owner", "installation_date", "purchase_date", "warranty", "maintenance_interval",
    "lifecycle_stage", "operational_status", "patch_status", "firmware",
    "operating_system", "criticality", "health_score", "risk_level",
    "capex", "opex", "depreciation",
]


def canonical_key(name: str) -> str:
    """Normalized identity key so spelling variants collapse to one asset."""
    return _CANON_RE.sub("-", str(name or "").lower()).strip("-")


def _as_uuid(value) -> Optional[uuid_mod.UUID]:
    try:
        return uuid_mod.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


# ── Write path ───────────────────────────────────────────────────────────────
def upsert_asset(
    db: Session,
    user_id: str,
    name: str,
    asset_type: str,
    asset_group: str,
    confidence: float,
    confidence_band: Optional[str],
    document_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Optional[Asset]:
    """
    Create or update an asset by canonical key (dedup/merge across documents),
    record the incoming name as an alias, and link the source document. Returns
    the Asset, or None for an invalid identity.
    """
    key = canonical_key(name)
    if not key:
        return None
    uid = _as_uuid(user_id)
    if uid is None:
        return None

    asset = (
        db.query(Asset)
        .filter(Asset.user_id == uid, Asset.canonical_key == key)
        .first()
    )
    if asset is None:
        asset = Asset(
            user_id=uid, canonical_key=key, name=name, asset_type=asset_type,
            asset_group=asset_group, confidence=confidence, confidence_band=confidence_band,
            status=status,
        )
        db.add(asset)
        db.flush()
    else:
        # Merge: keep the higher-confidence classification, refresh timestamps.
        if confidence > (asset.confidence or 0):
            asset.confidence = confidence
            asset.confidence_band = confidence_band
            asset.asset_type = asset_type
            asset.asset_group = asset_group
        if status and not asset.status:
            asset.status = status
        asset.updated_at = datetime.utcnow()

    # Alias tracking (the exact name as written, if it differs from display).
    existing_aliases = {a.alias for a in asset.aliases}
    if name not in existing_aliases:
        db.add(AssetAlias(asset_id=asset.id, alias=name))

    # Document link.
    doc_uuid = _as_uuid(document_id) if document_id else None
    if doc_uuid is not None:
        link_exists = db.query(AssetDocument).filter(
            AssetDocument.asset_id == asset.id, AssetDocument.document_id == doc_uuid
        ).first()
        if not link_exists:
            db.add(AssetDocument(asset_id=asset.id, document_id=doc_uuid))

    # Session is autoflush=False; flush so a subsequent upsert of the same
    # asset in this session sees these pending aliases/links (avoids duplicate
    # inserts violating the unique constraints).
    db.flush()
    return asset


def set_metadata(
    db: Session,
    asset: Asset,
    field: str,
    value: Any,
    confidence: Optional[float] = None,
    document_id: Optional[str] = None,
    source_filename: Optional[str] = None,
    page_number: Optional[int] = None,
    snippet: Optional[str] = None,
) -> None:
    """Upsert one metadata field with provenance. Highest confidence wins."""
    if value in (None, "", []) or field not in METADATA_FIELDS:
        return
    value_str = str(value)[:1000]
    row = db.query(AssetMetadata).filter(
        AssetMetadata.asset_id == asset.id, AssetMetadata.field == field
    ).first()
    if row is None:
        db.add(AssetMetadata(
            asset_id=asset.id, field=field, value=value_str, confidence=confidence,
            source_document_id=_as_uuid(document_id), source_filename=source_filename,
            page_number=page_number, snippet=(snippet or "")[:500] or None,
        ))
        db.flush()  # session is autoflush=False; make this row visible to later lookups
    elif (confidence or 0) > (row.confidence or 0):
        row.value = value_str
        row.confidence = confidence
        row.source_document_id = _as_uuid(document_id)
        row.source_filename = source_filename
        row.page_number = page_number
        row.snippet = (snippet or "")[:500] or None

    # Mirror a couple of enriched fields onto the asset row for fast filtering.
    if field == "criticality" and value_str:
        asset.criticality = value_str
    if field == "operational_status" and value_str and not asset.status:
        asset.status = value_str


def add_incident(db: Session, user_id: str, data: Dict[str, Any],
                 affected_asset_names: Iterable[str],
                 document_id: Optional[str] = None, source_filename: Optional[str] = None) -> Optional[Incident]:
    uid = _as_uuid(user_id)
    title = str(data.get("title") or "").strip()
    if uid is None or not title:
        return None
    # De-dup incidents by (title, source document).
    doc_uuid = _as_uuid(document_id) if document_id else None
    existing = db.query(Incident).filter(
        Incident.user_id == uid, Incident.title == title, Incident.source_document_id == doc_uuid
    ).first()
    if existing:
        return existing

    inc = Incident(
        user_id=uid, title=title,
        severity=data.get("severity"), symptoms=data.get("symptoms") or [],
        root_cause=data.get("root_cause"), impact=data.get("impact"), downtime=data.get("downtime"),
        corrective_actions=data.get("corrective_actions") or [],
        preventive_actions=data.get("preventive_actions") or [],
        recommendations=data.get("recommendations") or [],
        confidence=data.get("confidence"), source_document_id=doc_uuid, source_filename=source_filename,
    )
    db.add(inc)
    db.flush()

    for aname in affected_asset_names:
        key = canonical_key(aname)
        asset = db.query(Asset).filter(Asset.user_id == uid, Asset.canonical_key == key).first()
        if asset:
            db.add(IncidentAsset(incident_id=inc.id, asset_id=asset.id))
    return inc


def remove_document(db: Session, document_id: str) -> None:
    """
    On document delete: unlink the document from assets, then delete any asset
    (and its incidents) no longer referenced by any surviving document. Keeps
    the store consistent with the document catalog (req 3/9 cascade).
    """
    doc_uuid = _as_uuid(document_id)
    if doc_uuid is None:
        return
    links = db.query(AssetDocument).filter(AssetDocument.document_id == doc_uuid).all()
    affected_asset_ids = {l.asset_id for l in links}
    for l in links:
        db.delete(l)
    db.flush()

    # Incidents sourced from this document go away with it (FK cascade covers
    # incident_assets); also drop now-orphaned assets.
    db.query(Incident).filter(Incident.source_document_id == doc_uuid).delete(synchronize_session=False)

    for asset_id in affected_asset_ids:
        remaining = db.query(AssetDocument).filter(AssetDocument.asset_id == asset_id).count()
        if remaining == 0:
            asset = db.query(Asset).filter(Asset.id == asset_id).first()
            if asset:
                db.delete(asset)  # cascades to aliases/metadata/incident links
    db.commit()


def sync_from_graph(db: Session, user_id: str, graph: Dict[str, Any]) -> int:
    """
    Backfill/refresh the asset store from the user's current knowledge graph:
    upsert every classified maintainable asset and (re)link its documents.
    Idempotent — safe to run on every upload and at startup for existing data.
    Returns the number of assets upserted.
    """
    count = 0
    for node in graph.get("nodes", []):
        data = node.get("data", {})
        name = str(data.get("name") or data.get("title") or data.get("id") or "").strip()
        if not name:
            continue
        doc_ids = data.get("document_ids") or []
        result = classify_entity(node.get("type"), name, data, corroborating_documents=len(doc_ids) or 1)
        if result is None or result.group not in MAINTAINABLE_GROUPS:
            continue
        status = str(data.get("status") or "").strip() or None
        first_doc = doc_ids[0] if doc_ids else None
        asset = upsert_asset(
            db, user_id, name, result.asset_type, result.group,
            result.confidence, result.confidence_band, document_id=first_doc, status=status,
        )
        if asset is None:
            continue
        for d in doc_ids[1:]:
            duuid = _as_uuid(d)
            if duuid and not db.query(AssetDocument).filter(
                AssetDocument.asset_id == asset.id, AssetDocument.document_id == duuid
            ).first():
                db.add(AssetDocument(asset_id=asset.id, document_id=duuid))
        count += 1
    db.commit()
    return count


# ── Read path ────────────────────────────────────────────────────────────────
def list_assets(db: Session, user_id: str) -> List[Asset]:
    uid = _as_uuid(user_id)
    if uid is None:
        return []
    return db.query(Asset).filter(Asset.user_id == uid).all()


def metadata_dict(asset: Asset) -> Dict[str, Any]:
    """Field -> {value, confidence, source_document, page_number, snippet}."""
    return {
        m.field: {
            "value": m.value, "confidence": m.confidence,
            "source_document": m.source_filename, "page_number": m.page_number,
            "snippet": m.snippet,
        }
        for m in asset.metadata_entries
    }


def incidents_for_asset(db: Session, asset: Asset) -> List[Dict[str, Any]]:
    out = []
    for link in asset.incident_links:
        inc = link.incident
        out.append({
            "id": str(inc.id), "title": inc.title, "severity": inc.severity,
            "symptoms": inc.symptoms or [], "root_cause": inc.root_cause, "impact": inc.impact,
            "downtime": inc.downtime, "corrective_actions": inc.corrective_actions or [],
            "preventive_actions": inc.preventive_actions or [], "recommendations": inc.recommendations or [],
            "confidence": inc.confidence, "source_document": inc.source_filename,
        })
    return out


def open_incident_count(db: Session, user_id: str) -> int:
    uid = _as_uuid(user_id)
    if uid is None:
        return 0
    return db.query(Incident).filter(Incident.user_id == uid).count()
