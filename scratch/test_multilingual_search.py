import sys
import requests
import json

# Force stdout encoding to UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:5000"

queries = [
    "copper wire",
    "कॉपर वायर",
    "तांब्याची वायर"
]

print("=== Starting Multilingual Search Verification ===")

results_by_query = {}

for q in queries:
    print(f"\nSearching for: '{q}'...")
    try:
        response = requests.get(f"{BASE_URL}/search", params={"q": q, "include_web": False})
        if response.status_code == 200:
            data = response.json()
            results = data.get("all_results", [])
            print(f"-> Found {len(results)} results.")
            for r in results[:2]:
                print(f"   - Title: {r.get('name') or r.get('title')} | Source: {r.get('source_name')}")
            
            # Extract result IDs to compare similarity
            result_ids = [r.get("id") or r.get("ad_id") for r in results]
            results_by_query[q] = set(filter(None, result_ids))
        else:
            print(f"-> Error: status code {response.status_code}")
    except Exception as e:
        print(f"-> Connection failed: {e}")

print("\n=== Comparing Results ===")
common_ids = None
for q, ids in results_by_query.items():
    print(f"Query '{q}': {len(ids)} unique result IDs.")
    if common_ids is None:
        common_ids = ids
    else:
        common_ids = common_ids.intersection(ids)

if common_ids:
    print(f"\nSUCCESS: Queries retrieved the same verified ads! Common IDs: {common_ids}")
else:
    print("\nWARNING: No common verified ads found between the queries. Search results might be sparse or offline.")
