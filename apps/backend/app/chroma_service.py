import os
import logging
import threading
from google import genai
import chromadb
from app.config import GEMINI_API_KEY, CHROMA_DB_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ChromaService")

CHROMA_COLLECTION = "industrial_parts"

class ChromaService:
    def __init__(self):
        # Locate Chroma storage path from config
        try:
            os.makedirs(CHROMA_DB_PATH, exist_ok=True)
            logger.info(f"Initializing local persistent ChromaDB client at: {CHROMA_DB_PATH}")
            self.client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
            self.collection = self.client.get_or_create_collection(name=CHROMA_COLLECTION)
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB PersistentClient: {e}. Falling back to EphemeralClient.")
            try:
                self.client = chromadb.EphemeralClient()
                self.collection = self.client.get_or_create_collection(name=CHROMA_COLLECTION)
            except Exception as ex:
                logger.error(f"Failed to initialize EphemeralClient: {ex}. Running without vector storage.")
                self.client = None
                self.collection = None
        
        # Setup Gemini genai client
        if GEMINI_API_KEY:
            try:
                self.genai_client = genai.Client(api_key=GEMINI_API_KEY)
                self.has_gemini = True
                logger.info("ChromaService: Gemini API client initialized successfully.")
            except Exception as e:
                self.genai_client = None
                self.has_gemini = False
                logger.error(f"Failed to initialize Gemini Client: {e}. Running in mock mode.")
        else:
            self.genai_client = None
            self.has_gemini = False
            logger.warning("Gemini API key missing. Running in mock mode.")
            
        # Lazy background loader setup for SentenceTransformer
        self._hf_model = None
        self._hf_loading_failed = False
        self.embedding_dim = 384  # Default to bge-small-en-v1.5 dimension
        self._lock = threading.Lock()
        
        # Start background thread to load model (non-blocking lazy load)
        threading.Thread(target=self._lazy_load_hf_model, daemon=True).start()

    def _lazy_load_hf_model(self):
        with self._lock:
            if self._hf_model or self._hf_loading_failed:
                return
            try:
                from sentence_transformers import SentenceTransformer
                logger.info("SentenceTransformer: Loading BAAI/bge-small-en-v1.5 in background thread...")
                # Load with local cache path or direct download
                self._hf_model = SentenceTransformer('BAAI/bge-small-en-v1.5')
                self.embedding_dim = 384
                logger.info("INFO: Embedding model loaded")
            except Exception as e:
                self._hf_loading_failed = True
                logger.warning(
                    f"Embedding model unavailable: {e}. Startup will continue with mock/Gemini fallbacks."
                )

    def _get_embedding(self, text: str) -> list:
        # 1. Try local SentenceTransformer (bge-small-en-v1.5)
        if self._hf_model:
            try:
                embedding = self._hf_model.encode(text)
                return embedding.tolist()
            except Exception as e:
                logger.error(f"SentenceTransformer encoding failed: {e}")
        
        # 2. Try Gemini API
        if self.has_gemini and self.genai_client:
            try:
                response = self.genai_client.models.embed_content(
                    model="text-embedding-004",
                    contents=text
                )
                if hasattr(response, 'embeddings') and response.embeddings:
                    return response.embeddings[0].values
                elif hasattr(response, 'embedding') and hasattr(response.embedding, 'values'):
                    return response.embedding.values
            except Exception as e:
                logger.error(f"Gemini API embedding generation failed: {e}")
                
        # 3. Fallback mock vector (All zeroes of size 384)
        logger.warning(f"Using mock vector fallback [0.0] * {self.embedding_dim}")
        return [0.0] * self.embedding_dim

    def index_product(self, product_id: str, text: str, metadata: dict):
        if not self.collection:
            logger.warning("Chroma collection is not initialized. Skipping index.")
            return False
        try:
            vector = self._get_embedding(text)
            
            # Normalize metadata to string, int, float, or bool
            flat_metadata = {}
            for k, v in metadata.items():
                if isinstance(v, (str, int, float, bool)):
                    flat_metadata[k] = v
                elif v is None:
                    flat_metadata[k] = ""
                else:
                    flat_metadata[k] = str(v)
            
            flat_metadata["product_id"] = product_id
            
            self.collection.upsert(
                ids=[product_id],
                embeddings=[vector],
                metadatas=[flat_metadata],
                documents=[text]
            )
            return True
        except Exception as e:
            logger.error(f"ChromaDB index failed for product {product_id}: {e}")
            return False

    def search_products(self, query_text: str, brand: str = None, category: str = None, limit: int = 5) -> list:
        if not self.collection:
            logger.warning("Chroma collection is not initialized. Returning empty search results.")
            return []
        try:
            query_vector = self._get_embedding(query_text)
            
            # Construct Chroma meta filters
            where_conditions = {}
            if brand:
                where_conditions["brand"] = brand
            if category:
                where_conditions["category"] = category
                
            where_filter = None
            if len(where_conditions) == 1:
                k, v = list(where_conditions.items())[0]
                where_filter = {k: v}
            elif len(where_conditions) > 1:
                where_filter = {"$and": [{k: v} for k, v in where_conditions.items()]}

            results = self.collection.query(
                query_embeddings=[query_vector],
                n_results=limit,
                where=where_filter
            )
            
            hits = []
            if results and results["ids"] and len(results["ids"][0]) > 0:
                for i in range(len(results["ids"][0])):
                    hits.append({
                        "product_id": results["ids"][0][i],
                        "document": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i],
                        "distance": results["distances"][0][i] if "distances" in results else 0.0
                    })
            return hits
        except Exception as e:
            logger.error(f"ChromaDB search failed: {e}")
            return []
