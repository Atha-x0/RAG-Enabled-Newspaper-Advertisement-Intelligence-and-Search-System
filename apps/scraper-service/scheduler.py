import traceback
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

from models import SessionLocal, ScrapeSource, ScrapeLog
from crawlers import get_crawler
from pipeline import ScraperPipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ScraperScheduler")

scheduler = BackgroundScheduler()
pipeline = ScraperPipeline()

import datetime

import traceback

def execute_crawl_job(source_id: int):
    """
    Background worker job that executes crawling, downloading, and pipeline ingestion
    for a specific ScrapeSource.
    """
    trigger_time = datetime.datetime.utcnow()
    logger.info(f"[JOB START] Source ID: {source_id} | Trigger Time: {trigger_time}")
    db = SessionLocal()
    source_name = "Unknown Source"
    source = None
    try:
        if db.query(ScrapeSource).count() == 0:
            logger.error("WARNING: No scraping sources configured in ScrapeSource table! Newspaper ingestion cannot run.")
            log_err = ScrapeLog(
                source_id=source_id,
                publication_date=datetime.date.today().isoformat(),
                source_url="N/A",
                status="FAILED",
                error_message="No scraping sources configured in ScrapeSource table! Newspaper ingestion cannot run."
            )
            db.add(log_err)
            db.commit()
            return

        source = db.query(ScrapeSource).filter(ScrapeSource.id == source_id).first()
        if not source:
            logger.error(f"Source ID {source_id} not found in database. Skipping job execution.")
            log_err = ScrapeLog(
                source_id=source_id,
                publication_date=datetime.date.today().isoformat(),
                source_url="N/A",
                status="FAILED",
                error_message=f"Source ID {source_id} not found in database."
            )
            db.add(log_err)
            db.commit()
            return

        source_name = source.name
        logger.info(f"Source Name: {source_name} | Active: {source.is_active}")
        
        # Always update last crawl time immediately when job executes
        source.last_crawl_time = trigger_time
        db.commit()

        if not source.is_active:
            logger.warning(f"Source '{source_name}' is inactive. Skipping job execution.")
            log_err = ScrapeLog(
                source_id=source_id,
                publication_date=datetime.date.today().isoformat(),
                source_url=source.crawling_url,
                status="FAILED",
                error_message=f"Source '{source_name}' is inactive."
            )
            db.add(log_err)
            db.commit()
            return

        logger.info(f"Requesting portal index URL: {source.crawling_url}")
        crawler = get_crawler(source)
        
        # 1. Fetch available editions from portal index
        try:
            editions = crawler.fetch_index()
            logger.info(f"Index fetch request completed successfully. Found {len(editions)} available edition(s).")
        except Exception as idx_err:
            logger.error(f"Failed to fetch index from URL: {source.crawling_url}. Error: {idx_err}")
            log_err = ScrapeLog(
                source_id=source_id,
                publication_date=datetime.date.today().isoformat(),
                source_url=source.crawling_url,
                status="FAILED",
                error_message=f"Failed to fetch portal index: {idx_err}\nStack trace:\n{traceback.format_exc()}"
            )
            db.add(log_err)
            db.commit()
            raise idx_err

        if not editions:
            logger.warning("No editions found in portal index.")
            log_entry = ScrapeLog(
                source_id=source_id,
                publication_date=datetime.date.today().isoformat(),
                source_url=source.crawling_url,
                status="SUCCESS",
                error_message="No new editions found in portal index."
            )
            db.add(log_entry)
            db.commit()
            return

        for edition in editions:
            url = edition["url"]
            pub_date = edition["publication_date"] or datetime.date.today().isoformat()
            
            logger.info(f"Processing edition: {edition.get('title', 'N/A')} | URL: {url} | Date: {pub_date}")

            # Check if we have already successfully processed this source URL
            exists = db.query(ScrapeLog).filter(
                ScrapeLog.source_id == source_id,
                ScrapeLog.source_url == url,
                ScrapeLog.status == "SUCCESS"
            ).first()
            
            if exists:
                logger.info(f"Edition at {url} already processed successfully. Skipping.")
                continue
            
            # 2. Download raw PDF / scan bytes
            logger.info(f"Downloading edition file from URL: {url}")
            try:
                file_bytes = crawler.download_file(url)
                logger.info(f"Successfully downloaded file bytes ({len(file_bytes)} bytes) from {url}")
                
                # 3. Process download through pipeline (SHA256, pdf split, upload)
                logger.info(f"Forwarding downloaded bytes to pipeline ingestion...")
                status = pipeline.process_download(
                    source_id=source_id,
                    url=url,
                    publication_date=pub_date,
                    language=source.language,
                    file_bytes=file_bytes
                )
                logger.info(f"[JOB SUCCESS] Processed download for {url} | Result Status: {status}")
                
            except Exception as download_err:
                logger.error(f"[JOB FAILURE] Failed to crawl/process edition at {url}: {download_err}")
                logger.error(traceback.format_exc())
                
                log_err = ScrapeLog(
                    source_id=source_id,
                    publication_date=pub_date,
                    source_url=url,
                    status="FAILED",
                    error_message=f"Error: {download_err}\nStack trace:\n{traceback.format_exc()}"
                )
                db.add(log_err)
                db.commit()
                
    except Exception as job_err:
        logger.error(f"[JOB EXECUTION EXCEPTION] Source ID: {source_id} | Name: {source_name} | Error: {job_err}")
        logger.error(traceback.format_exc())
        if source:
            source.last_crawl_time = trigger_time
            db.commit()
    finally:
        db.close()

