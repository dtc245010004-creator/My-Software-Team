# BƯỚC 03: CẤU HÌNH MÔI TRƯỜNG, DOCKER & CSDL (ENVIRONMENT SETUP)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-03-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn & cấu hình được sinh trực tiếp vào thư mục gốc `backend/`, `frontend/`, và file gốc `docker-compose.yml`.

---

## 1. Mục tiêu bước 3
- Thiết lập môi trường phát triển nhất quán, độc lập và dễ chạy lại trên bất kỳ máy tính nào cho Nền tảng trạm sạc xe điện (EV CSMS).
- Cấu hình file biến môi trường `.env` và mẫu `.env.example`.
- Thiết lập cấu hình kết nối CSDL linh hoạt: mặc định chạy `SQLite` (`ev_csms.db`) cho demo nhanh, sẵn sàng đổi sang `PostgreSQL` qua chuỗi kết nối.
- Xây dựng cấu hình `docker-compose.yml` để đóng gói toàn bộ hệ thống (PostgreSQL + Backend FastAPI + Frontend React + WebSocket).

---

## 2. Nội dung công việc chi tiết

### 2.1. Quản lý Biến Môi Trường (.env)
- Các tham số cần quản lý:
  - `PROJECT_NAME="EV Charging Station Management System"`
  - `VERSION="1.0.0"`, `API_V1_STR="/api/v1"`
  - `SECRET_KEY`, `ALGORITHM="HS256"`, `ACCESS_TOKEN_EXPIRE_MINUTES=1440`
  - `DATABASE_URL`: `sqlite:///./ev_csms.db` hoặc `postgresql://postgres:postgres@localhost:5432/ev_csms_db`
  - `GEMINI_API_KEY`, `AI_MODEL_NAME="gemini-1.5-flash"`
  - `BACKEND_CORS_ORIGINS=["http://localhost:5173", "http://localhost:3000"]`
  - `SIMULATOR_INTERVAL_SECONDS=2` (chu kỳ phát xung nhịp telemetry sạc)

### 2.2. Cấu hình Docker & Docker Compose
- `backend/Dockerfile`: Build ứng dụng FastAPI với Python 3.10+ slim.
- `frontend/Dockerfile`: Build ứng dụng React với Vite/Node.js và phục vụ qua Nginx.
- `docker-compose.yml`: Điều phối 3 containers:
  - `db`: PostgreSQL 16 Alpine kèm volume lưu trữ bền vững.
  - `backend`: Kết nối tới `db`, hỗ trợ REST và WebSocket.
  - `frontend`: Kết nối tới backend qua reverse proxy.

---

## 3. Cấu trúc file cần sinh
```text
├── .env.example                       # Mẫu cấu hình môi trường gốc
├── docker-compose.yml                 # File điều phối Docker containers
├── backend/
│   ├── .env.example                   # Mẫu cấu hình môi trường backend
│   └── Dockerfile                     # Dockerfile đóng gói backend FastAPI
└── frontend/
    ├── Dockerfile                     # Dockerfile đóng gói frontend React
    └── nginx.conf                     # Cấu hình Nginx reverse proxy
```

---

## 4. Checklist thực hiện
- [ ] Cập nhật `.env.example` với đầy đủ các biến môi trường của hệ thống trạm sạc.
- [ ] Cấu hình `docker-compose.yml` hỗ trợ PostgreSQL + Backend + Frontend.
- [ ] Cập nhật trạng thái Bước 03 trong `docs/plans/TIEN-DO.md`.
