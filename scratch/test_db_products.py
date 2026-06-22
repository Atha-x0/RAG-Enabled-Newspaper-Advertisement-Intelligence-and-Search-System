import os
import sys
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

sys.path.insert(0, os.path.join(BASE_DIR, "apps", "backend"))
from app.database import SessionLocal
import app.models as models

db = SessionLocal()
products = db.query(models.Product).all()
print(f"Products count: {len(products)}")
for p in products:
    print(f"- ID: {p.id}, Name: {p.name}, Brand: {p.brand}, Category: {p.category}")
    prices = db.query(models.ProductPrice).filter(models.ProductPrice.product_id == p.id).all()
    print(f"  Offers ({len(prices)}):")
    for pr in prices:
        dealer = db.query(models.Dealer).filter(models.Dealer.id == pr.dealer_id).first()
        print(f"    * Price ID: {pr.id}, Dealer: {dealer.name if dealer else 'Unknown'}, Price: {pr.price}, Source: {pr.source_type}")

db.close()
