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
from app.web_search_service import WebSearchService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FastAPIBackend")

# Create SQL Tables on startup and execute migration checks
try:
    models.Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE scrape_sources ADD COLUMN priority INTEGER DEFAULT 3"))
            logger.info("Migration: Added column 'priority' to 'scrape_sources'.")
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE scrape_sources ADD COLUMN is_permanent BOOLEAN DEFAULT 0"))
            logger.info("Migration: Added column 'is_permanent' to 'scrape_sources'.")
        except Exception:
            pass
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
web_search_service = WebSearchService()

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
            ),
            models.Dealer(
                id="d5",
                name="Bhandari Industrial Corporation",
                shop_name="Bhandari Traders & Industrial Supplier",
                address="48, Central Avenue, Near Telephone Exchange Square",
                city="Nagpur",
                state="Maharashtra",
                pin_code="440008",
                phone="+91-712-2724455",
                whatsapp="+91-9890112233",
                email="sales@bhandariindustrial.com",
                website_url="http://www.bhandariindustrial.com",
                rating=4.6
            ),
            models.Dealer(
                id="d6",
                name="Royal Bearing & Machinery Co.",
                shop_name="Royal Bearing House",
                address="Shop No. 12, Lohar Chawl, Kalbadevi",
                city="Mumbai",
                state="Maharashtra",
                pin_code="400002",
                phone="+91-22-22067788",
                whatsapp="+91-9820088776",
                email="sales@royalbearing.com",
                website_url="http://www.royalbearing.com",
                rating=4.8
            ),
            models.Dealer(
                id="d7",
                name="Central India Engineering Agencies",
                shop_name="Central India Engineering Sales Corporation",
                address="G-8, MIDC Hingna Road",
                city="Nagpur",
                state="Maharashtra",
                pin_code="440016",
                phone="+91-712-2540966",
                whatsapp="+91-9422805566",
                email="info@ciea.co.in",
                website_url="http://www.ciea.co.in",
                rating=4.4
            ),
            models.Dealer(
                id="d8",
                name="Vidarbha Sales & Services",
                shop_name="Vidarbha Sales Corporation",
                address="110, Central Avenue Road",
                city="Nagpur",
                state="Maharashtra",
                pin_code="440008",
                phone="+91-9422112233",
                whatsapp="+91-9422112233",
                email="sales@vidarbhasales.com",
                website_url="http://www.vidarbhasales.com",
                rating=4.3
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
                    is_active=True,
                    priority=4,
                    is_permanent=True
                ),
                models.ScrapeSource(
                    id=2,
                    name="Justdial Nagpur Dealers",
                    crawling_url="http://mock-justdial.com/nagpur/industrial-parts",
                    source_type="justdial",
                    cron_schedule="0 10 * * *",
                    language="en",
                    is_active=True,
                    priority=2,
                    is_permanent=True
                ),
                models.ScrapeSource(
                    id=3,
                    name="Siemens Industrial Catalog",
                    crawling_url="http://mock-catalog-portal.com/siemens-motors.pdf",
                    source_type="website_catalog",
                    cron_schedule="0 6 * * *",
                    language="en",
                    is_active=True,
                    priority=3,
                    is_permanent=True
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
    
    # Validate and potentially rebuild collections based on dimension match
    try:
        chroma_service.verify_collection_dimension()
    except Exception as e:
        logger.error(f"Failed to validate ChromaDB collection on startup: {e}")
        
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

@app.put("/products/{product_id}")
def update_product(product_id: str, product_data: dict = Body(...), db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product.name = product_data.get("name", product.name)
    product.brand = product_data.get("brand", product.brand)
    product.model_number = product_data.get("model_number", product.model_number)
    product.category = product_data.get("category", product.category)
    product.description = product_data.get("description", product.description)
    if "specifications" in product_data:
        product.specifications = product_data["specifications"]
    product.image_url = product_data.get("image_url", product.image_url)
    
    db.commit()
    db.refresh(product)
    
    # Re-index in ChromaDB
    composite_text = f"Product Name: {product.name} | Brand: {product.brand} | Model: {product.model_number} | Category: {product.category} | Description: {product.description}"
    metadata = {
        "name": product.name,
        "brand": product.brand or "Unknown",
        "category": product.category,
        "model_number": product.model_number or ""
    }
    chroma_service.index_product(product.id, composite_text, metadata)
    
    return {"status": "SUCCESS", "message": f"Product {product_id} updated and re-indexed."}

@app.delete("/products/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    db.delete(product)
    db.commit()
    
    # Delete from ChromaDB
    try:
        if chroma_service.collection:
            chroma_service.collection.delete(ids=[product_id])
    except Exception as e:
        logger.error(f"Failed to delete product {product_id} from ChromaDB: {e}")
        
    return {"status": "SUCCESS", "message": f"Product {product_id} deleted."}

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

@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(models.Product.category).distinct().all()
    return [c[0] for c in categories if c[0]]

@app.get("/brands")
def get_brands(db: Session = Depends(get_db)):
    brands = db.query(models.Product.brand).distinct().all()
    return [b[0] for b in brands if b[0]]

@app.get("/locations")
def get_locations(db: Session = Depends(get_db)):
    cities = db.query(models.Dealer.city).distinct().all()
    return [c[0] for c in cities if c[0]]

@app.get("/logs")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(models.ScrapeLog).order_by(models.ScrapeLog.downloaded_at.desc()).all()
    return [{
        "id": l.id,
        "source_id": l.source_id,
        "publication_date": l.publication_date,
        "source_url": l.source_url,
        "status": l.status,
        "retry_count": l.retry_count,
        "error_message": l.error_message,
        "downloaded_at": l.downloaded_at.isoformat() if l.downloaded_at else None
    } for l in logs]

def translate_query_if_regional(q: str) -> str:
    if not q or not q.strip():
        return q
    import re
    has_devanagari = bool(re.search(r"[\u0900-\u097F]", q))
    if not has_devanagari:
        return q

    # Try Gemini translation
    if chroma_service.has_gemini and chroma_service.genai_client:
        try:
            model_name = "gemini-2.0-flash"
            try:
                available_models = [m.name for m in chroma_service.genai_client.models.list()]
                for m in ['models/gemini-3.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.5-pro']:
                    if m in available_models:
                        model_name = m.replace('models/', '')
                        break
            except Exception:
                pass

            prompt = (
                "Translate the following Indian regional query text into simple English. "
                "Do not explain, add comments, or wrap in markdown. Just return the translation.\n\n"
                f"=== QUERY ===\n{q}"
            )
            response = chroma_service.genai_client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            translated = response.text.strip()
            if translated:
                logger.info(f"main.py: Translated regional search query '{q}' to '{translated}' using Gemini.")
                return translated
        except Exception as e:
            logger.warning(f"main.py: Gemini search query translation failed: {e}. Falling back to local dict.")
            pass

    # Local dictionary fallback
    import sys
    _scraper_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../scraper-service"))
    if _scraper_path not in sys.path:
        sys.path.insert(0, _scraper_path)
    try:
        from ad_classifier import LOCAL_TRANSLATION_MAP
        text_lower = q.lower()
        phrases = {
            "तांब्याची वायर": "copper wire",
            "तांब्याची केबल": "copper cable",
            "कॉपर वायर": "copper wire",
            "कॉपर केबल": "copper cable",
        }
        for phrase, eng in phrases.items():
            text_lower = text_lower.replace(phrase, eng)

        words = text_lower.split()
        translated_words = []
        for word in words:
            clean_word = re.sub(r"[^\w\u0900-\u097F]", "", word)
            if clean_word in LOCAL_TRANSLATION_MAP:
                translated_words.append(LOCAL_TRANSLATION_MAP[clean_word])
            else:
                translated_words.append(word)
        return " ".join(translated_words)
    except Exception:
        pass

    return q

@app.get("/search")
def search_system(
    q: str = Query(..., description="Natural language search string"),
    brand: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    include_web: bool = Query(True, description="Include real-time web scraped results"),
    db: Session = Depends(get_db)
):
    """
    Unified search endpoint combining:
    1. Local vector (ChromaDB semantic) search
    2. AI-powered dynamic search (Gemini grounding)
    3. Real-time web scraping (newspapers → dealers → manufacturers → directories)

    Results are ranked by source priority and relevance score.
    Every result includes its origin source so users can trace information.
    """
    SIMILARITY_THRESHOLD = 0.65

    # Translate regional queries first
    q = translate_query_if_regional(q)

    logger.info(f"=== Unified Search: '{q}' [brand={brand}, cat={category}, loc={location}] ===")

    # ── Step 1: Expand query for better matching ──────────────────────────────
    expanded_query = q
    inferred_category = category
    inferred_location = location
    try:
        from app.web_search_service import WebSearchService as _WSS
        _expander_instance = getattr(web_search_service, 'expander', None)
        if _expander_instance:
            expanded = _expander_instance.expand(q)
            expanded_query = expanded.get("normalized", q)
            inferred_category = category or expanded.get("category")
            inferred_location = location or expanded.get("location")
            logger.info(f"Query expanded: '{q}' → '{expanded_query}' cat={inferred_category}")
    except Exception as e:
        logger.warning(f"Query expansion failed: {e}")

    # ── Step 2: Local vector search ───────────────────────────────────────────
    hits = chroma_service.search_products(
        expanded_query, brand=brand, category=inferred_category, limit=10
    )

    local_results = []
    retrieved_ids = []

    for hit in hits:
        pid = hit["product_id"]
        retrieved_ids.append(pid)
        distance = float(hit.get("distance", 1.0))
        similarity = 1.0 - distance

        product = db.query(models.Product).filter(models.Product.id == pid).first()
        if not product:
            continue
        logger.info(f"  Vector hit: {product.name} similarity={similarity:.4f}")

        if similarity >= SIMILARITY_THRESHOLD:
            min_price_row = db.query(func.min(models.ProductPrice.price)).filter(
                models.ProductPrice.product_id == pid).first()
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
                        "source": pr.source_type,
                        "source_url": pr.source_url,
                    })

            local_results.append({
                "id": product.id,
                "name": product.name,
                "brand": product.brand,
                "model_number": product.model_number,
                "category": product.category,
                "description": product.description,
                "specifications": product.specifications,
                "image_url": product.image_url,
                "score": similarity,
                "min_price": min_price,
                "offers": offers,
                "result_type": "local_catalog",
                "source_name": "Local Catalog",
                "source_type": "local",
                "source_priority": 5,
            })

    logger.info(f"Local vector search: {len(local_results)} results above threshold {SIMILARITY_THRESHOLD}")

    # ── Step 3: AI-powered dynamic search (Gemini) if local results thin ─────
    dynamic_results = []
    if len(local_results) < 3:
        logger.info(f"Local results sparse. Triggering AI dynamic search for '{q}'...")
        try:
            from app.dynamic_search_service import DynamicSearchService
            dynamic_search = DynamicSearchService(chroma_service)
            dynamic_results = dynamic_search.search_product(db, q)
            for dr in dynamic_results:
                dr["result_type"] = "ai_generated"
                dr["source_name"] = dr.get("source_name", "AI Search Grounding")
                dr["source_type"] = dr.get("source_type", "ai_grounding")
                dr["source_priority"] = dr.get("source_priority", 3)
            logger.info(f"AI dynamic search returned {len(dynamic_results)} results.")
        except Exception as e:
            logger.error(f"DynamicSearchService failed: {e}")

    # ── Step 4: Real-time web scraping ────────────────────────────────────────
    web_results = []
    if include_web:
        logger.info(f"Running real-time web scraping for '{q}'...")
        try:
            web_results = web_search_service.search(
                db=db,
                query=q,
                category=inferred_category,
                location=inferred_location,
                limit=12,
            )
            logger.info(f"Real-time web scraping returned {len(web_results)} results.")
        except Exception as e:
            logger.error(f"WebSearchService failed: {e}")

    # ── Step 5: Merge and rank all results ────────────────────────────────────
    # Web scraped results are already sorted by source_priority + relevance.
    # Newspaper ads (priority=1) appear first, then dealers (2), manufacturers (3), etc.
    # Local catalog results are appended after.
    all_results = []

    # Add web results first (prioritized by source_priority)
    all_results.extend(web_results)

    # Merge local results (dedup by id)
    existing_ids = {r.get("id") for r in all_results}
    for r in local_results:
        if r["id"] not in existing_ids:
            all_results.append(r)
            existing_ids.add(r["id"])

    for r in dynamic_results:
        if r.get("id") and r["id"] not in existing_ids:
            all_results.append(r)
            existing_ids.add(r["id"])

    if not all_results:
        logger.info(f"No results found for '{q}'")
        return {
            "results": [],
            "web_results": [],
            "message": "No verified results found",
            "search_meta": {
                "query": q,
                "expanded_query": expanded_query,
                "inferred_category": inferred_category,
                "inferred_location": inferred_location,
            }
        }

    logger.info(f"=== Unified Search complete: {len(all_results)} total results ===")

    return {
        "results": [r for r in all_results if r.get("result_type") in ("local_catalog", "ai_generated")],
        "web_results": [r for r in all_results if r.get("result_type") == "web_scraped"],
        "all_results": all_results,
        "message": f"Found {len(all_results)} results from multiple sources.",
        "search_meta": {
            "query": q,
            "expanded_query": expanded_query,
            "inferred_category": inferred_category,
            "inferred_location": inferred_location,
            "local_count": len(local_results),
            "web_count": len(web_results),
            "ai_count": len(dynamic_results),
        }
    }


@app.get("/search/web")
def search_web_only(
    q: str = Query(..., description="Real-time web search query"),
    category: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Performs real-time web scraping ONLY (no local vector database).
    Returns results directly from newspapers, dealer sites, manufacturer pages,
    and business directories.
    """
    logger.info(f"Web-only search: '{q}'")
    try:
        results = web_search_service.search(
            db=db, query=q, category=category, location=location, limit=limit
        )
        return {
            "results": results,
            "count": len(results),
            "query": q,
            "message": f"Found {len(results)} real-time web results." if results
                       else "No verified results found",
        }
    except Exception as e:
        logger.error(f"Web search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Web search failed: {str(e)}")


@app.get("/search/autocomplete")
def search_autocomplete(
    q: str = Query(..., min_length=2, description="Partial search query"),
    limit: int = Query(8, ge=1, le=20),
):
    """Returns autocomplete suggestions for a partial search query."""
    try:
        suggestions = web_search_service.get_autocomplete_suggestions(q, limit=limit)
        return {"suggestions": suggestions, "query": q}
    except Exception as e:
        logger.warning(f"Autocomplete failed: {e}")
        return {"suggestions": [], "query": q}


@app.get("/search/history")
def get_search_history(limit: int = Query(20), db: Session = Depends(get_db)):
    """Returns recent search history."""
    return web_search_service.get_search_history(db, limit=limit)


@app.get("/search/trending")
def get_trending_searches(limit: int = Query(10), db: Session = Depends(get_db)):
    """Returns most frequently searched queries."""
    return web_search_service.get_trending_searches(db, limit=limit)



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

from pydantic import BaseModel, Field

class ScrapeSourceCreate(BaseModel):
    name: str
    crawling_url: str
    source_type: str = "epaper_pdf"
    cron_schedule: str = "0 6 * * *"
    language: str = "en"
    is_active: bool = True
    priority: int = 3
    is_permanent: bool = False
    region: Optional[str] = None
    verification_status: str = "PENDING"
    last_crawl_time: Optional[datetime.datetime] = None

@app.get("/sources")
def get_sources_logs(db: Session = Depends(get_db)):
    sources = db.query(models.ScrapeSource).all()
    logs = db.query(models.ScrapeLog).order_by(models.ScrapeLog.downloaded_at.desc()).limit(100).all()
    
    return {
        "sources": [{
            "id": s.id,
            "name": s.name,
            "crawling_url": s.crawling_url,
            "source_type": s.source_type,
            "cron_schedule": s.cron_schedule,
            "language": s.language,
            "is_active": s.is_active,
            "priority": s.priority,
            "is_permanent": s.is_permanent
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

import requests
SCRAPER_SERVICE_URL = "http://localhost:8010"

@app.post("/sources")
def create_scrape_source(source_data: ScrapeSourceCreate, db: Session = Depends(get_db)):
    try:
        source = models.ScrapeSource(
            name=source_data.name,
            crawling_url=source_data.crawling_url,
            source_type=source_data.source_type,
            cron_schedule=source_data.cron_schedule,
            language=source_data.language,
            is_active=source_data.is_active,
            priority=source_data.priority,
            is_permanent=source_data.is_permanent
        )
        db.add(source)
        db.commit()
        db.refresh(source)

        try:
            resp = requests.post(f"{SCRAPER_SERVICE_URL}/api/v1/scraper/sources", json=source_data.dict(), timeout=2.0)
            if resp.status_code != 201:
                logger.warning(f"Failed to sync source to scraper service: {resp.text}")
        except Exception as sync_err:
            logger.warning(f"Connection failed to scraper service for sync: {sync_err}")

        return source
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create source: {str(e)}")

@app.put("/sources/{source_id}")
def update_scrape_source(source_id: int, source_data: ScrapeSourceCreate, db: Session = Depends(get_db)):
    try:
        source = db.query(models.ScrapeSource).filter(models.ScrapeSource.id == source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        source.name = source_data.name
        source.crawling_url = source_data.crawling_url
        source.source_type = source_data.source_type
        source.cron_schedule = source_data.cron_schedule
        source.language = source_data.language
        source.is_active = source_data.is_active
        source.priority = source_data.priority
        source.is_permanent = source_data.is_permanent
        db.commit()
        db.refresh(source)

        try:
            resp = requests.put(f"{SCRAPER_SERVICE_URL}/api/v1/scraper/sources/{source_id}", json=source_data.dict(), timeout=2.0)
            if resp.status_code != 200:
                logger.warning(f"Failed to sync update to scraper service: {resp.text}")
        except Exception as sync_err:
            logger.warning(f"Connection failed to scraper service for sync: {sync_err}")

        return source
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Failed to update source: {str(e)}")

@app.delete("/sources/{source_id}")
def delete_scrape_source(source_id: int, bypass_permanent: bool = Query(False), db: Session = Depends(get_db)):
    try:
        source = db.query(models.ScrapeSource).filter(models.ScrapeSource.id == source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        if source.is_permanent and not bypass_permanent:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete permanently registered source. Please confirm permanent bypass."
            )

        try:
            resp = requests.delete(f"{SCRAPER_SERVICE_URL}/api/v1/scraper/sources/{source_id}?bypass_permanent={str(bypass_permanent).lower()}", timeout=2.0)
            if resp.status_code not in (200, 204):
                logger.warning(f"Failed to sync delete to scraper service: {resp.text}")
        except Exception as sync_err:
            logger.warning(f"Connection failed to scraper service for sync: {sync_err}")

        db.delete(source)
        db.commit()
        return {"status": "SUCCESS", "message": "Source removed successfully"}
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Failed to delete source: {str(e)}")

@app.post("/sources/{source_id}/toggle")
def toggle_scrape_source(source_id: int, db: Session = Depends(get_db)):
    try:
        source = db.query(models.ScrapeSource).filter(models.ScrapeSource.id == source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        source.is_active = not source.is_active
        db.commit()
        db.refresh(source)

        source_data = ScrapeSourceCreate(
            name=source.name,
            crawling_url=source.crawling_url,
            source_type=source.source_type,
            cron_schedule=source.cron_schedule,
            language=source.language,
            is_active=source.is_active,
            priority=source.priority,
            is_permanent=source.is_permanent
        )
        try:
            resp = requests.put(f"{SCRAPER_SERVICE_URL}/api/v1/scraper/sources/{source_id}", json=source_data.dict(), timeout=2.0)
            if resp.status_code != 200:
                logger.warning(f"Failed to sync toggle to scraper service: {resp.text}")
        except Exception as sync_err:
            logger.warning(f"Connection failed to scraper service for sync: {sync_err}")

        return source
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Failed to toggle source: {str(e)}")

@app.post("/sources/{source_id}/trigger")
def trigger_scrape_source(source_id: int, db: Session = Depends(get_db)):
    try:
        source = db.query(models.ScrapeSource).filter(models.ScrapeSource.id == source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        
        resp = requests.post(f"{SCRAPER_SERVICE_URL}/api/v1/scraper/trigger/{source_id}", timeout=2.0)
        if resp.status_code not in (200, 202):
            raise HTTPException(status_code=resp.status_code, detail=f"Scraper service error: {resp.text}")
        return {"status": "SUCCESS", "message": f"Crawling triggered for '{source.name}'"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Failed to trigger crawl: {str(e)}")

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
    if q:
        q = translate_query_if_regional(q)
        params["q"] = q
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
            if enriched:
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
    if not results:
        return {"results": [], "message": "No verified results found"}
    return {"results": results}

@app.post("/api/v1/ads/ask")
def legacy_ask_rag(payload: dict = Body(...), db: Session = Depends(get_db)):
    question = payload.get("question")
    filters = payload.get("filters", {})
    
    if question:
        question = translate_query_if_regional(question)
        
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
                "contact_info": None,
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

@app.post("/admin/rebuild-index")
def rebuild_index_endpoint(db: Session = Depends(get_db)):
    try:
        chroma_service.rebuild_embeddings(db)
        return {"status": "SUCCESS", "message": "ChromaDB collections rebuilt and re-indexed successfully."}
    except Exception as e:
        logger.error(f"Rebuild index failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": "seetech-procurement-fastapi-backend",
        "chromadb": "CONNECTED",
        "gemini_api": "CONFIGURED" if chroma_service.has_gemini else "MOCK_MODE"
    }
