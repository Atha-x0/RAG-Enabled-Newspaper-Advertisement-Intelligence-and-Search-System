from fastapi import FastAPI, Query, HTTPException, Body, BackgroundTasks
from typing import Optional, Dict, Any
import logging
import os
import sys
from dotenv import load_dotenv

# Ensure the parent directory (ml-service root) is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

load_dotenv()

from app.rag.rag_pipeline import AdIntelRagEngine


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FastAPIServer")

app = FastAPI(
    title="AdIntel-RAG ML Engine",
    description="Python API endpoint for document layout analysis, vector search, and QA generation.",
    version="1.0.0"
)

# Instantiate engine global state
rag_engine = None
worker = None

@app.on_event("startup")
def startup_event():
    global rag_engine, worker
    try:
        logger.info("Initializing RAG engine connection objects on startup...")
        rag_engine = AdIntelRagEngine()
        
        # Lazy import of worker to avoid loading duplicate db initializers
        from app.core.worker import IngestionWorker
        worker = IngestionWorker()
        logger.info("Ingestion Worker initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to bootstrap RAG engine on startup: {e}")

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": "adintel-ml-service",
        "gemini_api": "CONFIGURED" if (rag_engine and rag_engine.has_gemini) else "MOCK_MODE"
    }

@app.get("/api/v1/search")
def search_ads(
    q: str = Query(..., description="Semantic search matching query text"),
    type: str = Query("hybrid", description="Search type (keyword, semantic, hybrid)"),
    category: Optional[str] = Query(None, description="Optional ad category filter"),
    location: Optional[str] = Query(None, description="Optional location filter"),
    limit: int = Query(5, description="Number of results to return")
):
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG Vector engine is not ready.")
    
    logger.info(f"Received search query: '{q}' [type: {type}, cat: {category}, loc: {location}]")
    try:
        results = rag_engine.search_ads(
            query_text=q,
            search_type=type,
            category=category,
            location=location,
            limit=limit
        )
        return {"results": results}
    except Exception as e:
        logger.error(f"Search API execution failure: {e}")
        raise HTTPException(status_code=500, detail=f"Search pipeline failed: {str(e)}")

@app.post("/api/v1/rag/ask")
def ask_question(
    payload: Dict[str, Any] = Body(..., example={
        "question": "What road construction tenders were published in Maharashtra?",
        "filters": {"category": "Government Tender", "location": "Maharashtra"}
    })
):
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG Vector engine is not ready.")
    
    question = payload.get("question")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")
        
    filters = payload.get("filters", {})
    
    logger.info(f"Received QA query: '{question}' with filters: {filters}")
    try:
        response = rag_engine.generate_answer(question, filters=filters)
        return response
    except Exception as e:
        logger.error(f"RAG QA API execution failure: {e}")
        raise HTTPException(status_code=500, detail=f"RAG QA pipeline failed: {str(e)}")

@app.post("/api/v1/ingest")
def trigger_ingestion(
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any] = Body(...)
):
    """
    Triggers direct ingestion parsing in a background execution thread, bypassing RabbitMQ.
    """
    if not worker:
        raise HTTPException(status_code=503, detail="Ingestion Worker is not ready.")
    
    logger.info(f"Received direct ingestion trigger payload: {payload}")
    
    # Process job as a background task to return immediate success to the express upload route
    background_tasks.add_task(worker.process_job_payload, payload)
    
    return {
        "status": "QUEUED",
        "message": "Ingestion job queued successfully for direct processing."
    }

if __name__ == "__main__":
    import uvicorn
    # Start as app.main:app to resolve relative imports correctly
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

