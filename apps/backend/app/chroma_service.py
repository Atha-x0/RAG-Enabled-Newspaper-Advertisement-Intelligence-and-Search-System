import os
import logging
import threading
from google import genai
import chromadb
from app.config import GEMINI_API_KEY, CHROMA_DB_PATH, EMBEDDING_MODEL, EMBEDDING_DIMENSION

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
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB PersistentClient: {e}. Falling back to EphemeralClient.")
            try:
                self.client = chromadb.EphemeralClient()
            except Exception as ex:
                logger.error(f"Failed to initialize EphemeralClient: {ex}. Running without vector storage.")
                self.client = None
        
        self.collection = None
        self.dimension_verified = False
        
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
        self.embedding_dim = EMBEDDING_DIMENSION  # Default dimension from config
        self._lock = threading.Lock()
        
        # Start background thread to load model (non-blocking lazy load)
        threading.Thread(target=self._lazy_load_hf_model, daemon=True).start()

    def _lazy_load_hf_model(self):
        with self._lock:
            if self._hf_model or self._hf_loading_failed:
                return
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(f"SentenceTransformer: Loading {EMBEDDING_MODEL} in background thread...")
                self._hf_model = SentenceTransformer(EMBEDDING_MODEL)
                self.embedding_dim = len(self._hf_model.encode("test"))
                logger.info(f"INFO: Embedding model loaded (dimension: {self.embedding_dim})")
                
                # Reset verification flag and run collection dimension verification
                self.dimension_verified = False
                self.verify_collection_dimension()
            except Exception as e:
                self._hf_loading_failed = True
                logger.warning(
                    f"Embedding model unavailable: {e}. Startup will continue with mock/Gemini fallbacks."
                )
                self.dimension_verified = False
                self.verify_collection_dimension()

    def get_current_dimension(self) -> int:
        if self._hf_model:
            try:
                test_emb = self._hf_model.encode("test")
                return len(test_emb)
            except Exception as e:
                logger.error(f"Error checking dimension of local model: {e}")
                
        if self.has_gemini and self.genai_client:
            return 768
            
        return EMBEDDING_DIMENSION

    def create_collection_with_metadata(self, dimension: int):
        if not self.client:
            return
        try:
            try:
                self.client.delete_collection(name=CHROMA_COLLECTION)
            except Exception:
                pass
            self.collection = self.client.create_collection(
                name=CHROMA_COLLECTION,
                metadata={
                    "embedding_dimension": dimension,
                    "embedding_model": EMBEDDING_MODEL
                }
            )
            logger.info(f"Created collection '{CHROMA_COLLECTION}' with dimension {dimension} and model {EMBEDDING_MODEL}")
        except Exception as e:
            logger.error(f"Failed to create collection with metadata: {e}")

    def verify_collection_dimension(self) -> bool:
        """
        Verifies if the existing collection's dimension matches the current dimension.
        If a mismatch is found, it deletes the collection, recreates it, and rebuilds the index.
        Returns True if a rebuild was executed, False otherwise.
        """
        if self.dimension_verified:
            return False
            
        if not self.client:
            return False
            
        current_dim = self.get_current_dimension()
        
        try:
            collection = self.client.get_collection(name=CHROMA_COLLECTION)
            metadata = collection.metadata or {}
            col_dim = metadata.get("embedding_dimension")
            
            if col_dim is None or col_dim != current_dim:
                logger.warning("Embedding dimension mismatch detected. Rebuilding ChromaDB.")
                print("Embedding dimension mismatch detected. Rebuilding ChromaDB.", flush=True)
                
                from app.database import SessionLocal
                db = SessionLocal()
                try:
                    self.rebuild_embeddings(db)
                finally:
                    db.close()
                return True
            else:
                self.collection = collection
                self.dimension_verified = True
                return False
        except Exception as e:
            logger.info(f"Collection '{CHROMA_COLLECTION}' not found or error: {e}. Creating new collection.")
            self.create_collection_with_metadata(current_dim)
            
            from app.database import SessionLocal
            db = SessionLocal()
            try:
                self.rebuild_embeddings(db)
            finally:
                db.close()
            return True

    def rebuild_embeddings(self, db):
        """
        Drops old collections, recreates collection with current dimension metadata,
        and re-indexes all products, dealers, and advertisements.
        """
        logger.info("Rebuilding embeddings collection...")
        current_dim = self.get_current_dimension()
        self.create_collection_with_metadata(current_dim)
        
        if not self.collection:
            logger.error("Cannot rebuild embeddings: Chroma collection is not initialized.")
            return False
            
        # Re-index all Products
        from app.models import Product
        try:
            products = db.query(Product).all()
            logger.info(f"Re-indexing {len(products)} products in ChromaDB...")
            for p in products:
                composite_text = f"Product Name: {p.name} | Brand: {p.brand or ''} | Model: {p.model_number or ''} | Category: {p.category} | Description: {p.description or ''}"
                metadata = {
                    "type": "product",
                    "name": p.name,
                    "brand": p.brand or "Unknown",
                    "category": p.category,
                    "model_number": p.model_number or ""
                }
                self.index_product(p.id, composite_text, metadata)
            logger.info("Products successfully re-indexed.")
        except Exception as e:
            logger.error(f"Failed to re-index products: {e}")
            
        # Re-index all Dealers
        from app.models import Dealer
        try:
            dealers = db.query(Dealer).all()
            logger.info(f"Re-indexing {len(dealers)} dealers in ChromaDB...")
            for d in dealers:
                composite_text = f"Dealer Name: {d.name} | Shop Name: {d.shop_name or ''} | Address: {d.address or ''} | City: {d.city or ''} | State: {d.state or ''} | Phone: {d.phone or ''} | Website: {d.website_url or ''}"
                metadata = {
                    "type": "dealer",
                    "name": d.name,
                    "city": d.city or "",
                    "state": d.state or ""
                }
                self.index_product(d.id, composite_text, metadata)
            logger.info("Dealers successfully re-indexed.")
        except Exception as e:
            logger.error(f"Failed to re-index dealers: {e}")
            
        # Re-index all Advertisements
        from app.models import Advertisement
        try:
            ads = db.query(Advertisement).all()
            logger.info(f"Re-indexing {len(ads)} advertisements in ChromaDB...")
            for ad in ads:
                composite_text = f"Ad Title: {ad.title or ''} | Company: {ad.company or ''} | Brand: {ad.brand or ''} | Category: {ad.category} | Location: {ad.location or ''} | Text: {ad.raw_text}"
                metadata = {
                    "type": "advertisement",
                    "title": ad.title or "Untitled",
                    "category": ad.category,
                    "location": ad.location or "",
                    "company": ad.company or ""
                }
                self.index_product(ad.id, composite_text, metadata)
            logger.info("Advertisements successfully re-indexed.")
        except Exception as e:
            logger.error(f"Failed to re-index advertisements: {e}")
            
        logger.info("Rebuild embeddings complete.")
        self.dimension_verified = True
        return True

    def _get_embedding(self, text: str) -> list:
        # 1. Try local SentenceTransformer (bge-small-en-v1.5 / config model)
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
                
        # 3. Fallback mock vector (All zeroes of size matching current dimension)
        dim = self.get_current_dimension()
        logger.warning(f"Using mock vector fallback [0.0] * {dim}")
        return [0.0] * dim

    def index_product(self, product_id: str, text: str, metadata: dict):
        self.verify_collection_dimension()
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
        self.verify_collection_dimension()
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
