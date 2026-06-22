import sys
import os
import unittest
from dotenv import load_dotenv
from sqlalchemy.orm import Session

# Setup python path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))
sys.path.insert(0, os.path.join(BASE_DIR, "apps", "backend"))

from app.database import SessionLocal, engine
import app.models as models
from app.web_search_service import WebSearchService
from web_scraper import WebScrapedResult

db = SessionLocal()
service = WebSearchService()

# Create a mock query
query = "Havells Switchgear Mock Search"

# Setup raw results: 1 VERIFIED, 1 PARTIAL, 1 AI-generated (REJECTED)
mock_verified = WebScrapedResult(
    title="Premium Havells MCB Switchgear",
    description="Authorized dealer supplying Havells switchgears and MCBs. In stock. Rs 450 per unit. Call +919876543210 for orders.",
    contact_phone="+919876543210",
    price=450.0,
    price_text="Rs 450",
    source_name="TradeIndia",
    source_type="directory",
    source_priority=4,
    source_url="https://www.tradeindia.com/mock-verified-switchgear"
)

mock_partial = WebScrapedResult(
    title="Havells Distribution Panel",
    description="We supply industrial Havells panels. Contact us.",
    contact_phone="+919876543210",
    price=None,
    price_text="",
    source_name="TradeIndia",
    source_type="directory",
    source_priority=4,
    source_url="https://www.tradeindia.com/mock-partial-panel"
)

mock_ai = WebScrapedResult(
    title="Synthetic Havells Switch",
    description="AI-generated description: Havells synthetic switch. Mock price Rs 200.",
    contact_phone="+919876543210",
    price=200.0,
    price_text="Rs 200",
    source_name="Gemini AI Generated",
    source_type="directory",
    source_priority=4,
    source_url="https://example.com/mock-ai-generated"
)

# Temporarily override search scrapers to return our mocks
class MockOrchestrator:
    def __init__(self):
        from ad_classifier import AdClassifier
        self.classifier = AdClassifier()
    def search(self, *args, **kwargs):
        return [mock_verified, mock_partial, mock_ai]

service.orchestrator = MockOrchestrator()

# Run the search
print("Running search mapping...")
results, _ = service.search(db, query, limit=5)

print("\n--- RESULTS STATUSES ---")
for r in results:
    print(f"Title: {r.get('title')} | Status: {r.get('verification_status')} | URL: {r.get('source_url')}")

# Verify that they are persisted in DB with the correct status
print("\nChecking SQLite records:")
for url in [mock_verified.source_url, mock_partial.source_url, mock_ai.source_url]:
    db_row = db.query(models.WebScrapedResult).filter(models.WebScrapedResult.source_url == url).first()
    if db_row:
        print(f"DB Row URL: {db_row.source_url} | Verification Status: {db_row.verification_status}")
        # Clean up database
        db.delete(db_row)
        # Delete evidence too
        evidence = db.query(models.AdvertisementEvidence).filter(models.AdvertisementEvidence.web_scraped_result_id == db_row.id).first()
        if evidence:
            db.delete(evidence)
db.commit()
print("Database cleaned up.")
