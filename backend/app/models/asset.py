"""
Postgres asset store — the source of truth for maintenance assets.

Neo4j remains for relationships and FAISS for embeddings; the durable asset
record (identity, aliases, per-field metadata with provenance, and incidents)
lives here in PostgreSQL. Populated during document ingestion and kept in sync
on delete (see app.services.asset_store).
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, DateTime, Float, Integer, Text, ForeignKey, UniqueConstraint, JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (UniqueConstraint("user_id", "canonical_key", name="uq_asset_user_canonical"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Normalized identity key — "Server A"/"server-a"/"SERVER_A" all share one.
    canonical_key = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)                  # best display name
    asset_type = Column(String, nullable=False)            # taxonomy type (Pump, Server, PLC…)
    asset_group = Column(String, nullable=False)           # coarse group
    confidence = Column(Float, nullable=False, default=0.0)
    confidence_band = Column(String, nullable=True)
    status = Column(String, nullable=True)
    criticality = Column(String, nullable=True)
    risk_level = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    aliases = relationship("AssetAlias", back_populates="asset", cascade="all, delete-orphan")
    metadata_entries = relationship("AssetMetadata", back_populates="asset", cascade="all, delete-orphan")
    documents = relationship("AssetDocument", back_populates="asset", cascade="all, delete-orphan")
    incident_links = relationship("IncidentAsset", back_populates="asset", cascade="all, delete-orphan")


class AssetAlias(Base):
    """Original name variants that merged into one canonical asset (req 8)."""
    __tablename__ = "asset_aliases"
    __table_args__ = (UniqueConstraint("asset_id", "alias", name="uq_alias_asset"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String, nullable=False)

    asset = relationship("Asset", back_populates="aliases")


class AssetMetadata(Base):
    """
    One enriched field per row (EAV), with full provenance so users always know
    WHY a value was extracted (req 3, 11). A missing field is simply an absent
    row — values are NULL, never invented.
    """
    __tablename__ = "asset_metadata"
    __table_args__ = (UniqueConstraint("asset_id", "field", name="uq_meta_asset_field"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    field = Column(String, nullable=False)                 # e.g. "manufacturer"
    value = Column(String, nullable=False)
    confidence = Column(Float, nullable=True)
    source_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    source_filename = Column(String, nullable=True)
    page_number = Column(Integer, nullable=True)
    snippet = Column(Text, nullable=True)                  # text the value was extracted from

    asset = relationship("Asset", back_populates="metadata_entries")


class AssetDocument(Base):
    """Which documents reference an asset (drives orphan cleanup on delete)."""
    __tablename__ = "asset_documents"
    __table_args__ = (UniqueConstraint("asset_id", "document_id", name="uq_asset_document"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)

    asset = relationship("Asset", back_populates="documents")


class Incident(Base):
    """Structured incident detected from a document (req 5)."""
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    severity = Column(String, nullable=True)
    symptoms = Column(JSON, nullable=True)                 # list[str]
    root_cause = Column(Text, nullable=True)
    impact = Column(Text, nullable=True)
    downtime = Column(String, nullable=True)
    corrective_actions = Column(JSON, nullable=True)       # list[str]
    preventive_actions = Column(JSON, nullable=True)       # list[str]
    recommendations = Column(JSON, nullable=True)          # list[str]
    confidence = Column(Float, nullable=True)
    source_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True)
    source_filename = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    asset_links = relationship("IncidentAsset", back_populates="incident", cascade="all, delete-orphan")


class IncidentAsset(Base):
    """Link an incident to the assets it affected."""
    __tablename__ = "incident_assets"
    __table_args__ = (UniqueConstraint("incident_id", "asset_id", name="uq_incident_asset"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)

    incident = relationship("Incident", back_populates="asset_links")
    asset = relationship("Asset", back_populates="incident_links")
