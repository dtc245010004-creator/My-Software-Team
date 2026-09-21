# BƯỚC 03: CẤU HÌNH MÔI TRƯỜNG, DOCKER & CSDL (ENVIRONMENT SETUP)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-03-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn & cấu hình được sinh trực tiếp vào thư mục gốc `backend/`, `frontend/`, và file gốc `docker-compose.yml`.

---

## 1. Mục tiêu bước 3
- Thiết lập môi trường phát triển nhất quán, độc lập và dễ chạy lại trên bất kỳ máy tính nào.
- Cấu hình file biến môi trường `.env` và mẫu `.env.example`.
- Thiết lập cấu hình kết nối CSDL linh hoạt: mặc định chạy `SQLite` cho demo nhanh, sẵn sàng đổi sang `PostgreSQL` qua chuỗi kết nối.
- Xây dựng cấu hình `docker-compose.yml` để đóng gói toàn bộ hệ thống (PostgreSQL + Backend + Frontend).

---

## 2. Nội dung công việc chi tiết

### 2.1. Quản lý Biến Môi Trường (.env)
- Các tham số cần quản lý:
  - `PROJECT_NAME`, `VERSION`, `API_V1_STR`.
  - `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
  - `DATABASE_URL`: `sqlite:///./warehouse.db` hoặc `postgresql://postgres:postgres@localhost:5432/warehouse_db`.
  - `GEMINI_API_KEY`, `AI_PROVIDER`, `AI_MODEL_NAME`.
  - `BACKEND_CORS_ORIGINS`.

### 2.2. Cấu hình Docker & Docker Compose
- `backend/Dockerfile`: Build ứng dụng FastAPI với Python 3.14 / 3.11 slim.
- `frontend/Dockerfile`: Build ứng dụng React với Node.js và phục vụ qua Nginx.
- `docker-compose.yml`: Điều phối 3 containers:
  - `db`: PostgreSQL 16 Alpine kèm volume lưu trữ bền vững.
  - `backend`: Kết nối tới `db`, nạp biến môi trường từ `.env`.
  - `frontend`: Kết nối tới backend qua cổng 80/5173.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
he-thong-quan-ly-kho/
├── .env.example                       # Mẫu cấu hình môi trường gốc
├── docker-compose.yml                 # File điều phối Docker containers
├── backend/
│   ├── .env                           # File cấu hình môi trường backend (không commit git)
│   ├── .env.example                   # Mẫu cấu hình môi trường backend
│   └── Dockerfile                     # Dockerfile đóng gói backend FastAPI
└── frontend/
    ├── Dockerfile                     # Dockerfile đóng gói frontend React + Nginx
    └── nginx.conf                     # Cấu hình Nginx reverse proxy cho frontend
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Ứng dụng chạy được cục bộ với `SQLite` mà không cần cài đặt thêm phần mềm máy chủ CSDL.
- [ ] Chạy được lệnh `docker-compose up --build` khởi động thành công cả 3 services (DB, Backend, Frontend).
- [ ] File `.env` chứa bí mật không bị commit lên kho mã nguồn Git.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 03** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 03 | Cấu hình Môi trường, Docker & CSDL | Hoàn thành | `.env.example`, `docker-compose.yml`, `Dockerfile` | Đã hoàn thiện cấu hình .env, docker-compose.yml và Dockerfile |
```
