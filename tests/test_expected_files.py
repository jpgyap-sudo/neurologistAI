from pathlib import Path


def test_required_files_exist():
    root = Path(__file__).resolve().parents[1]
    required = [
        "README.md",
        "scripts/analyze_slicer.py",
        "scripts/run_analysis.bat",
        "service/server.py",
        "skills/callosal_angle_reconstruction.md",
        "clinical/hydrocephalus/lumbar_puncture_response.md",
        "clinical/hydrocephalus/shunt_decision_matrix.md",
        "data/dad/lumbar_puncture_log.json",
    ]
    for rel in required:
        assert (root / rel).exists(), rel
