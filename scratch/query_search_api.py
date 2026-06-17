import requests

url = "http://localhost:5000/search"
params = {"q": "Siemens Motor 2"}

try:
    print(f"Sending GET to {url} with query 'Siemens Motor'...")
    response = requests.get(url, params=params, timeout=10)
    print("Status Code:", response.status_code)
    data = response.json()
    print("Keys in response:", list(data.keys()))
    print("Catalog results found:", len(data.get("results", [])))
    print("Web results found:", len(data.get("web_results", [])))
    print("Web results details:")
    for r in data.get("web_results", []):
        print(f"- {r.get('title')} (Priority: {r.get('source_priority')}, Relevance: {r.get('relevance_score')})")
except Exception as e:
    print("Failed to query API:", e)
