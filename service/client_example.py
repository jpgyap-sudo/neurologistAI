import requests

payload = {
    "input_dir": "scans/dad/2026-05-01-mri",
    "output_dir": "outputs/dad/2026-05-01-mri"
}

r = requests.post("http://127.0.0.1:8787/analyze-dicom", json=payload, timeout=3600)
print(r.status_code)
print(r.json())
