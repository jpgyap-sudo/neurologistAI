# SuperRoo Integration Guide

## Goal

SuperRoo should not control the 3D Slicer GUI. It should call the Slicer engine through scripts or local API.

## Option A: Direct script call

SuperRoo runs:

```bat
scripts\run_analysis.bat scans\dad\2026-05-01-mri outputs\dad\2026-05-01-mri
```

Then it reads:

```text
outputs\dad\2026-05-01-mri\metrics.json
outputs\dad\2026-05-01-mri\report.md
```

## Option B: Local API

Start API:

```bat
cd service
pip install -r requirements.txt
uvicorn server:app --reload --port 8787
```

Call:

```http
POST http://127.0.0.1:8787/analyze-dicom
Content-Type: application/json

{
  "input_dir": "scans/dad/2026-05-01-mri",
  "output_dir": "outputs/dad/2026-05-01-mri"
}
```

## SuperRoo system instruction

```text
You are connected to SuperRoo Medical. For DICOM MRI/CT analysis, call the local Slicer pipeline, read metrics.json/report.md, and produce a cautious decision-support report. Do not diagnose. Separate technical imaging findings from clinical interpretation. Always list uncertainty and doctor-facing questions.
```
