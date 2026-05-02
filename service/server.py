from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
from dotenv import load_dotenv
import subprocess
import os
import uuid
import json

load_dotenv()

app = FastAPI(title="Local Slicer Service")

# Preserve CORS env pattern from current version with upgrade defaults
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://neurologist-ai.vercel.app").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPO_ROOT = Path(__file__).resolve().parents[1]
RUN_BAT = REPO_ROOT / "scripts" / "run_analysis.bat"


class AnalyzeRequest(BaseModel):
    dicom_dir: str


class LegacyAnalyzeRequest(BaseModel):
    input_dir: str = Field(..., description="Absolute or repo-relative DICOM folder path")
    output_dir: str = Field(..., description="Absolute or repo-relative output folder path")


def resolve_path(p: str) -> Path:
    path = Path(p)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


@app.get("/health")
def health():
    slicer_exe = os.getenv("SLICER_EXE")
    return {
        "status": "ok",
        "slicer_exe_exists": bool(slicer_exe and Path(slicer_exe).exists()),
        "slicer_exe": slicer_exe
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    slicer_exe = os.getenv("SLICER_EXE")
    slicer_script = os.getenv("SLICER_SCRIPT")
    output_root = os.getenv("OUTPUT_ROOT", "C:\\superroo-medical\\outputs")

    if not slicer_exe or not Path(slicer_exe).exists():
        raise HTTPException(status_code=500, detail="SLICER_EXE missing or invalid")
    if not slicer_script or not Path(slicer_script).exists():
        raise HTTPException(status_code=500, detail="SLICER_SCRIPT missing or invalid")
    if not Path(req.dicom_dir).exists():
        raise HTTPException(status_code=400, detail="dicom_dir does not exist")

    job_id = str(uuid.uuid4())
    output_dir = Path(output_root) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        slicer_exe,
        "--no-main-window",
        "--python-script",
        slicer_script,
        "--",
        req.dicom_dir,
        str(output_dir)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)

    metrics_path = output_dir / "metrics.json"
    metrics = None
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    return {
        "job_id": job_id,
        "status": "completed" if result.returncode == 0 else "failed",
        "output_dir": str(output_dir),
        "metrics": metrics,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:]
    }


@app.post("/analyze-dicom")
def analyze_dicom(req: LegacyAnalyzeRequest):
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
