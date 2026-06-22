import os
import sys
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

sys.path.insert(0, os.path.join(BASE_DIR, "apps", "backend"))
from app.database import SessionLocal
from app.web_search_service import WebSearchService

db = SessionLocal()
wss = WebSearchService()

print("Calling WebSearchService.search for 'Siemens Motor'...")
results = wss.search(db, "Siemens Motor")
print(f"Found {len(results)} results:")
for r in results:
    print(f"- Title: {r.get('title')}")
    print(f"  Publication Date: {r.get('publication_date')}")
    print(f"  Source URL: {r.get('source_url')}")
    print(f"  Source Priority Label: {r.get('source_priority_label')}")
    print("-" * 40)

db.close()
