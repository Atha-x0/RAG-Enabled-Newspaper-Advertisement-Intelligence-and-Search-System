import requests

def test_search():
    url = "http://localhost:5000/search"
    params = {"q": "Siemens 5 HP", "include_web": "false"}
    
    print(f"Sending request to {url} with params {params}...")
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            results = data.get("results", [])
            print(f"\nFound {len(results)} local results in search:")
            for i, r in enumerate(results):
                print(f"\nResult #{i+1}:")
                print(f"  Result ID: {r.get('id')}")
                print(f"  Product ID: {r.get('product_id')}")
                print(f"  Name: {r.get('name')}")
                print(f"  Dealer: {r.get('dealer_name')}")
                print(f"  Price: {r.get('price')}")
                print(f"  Phone: {r.get('contact_phone')}")
                print(f"  Source URL: {r.get('source_url')}")
                print(f"  Pub Date: {r.get('publication_date')}")
        else:
            print("Failed to get a successful response.")
    except Exception as e:
        print(f"Error connecting to search endpoint: {e}")

if __name__ == "__main__":
    test_search()
