# BƯỚC 04: CẤU TRÚC BACKEND, DATABASE SESSION & WEBSOCKET MANAGER (BACKEND FOUNDATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
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
  - Tạo `engine` với cấu hình linh hoạt (`check_same_thread=False` cho SQLite, connection pool cho PostgreSQL).
  - Khai báo `Base = declarative_base()`.
  - Hàm `get_db()` yield session và đảm bảo `db.close()` sau mỗi request.

### 2.2. WebSocket Manager quản lý Telemetry Realtime
- `app/core/websocket.py`:
  - Lớp `ConnectionManager` quản lý danh sách client WebSocket đang kết nối (Dashboard CPO, màn hình Simulator, màn hình sạc của tài xế).
  - Phương thức `connect(websocket, client_id)`, `disconnect(websocket)`, `broadcast(message: dict)`, `send_personal_message(message: dict, websocket)`.

### 2.3. Khởi tạo FastAPI App & Middleware
- `app/main.py`:
  - Khởi tạo `app = FastAPI(title="EV CSMS API", version="1.0.0", docs_url="/docs")`.
  - Cấu hình `CORSMiddleware` cho phép kết nối từ Frontend React (`http://localhost:5173`).
  - Đăng ký Router chính `/api/v1` và WebSocket endpoint `/ws/telemetry`.

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

## 4. Bảng kiểm tra thực hiện & Trạng thái (Execution Checklist)

> **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét

| Hạng mục kiểm tra | Trạng thái | Đánh giá thực tế & Nguyên nhân trạng thái |
|---|:---:|---|
| **1. Khung ứng dụng FastAPI (`app/main.py`)** | ⚠️ Cần xem xét | **Mới làm khung ban đầu (Task T-01)**: Đã có endpoint `/health`. **XUNG ĐỘT:** Thiếu `CORSMiddleware` cho phép kết nối từ Vite Frontend port `5173`, chưa có router prefix `/api/v1`. |
| **2. Quản lý phiên CSDL (`app/core/database.py` & `config.py`)** | ⚠️ Cần xem xét | **Mới làm khung ban đầu**: Đã có `create_engine`, `SessionLocal`, `get_db()`. **XUNG ĐỘT:** Đang cấu hình DB `csms` (sai lệch với `docker-compose.yml`); thiếu cấu hình hỗ trợ SQLite fallback cho kiểm thử. |
| **3. Tích hợp di chuyển lược đồ Alembic (`migrations/`)** | ⚠️ Cần xem xét | **Đã khởi tạo**: Đã có `alembic.ini`, `env.py` và revision đầu `5bd3f74937cd_init.py`. **NGUY CƠ CRASH:** `env.py` gọi `None.replace(...)` khi thiếu file `.env`. Cần lấy trực tiếp từ `settings.database_url`. |
| **4. WebSocket Manager quản lý Telemetry (`core/websocket.py`)** | ⬜ Chưa bắt đầu | **Chưa có**: Chưa xây dựng `ConnectionManager` và WebSocket endpoint `/ws/telemetry` phục vụ truyền phát dữ liệu đo đếm sạc xe. |
| **5. Cập nhật tiến độ vào `docs/plans/TIEN-DO.md`** | ✅ Hoàn thành | Đã ghi nhận đúng hiện trạng (40% toàn bước / 75% Task T-01 - Cần xem xét do lỗi kết nối và CORS). |
