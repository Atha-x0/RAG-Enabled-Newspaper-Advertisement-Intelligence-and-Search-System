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

def execute_crawl_job(source_id: int):
    """
    Background worker job that executes crawling, downloading, and pipeline ingestion
    for a specific ScrapeSource.
    """
    logger.info(f"Starting scheduled crawl job for source ID: {source_id}")
    db = SessionLocal()
    try:
        source = db.query(ScrapeSource).filter(ScrapeSource.id == source_id, ScrapeSource.is_active == True).first()
        if not source:
            logger.warning(f"Active source ID {source_id} not found in database. Skipping job execution.")
            return

        crawler = get_crawler(source)
        
        # 1. Fetch available editions from portal index
        editions = crawler.fetch_index()
        logger.info(f"Crawled portal index. Found {len(editions)} available edition(s).")
        
        for edition in editions:
            url = edition["url"]
            pub_date = edition["publication_date"]
            
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
            try:
                file_bytes = crawler.download_file(url)
                
                # 3. Process download through pipeline (SHA256, pdf split, upload)
                status = pipeline.process_download(
                    source_id=source_id,
                    url=url,
                    publication_date=pub_date,
                    language=source.language,
                    file_bytes=file_bytes
                )
                logger.info(f"Processed download for {url}. Result: {status}")
                
            except Exception as download_err:
                logger.error(f"Failed to crawl/process edition at {url}: {download_err}")
                
                # Log failures to db ScrapeLog
                log_err = ScrapeLog(
                    source_id=source_id,
                    publication_date=pub_date,
                    source_url=url,
                    status="FAILED",
                    error_message=str(download_err)[:2000]
                )
                db.add(log_err)
                db.commit()
                
    except Exception as job_err:
        logger.error(f"Scheduler job execution error for source {source_id}: {job_err}")
        logger.error(traceback.format_exc())
    finally:
        db.close()

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
