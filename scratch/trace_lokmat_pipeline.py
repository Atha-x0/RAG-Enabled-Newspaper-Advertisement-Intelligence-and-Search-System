import os
import sys
import traceback
import sqlite3
import datetime

# Add necessary paths to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

print("=== STARTING LOKMAT PIPELINE TRACE ===", flush=True)

# We will count initial records in target tables
db_path = os.path.join(BASE_DIR, "database.sqlite")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Print scrape sources
try:
    cursor.execute("SELECT id, name, crawling_url, source_type FROM scrape_sources")
    sources = cursor.fetchall()
    print("Scrape Sources in Database:", flush=True)
    for s in sources:
        print(f"  ID: {s[0]} | Name: {s[1]} | URL: {s[2]} | Type: {s[3]}", flush=True)
except Exception as e:
    print(f"Error querying scrape_sources: {e}", flush=True)

def get_row_counts():
    counts = {}
    for table in ["products", "dealers", "product_prices", "web_scraped_results"]:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = cursor.fetchone()[0]
        except Exception:
            counts[table] = 0
    return counts

initial_counts = get_row_counts()
print(f"Initial DB Counts: {initial_counts}", flush=True)

# Helper to print stage headers
def print_stage(num, name, input_count, output_count, errors=None, exc=None):
    print(f"\n--- STAGE {num}: {name} ---", flush=True)
    print(f"Input Count: {input_count}", flush=True)
    print(f"Output Count: {output_count}", flush=True)
    if errors:
        print(f"Errors: {errors}", flush=True)
    else:
        print("Errors: None", flush=True)
    if exc:
        print(f"Exception: {exc}", flush=True)
        print("Stack Trace:", flush=True)
        print(traceback.format_exc(), flush=True)
    else:
        print("Exceptions: None", flush=True)

# Setup variables
source_id = None
pub_date = datetime.date.today().isoformat()
pdf_path = None
pages = []
raw_texts = []
regions = []
extracted_metadata = []
database_inserted = False
chromadb_indexed = False

def clear_app_modules():
    # Remove all modules loaded under the 'app' namespace
    to_delete = [m for m in sys.modules if m == 'app' or m.startswith('app.')]
    for m in to_delete:
        del sys.modules[m]

# Import scraper-service classes
sys.path.insert(0, os.path.join(BASE_DIR, "apps", "scraper-service"))
from crawlers import get_crawler
from models import SessionLocal, ScrapeSource
from config import DOWNLOAD_DIR

db_session = SessionLocal()
# Find Lokmat source specifically
source = db_session.query(ScrapeSource).filter(ScrapeSource.name.like("%Lokmat%")).first()
if source:
    source_id = source.id
    print(f"Found Lokmat Source: ID={source.id}, Name={source.name}, URL={source.crawling_url}", flush=True)
else:
    print("WARNING: Lokmat source not found in database. Querying default ID=1.", flush=True)
    source = db_session.query(ScrapeSource).filter(ScrapeSource.id == 1).first()
    if source:
        source_id = source.id
db_session.close()

if not source:
    print("Error: No source found to process.", flush=True)
    sys.exit(1)

# Stage 1: Download PDF
file_bytes = None
try:
    crawler = get_crawler(source)
    editions = crawler.fetch_index()
    url = editions[0]["url"] if editions else f"{source.crawling_url}/epaper_{pub_date}.pdf"
    
    print(f"Downloading from URL: {url}", flush=True)
    file_bytes = crawler.download_file(url)
    
    print_stage(1, "Download PDF", input_count=1, output_count=1 if file_bytes else 0)
except Exception as e:
    print_stage(1, "Download PDF", input_count=1, output_count=0, errors="Failed to download", exc=e)
    sys.exit(1)

# Stage 2: Verify PDF file exists
try:
    filename = f"scrape_debug_{source_id}_{pub_date}.pdf"
    pdf_path = os.path.join(DOWNLOAD_DIR, filename)
    with open(pdf_path, "wb") as f:
        f.write(file_bytes)
    
    exists = os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0
    print_stage(2, "Verify PDF file exists", input_count=1, output_count=1 if exists else 0)
    if not exists:
        raise FileNotFoundError("PDF file was not successfully saved/verified.")
except Exception as e:
    print_stage(2, "Verify PDF file exists", input_count=1, output_count=0, errors="Verification failed", exc=e)
    sys.exit(1)

# Stage 3: Convert PDF to images
try:
    from pdf2image import convert_from_bytes
    from config import POPPLER_PATH
    
    # Try pdf2image
    try:
        pages = convert_from_bytes(file_bytes, poppler_path=POPPLER_PATH)
    except Exception as pdf_err:
        print(f"pdf2image failed: {pdf_err}. Using fallback mock image generator.")
        from PIL import Image, ImageDraw
        img = Image.new("RGB", (800, 1130), color="#1e293b")
        draw = ImageDraw.Draw(img)
        draw.rectangle([20, 20, 780, 1110], outline="#475569", width=2)
        pages = [img]
        
    print_stage(3, "Convert PDF to images", input_count=1, output_count=len(pages))
except Exception as e:
    print_stage(3, "Convert PDF to images", input_count=1, output_count=0, errors="Conversion failed", exc=e)
    sys.exit(1)

# Stage 4: Count pages generated
try:
    page_count = len(pages)
    print_stage(4, "Count pages generated", input_count=len(pages), output_count=page_count)
except Exception as e:
    print_stage(4, "Count pages generated", input_count=len(pages), output_count=0, errors="Counting failed", exc=e)
    sys.exit(1)

