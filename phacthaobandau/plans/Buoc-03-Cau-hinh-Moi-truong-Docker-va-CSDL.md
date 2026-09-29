# BƯỚC 03: CẤU HÌNH MÔI TRƯỜNG, BIẾN MÔI TRƯỜNG & CSDL SQLITE (ENVIRONMENT SETUP)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-03-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn & cấu hình được sinh trực tiếp vào thư mục `backend/` (`requirements.txt`, `.env.example`, `.env`, `app/core/config.py`) và file gốc `.env.example`.
> - *(Ghi chú phân kỳ: Docker Compose, Nginx và PostgreSQL được tạm hoãn sang Giai đoạn 2 theo định hướng Giai đoạn 1 MVP).*

---

## 1. Mục tiêu bước 3

- Thiết lập môi trường phát triển nhất quán, độc lập và dễ chạy lại trên bất kỳ máy tính nào cho Nền tảng trạm sạc xe điện (EV CSMS).
- Cấu hình file biến môi trường `.env` và mẫu `.env.example` (ở gốc và `backend/`).
- Quản lý danh mục dependencies cốt lõi tại `backend/requirements.txt` (FastAPI, SQLAlchemy, Pydantic, PyJWT, WebSockets, Pytest, Gemini).
- Xây dựng module nạp cấu hình `backend/app/core/config.py` bằng Pydantic Settings.
- Thiết lập cấu hình kết nối CSDL mặc định chạy `SQLite local` (`sqlite:///./ev_csms.db`) cho demo nhanh, nhẹ và không xung đột cổng mạng.

---

## 2. Nội dung công việc chi tiết

### 2.1. Quản lý Biến Môi Trường (.env)

- Các tham số cần quản lý:
  + `PROJECT_NAME="EV Charging Station Management System"`
  + `VERSION="1.0.0"`, `API_V1_STR="/api/v1"`
  + `SECRET_KEY`, `ALGORITHM="HS256"`, `ACCESS_TOKEN_EXPIRE_MINUTES=1440`
  + `DATABASE_URL="sqlite:///./ev_csms.db"` (mặc định Giai đoạn 1 MVP)
  + `GEMINI_API_KEY`, `AI_MODEL_NAME="gemini-1.5-flash"`
  + `BACKEND_CORS_ORIGINS=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]`
  + `SIMULATOR_INTERVAL_SECONDS=2` (chu kỳ phát xung nhịp telemetry sạc)

### 2.2. Danh mục Dependencies (requirements.txt)

- FastAPI, Uvicorn (Web framework & ASGI server)
- SQLAlchemy (ORM tương thích SQLite & PostgreSQL)
- Pydantic, Pydantic-Settings (Xác thực dữ liệu & nạp cấu hình)
- PyJWT, Passlib, Bcrypt (Mã hóa mật khẩu & phát hành Access Token)
- WebSockets (Giao tiếp thời gian thực cho telemetry sạc)
- Pytest, Pytest-asyncio, HTTPX (Bộ kiểm thử tự động)
- Google-generativeai (Tích hợp Gemini AI Engine)

---

## 3. Cấu trúc file cần sinh

```text
├── .env.example                       # Mẫu cấu hình môi trường gốc
├── backend/
│   ├── .env.example                   # Mẫu cấu hình môi trường backend
│   ├── .env                           # File cấu hình thực tế (được nạp tự động)
│   ├── requirements.txt               # Danh mục thư viện Python
│   └── app/
│       ├── __init__.py
│       └── core/
│           ├── __init__.py
│           └── config.py              # Pydantic Settings nạp biến môi trường
```

---

## 4. Checklist thực hiện

- [x] Tạo `backend/requirements.txt` với đầy đủ dependencies.
- [x] Tạo `.env.example` ở thư mục gốc và `backend/.env.example`.
- [x] Tạo `backend/.env` với cấu hình SQLite local và CORS chuẩn.
- [x] Tạo `backend/app/core/config.py` bằng Pydantic Settings và kiểm thử nạp thành công.
- [x] Cập nhật trạng thái Bước 03 trong `docs/plans/TIEN-DO.md`.
