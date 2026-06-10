from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import logging

from models import init_db, SessionLocal, ScrapeSource, ScrapeLog
from scheduler import init_scheduler, execute_crawl_job, scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ScraperServer")

app = FastAPI(
    title="AdIntel-RAG Scraper Service",
    description="Microservice managing automated crawling, fetching, and ingestion of e-paper PDFs.",
    version="1.1.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class SourceCreate(BaseModel):
    name: str = Field(..., example="Nagpur Daily ePaper")
    crawling_url: str = Field(..., example="http://example-newspaper.com/pdf")
    source_type: str = Field("epaper_pdf", example="epaper_pdf") # epaper_pdf, html_portal, tender_portal
    cron_schedule: str = Field("0 6 * * *", example="0 6 * * *")
    language: str = Field("en", example="en")
    is_active: bool = Field(True, example=True)

class SourceResponse(SourceCreate):
    id: int

    class Config:
        orm_mode = True

class LogResponse(BaseModel):
    id: int
    source_id: int
    publication_date: str
    source_url: str
    file_hash: Optional[str]
    file_path: Optional[str]
    status: str
    retry_count: int
    error_message: Optional[str]
    downloaded_at: str

    class Config:
        orm_mode = True

@app.on_event("startup")
def startup_event():
    logger.info("Starting up Scraper Service...")
    # 1. Initialize metadata database tables
    init_db()
    # 2. Boot background scheduler daemon
    init_scheduler()

@app.get("/health")
def health_check():
    active_jobs = [job.id for job in scheduler.get_jobs()]
    return {
        "status": "UP",
        "service": "adintel-scraper-service",
        "scheduler_running": scheduler.running,
        "registered_jobs_count": len(active_jobs),
        "registered_jobs": active_jobs
    }

@app.get("/api/v1/scraper/sources", response_model=List[SourceResponse])
def list_sources():
    db = SessionLocal()
    try:
        sources = db.query(ScrapeSource).all()
        # Convert ORM objects to fit Pydantic orm_mode
        return sources
    finally:
        db.close()

@app.post("/api/v1/scraper/sources", response_model=SourceResponse, status_code=201)
def create_source(source_data: SourceCreate):
    db = SessionLocal()
    try:
        source = ScrapeSource(
            name=source_data.name,
            crawling_url=source_data.crawling_url,
            source_type=source_data.source_type,
            cron_schedule=source_data.cron_schedule,
            language=source_data.language,
            is_active=source_data.is_active
        )
        db.add(source)
        db.commit()
        db.refresh(source)
        
        # Dynamically add to Background Scheduler if active
        if source.is_active:
            from scheduler import schedule_source_crawl
            schedule_source_crawl(source)
            
        return source
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create source: {e}")
    finally:
        db.close()

@app.delete("/api/v1/scraper/sources/{source_id}", status_code=204)
def delete_source(source_id: int):
    db = SessionLocal()
    try:
        source = db.query(ScrapeSource).filter(ScrapeSource.id == source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Scrape source not found")
        
        # Remove from background scheduler
        job_id = f"scrape_source_{source.id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            
        db.delete(source)
        db.commit()
        return
    finally:
        db.close()

@app.post("/api/v1/scraper/trigger/{source_id}", status_code=202)
def trigger_scrape(source_id: int, background_tasks: BackgroundTasks):
    """
    Manually triggers a scraper crawl job immediately in a background task thread,
    without waiting for the scheduled cron trigger.
    """
    db = SessionLocal()
    try:
        source = db.query(ScrapeSource).filter(ScrapeSource.id == source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Scrape source not found")
        
        logger.info(f"Manual crawl triggered for source ID: {source_id} ({source.name})")
        # Route to background execution thread to return success immediately
        background_tasks.add_task(execute_crawl_job, source_id)
        
        return {
            "status": "QUEUED",
            "message": f"Crawling run for '{source.name}' has been triggered successfully."
        }
    finally:
        db.close()

@app.get("/api/v1/scraper/logs")
def get_logs(limit: int = Query(20, ge=1, le=100)):
    db = SessionLocal()
    try:
        logs = db.query(ScrapeLog).order_by(ScrapeLog.downloaded_at.desc()).limit(limit).all()
        results = []
        for log in logs:
            results.append({
                "id": log.id,
                "source_id": log.source_id,
                "publication_date": log.publication_date,
                "source_url": log.source_url,
                "file_hash": log.file_hash,
                "file_path": log.file_path,
                "status": log.status,
                "retry_count": log.retry_count,
                "error_message": log.error_message,
                "downloaded_at": log.downloaded_at.isoformat()
            })
        return results
    finally:
        db.close()
