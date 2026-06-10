import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import DATABASE_URL, BASE_DIR

logger = logging.getLogger("Database")

current_db_url = DATABASE_URL
fallback_db_url = f"sqlite:///{os.path.join(BASE_DIR, 'database.sqlite')}"

engine = None
SessionLocal = sessionmaker(autocommit=False, autoflush=False)

def initialize_database():
    global engine, current_db_url
    try:
        connect_args = {"check_same_thread": False} if current_db_url.startswith("sqlite") else {}
        if "postgresql" in current_db_url:
            connect_args["connect_timeout"] = 3
        
        test_engine = create_engine(current_db_url, connect_args=connect_args)
        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        engine = test_engine
        SessionLocal.configure(bind=engine)
        logger.info(f"Database connected successfully: {current_db_url}")
    except Exception as e:
        logger.warning(f"Failed to connect to primary database ({current_db_url}): {e}")
        if current_db_url != fallback_db_url:
            logger.warning(f"Falling back to local SQLite database at: {fallback_db_url}")
            current_db_url = fallback_db_url
            connect_args = {"check_same_thread": False}
            engine = create_engine(current_db_url, connect_args=connect_args)
            SessionLocal.configure(bind=engine)
        else:
            logger.error("Fallback SQLite database failed! Using in-memory SQLite.")
            current_db_url = "sqlite:///:memory:"
            connect_args = {"check_same_thread": False}
            engine = create_engine(current_db_url, connect_args=connect_args)
            SessionLocal.configure(bind=engine)

initialize_database()

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

