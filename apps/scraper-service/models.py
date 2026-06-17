import datetime
import uuid
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Date, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from config import DATABASE_URL

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class NewspaperPage(Base):
    __tablename__ = 'newspaper_pages'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(1024), nullable=False)
    publication_date = Column(String(20), nullable=False)
    language = Column(String(50), nullable=False)
    total_ads_detected = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    advertisements = relationship("Advertisement", back_populates="page", cascade="all, delete-orphan")

class Advertisement(Base):
    __tablename__ = 'advertisements'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    page_id = Column(String(36), ForeignKey('newspaper_pages.id'), nullable=False)
    raw_text = Column(Text, nullable=False)
    title = Column(String(500), nullable=True)
    company = Column(String(255), nullable=True)
    brand = Column(String(255), nullable=True)
    category = Column(String(100), nullable=False)
    location = Column(String(255), nullable=True)
    contact_info = Column(String(255), nullable=True)
    price = Column(Float, nullable=True)
    structured_metadata = Column(JSON, default={})
    image_path = Column(String(1024), nullable=True)
    bbox_x1 = Column(Float, nullable=True)
    bbox_y1 = Column(Float, nullable=True)
    bbox_x2 = Column(Float, nullable=True)
    bbox_y2 = Column(Float, nullable=True)
    detection_confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    page = relationship("NewspaperPage", back_populates="advertisements")
    visual = relationship("VisualUnderstanding", uselist=False, back_populates="advertisement", cascade="all, delete-orphan")

class VisualUnderstanding(Base):
    __tablename__ = 'visual_understanding'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    ad_id = Column(String(36), ForeignKey('advertisements.id'), nullable=False)
    caption = Column(Text, nullable=False)
    detected_objects = Column(JSON, default=[])
    detected_logos = Column(JSON, default=[])
    caption_confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    advertisement = relationship("Advertisement", back_populates="visual")

# --- Seetech Industrial Parts & Procurement System Extensions ---

class Product(Base):
    __tablename__ = 'products'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    brand = Column(String(255), nullable=True)
    model_number = Column(String(255), nullable=True)
    category = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    specifications = Column(JSON, default={})
    image_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    prices = relationship("ProductPrice", back_populates="product", cascade="all, delete-orphan")

class Dealer(Base):
    __tablename__ = 'dealers'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    shop_name = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(255), nullable=True)
    state = Column(String(255), nullable=True)
    pin_code = Column(String(20), nullable=True)
    phone = Column(String(100), nullable=True)
    whatsapp = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    website_url = Column(String(500), nullable=True)
    rating = Column(Float, default=4.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    prices = relationship("ProductPrice", back_populates="dealer", cascade="all, delete-orphan")

class ProductPrice(Base):
    __tablename__ = 'product_prices'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    product_id = Column(String(36), ForeignKey('products.id'), nullable=False)
    dealer_id = Column(String(36), ForeignKey('dealers.id'), nullable=False)
    price = Column(Float, nullable=False)
    discount = Column(Float, default=0.0)
    currency = Column(String(10), default="INR")
    offer_validity = Column(String(50), nullable=True)
    shipping_charges = Column(Float, default=0.0)
    delivery_time_days = Column(Integer, default=3)
    dispatch_details = Column(String(500), nullable=True)
    source_type = Column(String(50), nullable=False)
    source_id = Column(String(100), nullable=True)
    source_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    product = relationship("Product", back_populates="prices")
    dealer = relationship("Dealer", back_populates="prices")

# --- Scraper Management Classes ---

class ScrapeSource(Base):
    __tablename__ = 'scrape_sources'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    crawling_url = Column(String(500), nullable=False)
    source_type = Column(String(50), default='epaper_pdf')
    cron_schedule = Column(String(50), default='0 6 * * *')
    language = Column(String(20), default='en')
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=3)
    is_permanent = Column(Boolean, default=False)
    
    logs = relationship("ScrapeLog", back_populates="source", cascade="all, delete-orphan")

class ScrapeLog(Base):
    __tablename__ = 'scrape_logs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(Integer, ForeignKey('scrape_sources.id'), nullable=False)
    publication_date = Column(String(20), nullable=False)
    source_url = Column(String(1000), nullable=False)
    file_hash = Column(String(64), unique=True, nullable=True)
    file_path = Column(String(1024), nullable=True)
    status = Column(String(50), default='PENDING')
    retry_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    downloaded_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    source = relationship("ScrapeSource", back_populates="logs")

# Database engine and session creator
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE scrape_sources ADD COLUMN priority INTEGER DEFAULT 3"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE scrape_sources ADD COLUMN is_permanent BOOLEAN DEFAULT 0"))
        except Exception:
            pass

