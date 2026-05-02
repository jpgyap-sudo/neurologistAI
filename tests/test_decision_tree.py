import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from clinical.hydrocephalus.decision_tree import VentriculomegalyEvidence, score_ventriculomegaly


def test_ex_vacuo_pattern():
    e = VentriculomegalyEvidence(
        asymmetric_ventricles=True,
        enlargement_adjacent_to_lesion=True,
        widened_sulci=True,
        positive_tap_test=False,
    )
    result = score_ventriculomegaly(e)
    assert result["pattern"] == "more_consistent_with_ex_vacuo"


def test_nph_pattern():
    e = VentriculomegalyEvidence(
        tight_high_convexity_sulci=True,
        desh_pattern=True,
        positive_tap_test=True,
    )
    result = score_ventriculomegaly(e)
    assert result["pattern"] == "more_consistent_with_nph_or_communicating_hydrocephalus"
