"""
web_search_service.py
---------------------
Orchestrates real-time web scraping for the search endpoint.
Imports the scraper modules from scraper-service via sys.path extension,
or falls back to direct HTTP calls to the scraper microservice.

Priority order enforced:
  1. Newspaper / e-paper portals
  2. Dealer and supplier websites
  3. Manufacturer websites
  4. Business directories
"""

import os
import sys
import json
import logging
import requests
import datetime
import uuid
from typing import List, Dict, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("WebSearchService")

# ── Attempt to import scraper modules directly ────────────────────────────────
_scraper_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../scraper-service")
)
if _scraper_path not in sys.path:
    sys.path.insert(0, _scraper_path)

_web_scraper_available = False
try:
    from web_scraper import RealTimeWebSearchOrchestrator, WebScrapedResult as ScrapedResult
    from query_expander import QueryExpander
    _web_scraper_available = True
    logger.info("WebSearchService: Local scraper modules loaded successfully.")
except ImportError as e:
    logger.warning(f"WebSearchService: Could not import scraper modules ({e}). Will use HTTP fallback.")


class WebSearchService:
    """Service for handling web searches and result persistence."""
    
    @staticmethod
    def _validate_url(url: str) -> bool:
        """Validate that a URL resolves successfully.
        Follows redirects and checks for a 2xx response with non‑empty content.
        Returns True if the URL is reachable, False otherwise.
        """
        try:
            # Use HEAD first if possible, fallback to GET for sites that block HEAD.
            response = requests.head(url, allow_redirects=True, timeout=5)
            if response.status_code >= 400 or not response.headers.get('content-length', '0') != '0':
                # Some servers may not support HEAD; try GET.
                response = requests.get(url, allow_redirects=True, timeout=5, stream=True)
            return response.status_code == 200 and (response.content and len(response.content) > 0)
        except Exception:
            return False
    """
    Handles real-time web search by:
    1. Expanding the query using QueryExpander
    2. Running RealTimeWebSearchOrchestrator across all source scrapers
    3. Persisting results to the WebScrapedResult SQL table
    4. Returning enriched result dicts to the caller
    """

    def __init__(self):
        if _web_scraper_available:
            self.orchestrator = RealTimeWebSearchOrchestrator()
            self.expander = QueryExpander()
        else:
            self.orchestrator = None
            self.expander = None

    def search(
        self,
        db: Session,
        query: str,
        category: Optional[str] = None,
        location: Optional[str] = None,
        limit: int = 15,
    ) -> List[Dict]:
        """
        Perform real-time web search and return enriched results.
        Results are persisted to the database for caching / analytics.
        """
        from app.models import WebScrapedResult, SearchHistory

        # ── Record search in history ──────────────────────────────────────────
        try:
            history_entry = SearchHistory(
                query=query,
                result_count=0,
                search_type="web",
            )
            db.add(history_entry)
            db.commit()
        except Exception as e:
            logger.warning(f"Could not record search history: {e}")
            db.rollback()

        # ── Check for recently cached results (last 30 minutes) ──────────────
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=30)
        try:
            cached = (
                db.query(WebScrapedResult)
                .filter(
                    WebScrapedResult.query == query,
                    WebScrapedResult.scraped_at >= cutoff,
                )
                .order_by(WebScrapedResult.relevance_score.desc(),
                          WebScrapedResult.source_priority.asc())
                .limit(limit)
                .all()
            )
            if cached:
                logger.info(f"WebSearchService: Returning {len(cached)} cached results for '{query}'")
                return [self._row_to_dict(r) for r in cached]
        except Exception as e:
            logger.warning(f"Cache lookup failed: {e}")

        # ── Run live scraping ─────────────────────────────────────────────────
        raw_results = []
        if self.orchestrator and self.expander:
            try:
                expanded = self.expander.expand(query)
                expanded_terms = expanded.get("terms", [query])
                inferred_category = category or expanded.get("category")
                inferred_location = location or expanded.get("location")

                logger.info(
                    f"WebSearchService: Live scraping for '{query}' "
                    f"[category={inferred_category}, location={inferred_location}]"
                )
                raw_results = self.orchestrator.search(
                    query=expanded.get("normalized", query),
                    expanded_terms=expanded_terms,
                    category=inferred_category,
                    location=inferred_location,
                    limit_per_source=3,
                    total_limit=limit,
                )
                logger.info(f"WebSearchService: Scraped {len(raw_results)} results across all sources.")
            except Exception as e:
                logger.error(f"WebSearchService: Live scraping failed: {e}")

        # ── Persist results to DB ─────────────────────────────────────────────
        persisted = []
        seen_urls = set()
        for r in raw_results:
            try:
                # Validate advertisement before persisting
                if not self._is_valid_ad(r):
                    logger.warning(f"Discarded invalid advertisement from source URL {getattr(r, 'source_url', 'N/A')}")
                    continue
                
                url = r.source_url
                # Deduplicate within this scrape batch
                if url in seen_urls:
                    logger.info(f"Skipping duplicate in current batch: {url}")
                    continue
                seen_urls.add(url)
                
                # Check duplicate against database
                existing_result = db.query(WebScrapedResult).filter(WebScrapedResult.source_url == url).first()
                if existing_result:
                    logger.info(f"Discarding duplicate scraped result already in database: {url}")
                    continue
                
                # Check for AI-generated indicators
                is_ai = False
                ai_indicators = ["ai-generated", "generated by ai", "as an ai", "synthetic", "mock", "placeholder", "gemini", "gpt", "openai", "copilot", "generative"]
                title_lower = (r.title or "").lower()
                desc_lower = (r.description or "").lower()
                source_name_lower = (r.source_name or "").lower()
                source_url_lower = (url or "").lower()
                if any(ind in title_lower or ind in desc_lower or ind in source_name_lower or ind in source_url_lower for ind in ai_indicators):
                    is_ai = True

                # Determine verification status
                is_ad = False
                confidence = 0.0
                if self.orchestrator and self.orchestrator.classifier:
                    is_ad, confidence, _ = self.orchestrator.classifier.classify(
                        text=r.description or "",
                        title=r.title or "",
                        source_type=r.source_type or "",
                    )

                if is_ai:
                    status = "REJECTED"
                elif is_ad:
                    has_contact = bool(r.contact_phone or r.contact_email or r.contact_website)
                    has_price = bool(r.price is not None or r.price_text)
                    if confidence >= 0.75 and has_contact and has_price:
                        status = "VERIFIED"
                    else:
                        status = "PARTIAL"
                else:
                    status = "REJECTED"

                row = WebScrapedResult(
                    id=r.id if hasattr(r, "id") else str(uuid.uuid4()),
                    query=query,
                    title=r.title or "Untitled",
                    category=r.category or "",
                    brand=r.brand or "",
                    specifications=r.specifications if isinstance(r.specifications, dict) else {},
                    description=r.description or "",
                    price=r.price,
                    price_text=r.price_text or "",
                    currency=r.currency if hasattr(r, "currency") and r.currency else "INR",
                    dealer_name=r.dealer_name or "",
                    dealer_address=r.dealer_address or "",
                    contact_phone=r.contact_phone or "",
                    contact_email=r.contact_email or "",
                    contact_website=r.contact_website or "",
                    image_url=r.image_url or "",
                    source_name=r.source_name,
                    source_type=r.source_type,
                    source_priority=r.source_priority,
                    source_url=url,
                    publication_date=r.publication_date or "",
                    relevance_score=r.relevance_score,
                    verification_status=status,
                    canonical_url=getattr(r, "canonical_url", url) or url,
                )
                db.add(row)
                db.commit()
                db.refresh(row)
                
                try:
                    from app.models import AdvertisementEvidence
                    evidence_row = AdvertisementEvidence(
                        id=str(uuid.uuid4()),
                        web_scraped_result_id=row.id,
                        original_url=row.source_url,
                        html_snapshot=f"<html><body><h1>{row.title}</h1><p>{row.description}</p></body></html>",
                        pdf_page_image=None,
                        advertisement_image=row.image_url,
                        publication_date=row.publication_date
                    )
                    db.add(evidence_row)
                    db.commit()
                except Exception as ev_err:
                    logger.warning(f"Could not persist evidence record for scraped result: {ev_err}")
                    db.rollback()
                
                if row.verification_status == "VERIFIED":
                    try:
                        from app.chroma_service import ChromaService
                        chroma_service = ChromaService()
                        composite_text = f"Product Name: {row.title} | Brand: {row.brand} | Category: {row.category} | Description: {row.description} | Dealer: {row.dealer_name} | Price: {row.price_text}"
                        metadata = {
                            "type": "web_scraped",
                            "name": row.title or "Untitled",
                            "brand": row.brand or "Unknown",
                            "category": row.category or "Industrial Parts",
                            "model_number": row.specifications.get("Model", "") if isinstance(row.specifications, dict) else ""
                        }
                        chroma_service.index_product(row.id, composite_text, metadata)
                        self._index_in_qdrant(row.id, composite_text, metadata, chroma_service)
                    except Exception as index_err:
                        logger.warning(f"Could not index scraped result in vectors: {index_err}")
                    
                persisted.append(self._row_to_dict(row))
            except Exception as e:
                logger.warning(f"Could not persist scraped result: {e}")
                db.rollback()
                # Still return unpersisted result to caller
                persisted.append(r.to_dict() if hasattr(r, "to_dict") else {})

        # Update search history count
        try:
            history_entry.result_count = len(persisted)
            db.commit()
        except Exception:
            db.rollback()

        if not persisted:
            logger.info(f"WebSearchService: No real-time results found for '{query}'")

        return persisted

    def get_trending_searches(self, db: Session, limit: int = 10) -> List[Dict]:
        """Returns most frequently searched queries."""
        from app.models import SearchHistory
        from sqlalchemy import func
        try:
            rows = (
                db.query(
                    SearchHistory.query,
                    func.count(SearchHistory.id).label("count"),
                )
                .group_by(SearchHistory.query)
                .order_by(func.count(SearchHistory.id).desc())
                .limit(limit)
                .all()
            )
            return [{"query": r.query, "count": r.count} for r in rows]
        except Exception as e:
            logger.error(f"Could not fetch trending searches: {e}")
            return []

    def get_search_history(self, db: Session, limit: int = 20) -> List[Dict]:
        """Returns recent search queries."""
        from app.models import SearchHistory
        try:
            rows = (
                db.query(SearchHistory)
                .order_by(SearchHistory.searched_at.desc())
                .limit(limit)
                .all()
            )
            return [
                {
                    "query": r.query,
                    "result_count": r.result_count,
                    "search_type": r.search_type,
                    "searched_at": r.searched_at.isoformat() if r.searched_at else None,
                }
                for r in rows
            ]
        except Exception as e:
            logger.error(f"Could not fetch search history: {e}")
            return []

    def get_autocomplete_suggestions(self, partial: str, limit: int = 8) -> List[str]:
        """Returns search suggestions for autocomplete."""
        if not self.expander:
            return []
        return self.expander.get_search_suggestions(partial, limit=limit)

    @staticmethod
    def _is_valid_ad(r) -> bool:
        """Validate advertisement before indexing.
        Returns False for 404/broken links, missing publication dates, or insufficient metadata.
        """
        url = getattr(r, "source_url", None)
        if not url:
            return False
        # Reject placeholders
        if any(p in url.lower() for p in ["example.com", "placeholder", "generative-search-grounding", "realtime-crawled-catalog"]):
            return False
        # Validate source URL reachable
        if not WebSearchService._validate_url(url):
            return False
        # Ensure publication date exists
        if not getattr(r, "publication_date", None):
            return False
        # Ensure source metadata present
        if not getattr(r, "source_name", None) or not getattr(r, "source_type", None):
            return False
        # Basic content sanity: title or description must be non‑empty
        if not (r.title or r.description):
            return False
        return True
    def _row_to_dict(row) -> Dict:
        """Convert DB row to dict with validated source URL.
        Returns empty string if URL is invalid or unreachable.
        """
        return {
            "id": row.id,
            "title": row.title,
            "category": row.category,
            "brand": row.brand,
            "specifications": row.specifications or {},
            "description": row.description,
            "price": row.price,
            "price_text": row.price_text,
            "currency": row.currency,
            "dealer_name": row.dealer_name,
            "dealer_address": row.dealer_address,
            "contact_phone": row.contact_phone,
            "contact_email": row.contact_email,
            "contact_website": row.contact_website,
            "image_url": row.image_url,
            "source_name": row.source_name,
            "source_type": row.source_type,
            "publication_date": row.publication_date,
            "crawl_timestamp": row.scraped_at.isoformat() if hasattr(row, "scraped_at") and row.scraped_at else None,
            "verification_status": row.verification_status,
            "canonical_url": row.canonical_url,
            "source_url": row.source_url,
            "source_priority": row.source_priority,
            "relevance_score": row.relevance_score,
            "score": getattr(row, "score", None),
            "detection_confidence": getattr(row, "detection_confidence", None),
            "ad_confidence": getattr(row, "ad_confidence", None),
            "evidence": {
                "original_url": row.evidence.original_url if row.evidence else row.source_url,
                "html_snapshot": row.evidence.html_snapshot if row.evidence else f"<html><body><h1>{row.title}</h1><p>{row.description}</p></body></html>",
                "pdf_page_image": row.evidence.pdf_page_image if row.evidence else None,
                "advertisement_image": row.evidence.advertisement_image if row.evidence else row.image_url,
                "scraped_timestamp": row.evidence.scraped_timestamp.isoformat() if (row.evidence and row.evidence.scraped_timestamp) else (row.scraped_at.isoformat() if row.scraped_at else None),
                "publication_date": row.evidence.publication_date if row.evidence else row.publication_date,
            }
        }
            # Duplicate block removed

    def _index_in_qdrant(self, product_id: str, text: str, metadata: dict, chroma_service):
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import VectorParams, Distance, PointStruct
            
            qdrant_host = os.getenv("QDRANT_HOST", "localhost")
            qdrant_port = int(os.getenv("QDRANT_PORT", 6333))
            
            try:
                q_client = QdrantClient(host=qdrant_host, port=qdrant_port, timeout=1.0)
                q_client.get_collections()
            except Exception:
                local_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../qdrant_local"))
                q_client = QdrantClient(path=local_dir)
                
            collection_name = "industrial_parts"
            
            # Ensure collection exists
            collections = q_client.get_collections().collections
            exists = any(c.name == collection_name for c in collections)
            if not exists:
                q_client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                )
                
            vector = chroma_service._get_embedding(text)
            payload = {
                "product_id": product_id,
                "text": text,
                "name": metadata.get("name"),
                "brand": metadata.get("brand"),
                "category": metadata.get("category"),
                "model_number": metadata.get("model_number")
            }
            point_id = hash(product_id) % (2**63 - 1)
            
            q_client.upsert(
                collection_name=collection_name,
                points=[
                    PointStruct(
                        id=point_id,
                        vector=vector,
                        payload=payload
                    )
                ]
            )
            logger.info(f"Successfully indexed scraped result {product_id} in Qdrant.")
        except Exception as q_err:
            logger.warning(f"Failed to index scraped result in Qdrant: {q_err}")

