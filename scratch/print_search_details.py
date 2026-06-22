import requests
import json

url = "http://localhost:5000/search"
params = {"q": "Siemens Motor"}

try:
    response = requests.get(url, params=params, timeout=10)
    print("Status:", response.status_code)
    data = response.json()
    all_results = data.get("all_results", [])
    if all_results:
        print("\n--- FIRST RESULT DETAILS ---")
        first = all_results[0]
        print(json.dumps(first, indent=2))
    else:
        print("No results found.")
except Exception as e:
    print("Error:", e)
