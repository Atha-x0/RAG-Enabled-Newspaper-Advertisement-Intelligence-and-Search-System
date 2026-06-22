import os
import sqlite3

for root, dirs, files in os.walk("Z:/Projects/rag-ad-intelligence"):
    # skip some directories to make it fast
    if ".git" in root or ".uv-cache" in root or "node_modules" in root or ".gemini" in root:
        continue
    for file in files:
        if file.endswith(".sqlite"):
            full_path = os.path.join(root, file)
            print(f"\nFound DB: {full_path}")
            try:
                conn = sqlite3.connect(full_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                tables = [r[0] for r in cursor.fetchall()]
                print(f"  Tables: {tables}")
                conn.close()
            except Exception as e:
                print(f"  Error: {e}")
