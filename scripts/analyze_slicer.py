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
import ctk
from DICOMLib import DICOMUtils

try:
    import numpy as np
except Exception:
    np = None


def write_json(path, data):
    def default(value):
        if hasattr(value, "item"):
            return value.item()
        return str(value)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=default)


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
    raise RuntimeError(message)


def largest_component(mask):
    """Return the largest 2D connected component mask without requiring scipy."""
    height, width = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    best_pixels = []
    ys, xs = np.where(mask)
    for start_y, start_x in zip(ys.tolist(), xs.tolist()):
        if visited[start_y, start_x]:
            continue
        stack = [(start_y, start_x)]
        visited[start_y, start_x] = True
        pixels = []
        while stack:
            y, x = stack.pop()
            pixels.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))
        if len(pixels) > len(best_pixels):
            best_pixels = pixels
    output = np.zeros(mask.shape, dtype=bool)
    if best_pixels:
        py, px = zip(*best_pixels)
        output[list(py), list(px)] = True
    return output


def connected_components(mask, max_components=16):
    height, width = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    components = []
    ys, xs = np.where(mask)
    for start_y, start_x in zip(ys.tolist(), xs.tolist()):
        if visited[start_y, start_x]:
            continue
        stack = [(start_y, start_x)]
        visited[start_y, start_x] = True
        pixels = []
        while stack:
            y, x = stack.pop()
            pixels.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))
        if len(pixels) > 20:
            py, px = zip(*pixels)
            components.append({
                "area": len(pixels),
                "ys": np.array(py),
                "xs": np.array(px),
            })
    components.sort(key=lambda c: c["area"], reverse=True)
    return components[:max_components]


