import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, documents, chat, graph, compliance, reports, maintenance
from app.db.session import SessionLocal
from app.db.init_db import init_db
from app.models.document import Document
from app.services.graph_db import graph_db
from app.services.vector_store import vector_store

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set CORS middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["AI Chat"])
app.include_router(graph.router, prefix=f"{settings.API_V1_STR}/graph", tags=["Knowledge Graph"])
app.include_router(compliance.router, prefix=f"{settings.API_V1_STR}/compliance", tags=["Compliance Agent"])
app.include_router(maintenance.router, prefix=f"{settings.API_V1_STR}/maintenance", tags=["Maintenance Intelligence"])
app.include_router(reports.router, prefix=f"{settings.API_V1_STR}/reports", tags=["Reports"])


@app.on_event("startup")
def on_startup():
    logger.info("Starting up FastAPI application...")
    
    # 1. Initialize PostgreSQL tables and seed admin user
    try:
        logger.info("Initializing relational database...")
        db = SessionLocal()
        init_db(db)
        db.close()
        logger.info("Relational database initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize relational database on startup: {e}")

    # 2. Reconcile the vector index against the database so it only ever contains
    #    chunks for documents that actually still exist — this self-heals away any
    #    demo/test/orphaned data left over from before this document was deleted,
    #    or from earlier development runs.
    try:
        db = SessionLocal()
        valid_ids = {str(doc_id) for (doc_id,) in db.query(Document.id).all()}
        db.close()
        vector_store.reconcile_with_documents(valid_ids)
        logger.info(f"Vector index reconciled against {len(valid_ids)} existing document(s).")
    except Exception as e:
        logger.error(f"Failed to reconcile vector index with database: {e}")

    # 3. Verify graph database connectivity. The graph only ever reflects
    #    entities extracted from documents you actually upload — there is no
    #    demo/seed data anywhere in the runtime.
    try:
        logger.info("Checking Graph database connectivity...")
        if graph_db.active:
            logger.info("Graph DB is connected to Neo4j.")
        else:
            logger.info("Graph DB is in mock mode (in-memory, empty until documents are uploaded).")
    except Exception as e:
        logger.error(f"Failed to verify graph database connectivity: {e}")

    # 4. Reconcile the knowledge graph against the database, same as the
    #    vector index above — self-heals away any entities/relationships left
    #    over from documents deleted before this document-lifecycle model
    #    existed, or deleted while Neo4j was unreachable, so the graph always
    #    represents only currently-uploaded documents.
    try:
        db = SessionLocal()
        valid_ids = {str(doc_id) for (doc_id,) in db.query(Document.id).all()}
        db.close()
        graph_db.reconcile_with_documents(valid_ids)
    except Exception as e:
        logger.error(f"Failed to reconcile graph database with documents: {e}")

    # 5. Reconcile the reports folder against the database — deletes orphaned
    #    PDF files that have no Report row (e.g. reports generated into an
    #    abandoned SQLite-fallback database), so the reports folder always
    #    matches the Postgres source of truth.
    try:
        from app.services.report_service import reconcile_report_files
        db = SessionLocal()
        reconcile_report_files(db)
        db.close()
    except Exception as e:
        logger.error(f"Failed to reconcile reports folder with database: {e}")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "api_docs": "/docs"
    }
