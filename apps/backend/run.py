import uvicorn
import os

if __name__ == "__main__":
    # Ensure working directory is apps/backend
    os.chdir(os.path.abspath(os.path.dirname(__file__)))
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
