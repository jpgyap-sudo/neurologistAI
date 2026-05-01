"""
3D Slicer headless DICOM loader for SuperRoo Medical.

Run with:
Slicer --no-main-window --python-script analyze_slicer.py -- <input_dicom_dir> <output_dir>

This first version loads a DICOM series and exports technical metadata.
It intentionally does not diagnose. Advanced segmentation modules can be added later.
"""

import os
import sys
import json
import traceback
from datetime import datetime

import slicer


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def fail(output_dir, message, exc=None):
    os.makedirs(output_dir, exist_ok=True)
    payload = {
        "status": "failed",
        "message": message,
        "error": str(exc) if exc else None,
        "traceback": traceback.format_exc() if exc else None,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    write_json(os.path.join(output_dir, "metrics.json"), payload)
    print(message)
    if exc:
        print(exc)
    slicer.util.exit(1)


def main():
    args = sys.argv
    if "--" not in args:
        print("Usage: analyze_slicer.py -- <input_dicom_dir> <output_dir>")
        slicer.util.exit(1)

    idx = args.index("--")
    input_dir = os.path.abspath(args[idx + 1])
    output_dir = os.path.abspath(args[idx + 2])
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.isdir(input_dir):
        fail(output_dir, f"Input DICOM directory does not exist: {input_dir}")

    try:
        slicer.mrmlScene.Clear(0)

        dicom_db_dir = os.path.join(output_dir, "dicom_db")
        os.makedirs(dicom_db_dir, exist_ok=True)
        slicer.dicomDatabase.openDatabase(dicom_db_dir)

        indexer = slicer.ctk.ctkDICOMIndexer()
        indexer.addDirectory(slicer.dicomDatabase, input_dir)
        indexer.waitForImportFinished()

        patient_uids = slicer.dicomDatabase.patients()
        if not patient_uids:
            fail(output_dir, "No DICOM patients found. Check that the folder contains valid DICOM files.")

        loaded = []
        series_summary = []

        for patient_uid in patient_uids:
            studies = slicer.dicomDatabase.studiesForPatient(patient_uid)
            for study_uid in studies:
                series_uids = slicer.dicomDatabase.seriesForStudy(study_uid)
                for series_uid in series_uids:
                    files = slicer.dicomDatabase.filesForSeries(series_uid)
                    series_summary.append({
                        "patient_uid": patient_uid,
                        "study_uid": study_uid,
                        "series_uid": series_uid,
                        "file_count": len(files),
                    })
                    if files and not loaded:
                        try:
                            success, node = slicer.util.loadVolume(files[0], returnNode=True)
                            if success and node:
                                loaded.append(node)
                        except Exception as e:
                            print(f"Could not load series {series_uid}: {e}")

        if not loaded:
            fail(output_dir, "DICOM import succeeded, but no scalar volume could be loaded.")

        volume_node = loaded[0]
        spacing = volume_node.GetSpacing()
        image_data = volume_node.GetImageData()
        dimensions = image_data.GetDimensions() if image_data else (0, 0, 0)
        origin = volume_node.GetOrigin()

        voxel_volume_mm3 = spacing[0] * spacing[1] * spacing[2]
        approximate_volume_ml = dimensions[0] * dimensions[1] * dimensions[2] * voxel_volume_mm3 / 1000.0

        metrics = {
            "status": "loaded_successfully",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "input_dir": input_dir,
            "output_dir": output_dir,
            "loaded_volume": {
                "name": volume_node.GetName(),
                "dimensions_voxels": {"x": dimensions[0], "y": dimensions[1], "z": dimensions[2]},
                "spacing_mm": {"x": spacing[0], "y": spacing[1], "z": spacing[2]},
                "origin": {"x": origin[0], "y": origin[1], "z": origin[2]},
                "approx_full_volume_ml": round(approximate_volume_ml, 2),
            },
            "dicom_series": series_summary,
            "clinical_safety": {
                "diagnosis": "not_generated",
                "note": "Technical DICOM loading output only. Requires visual review and clinician interpretation.",
            },
            "next_metrics_to_add": [
                "Evans index",
                "lateral ventricle segmentation volume",
                "left-right ventricular asymmetry ratio",
                "sulcal widening/effacement qualitative score",
                "lesion-side ex-vacuo pattern flag",
            ],
        }

        metrics_path = os.path.join(output_dir, "metrics.json")
        write_json(metrics_path, metrics)

        report_path = os.path.join(output_dir, "report.md")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("# SuperRoo Medical Imaging Technical Report\n\n")
            f.write("## Processing Status\n")
            f.write("DICOM import and volume loading completed successfully.\n\n")
            f.write("## Loaded Volume\n")
            f.write(f"- Volume name: {volume_node.GetName()}\n")
            f.write(f"- Dimensions voxels: {dimensions}\n")
            f.write(f"- Spacing mm: {spacing}\n")
            f.write(f"- Approximate full image volume: {round(approximate_volume_ml, 2)} mL\n\n")
            f.write("## Clinical Interpretation Boundary\n")
            f.write("This report is not a diagnosis. Manual radiology/neurology review is required.\n\n")
            f.write("## Suggested Manual Review Targets\n")
            f.write("- Ventricular symmetry/asymmetry\n")
            f.write("- Lesion-side ventricular expansion into encephalomalacic territory\n")
            f.write("- High-convexity sulcal effacement versus generalized sulcal widening\n")
            f.write("- DESH pattern elements\n")
            f.write("- Transependymal FLAIR signal if MRI FLAIR is available\n")
            f.write("- Comparison against prior CT/MRI for progression\n")

        print("Analysis complete")
        print(metrics_path)
        print(report_path)
        slicer.util.exit(0)

    except Exception as e:
        fail(output_dir, "Unhandled error during Slicer analysis.", e)


main()
