import sys
import subprocess
import os

REQUIRED_PACKAGES = [
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "chromadb",
    "sentence-transformers",
    "python-multipart",
    "python-dotenv",
    "requests",
    "google-generativeai",
    "google-genai",
    "torch",
    "transformers",
    "huggingface-hub",
    "langchain",
    "langchain-community",
    "pydantic",
    "qdrant-client"
]

def check_and_install_dependencies():
    for package in REQUIRED_PACKAGES:
        import_name = package
        if package == "python-dotenv":
            import_name = "dotenv"
        elif package == "python-multipart":
            import_name = "multipart"
        elif package == "google-generativeai":
            import_name = "google.generativeai"
        elif package == "google-genai":
            import_name = "google.genai"
        elif package == "sentence-transformers":
            import_name = "sentence_transformers"
        elif package == "langchain-community":
            import_name = "langchain_community"
        elif package == "qdrant-client":
            import_name = "qdrant_client"
            
        try:
            if "." in import_name:
                parts = import_name.split(".")
                mod = __import__(parts[0])
                for part in parts[1:]:
                    mod = getattr(mod, part)
            else:
                __import__(import_name)
        except (ImportError, AttributeError):
            print(f"Installing missing package: {package}...", flush=True)
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", package])
                print(f"Successfully installed {package}.", flush=True)
            except Exception as e:
                print(f"Failed to install {package}: {e}", flush=True)

# Recover dependencies before import or execution
check_and_install_dependencies()

import uvicorn

if __name__ == "__main__":
    # Ensure working directory is apps/backend
    os.chdir(os.path.abspath(os.path.dirname(__file__)))
    try:
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=5000,
            reload=True
        )
    except Exception as e:
        print(e)

