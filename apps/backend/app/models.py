import datetime
import uuid
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

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
    
    source_id = Column(Integer, ForeignKey('scrape_sources.id'), nullable=True)
    
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
    price = Column(Float, nullable=True)
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
    region = Column(String(100), nullable=True)  # e.g., 'Maharashtra', 'Delhi'
    verification_status = Column(String(20), default='PENDING')  # PENDING, VERIFIED, REJECTED
    last_crawl_time = Column(DateTime, nullable=True)
    
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


# ── Real-time Web Search Results ─────────────────────────────────────────────

class WebScrapedResult(Base):
    """
    Stores real-time scraped results from newspapers, dealer sites, manufacturers,
    and business directories. Each result is fully traceable to its source.
    """
    __tablename__ = 'web_scraped_results'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    query = Column(String(500), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    category = Column(String(255), nullable=True)
    brand = Column(String(255), nullable=True)
    specifications = Column(JSON, default={})
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=True)
    price_text = Column(String(100), nullable=True)
    currency = Column(String(10), default="INR")
    dealer_name = Column(String(255), nullable=True)
    dealer_address = Column(Text, nullable=True)
    contact_phone = Column(String(100), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_website = Column(String(500), nullable=True)
    image_url = Column(String(1024), nullable=True)
    source_name = Column(String(255), nullable=False)
    source_type = Column(String(50), nullable=False)   # newspaper_ad / dealer_website / manufacturer / directory
    source_priority = Column(Integer, default=4)        # 1=newspaper (highest), 4=directory (lowest)
    source_url = Column(String(1024), nullable=False)
    publication_date = Column(String(20), nullable=True)
    relevance_score = Column(Float, default=0.0)
    scraped_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
        
    # Metadata for independent cards
    verification_status = Column(String(20), default="VERIFIED")  # VERIFIED, PARTIAL, REJECTED
    canonical_url = Column(String(1024), nullable=True)
    
    evidence = relationship("AdvertisementEvidence", uselist=False, backref="web_scraped_result", cascade="all, delete-orphan")


class AdvertisementEvidence(Base):
    """
    Stores evidence for advertisements (both newspaper crops and web scraped listings)
    for strict traceability.
    """
    __tablename__ = 'advertisement_evidence'
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    ad_id = Column(String(36), ForeignKey('advertisements.id'), nullable=True)
    web_scraped_result_id = Column(String(36), ForeignKey('web_scraped_results.id'), nullable=True)
    
    original_url = Column(String(1024), nullable=True)
    html_snapshot = Column(Text, nullable=True)
    pdf_page_image = Column(String(1024), nullable=True)
    advertisement_image = Column(String(1024), nullable=True)
    scraped_timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    publication_date = Column(String(50), nullable=True)



# ── Search History ───────────────────────────────────────────────────────────

class SearchHistory(Base):
    """Tracks user search queries for history and trending searches."""
    __tablename__ = 'search_history'

    id = Column(Integer, primary_key=True, autoincrement=True)
    query = Column(String(500), nullable=False, index=True)
    result_count = Column(Integer, default=0)
    search_type = Column(String(50), default='hybrid')   # hybrid / web / local
    searched_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship to logs
    logs = relationship("SearchLog", back_populates="search", cascade="all, delete-orphan")

class SearchLog(Base):
    """Stores execution stage logs for each search."""
    __tablename__ = 'search_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    search_id = Column(Integer, ForeignKey('search_history.id'), nullable=False)
    stage_name = Column(String(100), nullable=False)
    start_timestamp = Column(DateTime, nullable=False)
    end_timestamp = Column(DateTime, nullable=False)
    duration_ms = Column(Integer, nullable=False)
    details = Column(JSON, default={})

    search = relationship("SearchHistory", back_populates="logs")