# Set up paths for ML service imports
clear_app_modules()
sys.path = [os.path.join(BASE_DIR, "apps", "ml-service")] + [p for p in sys.path if "backend" not in p and "ml-service" not in p]
from app.models.yolo_detector import DocLayoutYoloDetector
from app.ocr.ocr_engine import MultilingualOcrEngine
from app.rag.rag_pipeline import AdIntelRagEngine

# Stage 7: Detect advertisement regions
tmp_dir = os.path.join(BASE_DIR, "scratch", "tmp")
os.makedirs(tmp_dir, exist_ok=True)
prep_path = os.path.join(tmp_dir, f"prep_{source_id}.png")
pages[0].save(prep_path, format="PNG")

try:
    detector = DocLayoutYoloDetector()
    regions = detector.detect_ads(prep_path)
    print_stage(7, "Detect advertisement regions", input_count=1, output_count=len(regions))
except Exception as e:
    print_stage(7, "Detect advertisement regions", input_count=1, output_count=0, errors="Detection failed", exc=e)
    sys.exit(1)

# Stage 8: Count advertisements found
try:
    ad_count = len(regions)
    print_stage(8, "Count advertisements found", input_count=len(regions), output_count=ad_count)
except Exception as e:
    print_stage(8, "Count advertisements found", input_count=len(regions), output_count=0, errors="Counting failed", exc=e)
    sys.exit(1)

# Stage 5: Run OCR
try:
    ocr_engine = MultilingualOcrEngine()
    
    for i, region in enumerate(regions):
        crop_path = os.path.join(tmp_dir, f"crop_{source_id}_{i}.png")
        detector.crop_ad(prep_path, region["pixel_box"], crop_path)
        ocr_result = ocr_engine.extract_text(crop_path, language=source.language)
        raw_texts.append(ocr_result)
        
    print_stage(5, "Run OCR", input_count=len(regions), output_count=len(raw_texts))
except Exception as e:
    print_stage(5, "Run OCR", input_count=len(regions), output_count=0, errors="OCR failed", exc=e)
    sys.exit(1)

# Stage 6: Log extracted text length
try:
    text_lengths = [len(r["raw_text"]) for r in raw_texts]
    print(f"Extracted Text Lengths: {text_lengths}", flush=True)
    print_stage(6, "Log extracted text length", input_count=len(raw_texts), output_count=len(text_lengths))
except Exception as e:
    print_stage(6, "Log extracted text length", input_count=len(raw_texts), output_count=0, errors="Logging failed", exc=e)
    sys.exit(1)

# Stage 9: Extract product title, price, dealer and phone
try:
    rag_engine = AdIntelRagEngine()
    
    for r in raw_texts:
        meta = rag_engine.enrich_metadata(r["raw_text"], image_caption="")
        meta["raw_text"] = r["raw_text"]
        extracted_metadata.append(meta)
        
    print_stage(9, "Extract product title, price, dealer and phone", input_count=len(raw_texts), output_count=len(extracted_metadata))
except Exception as e:
    print_stage(9, "Extract product title, price, dealer and phone", input_count=len(raw_texts), output_count=0, errors="Extraction failed", exc=e)
    sys.exit(1)

# Set up paths for backend imports
clear_app_modules()
sys.path = [os.path.join(BASE_DIR, "apps", "backend")] + [p for p in sys.path if "ml-service" not in p and "backend" not in p]

# Stage 10: Insert records into database
try:
    # Let's see what happens here! The standard IngestionWorker inserts into advertisements, visual_understanding, advertisement_evidence,
    # but DOES NOT insert into Product, Dealer, ProductPrice or WebScrapedResult!
    # Let's count current database records to see if any got inserted automatically
    new_counts = get_row_counts()
    diffs = {table: new_counts[table] - initial_counts[table] for table in initial_counts}
    print(f"DB Record Diffs: {diffs}", flush=True)
    
    database_inserted = all(diffs[t] > 0 for t in ["products", "dealers", "product_prices", "web_scraped_results"])
    print_stage(10, "Insert records into database", input_count=len(extracted_metadata), output_count=sum(diffs.values()))
    
    if not database_inserted:
        print("WARNING: Ingestion did NOT insert records into Product, Dealer, ProductPrice or WebScrapedResult tables!", flush=True)
except Exception as e:
    print_stage(10, "Insert records into database", input_count=len(extracted_metadata), output_count=0, errors="Database insert check failed", exc=e)
    sys.exit(1)

# Stage 11: Index records into ChromaDB
try:
    # Check if they are indexed in ChromaDB
    from app.chroma_service import ChromaService
    chroma_service = ChromaService()
    
    # We will try to search or check collection count
    collection_count = 0
    if chroma_service.collection:
        collection_count = chroma_service.collection.count()
    
    print_stage(11, "Index records into ChromaDB", input_count=len(extracted_metadata), output_count=collection_count)
except Exception as e:
    print_stage(11, "Index records into ChromaDB", input_count=len(extracted_metadata), output_count=0, errors="ChromaDB indexing check failed", exc=e)
    sys.exit(1)

# Clean up temp files
for i in range(len(regions)):
    crop_path = os.path.join(tmp_dir, f"crop_{source_id}_{i}.png")
    if os.path.exists(crop_path):
        os.unlink(crop_path)
if os.path.exists(prep_path):
    os.unlink(prep_path)
if pdf_path and os.path.exists(pdf_path):
    os.unlink(pdf_path)

# Final success check
if database_inserted:
    print("\n====================================")
    print("STATUS: SUCCESS")
    print("====================================")
else:
    print("\n====================================")
    print("STATUS: FAILURE")
    print("REASON: Missing insertions in Product, Dealer, ProductPrice, or WebScrapedResult tables.")
    print("====================================")

conn.close()
