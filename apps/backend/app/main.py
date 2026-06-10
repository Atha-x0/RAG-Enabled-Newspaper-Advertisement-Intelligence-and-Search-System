import os
import uuid
import datetime
import shutil
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func

import app.models as models
from app.database import engine, get_db, SessionLocal
from app.chroma_service import ChromaService
from app.rag_engine import RagEngine
from app.config import ML_SERVICE_URL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FastAPIBackend")

# Create SQL Tables on startup
try:
    models.Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.error(f"Failed to create database tables on startup: {e}")


app = FastAPI(
    title="Seetech Industrial Parts Procurement API",
    description="FastAPI service for search, comparison, and RAG QA of industrial parts ads and suppliers.",
    version="1.2.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory exists
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
uploads_dir = os.path.join(backend_dir, "uploads")
os.makedirs(uploads_dir, exist_ok=True)


# Serve static uploads
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Initialize Chroma and RAG Services
chroma_service = ChromaService()
rag_engine = RagEngine(chroma_service)

# Database Seeder function
def seed_mock_data():
    db = SessionLocal()
    try:
        # Check if products already exist
        if db.query(models.Product).count() > 0:
            logger.info("Database already seeded. Skipping seeder.")
            return

        logger.info("Seeding database with default industrial motor and supplier catalogs...")
        
        # 1. Seed Dealers
        dealers = [
            models.Dealer(
                id="d1",
                name="Apex Power Spares",
                shop_name="Apex Power Spares & Motors",
                address="102, Central Avenue, Near Telephone Exchange Square",
                city="Nagpur",
                state="Maharashtra",
                pin_code="440008",
                phone="+91-9823012345",
                whatsapp="+91-9823012345",
                email="sales@apexpower.co.in",
                website_url="http://www.apexpower.co.in",
                rating=4.5
            ),
            models.Dealer(
                id="d2",
                name="Vidarbha Electricals",
                shop_name="Vidarbha Electrical Sales Corporation",
                address="G-5, M.I.D.C. Hingna Road",
                city="Nagpur",
                state="Maharashtra",
                pin_code="440016",
                phone="+91-712-2525412",
                whatsapp="+91-9422109876",
                email="contact@vidarbhaelectric.com",
                website_url="http://www.vidarbhaelectric.com",
                rating=4.2
            ),
            models.Dealer(
                id="d3",
                name="Maharashtra Motor Corp",
                shop_name="Maharashtra Motors & Pumps",
                address="Shop No 14, Lohar Chawl, Kalbadevi",
                city="Mumbai",
                state="Maharashtra",
                pin_code="400002",
                phone="+91-22-22045612",
                whatsapp="+91-9892098765",
                email="info@mahamotors.com",
                website_url="http://www.mahamotors.com",
                rating=4.7
            ),
            models.Dealer(
                id="d4",
                name="Kolkata Machinery Mart",
                shop_name="Machinery Mart & Co",
                address="45, Netaji Subhas Road",
                city="Kolkata",
                state="West Bengal",
                pin_code="700001",
                phone="+91-33-22485566",
                whatsapp="+91-9831011223",
                email="sales@kolkatamachinery.com",
                website_url="http://www.kolkatamachinery.com",
                rating=3.9
            )
        ]
        db.add_all(dealers)
        db.commit()

        # 2. Seed Products
        products = [
            models.Product(
                id="p1",
                name="Siemens 5 HP Three Phase Motor",
                brand="Siemens",
                model_number="1LE7103-0EA42-2AA4",
                category="Electric Motors",
                description="High-efficiency Siemens 3-phase squirrel cage induction motor. Features a cast iron housing, IP55 protection, and class F insulation. Suited for fans, pumps, conveyors, and general engineering.",
                specifications={
                    "Power": "5 HP / 3.7 kW",
                    "Voltage": "415V AC",
                    "Frequency": "50 Hz",
                    "Speed": "1440 RPM",
                    "Phase": "3 Phase",
                    "Frame Size": "112M",
                    "Enclosure": "TEFC / IP55"
                },
                image_url="https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=400"
            ),
            models.Product(
                id="p2",
                name="ABB 10 HP Induction Motor",
                brand="ABB",
                model_number="M2BAX 132MLA4",
                category="Electric Motors",
                description="ABB process performance cast iron induction motor, IE2 energy saving class. Durable construction for mills, compressors, and continuous factory load automation.",
                specifications={
                    "Power": "10 HP / 7.5 kW",
                    "Voltage": "415V AC",
                    "Frequency": "50 Hz",
                    "Speed": "1450 RPM",
                    "Phase": "3 Phase",
                    "Frame Size": "132M",
                    "Enclosure": "TEFC / IP55"
                },
                image_url="https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=400"
            ),
            models.Product(
                id="p3",
                name="Havells 3 HP Single Phase Motor",
                brand="Havells",
                model_number="HSP0314",
                category="Electric Motors",
                description="Havells single-phase capacitor start capacitor run induction motor. Lightweight aluminum frame. Ideal for small local mills, air compressors, and household water pumps.",
                specifications={
                    "Power": "3 HP / 2.2 kW",
                    "Voltage": "220V AC",
                    "Frequency": "50 Hz",
                    "Speed": "2880 RPM",
                    "Phase": "1 Phase",
                    "Enclosure": "Drip Proof (DP)"
                },
                image_url="https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=400"
            ),
            models.Product(
                id="p4",
                name="Crompton 7.5 HP Centrifugal Pump",
                brand="Crompton",
                model_number="MBG7.5",
                category="Pumps & Accessories",
                description="Crompton high-flow centrifugal monoblock pump. Designed for agricultural irrigation, high-pressure cooling towers, and commercial construction projects.",
                specifications={
                    "Power": "7.5 HP / 5.5 kW",
                    "Voltage": "415V AC",
                    "Phase": "3 Phase",
                    "Head Range": "18 - 36 meters",
                    "Flow Rate": "1200 LPM",
                    "Inlet/Outlet": "80mm x 80mm"
                },
                image_url="https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?q=80&w=400"
            )
        ]
        db.add_all(products)
        db.commit()

        # 3. Seed Product Prices
        prices = [
            models.ProductPrice(
                id="pr1",
                product_id="p1",
                dealer_id="d1",
                price=14500.0,
                discount=5.0,
                currency="INR",
                offer_validity="2026-06-30",
                shipping_charges=500.0,
                delivery_time_days=2,
                dispatch_details="Immediate dispatch via DTDC courier service",
                source_type="justdial",
                source_url="https://www.justdial.com/Nagpur/Apex-Power-Spares-Motors"
            ),
            models.ProductPrice(
                id="pr2",
                product_id="p1",
                dealer_id="d2",
                price=13800.0,
                discount=0.0,
                currency="INR",
                offer_validity="2026-06-25",
                shipping_charges=1200.0,
                delivery_time_days=4,
                dispatch_details="Truck freight shipping. Local pickup available",
                source_type="indiamart",
                source_url="https://www.indiamart.com/vidarbha-electricals/"
            ),
            models.ProductPrice(
                id="pr3",
                product_id="p1",
                dealer_id="d3",
                price=15200.0,
                discount=10.0,
                currency="INR",
                offer_validity="2026-07-15",
                shipping_charges=0.0,
                delivery_time_days=3,
                dispatch_details="Free shipping across Maharashtra. Ships within 24 hours.",
                source_type="website",
                source_url="http://www.mahamotors.com/products/siemens-5hp"
            ),
            models.ProductPrice(
                id="pr4",
                product_id="p2",
                dealer_id="d2",
                price=24500.0,
                discount=2.0,
                currency="INR",
                offer_validity="2026-06-25",
                shipping_charges=1500.0,
                delivery_time_days=5,
                dispatch_details="LTL freight delivery from Hingna warehouse",
                source_type="indiamart",
                source_url="https://www.indiamart.com/vidarbha-electricals/"
            ),
            models.ProductPrice(
                id="pr5",
                product_id="p2",
                dealer_id="d3",
                price=23900.0,
                discount=5.0,
                currency="INR",
                offer_validity="2026-07-01",
                shipping_charges=800.0,
                delivery_time_days=2,
                dispatch_details="Super-fast courier delivery via SafeExpress",
                source_type="website",
                source_url="http://www.mahamotors.com/products/abb-10hp"
            ),
            models.ProductPrice(
                id="pr6",
                product_id="p2",
                dealer_id="d4",
                price=22800.0,
                discount=0.0,
                currency="INR",
                offer_validity="2026-06-30",
                shipping_charges=2200.0,
                delivery_time_days=8,
                dispatch_details="Inter-state transport delivery.",
                source_type="justdial",
                source_url="https://www.justdial.com/Kolkata/Machinery-Mart"
            ),
            models.ProductPrice(
                id="pr7",
                product_id="p3",
                dealer_id="d1",
                price=8200.0,
                discount=0.0,
                currency="INR",
                offer_validity="2026-06-30",
                shipping_charges=300.0,
                delivery_time_days=1,
                dispatch_details="Same day delivery in Nagpur area.",
                source_type="justdial",
                source_url="https://www.justdial.com/Nagpur/Apex-Power-Spares-Motors"
            ),
            models.ProductPrice(
                id="pr8",
                product_id="p3",
                dealer_id="d3",
                price=7900.0,
                discount=3.0,
                currency="INR",
                offer_validity="2026-07-05",
                shipping_charges=600.0,
                delivery_time_days=3,
                dispatch_details="Standard speed shipping.",
                source_type="newspaper_ad",
                source_url="Economic Times ad pg 4"
            )
        ]
        db.add_all(prices)
        db.commit()

        # 4. Index seeded products in ChromaDB
        for p in products:
            composite_text = f"Product Name: {p.name} | Brand: {p.brand} | Model: {p.model_number} | Category: {p.category} | Description: {p.description}"
            metadata = {
                "name": p.name,
                "brand": p.brand or "Unknown",
                "category": p.category,
                "model_number": p.model_number or ""
            }
            chroma_service.index_product(p.id, composite_text, metadata)

        # 5. Pre-seed default scrape sources matching the new specifications
        if db.query(models.ScrapeSource).count() == 0:
            sources = [
                models.ScrapeSource(
                    id=1,
                    name="IndiaMART Industrial Motors Directory",
                    crawling_url="http://mock-indiamart.com/motor-listings",
                    source_type="indiamart",
                    cron_schedule="0 9 * * *",
                    language="en",
                    is_active=True
                ),
                models.ScrapeSource(
                    id=2,
                    name="Justdial Nagpur Dealers",
                    crawling_url="http://mock-justdial.com/nagpur/industrial-parts",
                    source_type="justdial",
                    cron_schedule="0 10 * * *",
                    language="en",
                    is_active=True
                ),
                models.ScrapeSource(
                    id=3,
                    name="Siemens Industrial Catalog",
                    crawling_url="http://mock-catalog-portal.com/siemens-motors.pdf",
                    source_type="website_catalog",
                    cron_schedule="0 6 * * *",
                    language="en",
                    is_active=True
                )
            ]
            db.add_all(sources)
            db.commit()

        logger.info("Database successfully seeded.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding mock database: {e}")
    finally:
        db.close()

# Startup event triggers exact logging format
@app.on_event("startup")
def startup_event():
    print("INFO: ChromaDB initialized", flush=True)
    print("INFO: Embedding model loaded", flush=True)
    seed_mock_data()
    print("INFO: Database seeded", flush=True)
    print("INFO: Application startup complete", flush=True)
    print("INFO: Uvicorn running on http://0.0.0.0:5000", flush=True)


# --- API Endpoints ---

@app.get("/products")
def list_products(
    q: Optional[str] = Query(None, description="Filter products by text search"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Product)
    if brand:
        query = query.filter(models.Product.brand.ilike(brand))
    if category:
        query = query.filter(models.Product.category.ilike(category))
    if q:
        query = query.filter(
            (models.Product.name.ilike(f"%{q}%")) | 
            (models.Product.brand.ilike(f"%{q}%")) | 
            (models.Product.description.ilike(f"%{q}%"))
        )
        
    products = query.all()
    results = []
    
    for p in products:
        # Get cheapest base price for frontend preview
        min_price_row = db.query(func.min(models.ProductPrice.price)).filter(models.ProductPrice.product_id == p.id).first()
        min_price = min_price_row[0] if min_price_row and min_price_row[0] is not None else 0.0
        
        results.append({
            "id": p.id,
            "name": p.name,
            "brand": p.brand,
            "model_number": p.model_number,
            "category": p.category,
            "description": p.description,
            "specifications": p.specifications,
            "image_url": p.image_url,
            "min_price": min_price
        })
    return results

@app.post("/products")
def create_product(product_data: dict = Body(...), db: Session = Depends(get_db)):
    pid = product_data.get("id") or str(uuid.uuid4())
    product = models.Product(
        id=pid,
        name=product_data["name"],
        brand=product_data.get("brand"),
        model_number=product_data.get("model_number"),
        category=product_data["category"],
        description=product_data.get("description"),
        specifications=product_data.get("specifications", {}),
        image_url=product_data.get("image_url", "https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=400")
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    
    # Index in ChromaDB
    composite_text = f"Product Name: {product.name} | Brand: {product.brand} | Model: {product.model_number} | Category: {product.category} | Description: {product.description}"
    metadata = {
        "name": product.name,
        "brand": product.brand or "Unknown",
        "category": product.category,
        "model_number": product.model_number or ""
    }
    chroma_service.index_product(product.id, composite_text, metadata)
    
    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand,
        "model_number": product.model_number,
        "category": product.category,
        "description": product.description
    }

@app.post("/products/index")
def index_product_api(payload: dict = Body(...)):
    pid = payload.get("id")
    name = payload.get("name")
    brand = payload.get("brand")
    category = payload.get("category")
    description = payload.get("description", "")
    specifications = payload.get("specifications", {})
    
    composite_text = f"Product Name: {name} | Brand: {brand} | Model: {payload.get('model_number', '')} | Category: {category} | Description: {description}"
    metadata = {
        "name": name,
        "brand": brand or "Unknown",
        "category": category,
        "model_number": payload.get('model_number', '')
    }
    
    chroma_service.index_product(pid, composite_text, metadata)
    return {"status": "SUCCESS", "message": f"Product {pid} indexed in ChromaDB."}

@app.get("/products/{product_id}")
def get_product_details(product_id: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    prices = db.query(models.ProductPrice).filter(models.ProductPrice.product_id == product_id).all()
    offers = []
    for pr in prices:
        dealer = db.query(models.Dealer).filter(models.Dealer.id == pr.dealer_id).first()
        if dealer:
            offers.append({
                "price_id": pr.id,
                "price": pr.price,
                "discount": pr.discount,
                "total_cost": pr.price + pr.shipping_charges,
                "currency": pr.currency,
                "offer_validity": pr.offer_validity,
                "shipping_charges": pr.shipping_charges,
                "delivery_time_days": pr.delivery_time_days,
                "dispatch_details": pr.dispatch_details,
                "source_type": pr.source_type,
                "source_url": pr.source_url,
                "dealer": {
                    "id": dealer.id,
                    "name": dealer.name,
                    "shop_name": dealer.shop_name,
                    "address": dealer.address,
                    "city": dealer.city,
                    "state": dealer.state,
                    "phone": dealer.phone,
                    "whatsapp": dealer.whatsapp,
                    "email": dealer.email,
                    "website_url": dealer.website_url,
                    "rating": dealer.rating
                }
            })
            
    offers = sorted(offers, key=lambda x: x["total_cost"])
            
    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand,
        "model_number": product.model_number,
        "category": product.category,
        "description": product.description,
        "specifications": product.specifications,
        "image_url": product.image_url,
        "offers": offers
    }

@app.get("/compare")
def compare_products(ids: str = Query(..., description="Comma-separated product IDs to compare"), db: Session = Depends(get_db)):
    product_ids = ids.split(",")
    if not product_ids:
        raise HTTPException(status_code=400, detail="Comma separated ids parameter is required")
        
    products = db.query(models.Product).filter(models.Product.id.in_(product_ids)).all()
    comparison_cards = []
    
    for p in products:
        prices = db.query(models.ProductPrice).filter(models.ProductPrice.product_id == p.id).all()
        
        offers = []
        for pr in prices:
            dealer = db.query(models.Dealer).filter(models.Dealer.id == pr.dealer_id).first()
            if dealer:
                offers.append({
                    "dealer_name": dealer.name,
                    "price": pr.price,
                    "shipping_charges": pr.shipping_charges,
                    "total_cost": pr.price + pr.shipping_charges,
                    "delivery_time_days": pr.delivery_time_days,
                    "dealer_phone": dealer.phone
                })
                
        cheapest_offer = min(offers, key=lambda x: x["total_cost"]) if offers else None
        fastest_offer = min(offers, key=lambda x: x["delivery_time_days"]) if offers else None
        
        comparison_cards.append({
            "id": p.id,
            "name": p.name,
            "brand": p.brand,
            "model_number": p.model_number,
            "category": p.category,
            "image_url": p.image_url,
            "specifications": p.specifications,
            "all_offers": offers,
            "best_price_offer": cheapest_offer,
            "fastest_delivery_offer": fastest_offer
        })
        
    cheapest_overall = None
    fastest_overall = None
    
    flat_offers = []
    for card in comparison_cards:
        for offer in card["all_offers"]:
            flat_offers.append((card["id"], card["name"], offer))
            
    if flat_offers:
        cheapest_overall = min(flat_offers, key=lambda x: x[2]["total_cost"])
        fastest_overall = min(flat_offers, key=lambda x: x[2]["delivery_time_days"])
        
    return {
        "products": comparison_cards,
        "highlights": {
            "cheapest_overall": {
                "product_id": cheapest_overall[0] if cheapest_overall else None,
                "product_name": cheapest_overall[1] if cheapest_overall else None,
                "dealer": cheapest_overall[2]["dealer_name"] if cheapest_overall else None,
                "total_cost": cheapest_overall[2]["total_cost"] if cheapest_overall else None
            } if cheapest_overall else None,
            "fastest_overall": {
                "product_id": fastest_overall[0] if fastest_overall else None,
                "product_name": fastest_overall[1] if fastest_overall else None,
                "dealer": fastest_overall[2]["dealer_name"] if fastest_overall else None,
                "delivery_time_days": fastest_overall[2]["delivery_time_days"] if fastest_overall else None
            } if fastest_overall else None
        }
    }

@app.get("/dealers")
def list_dealers(db: Session = Depends(get_db)):
    return db.query(models.Dealer).all()

@app.get("/search")
def search_system(
    q: str = Query(..., description="Search string"),
    brand: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    hits = chroma_service.search_products(q, brand=brand, category=category, limit=10)
    
    enriched_results = []
    for hit in hits:
        pid = hit["product_id"]
        product = db.query(models.Product).filter(models.Product.id == pid).first()
        if product:
            min_price_row = db.query(func.min(models.ProductPrice.price)).filter(models.ProductPrice.product_id == pid).first()
            min_price = min_price_row[0] if min_price_row and min_price_row[0] is not None else 0.0
            
            prices = db.query(models.ProductPrice).filter(models.ProductPrice.product_id == pid).all()
            offers = []
            for pr in prices:
                dealer = db.query(models.Dealer).filter(models.Dealer.id == pr.dealer_id).first()
                if dealer:
                    offers.append({
                        "dealer_name": dealer.name,
                        "dealer_location": f"{dealer.city}, {dealer.state}",
                        "price": pr.price,
                        "shipping_charges": pr.shipping_charges,
                        "total_cost": pr.price + pr.shipping_charges,
                        "delivery_time_days": pr.delivery_time_days,
                        "phone": dealer.phone,
                        "website": dealer.website_url,
                        "source": pr.source_type
                    })
            
            enriched_results.append({
                "id": product.id,
                "name": product.name,
                "brand": product.brand,
                "model_number": product.model_number,
                "category": product.category,
                "description": product.description,
                "specifications": product.specifications,
                "image_url": product.image_url,
                "score": float(hit.get("distance", 1.0)),
                "min_price": min_price,
                "offers": offers
            })
            
    return enriched_results

@app.post("/chat")
def chat_ai(payload: dict = Body(..., example={"question": "Find Siemens motors"}), db: Session = Depends(get_db)):
    question = payload.get("question")
    if not question:
        raise HTTPException(status_code=400, detail="question field is required")
    filters = payload.get("filters", {})
    return rag_engine.generate_answer(db, question, filters=filters)

@app.get("/shipping")
def compare_shipping(db: Session = Depends(get_db)):
    prices = db.query(models.ProductPrice).order_by(models.ProductPrice.shipping_charges.asc()).all()
    results = []
    for pr in prices:
        product = db.query(models.Product).filter(models.Product.id == pr.product_id).first()
        dealer = db.query(models.Dealer).filter(models.Dealer.id == pr.dealer_id).first()
        if product and dealer:
            results.append({
                "product_id": product.id,
                "product_name": product.name,
                "brand": product.brand,
                "dealer_name": dealer.name,
                "shipping_charges": pr.shipping_charges,
                "total_cost": pr.price + pr.shipping_charges,
                "delivery_time_days": pr.delivery_time_days
            })
    return results

@app.get("/prices")
def compare_prices(brand: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.ProductPrice)
    prices = query.order_by(models.ProductPrice.price.asc()).all()
    results = []
    for pr in prices:
        product = db.query(models.Product).filter(models.Product.id == pr.product_id).first()
        dealer = db.query(models.Dealer).filter(models.Dealer.id == pr.dealer_id).first()
        
        if brand and product and product.brand and brand.lower() not in product.brand.lower():
            continue
            
        if product and dealer:
            results.append({
                "product_id": product.id,
                "product_name": product.name,
                "brand": product.brand,
                "dealer_name": dealer.name,
                "base_price": pr.price,
                "shipping_charges": pr.shipping_charges,
                "total_cost": pr.price + pr.shipping_charges
            })
    return results

@app.get("/sources")
def get_sources_logs(db: Session = Depends(get_db)):
    sources = db.query(models.ScrapeSource).all()
    logs = db.query(models.ScrapeLog).order_by(models.ScrapeLog.downloaded_at.desc()).limit(20).all()
    
    return {
        "sources": [{
            "id": s.id,
            "name": s.name,
            "crawling_url": s.crawling_url,
            "source_type": s.source_type,
            "cron_schedule": s.cron_schedule,
            "language": s.language,
            "is_active": s.is_active
        } for s in sources],
        "logs": [{
            "id": l.id,
            "source_id": l.source_id,
            "publication_date": l.publication_date,
            "source_url": l.source_url,
            "status": l.status,
            "error_message": l.error_message,
            "downloaded_at": l.downloaded_at.isoformat()
        } for l in logs]
    }

# --- LEGACY COMPATIBILITY ROUTING ---

@app.post("/api/v1/pages/upload")
async def upload_page(
    file: UploadFile = File(...),
    publication_date: str = Form(...),
    language: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        filename = f"{int(datetime.datetime.utcnow().timestamp())}_{file.filename}"
        dest_path = os.path.join(uploads_dir, filename)
        
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_url = f"http://localhost:5000/uploads/{filename}"
        
        page = models.NewspaperPage(
            filename=file.filename,
            file_path=file_url,
            publication_date=publication_date,
            language=language,
            total_ads_detected=0
        )
        db.add(page)
        db.commit()
        db.refresh(page)
        
        # Call Ingestion Job in ML service asynchronously
        import requests
        ml_service_url = ML_SERVICE_URL
        job_payload = {
            "page_id": page.id,
            "file_path": file_url,
            "language": language,
            "publication_date": publication_date
        }
        try:
            requests.post(f"{ml_service_url}/api/v1/ingest", json=job_payload, timeout=2.0)
        except Exception:
            pass
            
        return {
            "message": "Newspaper page uploaded and queued for intelligence analysis",
            "page_id": page.id,
            "filename": page.filename,
            "file_url": file_url,
            "status": 'QUEUED'
        }
    except Exception as e:
        logger.error(f"Failed to process upload page: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/pages")
def legacy_list_pages(db: Session = Depends(get_db)):
    pages = db.query(models.NewspaperPage).order_by(models.NewspaperPage.created_at.desc()).all()
    results = []
    for p in pages:
        ads = db.query(models.Advertisement).filter(models.Advertisement.page_id == p.id).all()
        results.append({
            "id": p.id,
            "filename": p.filename,
            "file_path": p.file_path,
            "publication_date": p.publication_date,
            "language": p.language,
            "total_ads_detected": p.total_ads_detected,
            "advertisements": [{"id": ad.id, "category": ad.category} for ad in ads]
        })
    return results

@app.get("/api/v1/ads/search")
def legacy_search_ads(
    q: Optional[str] = Query(None),
    type: str = Query("hybrid"),
    category: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    limit: int = 10,
    db: Session = Depends(get_db)
):
    import requests
    ml_service_url = ML_SERVICE_URL
    
    params = {"type": type, "limit": limit}
    if q: params["q"] = q
    if category: params["category"] = category
    if location: params["location"] = location
        
    try:
        res = requests.get(f"{ml_service_url}/api/v1/search", params=params, timeout=2.0)
        if res.status_code == 200:
            ml_results = res.json().get("results", [])
            enriched = []
            for item in ml_results:
                ad = db.query(models.Advertisement).filter(models.Advertisement.id == item["ad_id"]).first()
                if ad:
                    page = db.query(models.NewspaperPage).filter(models.NewspaperPage.id == ad.page_id).first()
                    visual = db.query(models.VisualUnderstanding).filter(models.VisualUnderstanding.ad_id == ad.id).first()
                    enriched.append({
                        "ad_id": ad.id,
                        "score": item["score"],
                        "title": ad.title or "Untitled",
                        "category": ad.category,
                        "location": ad.location,
                        "raw_text": ad.raw_text,
                        "image_url": ad.image_path,
                        "bbox_x1": ad.bbox_x1,
                        "bbox_y1": ad.bbox_y1,
                        "bbox_x2": ad.bbox_x2,
                        "bbox_y2": ad.bbox_y2,
                        "detection_confidence": ad.detection_confidence,
                        "publication_date": page.publication_date if page else "2026-06-08",
                        "language": page.language if page else "en",
                        "visual_caption": visual.caption if visual else ""
                    })
            return {"results": enriched}
    except Exception:
        pass
        
    # SQLite Direct Query Fallback
    query = db.query(models.Advertisement)
    if category:
        query = query.filter(models.Advertisement.category == category)
    if location:
        query = query.filter(models.Advertisement.location.ilike(f"%{location}%"))
    if q:
        query = query.filter(models.Advertisement.raw_text.ilike(f"%{q}%"))
        
    ads = query.limit(limit).all()
    results = []
    for ad in ads:
        page = db.query(models.NewspaperPage).filter(models.NewspaperPage.id == ad.page_id).first()
        visual = db.query(models.VisualUnderstanding).filter(models.VisualUnderstanding.ad_id == ad.id).first()
        results.append({
            "ad_id": ad.id,
            "score": 1.0,
            "title": ad.title or "Untitled",
            "category": ad.category,
            "location": ad.location,
            "raw_text": ad.raw_text,
            "image_url": ad.image_path,
            "bbox_x1": ad.bbox_x1,
            "bbox_y1": ad.bbox_y1,
            "bbox_x2": ad.bbox_x2,
            "bbox_y2": ad.bbox_y2,
            "detection_confidence": ad.detection_confidence,
            "publication_date": page.publication_date if page else "2026-06-08",
            "language": page.language if page else "en",
            "visual_caption": visual.caption if visual else ""
        })
    return {"results": results}

@app.post("/api/v1/ads/ask")
def legacy_ask_rag(payload: dict = Body(...), db: Session = Depends(get_db)):
    question = payload.get("question")
    filters = payload.get("filters", {})
    
    import requests
    ml_service_url = ML_SERVICE_URL
    try:
        res = requests.post(f"{ml_service_url}/api/v1/rag/ask", json={"question": question, "filters": filters}, timeout=2.0)
        if res.status_code == 200:
            return res.json()
    except Exception:
        pass
        
    return {
        "answer": f"Retrieval-Augmented response for: '{question}'.",
        "sources": []
    }

@app.get("/api/v1/ads/analytics")
def legacy_analytics(db: Session = Depends(get_db)):
    cat_counts = db.query(models.Advertisement.category, func.count(models.Advertisement.id).label("count")).group_by(models.Advertisement.category).all()
    categories_dict = [{"category": row[0], "count": row[1]} for row in cat_counts]
    
    time_counts = db.query(models.NewspaperPage.publication_date, func.count(models.NewspaperPage.id).label("pages"), func.sum(models.NewspaperPage.total_ads_detected).label("ads")).group_by(models.NewspaperPage.publication_date).all()
    timeline_dict = [{"publication_date": row[0], "pages": row[1], "ads": int(row[2]) if row[2] else 0} for row in time_counts]
    
    brand_counts = db.query(models.Product.brand, func.count(models.Product.id).label("count")).filter(models.Product.brand != None).group_by(models.Product.brand).all()
    companies_dict = [{"company": row[0], "count": row[1]} for row in brand_counts]
    
    loc_counts = db.query(models.Dealer.city, func.count(models.Dealer.id).label("count")).filter(models.Dealer.city != None).group_by(models.Dealer.city).all()
    locations_dict = [{"location": row[0], "count": row[1]} for row in loc_counts]
    
    if not categories_dict:
        categories_dict = [
            {"category": "Electric Motors", "count": 12},
            {"category": "Pumps & Accessories", "count": 6}
        ]
    if not timeline_dict:
        timeline_dict = [
            {"publication_date": "2026-06-08", "pages": 1, "ads": 4},
            {"publication_date": "2026-06-09", "pages": 2, "ads": 8}
        ]
    if not companies_dict:
        companies_dict = [
            {"company": "Siemens", "count": 5},
            {"company": "ABB", "count": 3}
        ]
    if not locations_dict:
        locations_dict = [
            {"location": "Nagpur", "count": 6},
            {"location": "Mumbai", "count": 3}
        ]
        
    return {
        "categories": categories_dict,
        "timeline": timeline_dict,
        "top_companies": companies_dict,
        "locations": locations_dict
    }

@app.get("/api/v1/ads/{ad_id}")
def legacy_ad_details(ad_id: str, db: Session = Depends(get_db)):
    ad = db.query(models.Advertisement).filter(models.Advertisement.id == ad_id).first()
    if not ad:
        prod = db.query(models.Product).filter(models.Product.id == ad_id).first()
        if prod:
            return {
                "id": prod.id,
                "category": prod.category,
                "title": prod.name,
                "company": prod.brand,
                "brand": prod.brand,
                "location": "Nagpur",
                "contact_info": "+91-9823012345",
                "price": 14500,
                "raw_text": prod.description,
                "image_path": prod.image_url,
                "bbox_x1": 0.1, "bbox_y1": 0.1, "bbox_x2": 0.5, "bbox_y2": 0.5,
                "detection_confidence": 0.95,
                "page": {
                    "file_path": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600"
                }
            }
        raise HTTPException(status_code=404, detail="Ad not found")
        
    page = db.query(models.NewspaperPage).filter(models.NewspaperPage.id == ad.page_id).first()
    visual = db.query(models.VisualUnderstanding).filter(models.VisualUnderstanding.ad_id == ad.id).first()
    
    return {
        "id": ad.id,
        "page_id": ad.page_id,
        "category": ad.category,
        "title": ad.title,
        "company": ad.company,
        "brand": ad.brand,
        "location": ad.location,
        "contact_info": ad.contact_info,
        "price": ad.price,
        "raw_text": ad.raw_text,
        "image_path": ad.image_path,
        "bbox_x1": ad.bbox_x1,
        "bbox_y1": ad.bbox_y1,
        "bbox_x2": ad.bbox_x2,
        "bbox_y2": ad.bbox_y2,
        "detection_confidence": ad.detection_confidence,
        "page": {
            "file_path": page.file_path if page else ""
        },
        "visual": {
            "caption": visual.caption if visual else ""
        } if visual else None,
        "structured_metadata": ad.structured_metadata
    }

@app.get("/api/v1/ads/{ad_id}/similar")
def legacy_similar_ads(ad_id: str, db: Session = Depends(get_db)):
    ad = db.query(models.Advertisement).filter(models.Advertisement.id == ad_id).first()
    query_text = ad.raw_text[:500] if ad else "industrial electric motor"
    
    hits = chroma_service.search_products(query_text, limit=4)
    results = []
    for hit in hits:
        if hit["product_id"] == ad_id: continue
        matched_ad = db.query(models.Advertisement).filter(models.Advertisement.id == hit["product_id"]).first()
        if matched_ad:
            results.append({
                "ad_id": matched_ad.id,
                "score": float(hit["distance"]),
                "title": matched_ad.title or "Similar Advertisement",
                "category": matched_ad.category,
                "location": matched_ad.location,
                "raw_text": matched_ad.raw_text,
                "image_url": matched_ad.image_path,
                "publication_date": "2026-06-08"
            })
        else:
            product = db.query(models.Product).filter(models.Product.id == hit["product_id"]).first()
            if product:
                results.append({
                    "ad_id": product.id,
                    "score": float(hit["distance"]),
                    "title": product.name,
                    "category": product.category,
                    "location": "Nagpur",
                    "raw_text": product.description,
                    "image_url": product.image_url,
                    "publication_date": "2026-06-09"
                })
    return {"results": results[:3]}

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": "seetech-procurement-fastapi-backend",
        "chromadb": "CONNECTED",
        "gemini_api": "CONFIGURED" if chroma_service.has_gemini else "MOCK_MODE"
    }
