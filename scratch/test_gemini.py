import os
from dotenv import load_dotenv
from google import genai

# Load .env file
load_dotenv(dotenv_path=r"z:\Projects\rag-ad-intelligence\.env")

api_key = os.getenv("GEMINI_API_KEY")
print(f"Loaded GEMINI_API_KEY: {api_key[:10]}...")

try:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model='gemini-1.5-flash',
        contents='Verify that you are online and working. Return a short message.'
    )
    print("Response text:", response.text)
except Exception as e:
    print("Failed to call Gemini API:", e)
