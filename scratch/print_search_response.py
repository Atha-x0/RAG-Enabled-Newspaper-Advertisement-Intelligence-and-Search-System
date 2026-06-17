import requests
import json

url = "http://localhost:5000/search"
params = {"q": "Siemens Motor"}

try:
    response = requests.get(url, params=params, timeout=10)
    print("Status:", response.status_code)
    data = response.json()
    print("message:", data.get("message"))
    print("search_meta:", data.get("search_meta"))
    print("\n--- RESULTS ---")
    for r in data.get("results", []):
        print(f"[{r.get('result_type')}] {r.get('name') or r.get('title')}")
    print("\n--- WEB RESULTS ---")
    for r in data.get("web_results", []):
        print(f"[{r.get('result_type')}] {r.get('name') or r.get('title')}")
except Exception as e:
    print("Error:", e)
