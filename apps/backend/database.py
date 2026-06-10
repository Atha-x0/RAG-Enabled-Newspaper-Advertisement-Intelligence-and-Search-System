import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Determine database URL. Fallback to root-level SQLite database.
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DEFAULT_SQLITE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'database.sqlite')}"

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)
if DATABASE_URL.startswith("postgres://"):
    # Fix for Heroku/standard PostgreSQL compatibility in SQLAlchemy 1.4+
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite check_same_thread is only applicable for SQLite
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
