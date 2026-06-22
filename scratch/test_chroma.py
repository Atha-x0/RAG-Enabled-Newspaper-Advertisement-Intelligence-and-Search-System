import os
import sys
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

sys.path.insert(0, os.path.join(BASE_DIR, "apps", "backend"))
from app.chroma_service import ChromaService

chroma = ChromaService()

import time
print("Waiting for local embedding model to load...")
for i in range(30):
    if chroma._hf_model is not None or chroma._hf_loading_failed:
        break
    time.sleep(1)

if chroma._hf_model is None:
    print("Failed to load local embedding model within 30 seconds.")
else:
    print("Embedding model loaded successfully.")

print("ChromaDB collections:")
print(chroma.collection)

print("\nSearching ChromaDB for 'Siemens'...")
hits = chroma.search_products("Siemens")
print(f"Found {len(hits)} hits:")
for h in hits:
    print(h)

print("\nSearching ChromaDB for 'Siemens 5 HP Three Phase Motor'...")
hits = chroma.search_products("Siemens 5 HP Three Phase Motor")
print(f"Found {len(hits)} hits:")
for h in hits:
    print(h)
