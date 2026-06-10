import os
import logging
import json
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import google.generativeai as genai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RagPipeline")

COLLECTION_NAME = "newspaper_ads"
EMBEDDING_DIM = 768 # Default for google's text-embedding-004 or standard local models

class AdIntelRagEngine:
    def __init__(self):
        # Setup Qdrant Client
        qdrant_host = os.getenv("QDRANT_HOST", "localhost")
        qdrant_port = int(os.getenv("QDRANT_PORT", 6333))
        
        try:
            logger.info(f"Connecting to external Qdrant server at {qdrant_host}:{qdrant_port}...")
            # Set short timeout to fail fast if port is closed
            self.qdrant = QdrantClient(host=qdrant_host, port=qdrant_port, timeout=2.0)
            self.qdrant.get_collections()
            logger.info("Successfully connected to external Qdrant server.")
        except Exception as e:
            logger.warning(f"Qdrant server connection failed: {e}. Falling back to local on-disk SQLite vector storage.")
            local_vector_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../qdrant_local"))
            os.makedirs(local_vector_dir, exist_ok=True)
            self.qdrant = QdrantClient(path=local_vector_dir)
            logger.info(f"Local Qdrant Client initialized at: {local_vector_dir}")
        
        # Setup Gemini
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            genai.configure(api_key=gemini_key)
            self.has_gemini = True
            logger.info("Gemini AI API configured.")
        else:
            self.has_gemini = False
            logger.warning("GEMINI_API_KEY environment variable is missing. Running LLM features in mock mode.")

        self._ensure_collection()

    def _ensure_collection(self):
        try:
            collections = self.qdrant.get_collections().collections
            exists = any(c.name == COLLECTION_NAME for c in collections)
            if not exists:
                logger.info(f"Creating Qdrant collection: '{COLLECTION_NAME}'...")
                self.qdrant.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE)
                )
                logger.info("Qdrant collection created.")
            else:
                logger.info(f"Qdrant collection '{COLLECTION_NAME}' already exists.")
        except Exception as e:
            logger.error(f"Error checking/creating Qdrant collection: {e}")

    def _get_embedding(self, text):
        """
        Generates embedding vector. Uses Gemini API if key is available,
        otherwise falls back to generating a pseudo-random deterministic vector.
        """
        if self.has_gemini:
            try:
                # Use Gemini text-embedding-004
                result = genai.embed_content(
                    model="models/text-embedding-004",
                    content=text,
                    task_type="retrieval_document"
                )
                embedding = result['embedding']
                # Truncate or pad to EMBEDDING_DIM (text-embedding-004 returns 768 dimensions)
                return embedding[:EMBEDDING_DIM]
            except Exception as e:
                logger.error(f"Gemini embedding generation failed: {e}")
        
        # Fallback pseudo-random deterministic vector based on text hash
        logger.warning("Using mock embedding representation.")
        state = np.random.RandomState(abs(hash(text)) % (2**32 - 1))
        vector = state.uniform(-1, 1, EMBEDDING_DIM).tolist()
        return vector

    def upsert_ad(self, ad_id, text, metadata):
        """
        Indexes an advertisement in Qdrant with dense vectors and metadata payloads.
        """
        try:
            vector = self._get_embedding(text)
            
            # Form clean payload
            payload = {
                "ad_id": str(ad_id),
                "text": text,
                "title": metadata.get("title", "Untitled Advertisement"),
                "category": metadata.get("category", "General"),
                "location": metadata.get("location", ""),
                "company": metadata.get("company", ""),
                "price": float(metadata.get("price")) if metadata.get("price") else None,
                "date": metadata.get("publication_date", "")
            }

            self.qdrant.upsert(
                collection_name=COLLECTION_NAME,
                points=[
                    PointStruct(
                        id=hash(str(ad_id)) % (2**63 - 1),  # Qdrant requires uint64 or UUID
                        vector=vector,
                        payload=payload
                    )
                ]
            )
            logger.info(f"Upserted ad {ad_id} to Qdrant successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to index ad in Qdrant: {e}")
            return False

    def search_ads(self, query_text, search_type="hybrid", category=None, location=None, limit=5):
        """
        Searches indexed ads. Filters by category and location using Qdrant payload filters.
        """
        try:
            query_vector = self._get_embedding(query_text)
            
            # Construct Qdrant query filter
            filter_conditions = []
            if category:
                filter_conditions.append(
                    FieldCondition(key="category", match=MatchValue(value=category))
                )
            if location:
                # Substring/value match
                filter_conditions.append(
                    FieldCondition(key="location", match=MatchValue(value=location))
                )
            
            query_filter = Filter(must=filter_conditions) if filter_conditions else None

            # Qdrant semantic/hybrid search routing (Query API / search compatibility)
            search_results = []
            try:
                # Try modern Qdrant Query API (v1.10.0+)
                response = self.qdrant.query_points(
                    collection_name=COLLECTION_NAME,
                    query=query_vector,
                    query_filter=query_filter,
                    limit=limit
                )
                search_results = response.points
            except Exception as query_err:
                logger.debug(f"query_points failed, falling back to search method: {query_err}")
                try:
                    # Fallback to older search API
                    search_results = self.qdrant.search(
                        collection_name=COLLECTION_NAME,
                        query_vector=query_vector,
                        query_filter=query_filter,
                        limit=limit
                    )
                except Exception as search_err:
                    logger.error(f"Both query_points and search operations failed: {search_err}")
                    raise search_err

            results = []
            for hit in search_results:
                results.append({
                    "ad_id": hit.payload.get("ad_id"),
                    "score": float(hit.score),
                    "payload": hit.payload
                })
            
            return results
        except Exception as e:
            logger.error(f"Qdrant search execution failure: {e}")
            return []

    def enrich_metadata(self, raw_text, image_caption=""):
        """
        Uses Gemini API to extract structured JSON metadata from OCR and Caption content.
        """
        # Structured JSON schema target
        schema = {
            "title": "Clean, descriptive header for the ad",
            "company": "Company publishing the ad or null",
            "brand": "Brand advertised or null",
            "category": "One of: Government Tender, Recruitment, Real Estate, Education, Healthcare, Automobile, Retail, Public Notice, Events, Business Advertisement, Property Sale, Auction, Jobs",
            "location": "Location mentioned (e.g. City/State) or null",
            "contact_number": "Phone number or null",
            "email": "Email address or null",
            "website": "Website URL or null",
            "price": 125000.00, # Numeric price if mentioned, else null
            "offer_details": "Summary of offers, job requirements, or tender scope",
            "is_tender": false # Boolean
        }

        prompt = f"""
        Analyze the following newspaper advertisement OCR text and image description.
        Extract the structured details in strict JSON format matching this schema:
        {json.dumps(schema, indent=2)}

        === OCR TEXT ===
        {raw_text}

        === IMAGE VISUAL CAPTION ===
        {image_caption}

        Respond ONLY with the raw JSON object. No markdown wrapping.
        """

        if self.has_gemini:
            try:
                # Use Gemini Flash
                model = genai.GenerativeModel('gemini-1.5-flash', generation_config={"response_mime_type": "application/json"})
                response = model.generate_content(prompt)
                
                # Parse structured JSON response
                structured_data = json.loads(response.text.strip())
                logger.info(f"Successfully enriched metadata via Gemini. Category: {structured_data.get('category')}")
                return structured_data
            except Exception as e:
                logger.error(f"Gemini API enrichment failed: {e}. Falling back to default parser.")

        # Fallback heuristic rule-based parser (Offline/Mock)
        logger.warning("Gemini API skipped/failed. Using regex heuristic parser.")
        text_lower = raw_text.lower()
        
        # Rough heuristics
        category = "Business Advertisement"
        if "tender" in text_lower or "निविदा" in text_lower:
            category = "Government Tender"
        elif "recruitment" in text_lower or "bharti" in text_lower or "भर्ती" in text_lower or "vacancy" in text_lower:
            category = "Recruitment"
        elif "flat" in text_lower or "real estate" in text_lower or "land" in text_lower or "plot" in text_lower:
            category = "Real Estate"
        elif "buy" in text_lower or "offer" in text_lower or "sale" in text_lower:
            category = "Retail"
            
        location = "Maharashtra"
        if "nagpur" in text_lower or "नागपूर" in text_lower:
            location = "Nagpur"
        elif "pune" in text_lower or "पुणे" in text_lower:
            location = "Pune"
        elif "mumbai" in text_lower or "मुंबई" in text_lower:
            location = "Mumbai"

        company = "Unknown"
        if "tata" in text_lower:
            company = "Tata Motors"
        elif "pwd" in text_lower or "सार्वजनिक बांधकाम" in text_lower:
            company = "PWD Government"

        return {
            "title": "Newspaper Advertisement Notice",
            "company": company,
            "brand": None,
            "category": category,
            "location": location,
            "contact_number": "1800-200-1122" if "contact" in text_lower or "call" in text_lower else None,
            "email": "info@newspaper-ads.org",
            "website": None,
            "price": None,
            "offer_details": raw_text[:150] + "...",
            "is_tender": category == "Government Tender"
        }

    def generate_answer(self, question, filters=None):
        """
        Retrieves matching context and generates response via RAG logic.
        """
        category = filters.get("category") if filters else None
        location = filters.get("location") if filters else None
        
        # Retrieve relative context ads
        matches = self.search_ads(question, category=category, location=location, limit=3)
        
        context_blocks = []
        source_ids = []
        for i, match in enumerate(matches):
            p = match["payload"]
            source_ids.append(match["ad_id"])
            context_blocks.append(
                f"Source #{i+1} [Ad ID: {match['ad_id']}, Category: {p.get('category')}, Date: {p.get('date')}, Location: {p.get('location')}]:\n{p.get('text')}"
            )

        context = "\n\n".join(context_blocks) if context_blocks else "No relevant advertisements found."

        prompt = f"""
        You are an intelligent QA assistant for a historical newspaper archive.
        Answer the following user question using ONLY the provided advertisement contexts.
        If the context does not contain enough info, answer honestly.
        Cite the Source numbers in your response (e.g. [Source #1]).

        === QUESTION ===
        {question}

        === CONTEXT ===
        {context}

        Answer:
        """

        if self.has_gemini:
            try:
                model = genai.GenerativeModel('gemini-1.5-flash')
                response = model.generate_content(prompt)
                return {
                    "answer": response.text.strip(),
                    "sources": [{"ad_id": sid} for sid in source_ids]
                }
            except Exception as e:
                logger.error(f"Gemini QA response generation failed: {e}")

        # Local mockup answer if Gemini is offline
        mock_answer = f"Based on retrieved offline context:\n{context[:300]}...\n\n(Note: LLM generated answer requires GEMINI_API_KEY environment variable. Mock RAG active.)"
        return {
            "answer": mock_answer,
            "sources": [{"ad_id": sid} for sid in source_ids]
        }
