from pathlib import Path
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import subprocess
import uuid
import tempfile
import shutil
import zipfile

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args, **_kwargs):
        return False

try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except ModuleNotFoundError:
    FastAPI = None
    HTTPException = None
    Request = None
    CORSMiddleware = None
    BaseModel = object

    def Field(default, **_kwargs):
        return default


load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SLICER_EXE = Path(r"C:\ProgramData\slicer.org\3D Slicer 5.10.0\Slicer.exe")
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "outputs" / "slicer"
DEFAULT_SLICER_SCRIPT = REPO_ROOT / "scripts" / "analyze_slicer.py"
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


def slicer_config():
    slicer_exe = Path(os.getenv("SLICER_EXE") or DEFAULT_SLICER_EXE)
    slicer_script = Path(os.getenv("SLICER_SCRIPT") or DEFAULT_SLICER_SCRIPT)
    output_root = Path(os.getenv("OUTPUT_ROOT") or DEFAULT_OUTPUT_ROOT)
    return slicer_exe, slicer_script, output_root


def health_payload():
    slicer_exe, slicer_script, output_root = slicer_config()
    return {
        "status": "ok",
        "fastapi_available": FastAPI is not None,
        "slicer_exe_exists": slicer_exe.exists(),
        "slicer_exe": str(slicer_exe),
        "slicer_script_exists": slicer_script.exists(),
        "slicer_script": str(slicer_script),
        "output_root": str(output_root),
    }


def http_error(status_code, detail):
    if HTTPException is not None:
        raise HTTPException(status_code=status_code, detail=detail)
    raise ValueError(detail)


def run_slicer_analysis(dicom_dir: str):
    slicer_exe, slicer_script, output_root = slicer_config()
    input_dir = resolve_path(dicom_dir)

    if not slicer_exe.exists():
        http_error(500, f"Slicer executable missing or invalid: {slicer_exe}")
    if not slicer_script.exists():
        http_error(500, f"Slicer script missing or invalid: {slicer_script}")
    if not input_dir.exists():
        http_error(400, f"dicom_dir does not exist: {input_dir}")

    job_id = str(uuid.uuid4())
    output_dir = output_root / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(slicer_exe),
        "--no-main-window",
        "--python-script",
        str(slicer_script),
        "--",
        str(input_dir),
        str(output_dir),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)

    metrics_path = output_dir / "metrics.json"
    metrics = None
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    return {
        "job_id": job_id,
        "status": "completed" if result.returncode == 0 else "failed",
        "process_returncode": result.returncode,
        "output_dir": str(output_dir),
        "metrics_path": str(metrics_path),
        "report_path": str(output_dir / "report.md"),
        "metrics": metrics,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def run_legacy_analysis(input_dir: str, output_dir: str):
    resolved_input = resolve_path(input_dir)
    resolved_output = resolve_path(output_dir)

    if not resolved_input.exists():
        http_error(400, f"Input directory does not exist: {resolved_input}")
    if not RUN_BAT.exists():
        http_error(500, f"Missing runner: {RUN_BAT}")

    resolved_output.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [str(RUN_BAT), str(resolved_input), str(resolved_output)],
        capture_output=True,
        text=True,
        shell=True,
        cwd=str(REPO_ROOT),
    )

    metrics_path = resolved_output / "metrics.json"
    metrics = None
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    return {
        "process_returncode": result.returncode,
        "status": "done" if result.returncode == 0 and metrics_path.exists() else "failed",
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        "metrics_path": str(metrics_path),
        "report_path": str(resolved_output / "report.md"),
        "metrics": metrics,
    }


def extract_and_run(zip_bytes: bytes):
    slicer_exe, slicer_script, _output_root = slicer_config()
    if not slicer_exe.exists():
        http_error(500, f"Slicer executable missing or invalid: {slicer_exe}")
    if not slicer_script.exists():
        http_error(500, f"Slicer script missing or invalid: {slicer_script}")

    temp_dir = Path(tempfile.mkdtemp(prefix="slicer_upload_"))
    try:
        zip_path = temp_dir / "upload.zip"
        with open(zip_path, "wb") as f:
            f.write(zip_bytes)

        extract_dir = temp_dir / "dicom"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        return run_slicer_analysis(str(extract_dir))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if FastAPI is not None:
    app = FastAPI(title="Local Slicer Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,https://neurologist-ai.vercel.app,https://ctscan-analyzer.vercel.app",
        ).split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return health_payload()

    @app.post("/analyze")
    def analyze(req: AnalyzeRequest):
        return run_slicer_analysis(req.dicom_dir)

    @app.post("/analyze-dicom")
    def analyze_dicom(req: LegacyAnalyzeRequest):
        return run_legacy_analysis(req.input_dir, req.output_dir)

    @app.post("/upload-and-analyze")
    async def upload_and_analyze(request: Request):
        body = await request.body()
        if not body:
            http_error(400, "Empty request body")
        return extract_and_run(body)
else:
    app = None


class LocalSlicerHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "*")
        self.send_header("access-control-allow-private-network", "true")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "*")
        self.send_header("access-control-allow-private-network", "true")
        self.send_header("content-length", "0")
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self.send_json(200, health_payload())
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        try:
            path = urlparse(self.path).path
            if path == "/upload-and-analyze":
                length = int(self.headers.get("content-length", "0"))
                body = self.rfile.read(length)
                if not body:
                    self.send_json(400, {"error": "bad_request", "detail": "Empty request body"})
                    return
                result = extract_and_run(body)
                self.send_json(200, result)
                return

            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if path == "/analyze":
                self.send_json(200, run_slicer_analysis(payload.get("dicom_dir", "")))
                return
            if path == "/analyze-dicom":
                self.send_json(200, run_legacy_analysis(payload.get("input_dir", ""), payload.get("output_dir", "")))
                return
            self.send_json(404, {"error": "not_found"})
        except ValueError as err:
            self.send_json(400, {"error": "bad_request", "detail": str(err)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "slicer_timeout", "detail": "Slicer analysis timed out after 15 minutes."})
        except Exception as err:
            if HTTPException is not None and isinstance(err, HTTPException):
                self.send_json(err.status_code, {"error": "http_exception", "detail": err.detail})
                return
            self.send_json(500, {"error": "slicer_service_failed", "detail": str(err)})


def main():
    host = os.getenv("SLICER_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("SLICER_SERVICE_PORT", "8787"))
    server = ThreadingHTTPServer((host, port), LocalSlicerHandler)
    print(f"Local Slicer service listening at http://{host}:{port}")
    print(json.dumps(health_payload(), indent=2))
    server.serve_forever()


if __name__ == "__main__":
    main()