def estimate_hydrocephalus_metrics(volume_node):
    if np is None:
        return {
            "method": "experimental_intensity_geometry",
            "status": "not_available",
            "limitations": ["numpy is not available in this Slicer Python environment."],
        }

    volume = slicer.util.arrayFromVolume(volume_node)
    if volume is None or volume.ndim != 3 or min(volume.shape) < 8:
        return {
            "method": "experimental_intensity_geometry",
            "status": "not_available",
            "limitations": ["Loaded volume is not a usable 3D scalar array."],
        }

    spacing = volume_node.GetSpacing()
    sx = float(spacing[0]) if spacing else 1.0
    sy = float(spacing[1]) if spacing else 1.0
    z_count, y_count, x_count = volume.shape
    sequence_name = (volume_node.GetName() or "").lower()
    is_flair_like = any(term in sequence_name for term in ("flair", "tirm", "dark-fluid"))
    is_t2_like = "t2" in sequence_name and not is_flair_like
    candidates = []

    z_start = max(1, int(z_count * 0.30))
    z_end = max(2, int(z_count * 0.70))
    slice_indexes = sorted(set(np.linspace(z_start, z_end - 1, num=min(16, max(1, z_end - z_start)), dtype=int).tolist()))

    for z in slice_indexes:
        image = volume[z].astype(float)
        finite = image[np.isfinite(image)]
        if finite.size < 100:
            continue

        p01, p05, p10, p15, p35, p45, p70, p90, p95, p995, p99 = np.percentile(
            finite,
            [1, 5, 10, 15, 35, 45, 70, 90, 95, 99.5, 99],
        )
        body_mask = (image > p01) & (image < p99)
        body_mask = largest_component(body_mask)
        by, bx = np.where(body_mask)
        if bx.size < 100:
            continue

        skull_width_mm = (bx.max() - bx.min() + 1) * sx
        if skull_width_mm <= 0:
            continue

        # This is intentionally a candidate measurement, not a diagnostic segmentation.
        # MRI sequences invert CSF differently: FLAIR/dark-fluid makes CSF dark,
        # while T2 makes CSF bright. CT and unknown sequences use a conservative
        # dark-central candidate rule.
        central_y = (np.arange(y_count)[:, None] > int(y_count * 0.25)) & (np.arange(y_count)[:, None] < int(y_count * 0.75))
        central_x = (np.arange(x_count)[None, :] > int(x_count * 0.20)) & (np.arange(x_count)[None, :] < int(x_count * 0.80))
        central_mask = body_mask & central_y & central_x
        if is_flair_like:
            vent_mask = central_mask & (image >= p15) & (image <= p45)
        elif is_t2_like:
            vent_mask = central_mask & (image >= p95) & (image <= p995)
        else:
            dark_threshold = min(p35, p10 + (p70 - p10) * 0.35)
            vent_mask = central_mask & (image >= p05) & (image <= dark_threshold)
        components = connected_components(vent_mask)
        if not components:
            continue

        mid_x = x_count / 2.0
        usable = []
        for comp in components:
            cx = float(comp["xs"].mean())
            cy = float(comp["ys"].mean())
            width = int(comp["xs"].max() - comp["xs"].min() + 1)
            height = int(comp["ys"].max() - comp["ys"].min() + 1)
            area_mm2 = comp["area"] * sx * sy
            if abs(cx - mid_x) > x_count * 0.28:
                continue
            if cy < y_count * 0.25 or cy > y_count * 0.68:
                continue
            if area_mm2 < 20:
                continue
            if width < 5 or height < 5:
                continue
            usable.append(comp)

        left_components = [c for c in usable if c["xs"].mean() < mid_x]
        right_components = [c for c in usable if c["xs"].mean() >= mid_x]
        if not left_components or not right_components:
            continue

        for left in left_components[:6]:
            for right in right_components[:6]:
                left_cy = float(left["ys"].mean())
                right_cy = float(right["ys"].mean())
                if abs(left_cy - right_cy) > y_count * 0.08:
                    continue

                left_area = left["area"] * sx * sy
                right_area = right["area"] * sx * sy
                total_area = left_area + right_area
                if total_area < 120:
                    continue

                min_x = min(int(left["xs"].min()), int(right["xs"].min()))
                max_x = max(int(left["xs"].max()), int(right["xs"].max()))
                frontal_horn_width_mm = (max_x - min_x + 1) * sx
                evans_index = frontal_horn_width_mm / skull_width_mm
                if evans_index < 0.15 or evans_index > 0.50:
                    continue

                smaller = min(left_area, right_area)
                larger = max(left_area, right_area)
                asymmetry_ratio = None if smaller <= 0 else larger / smaller
                y_alignment_penalty = abs(left_cy - right_cy)
                quality_score = total_area - (y_alignment_penalty * sx * 5)

                candidates.append({
                    "slice_index": int(z),
                    "skull_width_mm": round(skull_width_mm, 2),
                    "frontal_horn_width_mm": round(frontal_horn_width_mm, 2),
                    "evans_index": round(evans_index, 3),
                    "left_candidate_area_mm2": round(left_area, 2),
                    "right_candidate_area_mm2": round(right_area, 2),
                    "ventricular_asymmetry_ratio": round(asymmetry_ratio, 3) if asymmetry_ratio else None,
                    "candidate_component_count": 2,
                    "candidate_area": int(left["area"] + right["area"]),
                    "quality_score": round(float(quality_score), 2),
                })

    if not candidates:
        return {
            "method": "experimental_intensity_geometry",
            "status": "not_available",
            "limitations": [
                "Could not identify reliable central low-intensity ventricular candidates.",
                "Manual review or segmentation is required.",
            ],
        }

    candidates.sort(key=lambda c: c["quality_score"], reverse=True)
    best = candidates[0]
    confidence = "low"
    limitations = [
        "Experimental candidate measurement only; not validated for diagnosis.",
        "May fail on MRI sequences, hemorrhage, postoperative change, severe asymmetry, artifacts, or non-axial acquisitions.",
        "Confirm landmarks and ventricular borders manually in 3D Slicer before clinical use.",
    ]
    if (
        0.20 <= best["evans_index"] <= 0.45
        and best["left_candidate_area_mm2"] >= 40
        and best["right_candidate_area_mm2"] >= 40
    ):
        confidence = "moderate"

    return {
        "method": "experimental_intensity_geometry",
        "status": "candidate_generated",
        "confidence": confidence,
        "evans_index": best["evans_index"],
        "evans_index_supports_ventriculomegaly": best["evans_index"] >= 0.30,
        "frontal_horn_width_mm": best["frontal_horn_width_mm"],
        "inner_skull_width_mm": best["skull_width_mm"],
        "ventricular_asymmetry_ratio": best["ventricular_asymmetry_ratio"],
        "left_candidate_area_mm2": best["left_candidate_area_mm2"],
        "right_candidate_area_mm2": best["right_candidate_area_mm2"],
        "source_slice_index": best["slice_index"],
        "candidate_count": len(candidates),
        "limitations": limitations,
    }


