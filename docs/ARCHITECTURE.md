# Architecture

## Local-first design

```text
User provides DICOM folder path
        ↓
SuperRoo Medical Imaging Agent
        ↓
POST /analyze-dicom or direct BAT execution
        ↓
3D Slicer --no-main-window --python-script scripts/analyze_slicer.py
        ↓
outputs/<scan_id>/
  metrics.json
  report.md
  previews/
  dicom_db/
```

## Components

### 1. Imaging pipeline
Responsible for technical image handling:
- DICOM import
- series identification
- sequence selection
- volume loading
- coronal/sagittal/axial reconstruction
- preview export
- future segmentation

### 2. Radiology Agent
Focuses only on imaging morphology:
- ventriculomegaly pattern
- asymmetry
- DESH features
- sulcal effacement or widening
- transependymal edema / FLAIR signal
- lesion-side ex-vacuo pattern
- callosal angle quality caveats

### 3. Neurology Agent
Integrates clinical course:
- MCS status
- LP response
- medication effects
- infection/pneumonia effects
- BP/cerebral perfusion concerns
- shunt risk-benefit

### 4. Rehab Agent
Tracks functional recovery:
- CRS-R signs
- head control
- visual fixation/pursuit
- swallow latency
- sitting tolerance
- tone/spasticity
- task repetitions

### 5. Research Librarian Agent
Maintains references:
- guidelines
- textbooks/checklists without illegal PDFs
- open datasets
- papers and evidence summaries

## Deployment rule
- Laptop: best initial environment for Slicer.
- Vercel: UI only.
- VPS/Docker: optional future automation worker.
