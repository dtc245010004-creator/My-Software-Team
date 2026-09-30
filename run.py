"""Khởi chạy Backend FastAPI và Frontend Vite trong môi trường phát triển cục bộ."""

from __future__ import annotations

import importlib.util
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def check_dependencies() -> list[str]:
    errors = []

    if importlib.util.find_spec("uvicorn") is None:
        errors.append(
            "Chưa cài Uvicorn trong Python hiện tại. Hãy kích hoạt môi trường ảo "
            "và chạy: python -m pip install -r backend/requirements.txt"
        )

    npm_command = shutil.which("npm.cmd") or shutil.which("npm")
    if npm_command is None:
        errors.append("Không tìm thấy npm. Hãy cài Node.js rồi mở lại terminal.")
    if not (FRONTEND_DIR / "node_modules" / "vite" / "bin" / "vite.js").is_file():
        errors.append(
            "Chưa cài dependency Frontend. Hãy chạy: npm --prefix frontend install"
        )

    return errors


def start_process(
    command: list[str] | str, working_directory: Path, *, use_shell: bool = False
) -> subprocess.Popen[bytes]:
    options: dict[str, int | bool] = {}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True

    return subprocess.Popen(
        command,
        cwd=working_directory,
        shell=use_shell,
        **options,
    )


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                capture_output=True,
                timeout=10,
            )
        except (OSError, subprocess.TimeoutExpired):
            process.terminate()
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            process.kill()
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait()


def main() -> int:
    errors = check_dependencies()
    if errors:
        print("Không thể khởi chạy dự án:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    npm_command = shutil.which("npm.cmd") or shutil.which("npm")
    backend_command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
    ]

    if os.name == "nt":
        frontend_command = subprocess.list2cmdline(
            [npm_command, "run", "dev", "--", "--host", "127.0.0.1"]
        )
    else:
        frontend_command = [
            npm_command,
            "run",
            "dev",
            "--",
            "--host",
            "127.0.0.1",
        ]

    processes: list[tuple[str, subprocess.Popen[bytes]]] = []
    try:
        print("Đang khởi chạy Backend và Frontend...", flush=True)
        backend_process = start_process(backend_command, BACKEND_DIR)
        processes.append(("Backend", backend_process))
        frontend_process = start_process(
            frontend_command, FRONTEND_DIR, use_shell=os.name == "nt"
        )
        processes.append(("Frontend", frontend_process))

        print("Backend:  http://127.0.0.1:8000/docs", flush=True)
        print("Frontend: http://localhost:5173", flush=True)
        print("Nhấn Ctrl+C để dừng cả hai dịch vụ.", flush=True)

        while True:
            for name, process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    print(
                        f"{name} đã dừng với mã thoát {exit_code}; "
                        "đang dừng dịch vụ còn lại.",
                        file=sys.stderr,
                    )
                    return exit_code or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nĐang dừng Backend và Frontend...", flush=True)
        return 0
    finally:
        for _, process in reversed(processes):
            stop_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
