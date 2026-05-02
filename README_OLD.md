# SuperRoo Medical

Local medical-imaging and clinical decision-support scaffold for SuperRoo.

This repo lets SuperRoo call a local 3D Slicer installation to process DICOM MRI/CT studies, export technical metrics, and generate structured neurologist/radiologist-style reports for doctor review.

> Safety boundary: this project is not a diagnostic medical device. It generates quantitative decision-support summaries and doctor-facing questions. Final interpretation and treatment decisions must remain with licensed clinicians.

## What this repo does now

- Runs 3D Slicer headless from command line.
- Imports a DICOM folder.
- Loads the first valid scalar volume.
- Exports metadata to `metrics.json`.
- Creates a basic markdown report.
- Exposes an optional FastAPI endpoint for SuperRoo.
- Includes Vercel-ready assistant APIs for:
  - local repo knowledge search across clinical/resources/skills/docs files
  - PubMed counter-checking
  - scan-context-aware assistant responses
  - optional OpenAI model reasoning via `OPENAI_API_KEY`
- Includes clinical prompt templates for:
  - radiology review
  - neurology correlation
  - hydrocephalus vs ex-vacuo reasoning
  - medication/recovery review

## Folder structure

```text
superroo-medical/
  scripts/                 # Slicer command-line scripts
  service/                 # Optional local FastAPI wrapper
  agents/prompts/          # Agent system prompts for SuperRoo
  clinical/                # Clinical decision rules and knowledge scaffolds
  reports/templates/       # Doctor-facing report templates
  api/                     # Vercel serverless assistant endpoints
  js/app-skills.js         # Browser assistant skill manifest
  docs/                    # Setup and workflow guides
  scans/dad/               # Local DICOM input folder placeholder
  outputs/dad/             # Output folder placeholder
```

## Quick start

1. Install 3D Slicer on your laptop.
2. Edit `config.example.yaml` and copy it to `config.yaml`.
3. Put DICOM files under `scans/dad/<scan-date>/`.
4. Run:

```bat
scripts\run_analysis.bat scans\dad\2026-05-01-mri outputs\dad\2026-05-01-mri
```

Expected outputs:

```text
outputs/dad/2026-05-01-mri/metrics.json
outputs/dad/2026-05-01-mri/report.md
outputs/dad/2026-05-01-mri/dicom_db/
```

## Vercel assistant

The browser app can run on Vercel with API routes for assistant reasoning and evidence counter-checks:

```text
GET  /api/knowledge
POST /api/chat
POST /api/web-check
```

See `docs/VERCEL_ASSISTANT.md`.

## SuperRoo instruction

Tell SuperRoo:

```text
Use the local SuperRoo Medical repo. When I provide a DICOM folder path, call the local Slicer pipeline, then read metrics.json and report.md. Do not diagnose. Generate a technical radiology-style summary, neurology correlation, trend comparison, and doctor-facing questions.
```
