# Windows Setup Guide

## 1. Install 3D Slicer

Install 3D Slicer normally. Open it once to confirm it runs.

Then locate `Slicer.exe`. Common path:

```text
C:\Users\YOUR_NAME\AppData\Local\slicer.org\Slicer 5.8.0\Slicer.exe
```

## 2. Edit the runner

Open:

```text
scripts\run_analysis.bat
```

Change:

```bat
set SLICER_EXE=C:\Users\YOUR_NAME\AppData\Local\slicer.org\Slicer 5.8.0\Slicer.exe
```

## 3. Add a DICOM scan

Example:

```text
scans\dad\2026-05-01-mri\
```

Put the DICOM files/folders inside that folder.

## 4. Run analysis

From repo root:

```bat
scripts\run_analysis.bat scans\dad\2026-05-01-mri outputs\dad\2026-05-01-mri
```

## 5. Check output

```text
outputs\dad\2026-05-01-mri\metrics.json
outputs\dad\2026-05-01-mri\report.md
```
