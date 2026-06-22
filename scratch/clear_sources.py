import sqlite3
import os

db_path = r"z:\Projects\rag-ad-intelligence\database.sqlite"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Delete scrape_sources to trigger seeding
        cursor.execute("DELETE FROM scrape_sources")
        conn.commit()
        print("Deleted all sources.")
    except Exception as e:
        print(f"Error: {e}")
    conn.close()
