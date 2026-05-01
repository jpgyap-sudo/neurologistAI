"""
Simple transparent decision-support scoring for ventriculomegaly pattern.
This is not a diagnostic model. It only organizes evidence.
"""

from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any


@dataclass
class VentriculomegalyEvidence:
    asymmetric_ventricles: Optional[bool] = None
    enlargement_adjacent_to_lesion: Optional[bool] = None
    widened_sulci: Optional[bool] = None
    tight_high_convexity_sulci: Optional[bool] = None
    desh_pattern: Optional[bool] = None
    transependymal_edema: Optional[bool] = None
    progressive_on_serial_imaging: Optional[bool] = None
    positive_tap_test: Optional[bool] = None
    evans_index: Optional[float] = None
    callosal_angle_degrees: Optional[float] = None


def score_ventriculomegaly(e: VentriculomegalyEvidence) -> Dict[str, Any]:
    ex_vacuo = 0
    nph = 0
    notes = []

    if e.asymmetric_ventricles:
        ex_vacuo += 2
        notes.append("Asymmetric ventricular enlargement favors structural volume-loss pattern.")
    if e.enlargement_adjacent_to_lesion:
        ex_vacuo += 3
        notes.append("Ventricular expansion adjacent to lesion strongly favors ex-vacuo morphology.")
    if e.widened_sulci:
        ex_vacuo += 2
        notes.append("Widened sulci support atrophy/volume loss.")
    if e.tight_high_convexity_sulci:
        nph += 3
        notes.append("Tight high-convexity sulci support NPH/DESH morphology.")
    if e.desh_pattern:
        nph += 3
        notes.append("DESH pattern supports NPH morphology.")
    if e.transependymal_edema:
        nph += 2
        notes.append("Transependymal edema supports pressure/CSF-flow related hydrocephalus.")
    if e.progressive_on_serial_imaging:
        nph += 2
        notes.append("Progression on serial imaging raises concern for active hydrocephalus.")
    if e.positive_tap_test:
        nph += 4
        notes.append("Objective improvement after CSF drainage supports shunt-responsive physiology.")

    if e.callosal_angle_degrees is not None:
        if e.callosal_angle_degrees < 90:
            nph += 2
            notes.append("Narrow callosal angle can support NPH when measured correctly.")
        elif e.callosal_angle_degrees > 100:
            ex_vacuo += 1
            notes.append("Wider callosal angle is less supportive of classic NPH.")

    if e.evans_index is not None and e.evans_index >= 0.30:
        notes.append("Evans index >=0.30 confirms ventriculomegaly but does not distinguish NPH from ex-vacuo alone.")

    if ex_vacuo >= nph + 3:
        pattern = "more_consistent_with_ex_vacuo"
    elif nph >= ex_vacuo + 3:
        pattern = "more_consistent_with_nph_or_communicating_hydrocephalus"
    else:
        pattern = "mixed_or_indeterminate"

    return {
        "input": asdict(e),
        "scores": {"ex_vacuo": ex_vacuo, "nph": nph},
        "pattern": pattern,
        "notes": notes,
        "safety_note": "Decision support only. Requires clinician/radiologist review.",
    }
