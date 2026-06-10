import os
from dotenv import load_dotenv

# Search for root-level .env
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
root_env = os.path.join(BASE_DIR, ".env")
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()

DB_PATH = os.path.join(BASE_DIR, "database.sqlite")

DATABASE_URL = os.getenv("SCRAPER_DATABASE_URL", f"sqlite:///{DB_PATH}")

# Local directory to store downloaded PDFs/images
DOWNLOAD_DIR = os.getenv("SCRAPER_DOWNLOAD_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "downloads")))
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Endpoint to upload pages to Express API
UPLOAD_ENDPOINT = os.getenv("BACKEND_UPLOAD_ENDPOINT", "http://localhost:5000/api/v1/pages/upload")

# System Poppler path for pdf2image conversion
# If Poppler is not in system PATH on Windows, path to bin can be defined here
POPPLER_PATH = os.getenv("POPPLER_PATH", None)
