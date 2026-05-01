# CT Scan Analyzer

A client-side, single-file HTML application for viewing DICOM CT scan images, adjusting window/level settings, taking measurements, drawing ROIs, and generating structured radiology reports. No server or installation required.

## Features

- **DICOM Viewer**
  - Load individual `.dcm` files or bulk-import via `.zip` archives (no file count limit).
  - Browse slices with Previous / Next navigation.
  - Apply medical window/level presets: Lung, Soft Tissue, Bone, Brain, Abdomen.
  - Interactive window/level adjustment by dragging.

- **General File Attachments**
  - Attach supporting files: PDF, JPG, PNG, BMP, GIF.
  - Click any attached file to preview images in the viewer.

- **Image Tools**
  - **Pan** and **Zoom** (mouse wheel + zoom tool).
  - **Window/Level** drag adjustment.
  - **Length measurement** with on-canvas labels in millimeters.
  - **Rectangle and Ellipse ROIs** with pixel statistics (min, max, mean).
  - **Annotations / text notes** on the image.

- **DICOM to Image Export**
  - Save the current displayed slice (with windowing and annotations) as a PNG image.

- **Report Generator**
  - Fill in Patient ID, Study Date, Body Part, Clinical History, Findings, Impression, and Recommendations.
  - Generate a printable report and save as PDF via the browser print dialog.

- **Analysis Panel**
  - View image dimensions, min/max pixel values, and mean intensity.
  - ROI statistics update automatically when a region is drawn.
  - Measurement list accumulates all length measurements.

## How to Use

1. Open `index.html` in any modern web browser (Chrome, Edge, Firefox recommended).
2. Click **Attach DICOM / ZIP** to load DICOM files or ZIP archives containing DICOMs.
3. Click **Attach PDF / Images** to add supporting documents or reference images.
4. Select a file from the list to display it in the viewer.
5. Use the **Tools** buttons to switch between Pan, Zoom, Window/Level, Measure, ROI, and Annotation modes.
6. Adjust **Width (WW)** and **Level (WL)** sliders or use preset buttons.
7. Click **Generate Image from DICOM** to export the current slice as PNG.
8. Switch to the **Report** tab to enter findings and generate a printable report.

## Browser Requirements

- Modern browser with HTML5 Canvas, File API, and ES6 support.
- Internet connection required on first load to fetch JSZip and dicom-parser CDN libraries.

## Important Disclaimer

This tool is for **educational and demonstration purposes only**. It does **not** provide medical diagnoses. Always consult a qualified radiologist or physician for interpretation of medical imaging.

## File Structure

```
ctscan-analyzer/
├── index.html        # Main application
├── css/
│   └── style.css     # UI styles
├── js/
│   └── app.js        # Viewer logic, DICOM parsing, tools, reports
└── README.md         # This file
```

## Libraries Used

- [JSZip](https://stuk.github.io/jszip/) – for ZIP archive extraction in the browser.
- [dicom-parser](https://github.com/cornerstonejs/dicomParser) – for parsing DICOM files client-side.
