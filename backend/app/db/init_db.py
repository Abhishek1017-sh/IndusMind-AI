import logging
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.db.session import engine, Base, SessionLocal
from app.db.base import User  # Make sure models are registered
from app.models.user import UserRole
from app.core.security import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _apply_lightweight_migrations() -> None:
    """
    SQLAlchemy's create_all() only creates missing TABLES, never adds new
    COLUMNS to tables that already exist. This applies the small set of
    additive column migrations this project needs so an existing dev/prod DB
    picks them up without a full migration framework. Each is guarded so it's
    a no-op when the column is already present.
    """
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if "documents" in table_names:
        existing_columns = {col["name"] for col in inspector.get_columns("documents")}
        if "category" not in existing_columns:
            logger.info("Migrating: adding documents.category column.")
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE documents ADD COLUMN category VARCHAR"))
        if "intelligence" not in existing_columns:
            logger.info("Migrating: adding documents.intelligence column.")
            col_type = "JSONB" if engine.dialect.name == "postgresql" else "JSON"
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE documents ADD COLUMN intelligence {col_type}"))

    # reports.report_type moved from a native DB enum to a plain VARCHAR so
    # new report types (e.g. EXECUTIVE) don't need an ALTER TYPE migration.
    # Convert an existing Postgres native-enum column in place; SQLite already
    # stores it as text so it needs nothing.
    if "reports" in table_names and engine.dialect.name == "postgresql":
        try:
            # SQLAlchemy's inspector reflects a native Postgres enum as VARCHAR(n),
            # so it can't tell an enum column apart from a real varchar. Query
            # information_schema instead: a native enum reports data_type
            # 'USER-DEFINED', a real text column reports 'character varying'/'text'.
            with engine.begin() as conn:
                row = conn.execute(text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name = 'reports' AND column_name = 'report_type'"
                )).fetchone()
                data_type = (row[0] if row else "").lower()
                if data_type and "char" not in data_type and "text" not in data_type:
                    logger.info(
                        "Migrating: converting reports.report_type (%s) from native enum to VARCHAR.",
                        data_type,
                    )
                    conn.execute(text(
                        "ALTER TABLE reports ALTER COLUMN report_type TYPE VARCHAR USING report_type::text"
                    ))
        except Exception as e:
            logger.warning(f"Could not convert reports.report_type to VARCHAR (may already be text): {e}")


def init_db(db: Session) -> None:
    # Tables are created using SQLAlchemy metadata
    logger.info("Creating tables...")
    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()
    logger.info("Tables created successfully.")

    # Create default admin user if not exists
    logger.info("Checking for default admin user...")
    admin_email = "admin@industrial.ai"
    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        logger.info(f"Creating default admin user: {admin_email}")
        admin = User(
            email=admin_email,
            password_hash=hash_password("adminpassword123"),
            full_name="System Administrator",
            role=UserRole.ADMIN
        )
        db.add(admin)
        db.commit()
        logger.info("Default admin user created successfully.")
    else:
        logger.info("Default admin user already exists.")


def main() -> None:
    logger.info("Initializing database...")
    db = SessionLocal()
    try:
        init_db(db)
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise e
    finally:
        db.close()
    logger.info("Database initialization completed.")


if __name__ == "__main__":
    main()
