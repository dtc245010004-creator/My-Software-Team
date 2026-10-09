"""Điều khiển stack EV CSMS đầy đủ bằng Docker Compose."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent


def main() -> int:
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (AttributeError, OSError):
                pass

    parser = argparse.ArgumentParser(
        description="Chạy toàn bộ EV CSMS (backend, frontend, database và OCPP simulator)."
    )
    parser.add_argument(
        "action",
        nargs="?",
        choices=("up", "down", "ps", "logs"),
        default="up",
        help="up: build và chạy; down: dừng, giữ dữ liệu; ps: xem trạng thái; logs: theo dõi log.",
    )
    args = parser.parse_args()

    docker = shutil.which("docker")
    if docker is None:
        print(
            "Không tìm thấy Docker. Hãy cài/mở Docker Desktop rồi chạy lại.",
            file=sys.stderr,
        )
        return 1

    compose_command = [docker, "compose"]
    if args.action == "up":
        command = [*compose_command, "up", "-d", "--build"]
    elif args.action == "down":
        command = [*compose_command, "down"]
    elif args.action == "ps":
        command = [*compose_command, "ps"]
    else:
        command = [*compose_command, "logs", "-f"]

    try:
        result = subprocess.run(command, cwd=ROOT_DIR, check=False)
    except OSError as exc:
        print(f"Không chạy được Docker Compose: {exc}", file=sys.stderr)
        return 1

    if result.returncode != 0:
        print(
            "Docker Compose không chạy thành công. Hãy kiểm tra Docker Desktop và log phía trên.",
            file=sys.stderr,
        )
        return result.returncode

    if args.action == "up":
        print("EV CSMS đã khởi chạy với cấu hình chung cho Sprint 1–4.")
        print("Giao diện: http://localhost:8080")
        print("API:      http://localhost:8001/docs")
        print(
            "Trạng thái: python run.py ps | Nhật ký: python run.py logs | "
            "Dừng: python run.py down"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
