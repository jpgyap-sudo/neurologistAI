from pathlib import Path
import subprocess
import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="SuperRoo Medical Local Slicer Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

REPO_ROOT = Path(__file__).resolve().parents[1]
RUN_BAT = REPO_ROOT / "scripts" / "run_analysis.bat"


class AnalyzeRequest(BaseModel):
    input_dir: str = Field(..., description="Absolute or repo-relative DICOM folder path")
    output_dir: str = Field(..., description="Absolute or repo-relative output folder path")


def resolve_path(p: str) -> Path:
    path = Path(p)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


@app.get("/health")
def health():
    return {"status": "ok", "repo_root": str(REPO_ROOT), "run_bat_exists": RUN_BAT.exists()}


@app.post("/analyze-dicom")
def analyze_dicom(req: AnalyzeRequest):
    input_dir = resolve_path(req.input_dir)
    output_dir = resolve_path(req.output_dir)

    if not input_dir.exists():
        raise HTTPException(status_code=400, detail=f"Input directory does not exist: {input_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)

    if not RUN_BAT.exists():
        raise HTTPException(status_code=500, detail=f"Missing runner: {RUN_BAT}")

    result = subprocess.run(
        [str(RUN_BAT), str(input_dir), str(output_dir)],
        capture_output=True,
        text=True,
        shell=True,
        cwd=str(REPO_ROOT),
    )

    metrics_path = output_dir / "metrics.json"
    report_path = output_dir / "report.md"

    metrics = None
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    return {
        "process_returncode": result.returncode,
        "status": "done" if result.returncode == 0 and metrics_path.exists() else "failed",
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        "metrics_path": str(metrics_path),
        "report_path": str(report_path),
        "metrics": metrics,
    }
