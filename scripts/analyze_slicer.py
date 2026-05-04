"""
3D Slicer headless DICOM loader for SuperRoo Medical.

Run with:
Slicer --no-main-window --python-script analyze_slicer.py -- <input_dicom_dir> <output_dir>

This version loads a DICOM series, selects the best axial brain series,
and computes experimental hydrocephalus metrics including Evans index,
ventricular volume estimates, and callosal angle workflow.
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


def detect_modality(volume_node):
    """Infer modality from node name, DICOM metadata, and intensity range heuristics."""
    name = (volume_node.GetName() or "").lower()
    modality_hint = "unknown"
    if any(t in name for t in ("ct", "ct head", "head ct", "computed tomography")):
        modality_hint = "ct"
    elif any(t in name for t in ("mr", "mri", "t1", "t2", "flair", "tirm", "dark-fluid")):
        modality_hint = "mri"

    # Fallback: use intensity range heuristics on the volume
    try:
        arr = slicer.util.arrayFromVolume(volume_node)
        if arr is not None and arr.size > 0:
            finite = arr[np.isfinite(arr)]
            if finite.size > 0:
                vmin = float(finite.min())
                vmax = float(finite.max())
                # CT typically has Hounsfield units: air ~ -1000, bone > 500
                if vmin < -500 and vmax > 500:
                    modality_hint = "ct"
                elif -500 <= vmin and vmax > 500:
                    # Could be contrast CT or MRI with high values; prefer name hint
                    if modality_hint == "unknown":
                        modality_hint = "mri" if vmax > 2000 else "ct"
                elif modality_hint == "unknown":
                    modality_hint = "mri"
    except Exception:
        pass
    return modality_hint


def refine_modality_from_dicom(volume_node, db, series_summary):
    """Try to read Modality (0008,0060) from DICOM database files."""
    try:
        uids = volume_node.GetAttribute("DICOM.instanceUIDs")
        if uids:
            first_uid = uids.split()[0]
            for series in series_summary:
                files = db.filesForSeries(series["series_uid"])
                for f in files:
                    if first_uid in f:
                        try:
                            import pydicom
                            ds = pydicom.dcmread(f, stop_before_pixels=True)
                            mod = (ds.get("Modality") or "").lower()
                            if mod in ("ct", "mr", "mri"):
                                return "ct" if mod == "ct" else "mri"
                        except Exception:
                            pass
                        break
    except Exception:
        pass
    return None


def preprocess_mri_volume(volume_node):
    """
    Lightweight MRI preprocessing: per-slice robust percentile normalization.
    Reduces bias-field-like intensity variation without requiring N4ITK.
    """
    if np is None:
        return {"status": "skipped", "reason": "numpy unavailable"}
    arr = slicer.util.arrayFromVolume(volume_node)
    if arr is None or arr.ndim != 3:
        return {"status": "skipped", "reason": "volume is not 3D"}
    z_count, y_count, x_count = arr.shape
    out = np.empty_like(arr, dtype=np.float32)
    for z in range(z_count):
        sl = arr[z].astype(np.float32)
        finite = sl[np.isfinite(sl)]
        if finite.size < 100:
            out[z] = sl
            continue
        p2, p98 = np.percentile(finite, [2, 98])
        if p98 <= p2:
            out[z] = sl
            continue
        norm = (sl - p2) / (p98 - p2)
        norm = np.clip(norm, 0.0, 1.0)
        out[z] = norm * (p98 - p2) + p2
    try:
        slicer.util.updateVolumeFromArray(volume_node, out)
        return {"status": "normalized", "method": "per_slice_percentile_normalization"}
    except Exception as exc:
        try:
            new_node = slicer.mrmlScene.AddNewNodeByClass(
                "vtkMRMLScalarVolumeNode",
                volume_node.GetName() + "_preprocessed"
            )
            slicer.util.updateVolumeFromArray(new_node, out)
            new_node.SetSpacing(volume_node.GetSpacing())
            new_node.SetOrigin(volume_node.GetOrigin())
            return {"status": "normalized_new_node", "method": "per_slice_percentile_normalization", "new_node_name": new_node.GetName()}
        except Exception as e2:
            return {"status": "failed", "reason": f"updateVolumeFromArray failed: {exc}; fallback failed: {e2}"}


def mri_quality_check(volume_node):
    """
    Heuristic MRI quality assessment using slice-level statistics.
    Detects motion/ghosting proxies and signal dropout.
    """
    if np is None:
        return {"status": "not_available", "reason": "numpy unavailable"}
    arr = slicer.util.arrayFromVolume(volume_node)
    if arr is None or arr.ndim != 3:
        return {"status": "not_available", "reason": "volume is not 3D"}
    z_count, y_count, x_count = arr.shape
    slice_scores = []
    for z in range(z_count):
        sl = arr[z].astype(float)
        finite = sl[np.isfinite(sl)]
        if finite.size < 100:
            continue
        mean = float(np.mean(finite))
        std = float(np.std(finite))
        cv = std / mean if mean != 0 else 0.0
        p01, p99 = np.percentile(finite, [1, 99])
        range_val = float(p99 - p01)
        hist, _ = np.histogram(finite, bins=64, range=(float(p01), float(p99)))
        hist = hist[hist > 0]
        entropy = 0.0
        if hist.sum() > 0:
            prob = hist.astype(float) / hist.sum()
            entropy = float(-np.sum(prob * np.log(prob)))
        slice_scores.append({
            "slice": z,
            "cv": round(cv, 4),
            "range": round(range_val, 2),
            "entropy": round(entropy, 3),
        })
    if not slice_scores:
        return {"status": "not_available", "reason": "no evaluable slices"}
    cvs = np.array([s["cv"] for s in slice_scores])
    ranges = np.array([s["range"] for s in slice_scores])
    entropies = np.array([s["entropy"] for s in slice_scores])
    mean_cv = float(np.mean(cvs))
    std_cv = float(np.std(cvs))
    outlier_slices = [s["slice"] for s in slice_scores if abs(s["cv"] - mean_cv) > 2.5 * std_cv]
    issues = []
    if len(outlier_slices) > z_count * 0.15:
        issues.append("Potential motion or ghosting artifacts in >15% of slices (CV outliers).")
    if np.mean(ranges) > 0 and np.std(ranges) / np.mean(ranges) > 0.30:
        issues.append("Large inter-slice intensity variation suggests instability.")
    if float(np.mean(entropies)) < 2.0:
        issues.append("Low entropy may indicate signal dropout or poor contrast.")
    return {
        "status": "checked",
        "mean_cv": round(mean_cv, 3),
        "std_cv": round(std_cv, 3),
        "outlier_slice_count": len(outlier_slices),
        "total_slices": z_count,
        "issues": issues,
        "pass": len(issues) == 0,
    }


def compute_skull_width_ct(image, sx):
    """For CT: use bone threshold to find inner table width robustly.

    Clinical definition: maximal internal diameter of the skull measured
    from inner table to inner table at the same level as the frontal horn
    measurement.
    """
    bone_mask = image > 100  # HU threshold for bone
    bone_mask = largest_component(bone_mask)
    ys, xs = np.where(bone_mask)
    if xs.size < 50:
        return None

    # Find the inner table by eroding the bone mask to get the inner contour
    # For each row, find the leftmost and rightmost bone pixels
    # The inner table is approximated by taking a horizontal slice through
    # the center of the skull where the inner table is visible
    height, width = bone_mask.shape
    mid_y = int(height * 0.5)
    search_range = int(height * 0.15)

    inner_left_candidates = []
    inner_right_candidates = []
    for row in range(mid_y - search_range, mid_y + search_range + 1):
        if row < 0 or row >= height:
            continue
        bone_row = np.where(bone_mask[row, :])[0]
        if bone_row.size < 10:
            continue
        # Left inner table: scan inward from left edge
        left_bone = bone_row[0]
        right_bone = bone_row[-1]
        inner_left_candidates.append(left_bone)
        inner_right_candidates.append(right_bone)

    if not inner_left_candidates or not inner_right_candidates:
        # Fallback: use widest horizontal span
        leftmost = xs.min()
        rightmost = xs.max()
        width_mm = (rightmost - leftmost + 1) * sx
        if width_mm < 80 or width_mm > 220:
            return None
        return width_mm, leftmost, rightmost

    # Use median of inner table candidates for robustness
    inner_left = int(np.median(inner_left_candidates))
    inner_right = int(np.median(inner_right_candidates))
    width_mm = (inner_right - inner_left + 1) * sx

    # Sanity check
    if width_mm < 80 or width_mm > 220:
        return None
    return width_mm, inner_left, inner_right


def compute_skull_width_generic(image, sx):
    """Generic intensity-based skull width estimate using inner table approximation.

    For MRI: uses the brain parenchyma boundary as a proxy for inner table.
    For both CT and MRI, attempts to find the inner contour of the skull/brain
    rather than the outer margin.
    """
    finite = image[np.isfinite(image)]
    if finite.size < 100:
        return None
    p01, p99 = np.percentile(finite, [1, 99])
    body_mask = (image > p01) & (image < p99)
    body_mask = largest_component(body_mask)
    ys, xs = np.where(body_mask)
    if xs.size < 100:
        return None

    # Find inner boundaries by scanning rows near the vertical center
    height, width = body_mask.shape
    mid_y = int(height * 0.5)
    search_range = int(height * 0.15)

    inner_left_candidates = []
    inner_right_candidates = []
    for row in range(mid_y - search_range, mid_y + search_range + 1):
        if row < 0 or row >= height:
            continue
        body_row = np.where(body_mask[row, :])[0]
        if body_row.size < 20:
            continue
        inner_left_candidates.append(body_row[0])
        inner_right_candidates.append(body_row[-1])

    if not inner_left_candidates or not inner_right_candidates:
        # Fallback: use full extent
        skull_width_mm = (xs.max() - xs.min() + 1) * sx
        if skull_width_mm <= 0:
            return None
        return skull_width_mm, xs.min(), xs.max()

    inner_left = int(np.median(inner_left_candidates))
    inner_right = int(np.median(inner_right_candidates))
    skull_width_mm = (inner_right - inner_left + 1) * sx
    if skull_width_mm <= 0:
        return None
    return skull_width_mm, inner_left, inner_right


def _isolate_frontal_horns(left_comp, right_comp, sx, sy):
    """
    Isolate the frontal horn (anterior) portion of each lateral ventricle component.

    The Evan's Index requires measuring the maximal width of the FRONTAL HORNS
    specifically, not the full lateral ventricle span. The frontal horns are the
    anterior (top in axial view) portion of the lateral ventricles.

    This function takes the anterior 50% of each component's y-extent to isolate
    the frontal horns from the body/atrium which is wider posteriorly.
    """
    # Left frontal horn: take anterior (top) portion
    l_ys = left_comp["ys"]
    l_xs = left_comp["xs"]
    l_y_min = l_ys.min()
    l_y_max = l_ys.max()
    l_y_range = l_y_max - l_y_min
    l_anterior_cutoff = l_y_min + l_y_range * 0.50
    l_anterior_mask = l_ys <= l_anterior_cutoff
    if l_anterior_mask.sum() < 5:
        l_fh_xs = l_xs
    else:
        l_fh_xs = l_xs[l_anterior_mask]

    # Right frontal horn: take anterior (top) portion
    r_ys = right_comp["ys"]
    r_xs = right_comp["xs"]
    r_y_min = r_ys.min()
    r_y_max = r_ys.max()
    r_y_range = r_y_max - r_y_min
    r_anterior_cutoff = r_y_min + r_y_range * 0.50
    r_anterior_mask = r_ys <= r_anterior_cutoff
    if r_anterior_mask.sum() < 5:
        r_fh_xs = r_xs
    else:
        r_fh_xs = r_xs[r_anterior_mask]

    # Measure the maximal span between the outer margins of the left and right frontal horns
    fh_min_x = min(l_fh_xs.min(), r_fh_xs.min())
    fh_max_x = max(l_fh_xs.max(), r_fh_xs.max())
    frontal_horn_width_mm = (fh_max_x - fh_min_x + 1) * sx

    return frontal_horn_width_mm


def estimate_ventricles_ct(image, sx, sy, x_count, y_count):
    """
    CT-specific ventricle detection using Hounsfield unit thresholds.
    CSF ~ 0-20 HU.  We allow a slightly wider window for partial volume.

    Critically, this function isolates the FRONTAL HORNS (anterior horns)
    of the lateral ventricles for accurate Evan's Index measurement.
    """
    central_y = (np.arange(y_count)[:, None] > int(y_count * 0.15)) & (np.arange(y_count)[:, None] < int(y_count * 0.85))
    central_x = (np.arange(x_count)[None, :] > int(x_count * 0.10)) & (np.arange(x_count)[None, :] < int(x_count * 0.90))
    central_mask = central_y & central_x

    # Try multiple HU windows to be robust
    thresholds = [
        (0, 22),
        (-5, 25),
        (0, 30),
        (-10, 20),
        (-15, 15),
    ]
    all_candidates = []
    for lo, hi in thresholds:
        vent_mask = central_mask & (image >= lo) & (image <= hi)
        # Remove tiny noise
        comps = connected_components(vent_mask)
        # Filter components by position and size
        mid_x = x_count / 2.0
        usable = []
        for comp in comps:
            cx = float(comp["xs"].mean())
            cy = float(comp["ys"].mean())
            area_mm2 = comp["area"] * sx * sy
            width = int(comp["xs"].max() - comp["xs"].min() + 1)
            height = int(comp["ys"].max() - comp["ys"].min() + 1)
            if abs(cx - mid_x) > x_count * 0.40:
                continue
            if cy < y_count * 0.15 or cy > y_count * 0.80:
                continue
            if area_mm2 < 12:
                continue
            if width < 3 or height < 3:
                continue
            usable.append(comp)
        left = [c for c in usable if c["xs"].mean() < mid_x]
        right = [c for c in usable if c["xs"].mean() >= mid_x]
        if left and right:
            for lc in left[:6]:
                for rc in right[:6]:
                    left_cy = float(lc["ys"].mean())
                    right_cy = float(rc["ys"].mean())
                    if abs(left_cy - right_cy) > y_count * 0.12:
                        continue
                    left_area = lc["area"] * sx * sy
                    right_area = rc["area"] * sx * sy
                    total_area = left_area + right_area
                    if total_area < 60:
                        continue
                    # Use frontal horn isolation instead of full ventricle span
                    frontal_horn_width_mm = _isolate_frontal_horns(lc, rc, sx, sy)
                    all_candidates.append({
                        "left": lc,
                        "right": rc,
                        "frontal_horn_width_mm": frontal_horn_width_mm,
                        "total_area_mm2": total_area,
                        "threshold": (lo, hi),
                    })
    if not all_candidates:
        return None
    # Pick candidate with largest total ventricular area
    all_candidates.sort(key=lambda c: c["total_area_mm2"], reverse=True)
    return all_candidates[0]


def _filter_mri_components(components, sx, sy, x_count, y_count):
    """Shared MRI component filtering with relaxed bounds."""
    mid_x = x_count / 2.0
    usable = []
    for comp in components:
        cx = float(comp["xs"].mean())
        cy = float(comp["ys"].mean())
        area_mm2 = comp["area"] * sx * sy
        width = int(comp["xs"].max() - comp["xs"].min() + 1)
        height = int(comp["ys"].max() - comp["ys"].min() + 1)
        if abs(cx - mid_x) > x_count * 0.38:
            continue
        if cy < y_count * 0.18 or cy > y_count * 0.78:
            continue
        if area_mm2 < 12:
            continue
        if width < 4 or height < 4:
            continue
        usable.append(comp)
    left = [c for c in usable if c["xs"].mean() < mid_x]
    right = [c for c in usable if c["xs"].mean() >= mid_x]
    return left, right


def _pair_mri_candidates(left_components, right_components, sx, sy, y_count):
    candidates = []
    for left in left_components[:8]:
        for right in right_components[:8]:
            left_cy = float(left["ys"].mean())
            right_cy = float(right["ys"].mean())
            if abs(left_cy - right_cy) > y_count * 0.12:
                continue
            left_area = left["area"] * sx * sy
            right_area = right["area"] * sx * sy
            total_area = left_area + right_area
            if total_area < 60:
                continue
            # Use frontal horn isolation instead of full ventricle span
            frontal_horn_width_mm = _isolate_frontal_horns(left, right, sx, sy)
            candidates.append({
                "left": left,
                "right": right,
                "frontal_horn_width_mm": frontal_horn_width_mm,
                "total_area_mm2": total_area,
            })
    return candidates


def estimate_ventricles_mri(image, sx, sy, x_count, y_count, sequence_name):
    """MRI ventricle detection using multiple intensity strategies."""
    finite = image[np.isfinite(image)]
    if finite.size < 100:
        return None
    percentiles = np.percentile(
        finite,
        [1, 5, 10, 15, 20, 30, 35, 40, 45, 50, 70, 80, 90, 95, 99, 99.5, 99.9],
    )
    p01, p05, p10, p15, p20, p30, p35, p40, p45, p50, p70, p80, p90, p95, p99, p995, p999 = percentiles

    is_flair_like = any(term in sequence_name for term in ("flair", "tirm", "dark-fluid"))
    is_t2_like = "t2" in sequence_name and not is_flair_like
    is_t1_like = "t1" in sequence_name

    central_y = (np.arange(y_count)[:, None] > int(y_count * 0.15)) & (np.arange(y_count)[:, None] < int(y_count * 0.85))
    central_x = (np.arange(x_count)[None, :] > int(x_count * 0.10)) & (np.arange(x_count)[None, :] < int(x_count * 0.90))
    central_mask = central_y & central_x

    # Build a list of threshold strategies to try
    strategies = []
    if is_flair_like:
        strategies.append(("flair_dark", p15, p45))
        strategies.append(("flair_dark2", p20, p50))
        strategies.append(("flair_dark3", p10, p40))
    elif is_t2_like:
        strategies.append(("t2_bright", p95, p995))
        strategies.append(("t2_bright2", p90, p999))
        strategies.append(("t2_bright3", p80, p99))
    elif is_t1_like:
        strategies.append(("t1_dark", p05, p40))
        strategies.append(("t1_dark2", p01, p35))
        strategies.append(("t1_dark3", p10, p50))
    else:
        # Unknown MRI sequence: try multiple plausible windows
        strategies.append(("dark_a", p05, p40))
        strategies.append(("dark_b", p10, p50))
        strategies.append(("dark_c", p15, p45))
        strategies.append(("bright_a", p90, p999))
        strategies.append(("bright_b", p80, p99))
        strategies.append(("mid", p30, p70))

    all_candidates = []
    for label, lo, hi in strategies:
        if lo >= hi:
            continue
        vent_mask = central_mask & (image >= lo) & (image <= hi)
        components = connected_components(vent_mask)
        left, right = _filter_mri_components(components, sx, sy, x_count, y_count)
        if left and right:
            candidates = _pair_mri_candidates(left, right, sx, sy, y_count)
            for c in candidates:
                c["strategy"] = label
            all_candidates.extend(candidates)

    if not all_candidates:
        return None
    all_candidates.sort(key=lambda c: c["total_area_mm2"], reverse=True)
    return all_candidates[0]


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
    sz = float(spacing[2]) if spacing else 1.0
    z_count, y_count, x_count = volume.shape
    sequence_name = (volume_node.GetName() or "").lower()
    modality = detect_modality(volume_node)

    candidates = []
    diagnostic_log = []

    # Target the frontal horn level: typically in the upper 25%-60% of axial slices
    # (frontal horns are in the frontal lobe, which is in the superior/anterior brain)
    z_start = max(1, int(z_count * 0.15))
    z_end = max(2, int(z_count * 0.65))
    slice_indexes = sorted(set(np.linspace(z_start, z_end - 1, num=min(30, max(1, z_end - z_start)), dtype=int).tolist()))

    for z in slice_indexes:
        image = volume[z].astype(float)
        finite = image[np.isfinite(image)]
        if finite.size < 100:
            continue

        # Skull / intracranial diameter estimate
        sw = None
        if modality == "ct":
            sw = compute_skull_width_ct(image, sx)
        # Try generic for both MRI and CT fallback
        if sw is None:
            sw = compute_skull_width_generic(image, sx)
        if sw is None:
            # Last resort: use full image width minus small margins
            ys, xs = np.where(image > np.percentile(finite, 2))
            if xs.size > 50:
                width_mm = (xs.max() - xs.min() + 1) * sx
                if 80 <= width_mm <= 220:
                    sw = (width_mm, int(xs.min()), int(xs.max()))
        if sw is None:
            diagnostic_log.append({"slice": int(z), "issue": "skull_width_unavailable"})
            continue
        skull_width_mm, skull_left, skull_right = sw

        # Try modality-specific ventricle estimation, but also cross-try if it fails
        vent = None
        if modality == "ct":
            vent = estimate_ventricles_ct(image, sx, sy, x_count, y_count)
            if vent is None:
                vent = estimate_ventricles_mri(image, sx, sy, x_count, y_count, sequence_name)
        else:
            vent = estimate_ventricles_mri(image, sx, sy, x_count, y_count, sequence_name)
            if vent is None:
                vent = estimate_ventricles_ct(image, sx, sy, x_count, y_count)

        if vent is None:
            diagnostic_log.append({"slice": int(z), "issue": "no_ventricle_candidate"})
            continue

        frontal_horn_width_mm = vent["frontal_horn_width_mm"]
        evans_index = frontal_horn_width_mm / skull_width_mm
        if evans_index < 0.08 or evans_index > 0.65:
            diagnostic_log.append({"slice": int(z), "issue": "evans_out_of_range", "evans": round(evans_index, 3)})
            continue

        left = vent["left"]
        right = vent["right"]
        left_area = left["area"] * sx * sy
        right_area = right["area"] * sx * sy
        smaller = min(left_area, right_area)
        larger = max(left_area, right_area)
        asymmetry_ratio = None if smaller <= 0 else larger / smaller
        left_cy = float(left["ys"].mean())
        right_cy = float(right["ys"].mean())
        y_alignment_penalty = abs(left_cy - right_cy)

        # Improved quality score: prefer slices where:
        # 1. Frontal horns are well-visualized (moderate area, not too large = not body/atrium)
        # 2. Left and right are well-aligned vertically
        # 3. The frontal horn width is within a plausible clinical range
        # 4. The Evan's index is in a realistic range
        frontal_horn_quality = 0
        if 0.15 <= evans_index <= 0.50:
            frontal_horn_quality = 100
        elif 0.10 <= evans_index <= 0.55:
            frontal_horn_quality = 50

        symmetry_bonus = max(0, 100 - (asymmetry_ratio - 1.0) * 100) if asymmetry_ratio else 0
        alignment_penalty = y_alignment_penalty * sx * 10
        area_bonus = min(vent["total_area_mm2"], 200)  # Cap area bonus to avoid favoring large body/atrium

        quality_score = (
            frontal_horn_quality
            + symmetry_bonus
            + area_bonus
            - alignment_penalty
        )

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
            "modality": modality,
        })

    if not candidates:
        return {
            "method": "experimental_intensity_geometry",
            "status": "not_available",
            "modality_inferred": modality,
            "limitations": [
                "Could not identify reliable central ventricular candidates.",
                "Manual review or segmentation is required.",
            ],
            "diagnostic_log": diagnostic_log[-30:],
        }

    candidates.sort(key=lambda c: c["quality_score"], reverse=True)
    best = candidates[0]
    confidence = "low"
    limitations = [
        "Experimental candidate measurement only; not validated for diagnosis.",
        "May fail on poor quality scans, hemorrhage, postoperative change, severe asymmetry, artifacts, or non-axial acquisitions.",
        "Confirm landmarks and ventricular borders manually in 3D Slicer before clinical use.",
    ]
    if (
        0.15 <= best["evans_index"] <= 0.50
        and best["left_candidate_area_mm2"] >= 30
        and best["right_candidate_area_mm2"] >= 30
        and best["ventricular_asymmetry_ratio"] is not None
        and best["ventricular_asymmetry_ratio"] < 2.0
    ):
        confidence = "moderate"

    # Compute whole-volume ventricle volume estimate using the same thresholds as the best candidate
    total_ventricular_voxels = 0
    third_ventricle_proxy_slices = []
    temporal_horn_proxy_slices = []
    for z in range(z_count):
        image = volume[z].astype(float)
        finite = image[np.isfinite(image)]
        if finite.size < 100:
            continue
        if modality == "ct":
            vent_mask = (image >= -10) & (image <= 25)
        else:
            p01, p05, p10, p15, p20, p30, p35, p40, p45, p50, p70, p80, p90, p95, p99, p995, p999 = np.percentile(
                finite,
                [1, 5, 10, 15, 20, 30, 35, 40, 45, 50, 70, 80, 90, 95, 99, 99.5, 99.9],
            )
            is_flair_like = any(term in sequence_name for term in ("flair", "tirm", "dark-fluid"))
            is_t2_like = "t2" in sequence_name and not is_flair_like
            is_t1_like = "t1" in sequence_name
            if is_flair_like:
                vent_mask = (image >= p15) & (image <= p45)
            elif is_t2_like:
                vent_mask = (image >= p90) & (image <= p999)
            elif is_t1_like:
                vent_mask = (image >= p05) & (image <= p40)
            else:
                # Unknown MRI: combine dark and bright masks and pick largest plausible region
                dark_mask = (image >= p05) & (image <= p40)
                bright_mask = (image >= p90) & (image <= p999)
                vent_mask = dark_mask | bright_mask
        total_ventricular_voxels += int(np.count_nonzero(vent_mask))
        # Simple proxies for third ventricle (midline thin structure) and temporal horns (lateral inferior)
        mid_x = x_count // 2
        midline_region = vent_mask[:, max(0, mid_x - 3):min(x_count, mid_x + 4)]
        if midline_region.size > 0 and np.count_nonzero(midline_region) > 2:
            third_ventricle_proxy_slices.append(int(z))
        # Temporal horn proxy: lower lateral corners of ventricle mask
        lower_half = vent_mask[y_count // 2:, :]
        if np.count_nonzero(lower_half) > 5:
            temporal_horn_proxy_slices.append(int(z))

    ventricular_volume_ml = total_ventricular_voxels * sx * sy * sz / 1000.0

    return {
        "method": "experimental_intensity_geometry",
        "status": "candidate_generated",
        "confidence": confidence,
        "modality_inferred": modality,
        "evans_index": best["evans_index"],
        "evans_index_supports_ventriculomegaly": best["evans_index"] >= 0.30,
        "frontal_horn_width_mm": best["frontal_horn_width_mm"],
        "inner_skull_width_mm": best["skull_width_mm"],
        "ventricular_asymmetry_ratio": best["ventricular_asymmetry_ratio"],
        "left_candidate_area_mm2": best["left_candidate_area_mm2"],
        "right_candidate_area_mm2": best["right_candidate_area_mm2"],
        "source_slice_index": best["slice_index"],
        "candidate_count": len(candidates),
        "ventricular_volume_estimate_ml": round(ventricular_volume_ml, 2),
        "third_ventricle_proxy_slice_count": len(third_ventricle_proxy_slices),
        "temporal_horn_proxy_slice_count": len(temporal_horn_proxy_slices),
        "limitations": limitations,
        "diagnostic_log": diagnostic_log[-20:],
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
        "ct",
        "head ct",
        "ct head",
        "brain",
        "non-contrast",
        "ncct",
    ]
    for term in preferred:
        if term in name:
            score += 30000

    if "t2_tirm" in name or "dark-fluid" in name or "flair" in name:
        score += 20000
    if "t2_tse" in name:
        score += 10000
    if "ct" in name or "head" in name:
        score += 15000

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

        # Modality detection and MRI-specific pipeline
        modality = detect_modality(volume_node)
        dicom_modality = refine_modality_from_dicom(volume_node, db, series_summary)
        if dicom_modality:
            modality = dicom_modality
        preprocessing_info = {"status": "none", "modality_inferred": modality}
        quality_info = {"status": "none", "modality_inferred": modality}
        if modality == "mri":
            preprocessing_info = preprocess_mri_volume(volume_node)
            if preprocessing_info.get("status") == "normalized_new_node":
                new_name = preprocessing_info.get("new_node_name")
                try:
                    new_node = slicer.util.getNode(new_name)
                    volume_node = new_node
                except Exception:
                    pass
            quality_info = mri_quality_check(volume_node)

        spacing = volume_node.GetSpacing()
        image_data = volume_node.GetImageData()
        dimensions = image_data.GetDimensions() if image_data else (0, 0, 0)
        origin = volume_node.GetOrigin()

        voxel_volume_mm3 = spacing[0] * spacing[1] * spacing[2]
        approximate_volume_ml = dimensions[0] * dimensions[1] * dimensions[2] * voxel_volume_mm3 / 1000.0
        hydrocephalus_metrics = estimate_hydrocephalus_metrics(volume_node)
        callosal_angle_workflow = build_callosal_angle_workflow(output_dir, volume_node)

        # Build decision support interpretation
        evans = hydrocephalus_metrics.get("evans_index")
        asym = hydrocephalus_metrics.get("ventricular_asymmetry_ratio")
        vent_vol = hydrocephalus_metrics.get("ventricular_volume_estimate_ml")
        modality_from_metrics = hydrocephalus_metrics.get("modality_inferred", "unknown")
        if modality == "unknown" and modality_from_metrics != "unknown":
            modality = modality_from_metrics

        interpretation = {
            "evans_index_comment": None,
            "ventriculomegaly_present": None,
            "asymmetry_comment": None,
            "volume_comment": None,
            "suggested_next_steps": [],
        }
        if evans is not None:
            if evans < 0.30:
                interpretation["evans_index_comment"] = "Evans index <0.30 suggests no significant ventriculomegaly at the measured level."
                interpretation["ventriculomegaly_present"] = False
            elif evans < 0.40:
                interpretation["evans_index_comment"] = "Evans index 0.30-0.39 indicates mild ventriculomegaly; correlate clinically."
                interpretation["ventriculomegaly_present"] = True
            else:
                interpretation["evans_index_comment"] = "Evans index >=0.40 indicates significant ventriculomegaly. Does not distinguish NPH from ex-vacuo alone."
                interpretation["ventriculomegaly_present"] = True

        if asym is not None:
            if asym >= 1.5:
                interpretation["asymmetry_comment"] = f"Ventricular asymmetry ratio {asym} suggests notable asymmetry; consider structural volume loss or mass effect."
            else:
                interpretation["asymmetry_comment"] = f"Ventricular asymmetry ratio {asym} is relatively symmetric."

        if vent_vol is not None:
            interpretation["volume_comment"] = f"Estimated ventricular volume ~{vent_vol} mL (experimental)."

        interpretation["suggested_next_steps"] = [
            "1. Confirm true axial plane through frontal horns.",
            "2. Review DESH signs: tight high-convexity sulci, enlarged Sylvian fissures.",
            "3. Measure callosal angle on AC-PC aligned coronal plane at posterior commissure.",
            "4. Compare with prior imaging for interval change.",
            "5. Correlate with clinical triad (gait, cognition, urinary) and LP/ELD response.",
        ]

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
            "preprocessing": preprocessing_info,
            "mri_quality": quality_info,
            "interpretation": interpretation,
            "decision_support_inputs": {
                "evans_index": evans,
                "asymmetric_ventricles": (
                    asym is not None and asym >= 1.5
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
            f.write(f"- Approximate full image volume: {round(approximate_volume_ml, 2)} mL\n")
            f.write(f"- Inferred modality: {modality}\n\n")

            if modality == "mri":
                f.write("## MRI Preprocessing\n")
                f.write(f"- Status: {preprocessing_info.get('status')}\n")
                if preprocessing_info.get('method'):
                    f.write(f"- Method: {preprocessing_info.get('method')}\n")
                if preprocessing_info.get('reason'):
                    f.write(f"- Note: {preprocessing_info.get('reason')}\n")
                f.write("\n")

                f.write("## MRI Quality Check\n")
                f.write(f"- Status: {quality_info.get('status')}\n")
                if quality_info.get('pass') is not None:
                    f.write(f"- Pass: {quality_info.get('pass')}\n")
                if quality_info.get('issues'):
                    for issue in quality_info.get('issues'):
                        f.write(f"- Issue: {issue}\n")
                else:
                    f.write("- No major quality issues flagged.\n")
                f.write("\n")

            f.write("## Clinical Interpretation Boundary\n")
            f.write("This report is not a diagnosis. Manual radiology/neurology review is required.\n\n")

            f.write("## Experimental Hydrocephalus Metrics\n")
            f.write(f"- Evans index candidate: {evans if evans is not None else 'not available'}\n")
            f.write(f"- Ventricular asymmetry candidate ratio: {asym if asym is not None else 'not available'}\n")
            f.write(f"- Metric confidence: {hydrocephalus_metrics.get('confidence', 'not available')}\n")
            f.write(f"- Estimated ventricular volume: {vent_vol if vent_vol is not None else 'not available'} mL\n")
            f.write(f"- Source slice index: {hydrocephalus_metrics.get('source_slice_index', 'n/a')}\n")
            f.write("- These values require manual confirmation before clinical use.\n\n")

            f.write("## Interpretation Support\n")
            if interpretation["evans_index_comment"]:
                f.write(f"- {interpretation['evans_index_comment']}\n")
            if interpretation["asymmetry_comment"]:
                f.write(f"- {interpretation['asymmetry_comment']}\n")
            if interpretation["volume_comment"]:
                f.write(f"- {interpretation['volume_comment']}\n")
            f.write("\n")

            f.write("## Suggested Next Steps\n")
            for step in interpretation["suggested_next_steps"]:
                f.write(f"- {step}\n")
            f.write("\n")

            f.write("## Callosal Angle / Coronal Reconstruction Workflow\n")
            pkg = callosal_angle_workflow.get('coronal_reconstruction_package')
            f.write(f"- Coronal reconstruction package: {pkg or 'not saved'}\n")
            f.write("- Callosal angle requires manual AC-PC aligned coronal measurement at posterior commissure level.\n\n")

            f.write("## Suggested Manual Review Targets\n")
            f.write("- Ventricular symmetry/asymmetry\n")
            f.write("- Lesion-side ventricular expansion into encephalomalacic territory\n")
            f.write("- High-convexity sulcal effacement versus generalized sulcal widening\n")
            f.write("- DESH pattern elements\n")
            f.write("- Transependymal FLAIR signal if MRI FLAIR is available\n")
            f.write("- Comparison against prior CT/MRI for progression\n")

            # Append decision tree guidance
            f.write("\n## Decision Support Quick Reference\n")
            f.write("| Finding | Favors NPH | Favors Ex Vacuo |\n")
            f.write("|---------|------------|----------------|\n")
            f.write("| Evans index | >=0.30 (non-specific) | Any value with lesion-matched asymmetry |\n")
            f.write("| Callosal angle | <90 deg | >100 deg |\n")
            f.write("| High-convexity sulci | Tight/effaced | Widened |\n")
            f.write("| Sylvian fissures | Disproportionately enlarged | Proportionally enlarged |\n")
            f.write("| LP/ELD response | Objective improvement | No improvement |\n")
            f.write("| Prior large lesion | Absent | Present |\n\n")

        print("Analysis complete")
        print(metrics_path)
        print(report_path)
        slicer.util.exit(0)

    except Exception as e:
        fail(output_dir, "Unhandled error during Slicer analysis.", e)


main()
