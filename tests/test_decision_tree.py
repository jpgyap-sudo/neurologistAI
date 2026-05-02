import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from clinical.hydrocephalus.decision_tree import VentriculomegalyEvidence, score_ventriculomegaly


def test_ex_vacuo_pattern():
    e = VentriculomegalyEvidence(
        asymmetric_ventricles=True,
        enlargement_adjacent_to_lesion=True,
        widened_sulci=True,
        positive_tap_test=False,
        lp_trials=2,
        lp_removed_ml=40,
        objective_improvement_after_lp=False,
    )
    result = score_ventriculomegaly(e)
    assert result["pattern"] == "more_consistent_with_ex_vacuo"
    assert result["shunt_decision"]["category"] == "favors_ex_vacuo_shunt_benefit_expected_low"


def test_nph_pattern():
    e = VentriculomegalyEvidence(
        tight_high_convexity_sulci=True,
        desh_pattern=True,
        positive_tap_test=True,
        evans_index=0.34,
        callosal_angle_degrees=72,
    )
    result = score_ventriculomegaly(e)
    assert result["pattern"] == "more_consistent_with_nph_or_communicating_hydrocephalus"
    assert result["shunt_decision"]["category"] == "strongly_favors_shunt_responsive_hydrocephalus"


def test_evans_index_alone_does_not_decide():
    e = VentriculomegalyEvidence(evans_index=0.34)
    result = score_ventriculomegaly(e)
    assert result["pattern"] == "mixed_or_indeterminate"
    assert any("Evans index >=0.30" in note for note in result["notes"])


def test_evans_index_with_nph_pattern():
    e = VentriculomegalyEvidence(
        evans_index=0.42,
        callosal_angle_degrees=65,
        desh_pattern=True,
        tight_high_convexity_sulci=True,
    )
    result = score_ventriculomegaly(e)
    assert result["pattern"] == "more_consistent_with_nph_or_communicating_hydrocephalus"
    assert "Evans index >=0.30" in result["shunt_decision"]["supporting_shunt_factors"]
