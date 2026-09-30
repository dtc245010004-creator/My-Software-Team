@echo off
REM ============================================================
REM  EV CSMS - Backend Dev Runner (Windows)
REM  Su dung Python that tai AppData\Local\Python (Python 3.14)
REM ============================================================

REM Tu dong tim Python that (bo qua Microsoft Store stub)
set "PY_EXE=C:\Users\Lenovo\AppData\Local\Python\bin\python.exe"
if not exist "%PY_EXE%" (
    set "PY_EXE=python"
)

echo [1/4] Dang di chuyen vao thu muc backend...
cd /d "%~dp0backend"

echo [2/4] Python su dung: %PY_EXE%
"%PY_EXE%" --version

echo [3/4] Dang cai dat dependencies (neu can)...
"%PY_EXE%" -m pip install --upgrade pip --quiet
"%PY_EXE%" -m pip install -r requirements.txt --quiet

echo.
echo ============================================================
echo  Backend dang chay tai: http://127.0.0.1:8000
echo  Docs (Swagger UI)   : http://127.0.0.1:8000/docs
echo  Nhan Ctrl+C de dung.
echo ============================================================
echo.

"%PY_EXE%" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
