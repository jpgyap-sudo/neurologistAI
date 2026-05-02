# CT Scan Analyzer Developer Workflow

This workflow is for coders testing, debugging, or extending the product.

## 1. Local Setup

Install or expose the required tools:
- Node.js 18 or newer for JavaScript syntax checks and Vercel dev server.
- Python 3.10 or newer for clinical decision-support tests.
- `pytest` for Python tests.
- Vercel CLI if testing serverless API routes locally.

Useful commands:

```powershell
npm run check
python -m pytest
npm run dev
```

If `node` is installed through NVM on Windows, confirm the active shell has the Node path available before running `npm` scripts.

## 2. Fast Smoke Test

Use this sequence after any change:

1. Open the app.
2. Confirm the initial chat greeting renders.
3. Attach a DICOM file or ZIP.
4. Confirm the DICOM list updates and the canvas renders the active slice.
5. Move WW/WL sliders and click CT presets.
6. Draw a measurement and one ROI.
7. Attach an image and confirm DICOM annotations do not appear on it.
8. Generate a report with normal text.
9. Generate a report with HTML-like text and confirm it is escaped.
10. Ask the chat "What app skills are available?"

## 3. API Workflow

Run the app with a server that supports API routes, normally:

```powershell
npm run dev
```

Test knowledge stats:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/knowledge"
```

Test knowledge search:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/knowledge?q=hydrocephalus&limit=8"
```

Test bad knowledge limits:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/knowledge?q=hydrocephalus&limit=-1"
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/knowledge?q=hydrocephalus&limit=abc"
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/knowledge?q=hydrocephalus&limit=9999"
```

Test web counter-check:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/web-check" `
  -ContentType "application/json" `
  -Body '{"query":"normal pressure hydrocephalus DESH","limit":5}'
```

Expected behavior:
- Empty query returns HTTP 400.
- Bad limits fall back or clamp to a bounded range.
- Network failure returns a structured `web_check_failed` error.

## 4. Chat Workflow

Static file mode:
- The browser assistant uses local fallback responses.
- Server-backed AI and PubMed counter-check are unavailable.

HTTP or HTTPS mode:
- `tryServerAssistant()` calls `/api/chat`.
- The browser sends the user message, loaded scan context, report fields, and `counterCheck: true`.
- The API searches local knowledge and may query PubMed.
- If an AI provider key is configured, the API calls the configured model.
- Without an AI provider, the API returns a local fallback answer.

Environment variables:
- `OPENAI_API_KEY` enables OpenAI-compatible chat completions.
- `KIMI_API_KEY` enables Moonshot/Kimi chat completions.
- `AI_MODEL` overrides the default model.

Debug steps:
1. Check browser console for fetch failures.
2. Check `/api/chat` response JSON.
3. Confirm `model_used` is either the expected model name or `local-fallback`.
4. Confirm `local_sources` and `web_sources` are present when expected.

## 5. Security Regression Workflow

Run these manual checks after touching rendering code:

1. Send this chat message:

```html
<img src=x onerror=alert(1)>
```

Expected result:
- The message displays as text.
- No alert runs.

2. Create a report with this text in findings:

```html
<script>alert(1)</script>
```

Expected result:
- The generated report displays the literal text.
- No script runs.

3. Upload or ZIP a file with a name like:

```text
scan-<img src=x onerror=alert(1)>.dcm
```

Expected result:
- The file name displays as text.
- No markup is interpreted.

## 6. Annotation Regression Workflow

Run this after touching viewer state:

1. Load two DICOM slices.
2. Draw a measurement on slice 1.
3. Move to slice 2.
4. Confirm slice 1 annotation does not appear on slice 2.
5. Return to slice 1.
6. Confirm the annotation is still there.
7. Attach an image.
8. Confirm the DICOM annotation does not appear on the image.
9. Draw an annotation on the image.
10. Switch back to DICOM and confirm the image annotation does not appear.
11. Switch back to the image and confirm its annotation remains.

## 7. Python Clinical Rules Workflow

Run:

```powershell
python -m pytest
```

When adding scoring logic:
- Add a focused test in `tests/test_decision_tree.py`.
- Cover one clear positive case.
- Cover at least one mixed or indeterminate case when changing thresholds.
- Keep outputs cautious and clinician-review oriented.

## 8. Common Debug Map

Frontend app shell:
- `index.html`
- `css/style.css`
- `js/app.js`

Clinical skill definitions:
- `js/app-skills.js`
- `skills/`
- `clinical/`
- `resources/`

Serverless APIs:
- `api/chat.js`
- `api/knowledge.js`
- `api/web-check.js`
- `api/lib/request.js`
- `api/lib/knowledge.js`
- `api/lib/web-check.js`

Python decision support:
- `clinical/hydrocephalus/decision_tree.py`
- `tests/`

## 9. Pre-Release Checklist

Before deployment or sharing a build:

1. Run `npm run check`.
2. Run `python -m pytest`.
3. Run the fast smoke test.
4. Run the security regression workflow.
5. Run the annotation regression workflow.
6. Confirm `.env.local` is not committed.
7. Confirm API keys are configured only in the deployment environment.
8. Confirm medical disclaimer text is visible in the app and generated report.
