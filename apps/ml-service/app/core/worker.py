import os
import json
import time
import logging
import cv2
import requests
import sqlite3

from app.models.yolo_detector import DocLayoutYoloDetector
from app.ocr.ocr_engine import MultilingualOcrEngine
from app.rag.rag_pipeline import AdIntelRagEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IngestionWorker")

# Load environment configuration
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../database.sqlite"))
QUEUE_NAME = 'newspaper_ingestion_jobs'

class IngestionWorker:
    def __init__(self):
        logger.info("Initializing Ingestion Worker models...")
        self.detector = DocLayoutYoloDetector()
        self.ocr_engine = MultilingualOcrEngine()
        self.rag_engine = AdIntelRagEngine()
        self.db_conn = None
        self._connect_db()

    def _connect_db(self):
        try:
            logger.info(f"Connecting to SQLite database at: {DB_PATH}")
            self.db_conn = sqlite3.connect(DB_PATH)
            self.db_conn.row_factory = sqlite3.Row
            logger.info("Worker SQLite database connection established.")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}.")
            raise RuntimeError("Database connection could not be established.")

    def deskew_image(self, image_path, output_path):
        """
        Academic pre-processing: Deskewing image using Radon transform / Hough Lines.
        Improves OCR accuracy on rotated newspaper page scans.
        """
        try:
            img = cv2.imread(image_path)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            # Thresholding
            thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
            
            # Find Hough lines
            import numpy as np
            minLineLength = w = img.shape[1]
            lines = cv2.HoughLinesP(thresh, 1, np.pi/180, 100, minLineLength=minLineLength//2, maxLineGap=20)
            
            angle = 0.0
            if lines is not None:
                angles = []
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    angles.append(np.arctan2(y2 - y1, x2 - x1))
                angle = np.median(angles) * 180 / np.pi

            if abs(angle) > 0.5 and abs(angle) < 45.0:
                logger.info(f"Deskewing page scan: Rotated by {angle:.2f} degrees.")
                (h, w) = img.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                cv2.imwrite(output_path, rotated)
                return True
        except Exception as e:
            logger.error(f"Deskewing failed: {e}. Using original image.")
        
        # Fallback to copy
        cv2.imwrite(output_path, cv2.imread(image_path))
        return False

    def simulate_florence2_caption(self, category, image_text):
        """
        Simulates Florence-2 image understanding capabilities.
        Extracts visual descriptors and brands depending on OCR text matches.
        """
        brand = "local merchant"
        if "tata" in image_text.lower():
            brand = "Tata Motors branding"
        elif "government" in image_text.lower() or "pwd" in image_text.lower():
            brand = "State Emblem of India or Government seal"
            
        caption = f"A print advertisement scan for a {category.lower()} layout. Displays structured text lines, tabular fields, and key emblem or logo assets relating to {brand}."
        
        return {
            "caption": caption,
            "objects": ["text block", "logo", "border line"],
            "logos": [brand]
        }

    def process_job_payload(self, job):
        """
        Processes an ingestion job payload synchronously. Connects SQLite and models.
        """
        try:
            page_id = job["page_id"]
            file_url = job["file_path"]
            language = job["language"]
            pub_date = job["publication_date"]

            logger.info(f"Processing page ingestion. ID: {page_id}, Url: {file_url}")

            # Create temporary folder
            tmp_dir = os.path.join(os.getcwd(), "tmp")
            os.makedirs(tmp_dir, exist_ok=True)
            
            raw_filename = f"raw_{page_id}.png"
            deskewed_filename = f"prep_{page_id}.png"
            raw_path = os.path.join(tmp_dir, raw_filename)
            prep_path = os.path.join(tmp_dir, deskewed_filename)

            # 1. Download image from MinIO/Local URL
            logger.info(f"Downloading raw page file from object storage...")
            res = requests.get(file_url)
            if res.status_code != 200:
                raise RuntimeError(f"Failed to download image: Status code {res.status_code}")
            
            with open(raw_path, "wb") as f:
                f.write(res.content)

            # 2. Deskew page
            self.deskew_image(raw_path, prep_path)

            # 3. Detect advertisement regions (YOLO / DocLayout-YOLO)
            logger.info("Running DocLayout-YOLO regional detector...")
            regions = self.detector.detect_ads(prep_path)
            logger.info(f"YOLO Layout segmentation found {len(regions)} advertisement blocks.")

            # Re-verify db connection
            if not self.db_conn:
                self._connect_db()
                
            cursor = self.db_conn.cursor()

            # 4. Cascade processing for each cropped region
            ad_count = 0
            for i, region in enumerate(regions):
                x1, y1, x2, y2 = region["box"]
                px_x1, px_y1, px_x2, px_y2 = region["pixel_box"]
                conf = region["confidence"]

                # Crop advertisement image
                crop_filename = f"crop_{page_id}_{i}.png"
                crop_path = os.path.join(tmp_dir, crop_filename)
                self.detector.crop_ad(prep_path, region["pixel_box"], crop_path)

                # Write cropped region locally in backend uploads directory
                # Express serves it under /uploads/crop_...
                # Locate backend uploads folder
                backend_uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../backend/uploads"))
                os.makedirs(backend_uploads_dir, exist_ok=True)
                dest_crop_path = os.path.join(backend_uploads_dir, crop_filename)
                
                # Copy crop
                cv2.imwrite(dest_crop_path, cv2.imread(crop_path))
                
                # Resolve local server static crop URL
                crop_static_url = file_url.replace(raw_filename, crop_filename)

                # 5. Extract Text (PaddleOCR)
                logger.info(f"Running multilingual PaddleOCR (language: {language})...")
                ocr_result = self.ocr_engine.extract_text(crop_path, language=language)
                raw_text = ocr_result["raw_text"]
                ocr_confidence = ocr_result["confidence"]

                # Skip empty OCR boxes to maintain vector space quality
                if not raw_text.strip():
                    logger.warning("Empty OCR text block. Skipping index.")
                    continue

                # 6. Florence-2 Image Understanding Simulation
                vision_analysis = self.simulate_florence2_caption(region["class"], raw_text)
                caption = vision_analysis["caption"]

                # 7. LLM Metadata Enrichment (Gemini API)
                logger.info("Enriching metadata using Gemini 1.5 Flash API...")
                enriched_metadata = self.rag_engine.enrich_metadata(raw_text, image_caption=caption)
                
                # Add publication date context
                enriched_metadata["publication_date"] = pub_date

                # Ad classifier check before indexing
                import sys
                _scraper_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../scraper-service"))
                if _scraper_path not in sys.path:
                    sys.path.insert(0, _scraper_path)
                from ad_classifier import AdClassifier

                ad_classifier = AdClassifier()
                is_ad, ad_confidence, reason = ad_classifier.classify(
                    text=raw_text,
                    title=enriched_metadata.get("title", ""),
                    source_type="newspaper_page"
                )
                if not is_ad:
                    logger.info(f"IngestionWorker: Skipping non-ad block based on classification ({reason}) for region {i}: '{raw_text[:60]}'")
                    if os.path.exists(crop_path):
                        os.unlink(crop_path)
                    continue

                # Generate a UUID for SQLite insert since defaultValue UUIDV4 is Postgres features
                import uuid
                new_ad_id = str(uuid.uuid4())

                # 8. Save Advertisement meta to SQLite database
                logger.info("Writing results to SQLite DB...")
                cursor.execute(
                    """
                    INSERT INTO advertisements 
                    (id, page_id, raw_text, title, company, brand, category, location, contact_info, price, structured_metadata, image_path, bbox_x1, bbox_y1, bbox_x2, bbox_y2, detection_confidence, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
                    """,
                    (
                        new_ad_id,
                        page_id,
                        raw_text,
                        enriched_metadata.get("title"),
                        enriched_metadata.get("company"),
                        enriched_metadata.get("brand"),
                        enriched_metadata.get("category", "General"),
                        enriched_metadata.get("location"),
                        enriched_metadata.get("contact_number"),
                        enriched_metadata.get("price"),
                        json.dumps(enriched_metadata),
                        crop_static_url,
                        x1, y1, x2, y2,
                        conf,
                    )
                )

                # Save Visual Understanding details
                new_vis_id = str(uuid.uuid4())
                cursor.execute(
                    """
                    INSERT INTO visual_understanding 
                    (id, ad_id, caption, detected_objects, detected_logos, caption_confidence, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'));
                    """,
                    (
                        new_vis_id,
                        new_ad_id,
                        caption,
                        json.dumps(vision_analysis["objects"]),
                        json.dumps(vision_analysis["logos"]),
                        0.95
                    )
                )

                # Save Evidence details
                new_ev_id = str(uuid.uuid4())
                cursor.execute(
                    """
                    INSERT INTO advertisement_evidence
                    (id, ad_id, web_scraped_result_id, original_url, html_snapshot, pdf_page_image, advertisement_image, scraped_timestamp, publication_date)
                    VALUES (?, ?, NULL, ?, NULL, ?, ?, datetime('now'), ?);
                    """,
                    (
                        new_ev_id,
                        new_ad_id,
                        file_url,
                        file_url,
                        crop_static_url,
                        pub_date
                    )
                )

                # 9. Index in Qdrant Vector Store
                logger.info("Inserting dense representation in Qdrant collections...")
                english_raw_text = ad_classifier.translate_to_english(raw_text)
                composite_text = f"Title: {enriched_metadata.get('title')}\nCategory: {enriched_metadata.get('category')}\nText: {english_raw_text}\nRaw Text: {raw_text}\nVisual caption: {caption}"
                self.rag_engine.upsert_ad(new_ad_id, composite_text, enriched_metadata)

                ad_count += 1

                # Clean cropped image file
                if os.path.exists(crop_path):
                    os.unlink(crop_path)

            # Update page record with total count
            cursor.execute(
                "UPDATE newspaper_pages SET total_ads_detected = ? WHERE id = ?;",
                (ad_count, page_id)
            )
            self.db_conn.commit()

            # Cleanup files
            if os.path.exists(raw_path):
                os.unlink(raw_path)
            if os.path.exists(prep_path):
                os.unlink(prep_path)

            cursor.close()
            logger.info(f"Ingestion job completed successfully. Processed {ad_count} advertisements.")
            return ad_count

        except Exception as e:
            logger.error(f"Ingestion job processing error: {e}", exc_info=True)
            if self.db_conn:
                self.db_conn.rollback()
            raise e

    def process_job(self, ch, method, properties, body):
        # Deprecated queue callback. Direct HTTP execution used.
        pass

    def start_listening(self):
        # RabbitMQ connection listening is bypassed in sqlite/direct modes
        logger.info("Direct sync mode active. SQLite worker listener started in main thread.")
        while True:
            time.sleep(10)

if __name__ == "__main__":
    worker = IngestionWorker()
    worker.start_listening()
