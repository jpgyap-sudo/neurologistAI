# Vercel Assistant Upgrade

This project can run as a Vercel-hosted decision-support web app while keeping heavy DICOM reconstruction on a local machine or a dedicated imaging server.

## What Vercel Handles

- Serves the browser app.
- Provides `/api/chat` for the NeuroAI assistant.
- Provides `/api/knowledge` to search local repo knowledge files.
- Provides `/api/web-check` to counter-check PubMed evidence.
- Reads deployed repo knowledge from:
  - `agents/`
  - `clinical/`
  - `docs/`
  - `reports/`
  - `resources/`
  - `skills/`
  - `data/`

## What Stays Local

3D Slicer should stay local or run on a dedicated VM. Vercel serverless functions are not intended for desktop imaging engines, large DICOM reconstruction jobs, or long-running medical image processing.

Local Slicer service:

```powershell
uvicorn service.server:app --host 127.0.0.1 --port 8787
```

## Assistant Behavior

The assistant combines:

1. Loaded scan context from the browser viewer.
2. Local app knowledge from repo markdown/JSON/YAML files.
3. PubMed web counter-checks when the question asks for evidence, papers, citations, or latest research.
4. Optional OpenAI model reasoning when `OPENAI_API_KEY` is configured.

It must not claim to diagnose. Use terms such as:

- supports
- argues against
- indeterminate
- requires radiologist/clinician confirmation

## Environment Variables

Set these in Vercel project settings:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

If no OpenAI key is configured, `/api/chat` still returns a local evidence summary using repo knowledge and PubMed results.

## Endpoints

### `GET /api/knowledge`

Returns the number of indexed files/chunks.

### `GET /api/knowledge?q=hydrocephalus`

Returns local knowledge chunks matching the query.

### `POST /api/web-check`

```json
{
  "query": "callosal angle normal pressure hydrocephalus",
  "limit": 5
}
```

### `POST /api/chat`

```json
{
  "message": "Counter-check NPH vs ex vacuo evidence",
  "scanContext": "Loaded DICOM files/slices: 419...",
  "reportFields": {
    "findings": "",
    "impression": ""
  },
  "counterCheck": true
}
```

## Deployment

1. Install Vercel CLI:

```powershell
npm install -g vercel
```

2. From repo root:

```powershell
vercel
```

3. For local Vercel-style development:

```powershell
vercel dev
```

4. Open the provided local URL and test:

```text
What app skills are available?
Counter-check evidence for NPH versus hydrocephalus ex vacuo.
What does the loaded scan context show?
```
