import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Integer, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.session import Base


class DocumentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # pdf, docx, xlsx, image
    file_path = Column(String, nullable=False)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING, nullable=False)
    error_message = Column(String, nullable=True)
    file_size = Column(Integer, nullable=False)
    # Auto-detected document type (see app.services.document_classifier),
    # populated during background processing. Drives the Maintenance /
    # Compliance / Reports dashboards. Nullable so pre-existing rows and
    # still-processing uploads are valid.
    category = Column(String, nullable=True)
    # Document-driven module routing (see app.services.module_router):
    # {"document_type", "modules": {maintenance, compliance, knowledge_graph,
    # reports, chat}, "regulations": [...]}. The document decides which modules
    # it activates — not the UI. Nullable for pre-existing / processing rows.
    intelligence = Column(JSON, nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    vector_id = Column(String, nullable=True)  # References the index key inside FAISS index if needed

    document = relationship("Document", back_populates="chunks")