def build_callosal_angle_workflow(output_dir, volume_node):
    reconstruction_dir = os.path.join(output_dir, "reconstructions")
    os.makedirs(reconstruction_dir, exist_ok=True)
    volume_path = os.path.join(reconstruction_dir, "loaded_volume.nrrd")
    saved = False
    try:
        saved = bool(slicer.util.saveNode(volume_node, volume_path))
    except Exception as exc:
        print(f"Could not save reconstructed volume package: {exc}")

    return {
        "status": "manual_measurement_required",
        "coronal_reconstruction_package": volume_path if saved else None,
        "measurement_method": "manual_in_3d_slicer",
        "plane": "coronal_perpendicular_to_acpc",
        "level": "posterior_commissure",
        "steps": [
            "Open the saved NRRD or loaded DICOM volume in 3D Slicer.",
            "Identify anterior commissure and posterior commissure on sagittal view.",
            "Reformat to a true coronal plane perpendicular to the AC-PC line.",
            "Scroll to the posterior commissure level.",
            "Use Markups Angle: left ventricular roof, midline apex, right ventricular roof.",
            "Record callosal_angle_degrees with confidence and limitations.",
        ],
        "interpretation": {
            "less_than_90": "supports NPH pattern when measured correctly",
            "90_to_100": "borderline",
            "greater_than_100": "less supportive of classic NPH; can support atrophy/ex-vacuo pattern",
        },
        "limitations": [
            "Callosal angle is not computed automatically in this pipeline.",
            "Asymmetric encephalomalacia, prior hemorrhage, mass effect, and poor AC-PC alignment can distort the measurement.",
        ],
    }


def volume_score(node):
    image_data = node.GetImageData()
    if not image_data:
        return -1

    dimensions = image_data.GetDimensions()
    name = (node.GetName() or "").lower()
    x, y, z = dimensions
    score = 0

    score += min(z, 128) * 700
    score += min(x * y, 512 * 512) / 1000

    if z <= 1:
        score -= 100000
    if z >= 10:
        score += 10000
    if x >= 256 and y >= 256:
        score += 1000

    penalties = [
        "localizer",
        "mpr range",
        "mip",
        "swi",
        "pha",
        "phase",
        "mag",
        "diff",
        "adc",
        "trace",
    ]
    for penalty in penalties:
        if penalty in name:
            score -= 45000

    preferred = [
        "t2_tirm",
        "dark-fluid",
        "flair",
        "t2_tse",
        "t1_tse",
        "tra",
    ]
    for term in preferred:
        if term in name:
            score += 30000

    if "t2_tirm" in name or "dark-fluid" in name or "flair" in name:
        score += 20000
    if "t2_tse" in name:
        score += 10000

    return score


def select_best_volume_node():
    nodes = slicer.util.getNodesByClass("vtkMRMLScalarVolumeNode")
    if not nodes:
        return None, []

    ranked = []
    for node in nodes:
        image_data = node.GetImageData()
        dimensions = image_data.GetDimensions() if image_data else (0, 0, 0)
        ranked.append({
            "node": node,
            "name": node.GetName(),
            "dimensions": dimensions,
            "spacing": node.GetSpacing(),
            "score": volume_score(node),
        })

    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked[0]["node"], [
        {
            "name": item["name"],
            "dimensions": {
                "x": item["dimensions"][0],
                "y": item["dimensions"][1],
                "z": item["dimensions"][2],
            },
            "spacing_mm": {
                "x": item["spacing"][0],
                "y": item["spacing"][1],
                "z": item["spacing"][2],
            },
            "selection_score": round(item["score"], 2),
        }
        for item in ranked[:8]
    ]


