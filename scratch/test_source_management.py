import requests
import time

BACKEND_URL = "http://localhost:5000"
SCRAPER_URL = "http://localhost:8010"

def get_scraper_jobs():
    res = requests.get(f"{SCRAPER_URL}/health")
    if res.status_code == 200:
        return res.json().get("registered_jobs", [])
    return []

def main():
    print("=== STARTING SOURCE MANAGEMENT VERIFICATION ===")
    
    # 1. Fetch initial scheduler jobs
    initial_jobs = get_scraper_jobs()
    print(f"Initial jobs in APScheduler: {initial_jobs}")
    
    # 2. Add a new source via Backend
    new_source_payload = {
        "name": "Verification Test Source",
        "crawling_url": "http://verification-test.com/feed.pdf",
        "source_type": "epaper_pdf",
        "cron_schedule": "*/5 * * * *",  # every 5 minutes
        "language": "en",
        "is_active": True,
        "priority": 1,
        "is_permanent": False
    }
    
    print("\n1. Creating new source via backend...")
    create_res = requests.post(f"{BACKEND_URL}/sources", json=new_source_payload)
    assert create_res.status_code == 200, f"Failed to create source: {create_res.text}"
    source_info = create_res.json()
    source_id = source_info["id"]
    print(f"Created source successfully! ID: {source_id}")
    
    # Wait 1s for sync
    time.sleep(1.0)
    
    # Verify job is registered in scraper scheduler
    expected_job_id = f"scrape_source_{source_id}"
    jobs_after_create = get_scraper_jobs()
    print(f"Jobs after creation: {jobs_after_create}")
    assert expected_job_id in jobs_after_create, f"Job {expected_job_id} not registered in APScheduler!"
    print(f"PASS: Source registered successfully in APScheduler.")
    
    # 3. Edit source via Backend (change schedule to hourly)
    edit_payload = new_source_payload.copy()
    edit_payload["cron_schedule"] = "0 * * * *"  # every hour
    edit_payload["name"] = "Verification Test Source Edited"
    edit_payload["priority"] = 2
    
    print("\n2. Editing source via backend...")
    edit_res = requests.put(f"{BACKEND_URL}/sources/{source_id}", json=edit_payload)
    assert edit_res.status_code == 200, f"Failed to edit source: {edit_res.text}"
    print("Edited source successfully!")
    
    # Verify it's still registered in scheduler
    time.sleep(1.0)
    jobs_after_edit = get_scraper_jobs()
    assert expected_job_id in jobs_after_edit, f"Job {expected_job_id} lost from scheduler on update!"
    print("PASS: Source updated successfully and scheduler kept job.")
    
    # 4. Toggle source via Backend (disable it)
    print("\n3. Disabling source (toggle) via backend...")
    toggle_res = requests.post(f"{BACKEND_URL}/sources/{source_id}/toggle")
    assert toggle_res.status_code == 200, f"Failed to toggle: {toggle_res.text}"
    print(f"Disabled source successfully! Active state: {toggle_res.json()['is_active']}")
    
    # Verify job is removed from scheduler
    time.sleep(1.0)
    jobs_after_toggle = get_scraper_jobs()
    print(f"Jobs after disabling toggle: {jobs_after_toggle}")
    assert expected_job_id not in jobs_after_toggle, f"Job {expected_job_id} was not removed from APScheduler after toggle disable!"
    print("PASS: Source disabled and successfully removed from APScheduler.")
    
    # Re-enable it
    print("\nRe-enabling source...")
    toggle_res_2 = requests.post(f"{BACKEND_URL}/sources/{source_id}/toggle")
    assert toggle_res_2.status_code == 200
    time.sleep(1.0)
    assert expected_job_id in get_scraper_jobs()
    print("Re-enabled and registered again.")
    
    # 5. Delete source (since it is non-permanent, bypass is not needed)
    print("\n4. Deleting source via backend...")
    delete_res = requests.delete(f"{BACKEND_URL}/sources/{source_id}")
    assert delete_res.status_code == 200, f"Failed to delete source: {delete_res.text}"
    print("Deleted source successfully!")
    
    # Verify job is removed from scheduler
    time.sleep(1.0)
    jobs_after_delete = get_scraper_jobs()
    print(f"Jobs after deletion: {jobs_after_delete}")
    assert expected_job_id not in jobs_after_delete, f"Job {expected_job_id} was not removed from APScheduler after delete!"
    print("PASS: Source deleted and successfully removed from APScheduler.")

    # 6. Test Permanently Registered source deletion block
    print("\n5. Testing permanent registration deletion block...")
    perm_source_payload = new_source_payload.copy()
    perm_source_payload["name"] = "Permanent Verification Source"
    perm_source_payload["is_permanent"] = True
    
    create_perm_res = requests.post(f"{BACKEND_URL}/sources", json=perm_source_payload)
    assert create_perm_res.status_code == 200
    perm_source_id = create_perm_res.json()["id"]
    print(f"Created permanent source successfully! ID: {perm_source_id}")
    
    # Try standard delete (should fail with 400)
    bad_delete_res = requests.delete(f"{BACKEND_URL}/sources/{perm_source_id}")
    print(f"Standard delete status code: {bad_delete_res.status_code} (Expected: 400)")
    assert bad_delete_res.status_code == 400, "Permanent source was deleted without bypass!"
    print("PASS: Standard deletion was blocked correctly for permanent source.")
    
    # Delete with bypass
    good_delete_res = requests.delete(f"{BACKEND_URL}/sources/{perm_source_id}", params={"bypass_permanent": True})
    assert good_delete_res.status_code == 200, f"Failed bypass delete: {good_delete_res.text}"
    print("Bypass deletion succeeded.")
    print("PASS: Bypass parameter correctly allowed deletion of permanent source.")
    
    print("\n=== ALL VERIFICATION CHECKS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
