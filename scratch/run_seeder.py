import sys
import os

# Add scraper-service to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../apps/scraper-service")))

from models import SessionLocal, init_db
from scheduler import seed_default_sources

print("Initializing DB...")
init_db()
db = SessionLocal()
print("Seeding default sources...")
seed_default_sources(db)
db.close()
print("Seeded successfully.")
