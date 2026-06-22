import sqlite3
import os

db_path = "Z:/database.sqlite"
if os.path.exists(db_path):
    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(web_scraped_results);")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Current columns: {columns}")
    
    if "verification_status" not in columns:
        print("Adding column verification_status...")
        cursor.execute("ALTER TABLE web_scraped_results ADD COLUMN verification_status VARCHAR(20) DEFAULT 'VERIFIED';")
        
    if "canonical_url" not in columns:
        print("Adding column canonical_url...")
        cursor.execute("ALTER TABLE web_scraped_results ADD COLUMN canonical_url VARCHAR(1024);")
        
    conn.commit()
    conn.close()
    print("Migration completed successfully.")
else:
    print("Z:/database.sqlite not found.")
