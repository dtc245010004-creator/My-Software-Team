# BƯỚC 04: CẤU TRÚC BACKEND, DATABASE SESSION & WEBSOCKET MANAGER (BACKEND FOUNDATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-04-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/`.

---

## 1. Mục tiêu bước 4

- Thiết lập nền tảng FastAPI theo mô hình kiến trúc phân tầng (Layered Architecture): `Routers -> Services -> Models -> Schemas`.
- Cấu hình quản lý phiên kết nối CSDL (SQLAlchemy Engine, SessionLocal, Dependency `get_db`).
- Thiết lập hệ thống Middleware (CORS) và bộ xử lý lỗi tập trung (Global Exception Handlers).
- Xây dựng `ConnectionManager` quản lý WebSocket phục vụ truyền phát telemetry sạc xe thời gian thực.

---

## 2. Nội dung công việc chi tiết

### 2.1. Cấu hình SQLAlchemy & Phiên làm việc CSDL

- `app/core/database.py`:
  + Tạo `engine` với cấu hình linh hoạt (`check_same_thread=False` cho SQLite, connection pool cho PostgreSQL).
  + Khai báo `Base = declarative_base()`.
  + Hàm `get_db()` yield session và đảm bảo `db.close()` sau mỗi request.

### 2.2. WebSocket Manager quản lý Telemetry Realtime

- `app/core/websocket.py`:
  + Lớp `ConnectionManager` quản lý danh sách client WebSocket đang kết nối (Dashboard CPO, màn hình Simulator, màn hình sạc của tài xế).
  + Phương thức `connect(websocket, client_id)`, `disconnect(websocket)`, `broadcast(message: dict)`, `send_personal_message(message: dict, websocket)`.

### 2.3. Khởi tạo FastAPI App & Middleware

- `app/main.py`:
  + Khởi tạo `app = FastAPI(title="EV CSMS API", version="1.0.0", docs_url="/docs")`.
  + Cấu hình `CORSMiddleware` cho phép kết nối từ Frontend React (`http://localhost:5173`).
  + Đăng ký Router chính `/api/v1` và WebSocket endpoint `/ws/telemetry`.

---

## 3. Cấu trúc file cần sinh

```text
backend/
├── app/
│   ├── main.py                        # Điểm khởi chạy FastAPI, WebSocket & routers
│   ├── core/
│   │   ├── config.py                  # Pydantic Settings đọc biến môi trường
│   │   ├── database.py                # Engine, SessionLocal, get_db()
│   │   └── websocket.py               # ConnectionManager quản lý kết nối realtime
│   └── api/
│       └── v1/
│           └── __init__.py            # Router tập trung
```

---

## 4. Checklist thực hiện

- [x] Hoàn thiện `core/config.py`, `core/database.py`, `core/websocket.py`.
- [x] Khởi chạy `app/main.py` kiểm tra `/health` và kết nối WebSocket mẫu.
- [x] Cập nhật trạng thái Bước 04 trong `docs/plans/TIEN-DO.md`.