def main():
    args = sys.argv
    if "--" in args:
        idx = args.index("--")
        input_arg_index = idx + 1
    else:
        # Some Slicer builds strip the -- separator before Python sees sys.argv.
        input_arg_index = len(args) - 2

    if len(args) <= input_arg_index + 1:
        print("Usage: analyze_slicer.py [--] <input_dicom_dir> <output_dir>")
        slicer.util.exit(1)

    input_dir = os.path.abspath(args[input_arg_index])
    output_dir = os.path.abspath(args[input_arg_index + 1])
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.isdir(input_dir):
        fail(output_dir, f"Input DICOM directory does not exist: {input_dir}")

    try:
        slicer.mrmlScene.Clear(0)

        loaded = []
        series_summary = []

        with DICOMUtils.TemporaryDICOMDatabase() as db:
            DICOMUtils.importDicom(input_dir, db)
            patient_uids = db.patients()
            if not patient_uids:
                fail(output_dir, "No DICOM patients found. Check that the folder contains valid DICOM files.")

            for patient_uid in patient_uids:
                studies = db.studiesForPatient(patient_uid)
                for study_uid in studies:
                    series_uids = db.seriesForStudy(study_uid)
                    for series_uid in series_uids:
                        files = db.filesForSeries(series_uid)
                        series_summary.append({
                            "patient_uid": patient_uid,
                            "study_uid": study_uid,
                            "series_uid": series_uid,
                            "file_count": len(files),
                        })

            loaded_node_ids = []
            for patient_uid in patient_uids:
                try:
                    result = DICOMUtils.loadPatientByUID(patient_uid)
                    if isinstance(result, (list, tuple)):
                        loaded_node_ids.extend(result)
                except Exception as e:
                    print(f"Could not load patient {patient_uid}: {e}")

            for node_id in loaded_node_ids:
                node = slicer.mrmlScene.GetNodeByID(node_id)
                if node and node.IsA("vtkMRMLScalarVolumeNode"):
                    loaded.append(node)

            if not loaded and series_summary:
                for series in series_summary:
                    files = db.filesForSeries(series["series_uid"])
                    if files:
                        try:
                            success, node = slicer.util.loadVolume(files[0], returnNode=True)
                            if success and node:
                                loaded.append(node)
                                break
                        except Exception as e:
                            print(f"Could not directly load series {series['series_uid']}: {e}")

        best_volume_node, ranked_volume_candidates = select_best_volume_node()
        if best_volume_node:
            loaded = [best_volume_node]

        if not loaded:
            fail(output_dir, "DICOM import succeeded, but no scalar volume could be loaded.")

        volume_node = loaded[0]
        spacing = volume_node.GetSpacing()
        image_data = volume_node.GetImageData()
        dimensions = image_data.GetDimensions() if image_data else (0, 0, 0)
        origin = volume_node.GetOrigin()

        voxel_volume_mm3 = spacing[0] * spacing[1] * spacing[2]
        approximate_volume_ml = dimensions[0] * dimensions[1] * dimensions[2] * voxel_volume_mm3 / 1000.0
        hydrocephalus_metrics = estimate_hydrocephalus_metrics(volume_node)
        callosal_angle_workflow = build_callosal_angle_workflow(output_dir, volume_node)

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
            "volume_selection": {
                "strategy": "rank_loaded_scalar_volumes_prefer_multislice_axial_anatomic_series",
                "candidates": ranked_volume_candidates,
            },
            "dicom_series": series_summary,
            "clinical_safety": {
                "diagnosis": "not_generated",
                "note": "Technical and experimental decision-support measurements only. Requires visual review and clinician interpretation.",
            },
            "hydrocephalus_metrics": hydrocephalus_metrics,
            "callosal_angle_workflow": callosal_angle_workflow,
            "decision_support_inputs": {
                "evans_index": hydrocephalus_metrics.get("evans_index"),
                "asymmetric_ventricles": (
                    hydrocephalus_metrics.get("ventricular_asymmetry_ratio") is not None
                    and hydrocephalus_metrics.get("ventricular_asymmetry_ratio") >= 1.5
                ),
                "callosal_angle_degrees": None,
                "lp_response": "enter separately from clinical LP log",
            },
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
            f.write("## Experimental Hydrocephalus Metrics\n")
            f.write(f"- Evans index candidate: {hydrocephalus_metrics.get('evans_index', 'not available')}\n")
            f.write(f"- Ventricular asymmetry candidate ratio: {hydrocephalus_metrics.get('ventricular_asymmetry_ratio', 'not available')}\n")
            f.write(f"- Metric confidence: {hydrocephalus_metrics.get('confidence', 'not available')}\n")
            f.write("- These values require manual confirmation before clinical use.\n\n")
            f.write("## Callosal Angle / Coronal Reconstruction Workflow\n")
            f.write(f"- Coronal reconstruction package: {callosal_angle_workflow.get('coronal_reconstruction_package') or 'not saved'}\n")
            f.write("- Callosal angle requires manual AC-PC aligned coronal measurement at posterior commissure level.\n\n")
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
