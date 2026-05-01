# Coding Agent Task List

## Phase 0 — Repair repository
- Ensure Python, BAT, PowerShell, Markdown, TOML, YAML, and TXT files are properly multiline.
- Fix `requirements.txt` so each package is on a new line.
- Fix `pyproject.toml` formatting.
- Run basic lint/parse checks.

## Phase 1 — Slicer baseline
Add/verify:
- `scripts/analyze_slicer.py`
- `scripts/run_analysis.bat`
- `service/server.py`
- `config/config.example.yaml`

Expected outputs:
- `metrics.json`
- `report.md`
- `previews/axial.png`
- `previews/coronal.png`
- `previews/sagittal.png`

## Phase 2 — DICOM sequence selection
Implement robust selection of:
- T1
- T2
- FLAIR
- DWI
- ADC
- CT brain

Do not blindly load first scalar volume.

## Phase 3 — Callosal angle reconstruction skill
Add:
- `skills/callosal_angle_reconstruction.md`
- `scripts/reconstruct_coronal_acpc.py` scaffold
- report template section for CA measurement confidence

Manual-first requirement:
- The software may assist with reconstruction.
- Final CA measurement should require user/clinician visual confirmation.

## Phase 4 — Hydrocephalus decision support
Add:
- LP response module
- shunt decision matrix
- DESH checklist
- imaging red flags
- ex-vacuo vs NPH evidence weighting

## Phase 5 — Dad longitudinal data
Add JSON databases:
- `dad_case_summary.json`
- `timeline.json`
- `scans_manifest.json`
- `lumbar_puncture_log.json`
- `mcs_recovery_tracker.json`
- `medications.json`
- `rehab_metrics.json`
- `infection_pulmonary_tracker.json`
- `bp_cerebral_perfusion_log.json`

## Phase 6 — Reports
Generate Markdown reports:
- imaging technical report
- LP response report
- shunt decision support report
- rehab progress report
- doctor questions report

## Phase 7 — Optional viewer
Start with PNG previews. Later evaluate:
- OHIF viewer
- Cornerstone.js
- Slicer desktop deep-link workflow
