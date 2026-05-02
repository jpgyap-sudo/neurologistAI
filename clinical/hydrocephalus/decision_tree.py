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
    lp_trials: Optional[int] = None
    lp_removed_ml: Optional[float] = None
    objective_improvement_after_lp: Optional[bool] = None
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
    if e.objective_improvement_after_lp is True:
        nph += 4
        notes.append("Objective improvement after LP supports shunt-responsive physiology.")
    if e.objective_improvement_after_lp is False and (e.lp_trials or 0) >= 2 and (e.lp_removed_ml or 0) >= 30:
        ex_vacuo += 3
        notes.append("No objective improvement after repeated large-volume LP lowers expected shunt benefit.")

    if e.callosal_angle_degrees is not None:
        if e.callosal_angle_degrees < 90:
            nph += 2
            notes.append("Narrow callosal angle can support NPH when measured correctly.")
        elif e.callosal_angle_degrees > 100:
            ex_vacuo += 1
            notes.append("Wider callosal angle is less supportive of classic NPH.")

    if e.evans_index is not None and e.evans_index >= 0.30:
        nph += 1
        notes.append("Evans index >=0.30 confirms ventriculomegaly but does not distinguish NPH from ex-vacuo alone.")

    if ex_vacuo >= nph + 3:
        pattern = "more_consistent_with_ex_vacuo"
    elif nph >= ex_vacuo + 3:
        pattern = "more_consistent_with_nph_or_communicating_hydrocephalus"
    else:
        pattern = "mixed_or_indeterminate"

    shunt_decision = build_shunt_decision(pattern, ex_vacuo, nph, e)

    return {
        "input": asdict(e),
        "scores": {"ex_vacuo": ex_vacuo, "nph": nph},
        "pattern": pattern,
        "shunt_decision": shunt_decision,
        "notes": notes,
        "safety_note": "Decision support only. Requires clinician/radiologist review.",
    }


def build_shunt_decision(pattern: str, ex_vacuo_score: int, nph_score: int, e: VentriculomegalyEvidence) -> Dict[str, Any]:
    risk_flags = []
    if e.enlargement_adjacent_to_lesion:
        risk_flags.append("ventricular enlargement adjacent to structural lesion")
    if e.asymmetric_ventricles:
        risk_flags.append("marked ventricular asymmetry")
    if e.objective_improvement_after_lp is False and (e.lp_trials or 0) >= 2:
        risk_flags.append("negative large-volume LP response on repeated trials")

    support_flags = []
    if e.desh_pattern:
        support_flags.append("DESH pattern")
    if e.tight_high_convexity_sulci:
        support_flags.append("tight high-convexity sulci")
    if e.transependymal_edema:
        support_flags.append("transependymal edema")
    if e.objective_improvement_after_lp or e.positive_tap_test:
        support_flags.append("objective improvement after CSF drainage")
    if e.callosal_angle_degrees is not None and e.callosal_angle_degrees < 90:
        support_flags.append("callosal angle <90 degrees")
    if e.evans_index is not None and e.evans_index >= 0.30:
        support_flags.append("Evans index >=0.30")

    if pattern == "more_consistent_with_nph_or_communicating_hydrocephalus" and not risk_flags:
        category = "strongly_favors_shunt_responsive_hydrocephalus"
    elif pattern == "more_consistent_with_ex_vacuo" or ex_vacuo_score >= nph_score + 3:
        category = "favors_ex_vacuo_shunt_benefit_expected_low"
    elif support_flags or risk_flags:
        category = "mixed_or_uncertain"
    else:
        category = "unsafe_to_conclude_needs_clinician_review"

    return {
        "category": category,
        "supporting_shunt_factors": support_flags,
        "factors_against_or_risk_flags": risk_flags,
        "score_margin": nph_score - ex_vacuo_score,
        "doctor_facing_summary": (
            "Use this as a transparent evidence organizer only. Shunt candidacy requires neurosurgery, "
            "radiology review, clinical trajectory, goals of care, and complication-risk assessment."
        ),
    }