def seed_default_sources(db):
    sources = [
        ScrapeSource(
            id=1,
            name="Lokmat ePaper",
            crawling_url="http://mock-epaper.com/lokmat",
            source_type="epaper_pdf",
            cron_schedule="0 6 * * *",
            language="mr",
            is_active=True,
            priority=1,
            is_permanent=True,
            region="Maharashtra",
            verification_status="VERIFIED"
        ),
        ScrapeSource(
            id=2,
            name="Sakal ePaper",
            crawling_url="http://mock-epaper.com/sakal",
            source_type="epaper_pdf",
            cron_schedule="0 7 * * *",
            language="mr",
            is_active=True,
            priority=1,
            is_permanent=True,
            region="Maharashtra",
            verification_status="VERIFIED"
        ),
        ScrapeSource(
            id=3,
            name="Times of India",
            crawling_url="http://mock-epaper.com/toi",
            source_type="epaper_pdf",
            cron_schedule="0 6 * * *",
            language="en",
            is_active=True,
            priority=2,
            is_permanent=True,
            region="National",
            verification_status="VERIFIED"
        ),
        ScrapeSource(
            id=4,
            name="Dainik Bhaskar",
            crawling_url="http://mock-epaper.com/dainikbhaskar",
            source_type="epaper_pdf",
            cron_schedule="0 8 * * *",
            language="hi",
            is_active=True,
            priority=2,
            is_permanent=True,
            region="National",
            verification_status="VERIFIED"
        ),
        ScrapeSource(
            id=5,
            name="Employment News",
            crawling_url="http://mock-epaper.com/employmentnews",
            source_type="epaper_pdf",
            cron_schedule="0 9 * * *",
            language="en",
            is_active=True,
            priority=1,
            is_permanent=True,
            region="National",
            verification_status="VERIFIED"
        )
    ]
    db.add_all(sources)
    db.commit()

def init_scheduler():
    """
    Initializes and starts the BackgroundScheduler. Registers all active scrape sources
    with their respective cron schedules from the database.
    """
    logger.info("Initializing Scraper Scheduler...")
    
    # Start scheduler daemon
    if not scheduler.running:
        scheduler.start()
        logger.info("Background scheduler daemon started successfully.")
    
    # Load and register active sources
    db = SessionLocal()
    try:
        if db.query(ScrapeSource).count() == 0:
            logger.info("ScrapeSource table is empty. Seeding default newspaper sources...")
            try:
                seed_default_sources(db)
            except Exception as seed_err:
                logger.error(f"Failed to seed default scrape sources: {seed_err}")
                
        # Re-check count
        if db.query(ScrapeSource).count() == 0:
            logger.warning("WARNING: No scraping sources configured in ScrapeSource table! Newspaper ingestion cannot run.")
            return

        active_sources = db.query(ScrapeSource).filter(ScrapeSource.is_active == True).all()
        logger.info(f"Found {len(active_sources)} active crawler source(s) to schedule.")
        
        for source in active_sources:
            schedule_source_crawl(source)
            
    except Exception as e:
        logger.error(f"Failed to initialize scheduled crawls from database: {e}")
    finally:
        db.close()

def schedule_source_crawl(source: ScrapeSource):
    """
    Adds or updates a scheduled job for a specific ScrapeSource in APScheduler.
    """
    job_id = f"scrape_source_{source.id}"
    
    # Remove existing job if it is being re-scheduled
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        
    try:
        logger.info(f"Registering job '{job_id}' for '{source.name}' with schedule: '{source.cron_schedule}'")
        
        # Build cron trigger
        trigger = CronTrigger.from_crontab(source.cron_schedule)
        
        scheduler.add_job(
            execute_crawl_job,
            trigger=trigger,
            args=[source.id],
            id=job_id,
            replace_existing=True
        )
    except Exception as e:
        logger.error(f"Failed to parse cron schedule '{source.cron_schedule}' for source {source.name}: {e}")
        logger.warning(f"Scheduling job '{job_id}' to run every hour fallback instead.")
        # Fallback to hourly trigger if cron format fails to parse
        scheduler.add_job(
            execute_crawl_job,
            trigger='interval',
            hours=1,
            args=[source.id],
            id=job_id,
            replace_existing=True
        )
