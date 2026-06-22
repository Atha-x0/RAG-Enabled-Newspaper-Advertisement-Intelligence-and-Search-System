import sqlite3
import os

db_path = r"z:\Projects\rag-ad-intelligence\database.sqlite"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, crawling_url, region, verification_status, last_crawl_time FROM scrape_sources")
        rows = cursor.fetchall()
        print(f"Found {len(rows)} sources:")
        for r in rows:
            print(r)
    except Exception as e:
        print(f"Error querying: {e}")
    conn.close()
else:
    print("Database file not found yet.")
