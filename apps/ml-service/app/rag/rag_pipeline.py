import os
import logging
import json
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from google import genai
from google.genai import types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RagPipeline")

COLLECTION_NAME = "newspaper_ads"
EMBEDDING_DIM = 768

class AdIntelRagEngine:
    def __init__(self):
        qdrant_host = os.getenv("QDRANT_HOST", "localhost")
        qdrant_port = int(os.getenv("QDRANT_PORT", 6333))
        
        try:
            logger.info(f"Connecting to external Qdrant server at {qdrant_host}:{qdrant_port}...")
            self.qdrant = QdrantClient(host=qdrant_host, port=qdrant_port, timeout=2.0)
            self.qdrant.get_collections()
            logger.info("Successfully connected to external Qdrant server.")
        except Exception as e:
            logger.warning(f"Qdrant server connection failed: {e}. Falling back to local on-disk SQLite vector storage.")
            local_vector_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../qdrant_local"))
            os.makedirs(local_vector_dir, exist_ok=True)
            self.qdrant = QdrantClient(path=local_vector_dir)
            logger.info(f"Local Qdrant Client initialized at: {local_vector_dir}")
        
        # Setup Gemini genai client
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            try:
                self.genai_client = genai.Client(api_key=gemini_key)
                self.has_gemini = True
                logger.info("Gemini AI API client configured.")
                # Dynamically choose available model
                self.model_name = "gemini-2.0-flash"
                try:
                    available_models = [m.name for m in self.genai_client.models.list()]
                    for m in ['models/gemini-3.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.5-pro', 'models/gemini-2.5-flash']:
                        if m in available_models:
                            self.model_name = m.replace('models/', '')
                            break
                    logger.info(f"AdIntelRagEngine: Selected Gemini model: {self.model_name}")
                except Exception as model_err:
                    logger.warning(f"Failed to detect available models: {model_err}")
            except Exception as e:
                self.genai_client = None
                self.has_gemini = False
                logger.error(f"Failed to configure Gemini SDK: {e}")
        else:
            self.genai_client = None
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
        if self.has_gemini and self.genai_client:
            try:
                response = self.genai_client.models.embed_content(
                    model="text-embedding-004",
                    contents=text
                )
                if hasattr(response, 'embeddings') and response.embeddings:
                    embedding = response.embeddings[0].values
                elif hasattr(response, 'embedding') and hasattr(response.embedding, 'values'):
                    embedding = response.embedding.values
                else:
                    raise ValueError("Could not extract embedding values from response")
                return embedding[:EMBEDDING_DIM]
            except Exception as e:
                logger.error(f"Gemini embedding generation failed: {e}")
        
        logger.warning("Using mock embedding representation.")
        state = np.random.RandomState(abs(hash(text)) % (2**32 - 1))
        vector = state.uniform(-1, 1, EMBEDDING_DIM).tolist()
        return vector

    def upsert_ad(self, ad_id, text, metadata):
        try:
            vector = self._get_embedding(text)
            
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
                        id=hash(str(ad_id)) % (2**63 - 1),
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

    def _translate_query_if_regional(self, q: str) -> str:
        if not q or not q.strip():
            return q
        import re
        has_devanagari = bool(re.search(r"[\u0900-\u097F]", q))
        if not has_devanagari:
            return q

        # Try Gemini translation
        if self.has_gemini and self.genai_client:
            try:
                prompt = (
                    "Translate the following Indian regional query text into simple English. "
                    "Do not explain, add comments, or wrap in markdown. Just return the translation.\n\n"
                    f"=== QUERY ===\n{q}"
                )
                response = self.genai_client.models.generate_content(
                    model=self.model_name,
                    contents=prompt
                )
                translated = response.text.strip()
                if translated:
                    logger.info(f"AdIntelRagEngine: Translated regional search query '{q}' to '{translated}' using Gemini.")
                    return translated
            except Exception as e:
                logger.warning(f"AdIntelRagEngine: Gemini query translation failed: {e}. Falling back to local dict.")
                pass

        # Local dictionary fallback
        import sys
        _scraper_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../scraper-service"))
        if _scraper_path not in sys.path:
            sys.path.insert(0, _scraper_path)
        try:
            from ad_classifier import LOCAL_TRANSLATION_MAP
            text_lower = q.lower()
            phrases = {
                "तांब्याची वायर": "copper wire",
                "तांब्याची केबल": "copper cable",
                "कॉपर वायर": "copper wire",
                "कॉपर केबल": "copper cable",
            }
            for phrase, eng in phrases.items():
                text_lower = text_lower.replace(phrase, eng)

            words = text_lower.split()
            translated_words = []
            for word in words:
                clean_word = re.sub(r"[^\w\u0900-\u097F]", "", word)
                if clean_word in LOCAL_TRANSLATION_MAP:
                    translated_words.append(LOCAL_TRANSLATION_MAP[clean_word])
                else:
                    translated_words.append(word)
            return " ".join(translated_words)
        except Exception:
            pass

        return q

    def search_ads(self, query_text, search_type="hybrid", category=None, location=None, limit=5):
        try:
            query_text = self._translate_query_if_regional(query_text)
            query_vector = self._get_embedding(query_text)
            
            filter_conditions = []
            if category:
                filter_conditions.append(
                    FieldCondition(key="category", match=MatchValue(value=category))
                )
            if location:
                filter_conditions.append(
                    FieldCondition(key="location", match=MatchValue(value=location))
                )
            
            query_filter = Filter(must=filter_conditions) if filter_conditions else None

            search_results = []
            try:
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
                if float(hit.score) >= 0.65:
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
        schema = {
            "title": "Clean, descriptive header for the ad",
            "company": "Company publishing the ad or null",
            "brand": "Brand advertised or null",
            "category": "One of: Government Tender, Recruitment, Real Estate, Education, Healthcare, Automobile, Retail, Public Notice, Events, Business Advertisement, Property Sale, Auction, Jobs",
            "location": "Location mentioned (e.g. City/State) or null",
            "contact_number": "Phone number or null",
            "email": "Email address or null",
            "website": "Website URL or null",
            "price": 125000.00,
            "offer_details": "Summary of offers, job requirements, or tender scope",
            "is_tender": False
        }

        prompt = f"""
        Analyze the following newspaper advertisement OCR text and image description.
        Extract the structured details in strict JSON format matching this schema:
        {json.dumps(schema, indent=2)}

        === OCR TEXT ===
        {raw_text}

        === IMAGE VISUAL CAPTION ===
        {image_caption}

        IMPORTANT: Extract ONLY the original contact information (contact_number, email, website) explicitly present in the OCR text or visual caption. Never generate, placeholder, or infer contact details. If not present, set them to null.

        Respond ONLY with the raw JSON object. No markdown wrapping.
        """

        if self.has_gemini and self.genai_client:
            try:
                config = types.GenerateContentConfig(response_mime_type="application/json")
                response = self.genai_client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=config
                )
                structured_data = json.loads(response.text.strip())
                logger.info(f"Successfully enriched metadata via Gemini. Category: {structured_data.get('category')}")
                return structured_data
            except Exception as e:
                logger.error(f"Gemini API enrichment failed: {e}. Falling back to default parser.")

        logger.warning("Gemini API skipped/failed. Using regex heuristic parser.")
        text_lower = raw_text.lower()
        
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

        # Extract phone using regex
        phone_patterns = [
            r"\b1800\s*-\s*\d{3}\s*-\s*\d{4}\b",
            r"\b1800\s*-\s*\d{3,4}\s*-\s*\d{3,4}\b",
            r"(?:\+91[\s\-]?)?\b[6-9]\d{9}\b",
            r"(?:\+91[\s\-]?)?\b0?\d{2,4}\s*-\s*\d{6,8}\b",
        ]
        contact_number = None
        for pattern in phone_patterns:
            m = re.search(pattern, raw_text)
            if m:
                contact_number = m.group(0).strip()
                break

        # Extract email using regex
        email_match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", raw_text)
        email = email_match.group(0).lower() if email_match else None

        # Extract website/URL if present in the ad text
        web_match = re.search(r"\bhttps?://[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b|\bwww\.[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b", raw_text, re.I)
        website = web_match.group(0).strip() if web_match else None

        return {
            "title": "Newspaper Advertisement Notice",
            "company": company,
            "brand": None,
            "category": category,
            "location": location,
            "contact_number": contact_number,
            "email": email,
            "website": website,
            "price": None,
            "offer_details": raw_text[:150] + "...",
            "is_tender": category == "Government Tender"
        }

    def generate_answer(self, question, filters=None):
        category = filters.get("category") if filters else None
        location = filters.get("location") if filters else None
        
        matches = self.search_ads(question, category=category, location=location, limit=3)
        if not matches:
            return {
                "answer": "No verified results found",
                "sources": []
            }
        
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

        if self.has_gemini and self.genai_client:
            try:
                response = self.genai_client.models.generate_content(
                    model=self.model_name,
                    contents=prompt
                )
                return {
                    "answer": response.text.strip(),
                    "sources": [{"ad_id": sid} for sid in source_ids]
                }
            except Exception as e:
                logger.error(f"Gemini QA response generation failed: {e}")

        mock_answer = f"Based on retrieved offline context:\n{context[:300]}...\n\n(Note: LLM generated answer requires GEMINI_API_KEY environment variable. Mock RAG active.)"
        return {
            "answer": mock_answer,
            "sources": [{"ad_id": sid} for sid in source_ids]
        }
