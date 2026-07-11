"""
Tests for the PostgreSQL asset store (Phase 2): canonical de-duplication,
alias tracking, document links, metadata provenance, and delete cascade.
Runs offline against the temp SQLite DB (see conftest).
"""
import uuid

from app.db.session import SessionLocal
from app.services import asset_store
from app.services.asset_store import canonical_key
import uuid as _uuid
from app.models.asset import AssetDocument
from app.models.user import User, UserRole
from app.core.security import hash_password


def _make_user(db) -> str:
    u = User(email=f"asset-{uuid.uuid4().hex[:8]}@x.io", password_hash=hash_password("x"),
             full_name="Asset Tester", role=UserRole.ENGINEER)
    db.add(u)
    db.commit()
    db.refresh(u)
    return str(u.id)


def test_canonical_key_dedup_variants(client):
    assert canonical_key("Server A") == canonical_key("server-a") == canonical_key("SERVER_A")


def test_upsert_dedups_and_tracks_aliases(client):
    db = SessionLocal()
    try:
        uid = _make_user(db)
        d1, d2 = str(uuid.uuid4()), str(uuid.uuid4())
        asset_store.upsert_asset(db, uid, "Server A", "Server", "asset", 0.7, "Review Suggested", document_id=d1)
        asset_store.upsert_asset(db, uid, "server-a", "Server", "asset", 0.95, "Auto Approved", document_id=d2)
        db.commit()

        assets = asset_store.list_assets(db, uid)
        assert len(assets) == 1, "name variants must merge into one asset"
        a = assets[0]
        # Higher-confidence classification wins on merge.
        assert a.confidence == 0.95
        # Both spellings tracked as aliases.
        aliases = {al.alias for al in a.aliases}
        assert {"Server A", "server-a"} <= aliases
    finally:
        db.close()


def test_metadata_provenance_and_highest_confidence_wins(client):
    db = SessionLocal()
    try:
        uid = _make_user(db)
        asset = asset_store.upsert_asset(db, uid, "Pump P-9", "Pump", "asset", 0.8, "Review Suggested",
                                         document_id=str(uuid.uuid4()))
        db.commit()
        asset_store.set_metadata(db, asset, "manufacturer", "Grundfos", confidence=0.6,
                                 source_filename="a.pdf", snippet="mfr Grundfos")
        asset_store.set_metadata(db, asset, "manufacturer", "GRUNDFOS AB", confidence=0.9,
                                 source_filename="b.pdf", snippet="Manufacturer: GRUNDFOS AB")
        # Unknown field is ignored (never invented columns).
        asset_store.set_metadata(db, asset, "not_a_real_field", "x", confidence=0.9)
        db.commit()

        meta = asset_store.metadata_dict(asset)
        assert "not_a_real_field" not in meta
        assert meta["manufacturer"]["value"] == "GRUNDFOS AB"      # highest confidence won
        assert meta["manufacturer"]["source_document"] == "b.pdf"  # provenance retained
        assert meta["manufacturer"]["snippet"]
    finally:
        db.close()


def test_remove_document_cascade_and_orphan_cleanup(client):
    db = SessionLocal()
    try:
        uid = _make_user(db)
        shared_doc, only_doc = str(uuid.uuid4()), str(uuid.uuid4())
        # "Shared Motor" is referenced by two documents; "Lonely Valve" by one.
        asset_store.upsert_asset(db, uid, "Shared Motor", "Motor", "asset", 0.8, "Review Suggested", document_id=shared_doc)
        asset_store.upsert_asset(db, uid, "Shared Motor", "Motor", "asset", 0.8, "Review Suggested", document_id=only_doc)
        asset_store.upsert_asset(db, uid, "Lonely Valve", "Valve", "asset", 0.8, "Review Suggested", document_id=only_doc)
        db.commit()
        assert len(asset_store.list_assets(db, uid)) == 2

        # Delete only_doc: the motor survives (still referenced by shared_doc),
        # the valve is orphaned and removed.
        asset_store.remove_document(db, only_doc)
        remaining = {a.name for a in asset_store.list_assets(db, uid)}
        assert remaining == {"Shared Motor"}

        # Deleting the last document removes the motor and all its rows.
        asset_store.remove_document(db, shared_doc)
        assert asset_store.list_assets(db, uid) == []
        # Scope to THIS test's documents (the DB is shared across tests).
        for d in (shared_doc, only_doc):
            assert db.query(AssetDocument).filter(
                AssetDocument.document_id == _uuid.UUID(d)
            ).count() == 0
    finally:
        db.close()


def test_sync_from_graph_upserts_maintainable_only(client):
    db = SessionLocal()
    try:
        uid = _make_user(db)
        graph = {"nodes": [
            {"id": "n1", "type": "Machine", "data": {"id": "M1", "name": "Pump P-77", "user_id": uid, "document_ids": [str(uuid.uuid4())]}},
            {"id": "n2", "type": "Engineer", "data": {"id": "E1", "name": "Jane Doe", "user_id": uid, "document_ids": [str(uuid.uuid4())]}},
            {"id": "n3", "type": "SOP", "data": {"id": "S1", "name": "SOP-MECH-1", "user_id": uid, "document_ids": []}},
        ], "relationships": []}
        n = asset_store.sync_from_graph(db, uid, graph)
        assert n == 1  # only the pump is a maintainable asset
        names = {a.name for a in asset_store.list_assets(db, uid)}
        assert names == {"Pump P-77"}
    finally:
        db.close()
