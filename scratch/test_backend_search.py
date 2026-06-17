import os
import sys
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Setup python path exactly as backend does
sys.path.insert(0, os.path.join(BASE_DIR, "apps", "backend"))
from app.database import SessionLocal
from app.web_search_service import WebSearchService

db = SessionLocal()
wss = WebSearchService()
print("Initialized WebSearchService.")
print("Is orchestrator configured:", wss.orchestrator is not None)
print("Is expander configured:", wss.expander is not None)

print("Running search...")
try:
    results = wss.search(db, "Siemens Motor")
    print(f"WebSearchService search returned {len(results)} results:")
    for r in results:
        print(f"- Title: {r.get('title')} (Source: {r.get('source_name')}, Relevance: {r.get('relevance_score')})")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
