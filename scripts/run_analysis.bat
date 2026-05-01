@echo off
setlocal enabledelayedexpansion

REM Usage:
REM scripts\run_analysis.bat <input_dicom_dir> <output_dir>

set SLICER_EXE=C:\ProgramData\slicer.org\3D Slicer 5.10.0\Slicer.exe

if "%~1"=="" (
  echo Missing input DICOM directory.
  echo Usage: scripts\run_analysis.bat ^<input_dicom_dir^> ^<output_dir^>
  exit /b 1
)

if "%~2"=="" (
  echo Missing output directory.
  echo Usage: scripts\run_analysis.bat ^<input_dicom_dir^> ^<output_dir^>
  exit /b 1
)

set INPUT_DIR=%~f1
set OUTPUT_DIR=%~f2

if not exist "%SLICER_EXE%" (
  echo Slicer.exe not found: %SLICER_EXE%
  echo Edit scripts\run_analysis.bat and set your correct Slicer path.
  exit /b 1
)

"%SLICER_EXE%" --no-main-window --python-script "%~dp0analyze_slicer.py" -- "%INPUT_DIR%" "%OUTPUT_DIR%"
