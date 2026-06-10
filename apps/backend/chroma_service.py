import os
import logging
import numpy as np
import google.generativeai as genai
import chromadb
from chromadb.config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ChromaService")

CHROMA_COLLECTION = "industrial_parts"
EMBEDDING_DIM = 768  # 384 for bge-small-en-v1.5, 768 for gemini text-embedding-004. We will support custom shapes dynamically

class ChromaService:
    def __init__(self):
        # Locate Chroma storage path in project directory
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        chroma_path = os.path.join(base_dir, "chroma_db")
        os.makedirs(chroma_path, exist_ok=True)
        
        logger.info(f"Initializing local persistent ChromaDB client at: {chroma_path}")
        self.client = chromadb.PersistentClient(path=chroma_path)
        self.collection = self.client.get_or_create_collection(name=CHROMA_COLLECTION)
        
        # Setup Gemini for fallback embeddings and RAG
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            genai.configure(api_key=gemini_key)
            self.has_gemini = True
            logger.info("Gemini API configured for Chroma embedding fallback.")
        else:
            self.has_gemini = False
            logger.warning("GEMINI_API_KEY missing in backend. LLM features will run in mock mode.")
            
        # Try loading local BAAI/bge-small-en-v1.5 embeddings
        self.hf_model = None
        self.embedding_dim = 768
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading sentence-transformers BAAI/bge-small-en-v1.5 model...")
            self.hf_model = SentenceTransformer('BAAI/bge-small-en-v1.5')
            self.embedding_dim = 384
            logger.info("SentenceTransformer loaded successfully.")
        except Exception as e:
            logger.warning(f"Could not initialize local SentenceTransformer model: {e}. Using Gemini or Mock embeddings.")

    def _get_embedding(self, text: str) -> list:
        # 1. Try local SentenceTransformer (bge-small-en-v1.5)
        if self.hf_model:
            try:
                embedding = self.hf_model.encode(text)
                return embedding.tolist()
            except Exception as e:
                logger.error(f"SentenceTransformer encoding failed: {e}")
        
        # 2. Try Gemini API
        if self.has_gemini:
            try:
                result = genai.embed_content(
                    model="models/text-embedding-004",
                    content=text,
                    task_type="retrieval_document"
                )
                return result['embedding']
            except Exception as e:
                logger.error(f"Gemini API embedding generation failed: {e}")
                
        # 3. Fallback deterministic mockup vector representation
        logger.warning(f"Using mock vector representation for text: '{text[:30]}...'")
        state = np.random.RandomState(abs(hash(text)) % (2**32 - 1))
        # Vector size matches current collection or default
        vector = state.uniform(-1, 1, self.embedding_dim).tolist()
        return vector

    def index_product(self, product_id: str, text: str, metadata: dict):
        try:
            vector = self._get_embedding(text)
            
            # Chroma requires metadata values to be str, int, float or bool
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
            logger.info(f"Successfully indexed product {product_id} in ChromaDB.")
            return True
        except Exception as e:
            logger.error(f"ChromaDB upsert failed for product {product_id}: {e}")
            return False

    def search_products(self, query_text: str, brand: str = None, category: str = None, limit: int = 5) -> list:
        try:
            query_vector = self._get_embedding(query_text)
            
            # Construct Chroma meta filters
            where_conditions = {}
            if brand:
                where_conditions["brand"] = brand
            if category:
                where_conditions["category"] = category
                
            # ChromaDB filters syntax: if single condition, pass directly. If multiple, wrap in $and
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
