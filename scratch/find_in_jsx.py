import re

file_path = r"z:\Projects\rag-ad-intelligence\apps\frontend\src\app\page.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

search_terms = ["all_results", "results", "web_results", "map(", "length === 0", "no ", "not found"]
for i, line in enumerate(lines):
    for term in search_terms:
        if term in line:
            print(f"Line {i+1}: {line.strip()[:100]}")
            break
