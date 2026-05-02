param(
  [Parameter(Mandatory=$true)][string]$InputDir,
  [Parameter(Mandatory=$true)][string]$OutputDir
)

$SlicerExe = "C:\ProgramData\slicer.org\3D Slicer 5.10.0\Slicer.exe"
$ScriptPath = Join-Path $PSScriptRoot "analyze_slicer.py"

if (!(Test-Path $SlicerExe)) {
  Write-Error "Slicer.exe not found: $SlicerExe. Edit run_analysis.ps1."
  exit 1
}

& $SlicerExe --no-main-window --python-script $ScriptPath -- $InputDir $OutputDir
