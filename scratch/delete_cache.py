import shutil
import os

next_dir = r"z:\Projects\rag-ad-intelligence\apps\frontend\.next"
if os.path.exists(next_dir):
    try:
        shutil.rmtree(next_dir)
        print("Successfully deleted .next cache directory")
    except Exception as e:
        print(f"Failed to delete .next cache: {e}")
else:
    print(".next cache directory does not exist")
