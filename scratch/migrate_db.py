import sqlite3
import os

DB_PATHS = [
    "Z:/Projects/rag-ad-intelligence/database.sqlite",
    "Z:/Projects/rag-ad-intelligence/apps/backend/database.sqlite"
]

for db_path in DB_PATHS:
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}, skipping.")
        continue
    
    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='web_scraped_results';")
    table_exists = cursor.fetchone()
    
    if not table_exists:
        print("Table web_scraped_results does not exist in this database, skipping.")
        conn.close()
        continue
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(web_scraped_results);")
    columns = [row[1] for row in cursor.fetchall()]
    
    if "verification_status" not in columns:
        print("Adding column verification_status...")
        cursor.execute("ALTER TABLE web_scraped_results ADD COLUMN verification_status VARCHAR(20) DEFAULT 'VERIFIED';")
        
    if "canonical_url" not in columns:
        print("Adding column canonical_url...")
        cursor.execute("ALTER TABLE web_scraped_results ADD COLUMN canonical_url VARCHAR(1024);")
        
    conn.commit()
    conn.close()
    print("Migration completed.")
