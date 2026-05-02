# CT Scan Analyzer Product Features

This document describes the product surface so a coder can test, debug, and extend features without guessing where behavior lives.

## 1. DICOM Viewer

Primary files:
- `index.html`
- `js/app.js`
- `css/style.css`

What it does:
- Accepts individual DICOM files through **Attach DICOM / ZIP**.
- Accepts DICOM folders through **Attach DICOM Folder**.
- Accepts ZIP archives and extracts DICOM, image, and PDF-like attachments.
- Parses DICOM metadata and pixel data in the browser with `dicom-parser`.
- Renders the active DICOM slice to the canvas.
- Shows matrix dimensions and displayed pixel min, max, and mean.

Key test cases:
- Load one valid DICOM file and confirm the canvas displays.
- Load multiple DICOM files and confirm previous/next slice navigation works.
- Load a ZIP containing DICOM files and confirm each readable file appears in the DICOM list.
- Load malformed or unsupported files and confirm the user sees a readable error message.
- Confirm file names with special characters display as text and do not execute HTML.

Debug hints:
- DICOM parsing starts in `parseDicom()`.
- Pixel extraction is handled by `getPixelData()`.
- Slice rendering is handled by `renderSlice()`.
- Active slice state is stored in `state.activeIndex`.

## 2. General File Attachment

Primary files:
- `index.html`
- `js/app.js`

What it does:
- Accepts images and PDFs through **Attach PDF / Images**.
- Displays image attachments on the canvas.
- Shows a placeholder for files that cannot be previewed directly, including PDFs.
- Keeps general-file annotations separate from DICOM slice annotations.

Key test cases:
- Attach a PNG or JPG and confirm it renders on the canvas.
- Attach a PDF and confirm the placeholder appears.
- Add an annotation to a DICOM slice, switch to an image, and confirm the DICOM annotation does not appear.
- Add an annotation to an image, switch away and back, and confirm it remains with that image.

Debug hints:
- General file loading is handled by `loadGeneralFile()`.
- Image drawing is handled by `drawGeneralImage()`.
- General file annotations are stored in `state.annotationsByGeneralFile`.

## 3. Window, Level, Pan, Zoom, and Presets

Primary file:
- `js/app.js`

What it does:
- Supports window width and window level sliders.
- Supports CT-style presets for lung, soft tissue, bone, brain, and abdomen.
- Supports mouse-driven pan, zoom, and window/level adjustment.

Key test cases:
- Move WW/WL sliders and confirm the rendered DICOM contrast changes.
- Click each preset and confirm slider values update.
- Use pan and zoom tools and confirm the image moves/scales without losing annotations.
- Reset the view and confirm scale and pan return to defaults.

Debug hints:
- Windowing is handled by `computeWindowedImageData()`.
- Mouse tools are wired in the mouse event listeners near the tools section.

## 4. Annotations and ROI Measurements

Primary file:
- `js/app.js`

What it does:
- Supports length measurement, rectangle ROI, ellipse ROI, and text annotations.
- Computes length in millimeters using DICOM pixel spacing when available.
- Computes ROI pixel count, min, max, and mean for DICOM pixel data.
- Stores DICOM annotations per slice.
- Stores image/PDF placeholder annotations per attached file.

Key test cases:
- Draw a measurement on a DICOM slice and confirm a millimeter value is added.
- Draw rectangle and ellipse ROIs and confirm ROI stats update.
- Switch slices and confirm annotations are scoped to the correct slice.
- Clear annotations and confirm only the active item's annotations are cleared.

Debug hints:
- Annotation drawing is handled by `drawAnnotations()`.
- Pixel spacing comes from `getPixelSpacing()`.
- ROI stats are computed in `computeRoiStats()`.

## 5. Report Builder

Primary files:
- `index.html`
- `js/app.js`

What it does:
- Collects patient ID, study date, body part, clinical history, findings, impression, and recommendations.
- Generates an in-page report preview.
- Escapes report fields before inserting them into the report preview.

