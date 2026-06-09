import sys
import os

# Add the ml-service root directory to the Python path
# This ensures 'app' package can be discovered as a module
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
