import sys
import os

# Add the scraper-service directory to the python search path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import uvicorn

if __name__ == "__main__":
    logger_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    print("Booting automated Web Scraping service on port 8010...")
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)
