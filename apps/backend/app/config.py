from dotenv import load_dotenv
import os

# Project root-level resolution (three levels up from apps/backend/app/config.py)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

# Try loading .env from project root
root_env = os.path.join(BASE_DIR, ".env")
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'database.sqlite')}"
elif DATABASE_URL.startswith("sqlite:///"):
    # Strip sqlite:/// to see if it's absolute or relative
    db_path = DATABASE_URL[9:]
    if not os.path.isabs(db_path) and ":" not in db_path:
        DATABASE_URL = f"sqlite:///{os.path.abspath(os.path.join(BASE_DIR, db_path))}"

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH")
if not CHROMA_DB_PATH:
    CHROMA_DB_PATH = os.path.join(BASE_DIR, "chroma_db")
elif not os.path.isabs(CHROMA_DB_PATH):
    CHROMA_DB_PATH = os.path.abspath(os.path.join(BASE_DIR, CHROMA_DB_PATH))

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8000")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "384"))