Key test cases:
- Enter normal text and generate a report.
- Enter text containing `<script>` or HTML tags and confirm it displays as text, not markup.
- Close and reopen the report modal.

Debug hints:
- Report generation starts at the `generateReport` click handler.
- HTML escaping is handled by `escapeHtml()`.

## 6. NeuroAI Chat Assistant

Primary files:
- `js/app.js`
- `js/app-skills.js`
- `js/knowledge-base.js`
- `api/chat.js`
- `api/lib/knowledge.js`
- `api/lib/web-check.js`

What it does:
- Provides local fallback answers about loaded scan metadata and app skills.
- Calls `/api/chat` when served over HTTP or HTTPS.
- Sends loaded scan context and report fields to the server assistant.
- Uses local knowledge files for context.
- Can perform a PubMed counter-check for clinical terms.
- Escapes chat messages before rendering, while still allowing simple `**bold**` formatting.

Key test cases:
- Ask a general local question from a static file page and confirm fallback chat responds.
- Serve the app over HTTP and ask a clinical question; confirm `/api/chat` is called.
- Type HTML or script-like content in the chat and confirm it displays as text.
- Ask "What app skills are available?" and confirm skills from `js/app-skills.js` are listed.

Debug hints:
- Browser chat flow starts in `sendChat()`.
- Server chat handler is `api/chat.js`.
- Knowledge search is implemented in `api/lib/knowledge.js`.
- PubMed counter-check is implemented in `api/lib/web-check.js`.

## 7. Knowledge API

Primary files:
- `api/knowledge.js`
- `api/lib/knowledge.js`

What it does:
- `GET /api/knowledge` returns indexed knowledge stats.
- `GET /api/knowledge?q=term&limit=8` returns ranked local knowledge matches.
- Limit values are clamped to a safe range.

Key test cases:
- Request `/api/knowledge` and confirm file/chunk stats return.
- Request `/api/knowledge?q=hydrocephalus` and confirm matches return.
- Try `limit=-1`, `limit=abc`, and a very large limit; confirm output stays bounded.

Debug hints:
- Source directories are defined in `SOURCE_DIRS`.
- Chunking is handled by `chunkText()`.
- Ranking is handled by `searchKnowledge()`.

## 8. Web Counter-Check API

Primary files:
- `api/web-check.js`
- `api/lib/web-check.js`

What it does:
- Accepts a POST body with `query` and optional `limit`.
- Searches PubMed through NCBI E-utilities.
- Returns title, authors, journal, publication date, and URL.
- Limit values are clamped to a safe range.

Key test cases:
- POST a valid query and confirm PubMed sources return.
- POST an empty query and confirm a 400 response.
- Try bad limit values and confirm output stays bounded.
- Simulate network failure and confirm a structured `web_check_failed` response.

Debug hints:
- Request entry point is `api/web-check.js`.
- PubMed search and summary calls are in `api/lib/web-check.js`.

## 9. Python Clinical Decision Support

Primary files:
- `clinical/hydrocephalus/decision_tree.py`
- `tests/test_decision_tree.py`

What it does:
- Scores ventriculomegaly evidence as ex-vacuo leaning, NPH/communicating-hydrocephalus leaning, or mixed/indeterminate.
- Returns scores, pattern, notes, input echo, and safety note.

Key test cases:
- Run `python -m pytest`.
- Confirm ex-vacuo-heavy evidence returns `more_consistent_with_ex_vacuo`.
- Confirm NPH-heavy evidence returns `more_consistent_with_nph_or_communicating_hydrocephalus`.
- Add edge tests for mixed features and missing optional fields.

Debug hints:
- The scoring function is `score_ventriculomegaly()`.
- Inputs use the `VentriculomegalyEvidence` dataclass.

## Known Constraints

- This product is decision support only and does not produce validated diagnoses.
- Browser DICOM rendering depends on external CDN scripts unless vendored locally.
- PDF files are attached and tracked but not rendered as full PDF previews.
- PubMed counter-check requires network access from the serverless environment.
- Local static file mode cannot call serverless APIs; use `vercel dev` or a deployed environment for API-backed chat.
