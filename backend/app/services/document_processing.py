import logging
import os
import traceback
import uuid

from app.db.session import SessionLocal
from app.models.document import Document, DocumentChunk, DocumentStatus
from app.services.ocr_service import extract_text
from app.services.chunking import split_text_into_chunks
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)


def process_document_task(document_id: str, session_id: str) -> None:
    """
    Synchronous processing function intended to be run in a background executor.
    Opens its own DB session since the request-scoped session is closed by the
    time FastAPI's BackgroundTasks actually execute this function.
    1. Extracts text from file.
    2. Splits text into chunks.
    3. Saves chunks to database.
    4. Generates embeddings and saves to FAISS.
    5. Extracts entities and relationships, updates Neo4j.
    6. Updates status in PostgreSQL database.
    """
    logger.info(f"Starting background processing for document: {document_id}")
    db = SessionLocal()
    doc_uuid = uuid.UUID(document_id)

    document = db.query(Document).filter(Document.id == doc_uuid).first()
    if not document:
        logger.error(f"Document {document_id} not found in database.")
        db.close()
        return

    # Update status to PROCESSING
    document.status = DocumentStatus.PROCESSING
    db.commit()

    try:
        # Step 1: Text extraction (PyMuPDF / Tesseract fallback)
        if not os.path.exists(document.file_path):
            raise FileNotFoundError(f"File not found on disk: {document.file_path}")
            
        logger.info(f"Extracting text from: {document.file_path}")
        text_content = extract_text(document.file_path)
        
        if not text_content.strip():
            raise ValueError("No text could be extracted from this document.")
            
        logger.info(f"Text extraction complete. Characters extracted: {len(text_content)}")

        # Step 1.5: Auto-classify the document type from its own text, so the
        # Maintenance / Compliance / Reports dashboards can be populated
        # automatically. Non-blocking: a classification failure must never
        # fail the whole upload.
        try:
            from app.services.document_classifier import classify_document
            document.category = classify_document(text_content, document.filename)
            db.commit()
            logger.info(f"Document classified as: {document.category}")
        except Exception as classify_err:
            logger.error(f"Document classification failed (non-blocking): {classify_err}")

        # Step 2: Chunking
        logger.info("Splitting text into chunks...")
        chunks = split_text_into_chunks(text_content)
        logger.info(f"Document split into {len(chunks)} chunks.")

        # Step 3: Save chunks to PostgreSQL & prep vectors
        texts_to_embed = []
        metadatas_to_embed = []
        
        for idx, chunk_text in enumerate(chunks):
            chunk_db = DocumentChunk(
                document_id=document.id,
                chunk_index=idx,
                content=chunk_text
            )
            db.add(chunk_db)
            
            # Prepare data for Vector database
            texts_to_embed.append(chunk_text)
            metadatas_to_embed.append({
                "document_id": str(document.id),
                "user_id": str(document.uploaded_by),
                "filename": document.filename,
                "chunk_index": idx,
                "upload_time": document.created_at.isoformat() if document.created_at else None,
                "session_id": session_id,
            })
            
        # Commit to Postgres to generate chunk IDs
        db.commit()

        # Step 4: Add chunks to FAISS Index
        logger.info("Adding chunks to FAISS index...")
        vector_store.add_chunks(texts_to_embed, metadatas_to_embed)
        logger.info("FAISS indexing complete.")

        # Step 5: Entity and Relationship extraction for Neo4j
        logger.info("Extracting entities and relationships for Neo4j...")
        try:
            from app.services.entity_extractor import extract_and_sync_entities
            extract_and_sync_entities(
                document.filename, text_content, str(document.uploaded_by), str(document.id),
                file_type=document.file_type,
                upload_time=document.created_at.isoformat() if document.created_at else None,
            )
            logger.info("Neo4j knowledge graph updated successfully.")
        except Exception as graph_err:
            logger.error(f"Neo4j extraction/sync failed (non-blocking for document status): {graph_err}")
            logger.error(traceback.format_exc())

        # Step 5.5: Persist assets to the PostgreSQL asset store (source of
        # truth), enrich their metadata and extract incidents from this
        # document. Non-blocking — a failure here must never fail the upload.
        try:
            _sync_asset_store(db, document, text_content)
            logger.info("Asset store updated successfully.")
        except Exception as asset_err:
            logger.error(f"Asset store sync failed (non-blocking): {asset_err}")
            logger.error(traceback.format_exc())
            db.rollback()

        # Step 6: Mark document as COMPLETED
        document.status = DocumentStatus.COMPLETED
        db.commit()
        logger.info(f"Successfully processed document: {document.filename} (ID: {document_id})")

    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        logger.error(traceback.format_exc())
        
        # Rollback database changes, then set status to FAILED
        db.rollback()
        
        # Re-fetch document inside transaction to avoid detached state
        document = db.query(Document).filter(Document.id == doc_uuid).first()
        if document:
            document.status = DocumentStatus.FAILED
            document.error_message = str(e)[:500]  # Cap length
            db.commit()

    finally:
        db.close()


def _sync_asset_store(db, document, text_content: str) -> None:
    """
    Populate the PostgreSQL asset store from this user's current knowledge
    graph, then (when Gemini is available) enrich the assets' metadata and
    extract incidents from THIS document's text. Grounded and non-inventive:
    metadata/incidents come only from the document, and stay NULL/empty when
    Gemini is offline.
    """
    from app.services.graph_db import graph_db
    from app.services import asset_store
    from app.services.metadata_enricher import enrich_assets
    from app.services.incident_extractor import extract_incidents

    user_id = str(document.uploaded_by)
    doc_id = str(document.id)

    # 1. Upsert/refresh assets from the graph (dedup + document links).
    graph = graph_db.get_owned_graph(user_id)
    asset_store.sync_from_graph(db, user_id, graph)

    # 2. The assets this document actually references (by document link).
    assets = asset_store.list_assets(db, user_id)
    doc_assets = [
        a for a in assets
        if any(str(link.document_id) == doc_id for link in a.documents)
    ]
    asset_names = [a.name for a in doc_assets]
    if not asset_names:
        db.commit()
        return

    # 3. Metadata enrichment with provenance (Gemini; NULL when offline).
    enriched = enrich_assets(text_content, asset_names)
    by_name = {a.name: a for a in doc_assets}
    for aname, fields in enriched.items():
        asset = by_name.get(aname)
        if not asset:
            continue
        for field, spec in fields.items():
            asset_store.set_metadata(
                db, asset, field, spec.get("value"), confidence=spec.get("confidence"),
                document_id=doc_id, source_filename=document.filename, snippet=spec.get("snippet"),
            )

    # 4. Structured incidents linked to affected assets (Gemini; [] offline).
    for inc in extract_incidents(text_content, asset_names):
        asset_store.add_incident(
            db, user_id, inc, inc.get("affected_assets") or [],
            document_id=doc_id, source_filename=document.filename,
        )

    db.commit()
