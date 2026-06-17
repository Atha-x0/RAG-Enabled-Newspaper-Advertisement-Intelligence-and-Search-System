import os
import sys
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

sys.path.insert(0, os.path.join(BASE_DIR, "apps", "scraper-service"))
from web_scraper import RealTimeWebSearchOrchestrator

orchestrator = RealTimeWebSearchOrchestrator()
print("Searching for 'Siemens Motor'...")
results = orchestrator.search("Siemens Motor", ["Siemens", "Motor"])
print(f"Found {len(results)} results:")
for r in results:
    print(f"- Title: {r.title}")
    print(f"  Relevance: {r.relevance_score}")
    print(f"  Source Priority: {r.source_priority}")
    print(f"  Source URL: {r.source_url}")
    print(f"  Phone: {r.contact_phone}")
    print(f"  Is Ad: {r.is_verified_ad}")
    print("-" * 40)
