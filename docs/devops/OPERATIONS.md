# Vận hành CSMS — build, chạy, dừng, khởi động lại, dữ liệu, staging

> **Loại tài liệu**: Sổ tay kỹ thuật vận hành hệ thống (DevOps & Infrastructure Runbook)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.2 số 7  
> **Quy tắc tuân thủ**: Chỉ ghi nội dung có nguồn cụ thể từ mã nguồn và cấu hình thực tế; không suy diễn; mục thiếu được đánh dấu rõ ràng.

---

## 1. Thành phần và cổng

Căn cứ theo mã nguồn cấu hình tại `backend/app/main.py:68-96`, `frontend/vite.config.js:6-19` và `backend/app/core/config.py:30-34`:

| Thành phần | Công nghệ | Cổng / Đường dẫn mặc định | Chức năng & Giao thức |
| :--- | :--- | :--- | :--- |
| **Backend API (Local Dev)** | FastAPI / Uvicorn | `http://localhost:8000` | REST API quản lý trạm sạc, xác thực, ví tiền, phiên sạc |
| **Backend API (Compose)** | FastAPI / Uvicorn | Main `http://localhost:8001`; Staging `http://localhost:8002` | Cổng host; trong Docker backend vẫn nghe cổng `8000` |
| **Tài liệu API Swagger** | OpenAPI 3.0 | Local `:8000/docs`; Compose main `:8001/docs`; staging `:8002/docs` | Giao diện thử nghiệm và tra cứu API tương tác |
| **Tài liệu API ReDoc** | ReDoc | Local `:8000/redoc`; Compose main `:8001/redoc`; staging `:8002/redoc` | Tài liệu kỹ thuật API dạng tĩnh |
| **Kiểm tra sức khỏe** | FastAPI Endpoint | Local `:8000/api/v1/health`; Compose main `:8001/api/v1/health`; staging `:8002/api/v1/health` | HTTP GET kiểm tra trạng thái dịch vụ và CSDL |
| **Kênh Telemetry Realtime** | WebSocket | Local `ws://localhost:8000/ws/telemetry`; Compose main `ws://localhost:8001/ws/telemetry` | Kênh WebSocket truyền phát thông số telemetry phiên sạc |
| **Frontend UI** | React 18 / Vite 5 / Nginx | Local `http://localhost:5173`; Compose main `:8080`; staging `:8081` | Giao diện điều hành; Nginx proxy `/api` và `/ws` đến backend nội bộ `:8000` |

---

## 2. Yêu cầu

Căn cứ theo `backend/requirements.txt` và `frontend/package.json`:

* **Python**: Phiên bản 3.10 trở lên.
* **Node.js**: Phiên bản 18.x trở lên, kèm công cụ quản lý gói `npm` (khuyến nghị phiên bản 9.x trở lên).
* **Hệ điều hành**: Tương thích Windows 10/11, Linux (Ubuntu 20.04+) và macOS.
* **Cơ sở dữ liệu**: SQLite 3 (được tích hợp sẵn cùng Python runtime cho Giai đoạn 1 MVP).

---

## 3. Chạy: một lệnh, tự build

* **Quyết định hiện tại đối với `run.py` (09/10/2026)**: dùng làm bộ điều khiển Compose phát triển theo yêu cầu người dùng; mặc định build và chạy toàn bộ stack Backend, Frontend, PostgreSQL và OCPP simulator trên cùng mã nguồn Sprint 1–4.
* **Khởi chạy tương đương**: `docker compose up -d --build` từ thư mục gốc. Compose tự nhận `docker-compose.yml` và giữ tên project/volume phát triển đã khai báo trong file.
* **Lệnh qua `run.py`**: `python run.py` (chạy), `python run.py ps` (trạng thái), `python run.py logs` (log), `python run.py down` (dừng, giữ dữ liệu).

### Tài khoản trên máy cá nhân

Căn cứ theo `backend/app/services/demo_account_service.py`, `frontend/src/config/roleConfig.js` và `frontend/src/context/AuthContext.jsx`:

| Vai trò (Role) | Username / Email | Mật khẩu | Số dư ví ban đầu | Trạng thái ghi nhận |
| :--- | :--- | :--- | :--- | :--- |
| **Admin (Quản trị viên)** | `admin` (`admin@evcsms.vn`) | `12345678a` | 5.000.000 VND | Đăng nhập nhanh và quản trị hệ thống |
| **Admin dự phòng** | `admin2` (`admin2@evcsms.vn`) | `AdminPass123` | 5.000.000 VND | Tài khoản demo dự phòng |
| **Chủ trạm B** | `operator` (`operator@evcsms.vn`) | `OpPass123` | 2.000.000 VND | Quản lý trạm của Chủ B |
| **CPO / Operator (Vận hành)** | `operator_a` (`cpo_vinfast@evcsms.vn`) | `OpPass123` | 2.000.000 VND | Quản lý mạng lưới trạm sạc |
| **Kế toán** | `accountant` (`accountant@evcsms.vn`) | `AccPass123` | 1.000.000 VND | Đối soát tài chính |
| **Tài xế sạc (Customer)** | `customer_user` (`driver1@gmail.com`) | `CusPass123` | 250.000 VND | Đủ điều kiện bắt đầu sạc (> 50k) |
| **Tài xế VIP** | `driver_vip` (`driver_vip@gmail.com`) | `DriverPass123` | 1.500.000 VND | Số dư khả dụng cao |
| **Tài xế nợ (Bị khóa)** | `driver_debt` (`driver_debt@gmail.com`) | `DriverPass123` | -120.000 VND | Bị khóa nợ (`is_debt_locked: True`), đăng nhập bị từ chối có chủ đích |

Các tài khoản demo trên được đồng bộ an toàn khi Compose phát triển bật `ENABLE_DEMO_ACCOUNTS=true`; staging không bật cờ này. Đồng bộ chỉ tác động các tài khoản demo đã định danh và không xóa dữ liệu khác. Không dùng `backend/seed_data.py` cho mục đích này vì script đó xóa toàn bộ schema.
| **Khách sạc vãng lai** | *(Không cần đăng nhập)* | *(Không cần)* | 0 VND | Mặc định quyền `CUSTOMER` tại client |

---

## 4. Dừng, khởi động lại

* **Dừng stack và giữ dữ liệu**: `docker compose down` hoặc `python run.py down`.
* **Khởi động lại**: `docker compose up -d --build` hoặc `python run.py`.
* Không thêm `-v` vào lệnh dừng nếu cần giữ database.

---

## 5. Cấu hình Compose phát triển

`docker-compose.yml` là cấu hình dùng chung cho các story đã tích hợp từ Sprint 1–4. Backend mặc định lưu SQLite trong named volume; PostgreSQL cũng được khởi chạy cho các cấu hình Compose cần dùng `COMPOSE_DATABASE_URL`. Giao diện ở `http://localhost:8080`, API ở `http://localhost:8001/docs`.

---

## 6. Xem log và kiểm tra sức khoẻ

Căn cứ theo `backend/app/main.py:12-16` và `backend/app/api/v1/__init__.py:22-38`:

### Cấu hình ghi Log
* Định dạng ghi log: `logging.basicConfig(level=logging.INFO, format="%(asctime)s - [%(levelname)s] - %(name)s: %(message)s")`.
* Tên logger chính: `ev_csms.main`.
* Đầu ra: Xuất trực tiếp ra luồng điều khiển chuẩn (`stdout` / `stderr`).

### Kiểm tra sức khỏe (Health Check)
* **Endpoint**: `GET /api/v1/health`
* **Mẫu phản hồi HTTP 200**:
```json
{
  "status": "healthy",
  "project": "EV Charging Station Management System",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2026-09-29T10:00:00.000000Z"
}
```

---

## 7. Cơ sở dữ liệu

Căn cứ theo `backend/app/core/config.py:27`, `backend/seed_data.py:28-38` và `backend/alembic.ini`:

* **Động cơ lưu trữ**: SQLite (`backend/ev_csms.db`).
* **Khởi tạo và nạp dữ liệu mẫu (Seed Data)**:
  ```powershell
  cd backend
  python seed_data.py
  ```
  *Lưu ý: Lệnh này sẽ làm sạch schema và nạp mới toàn bộ trạm sạc, trụ, đầu nối, người dùng và ví tiền demo.*
* **Nâng cấp CSDL qua Alembic (Migrations)**:
  ```powershell
  cd backend
  alembic upgrade head
  ```
`backend/alembic.ini` trỏ tới nguồn migration duy nhất `backend/alembic/`; `alembic heads` ngày 10/10/2026 trả một head `e72b461d9ac3`, nối `5f9249bf58da` và `d8f56c4a911e`. Lượt kiểm tra này chỉ liệt kê head, không chạy upgrade/downgrade. DB dự án không bị migrate. Trước khi nâng cấp môi trường thật, sao lưu cơ sở dữ liệu đích theo đúng loại backend.

---

## 8. Kiểm thử

* **Quyết định đối với `test.py` & `tools/test_run.py`**: **Không cần**.
* **Lý do**: Dự án đã có công cụ chuẩn `pytest` và file cấu hình `backend/pytest.ini`. Viết script wrapper `test.py` chỉ làm phân mảnh cách chạy và tăng nguy cơ lệch môi trường.

Căn cứ theo `backend/pytest.ini`, `backend/tests/` và `frontend/package.json:9`:

### Kiểm thử Backend (Pytest)
Thực thi toàn bộ bộ test tự động trong `backend/.venv`. Tổng lịch sử cũ 84/89/90 vẫn mâu thuẫn `[CẦN XÁC NHẬN]`; lần chạy mới nhất ngày 05/10/2026 đạt 263 passed, 1 skipped, 181 warnings (đã gồm 53 ca OCPP):
```powershell
cd backend
pytest
```
*Hoặc chạy với báo cáo rút gọn từ thư mục gốc:*
```powershell
pytest backend/tests -v
```

### Kiểm thử Frontend Build (Vite)
Kiểm tra biên dịch và tính toàn vẹn kiểu dữ liệu giao diện:
```powershell
cd frontend
npm run build
```

---

## 9. Docker Compose dùng chung (Sprint 1–4)

Từ thư mục gốc, dùng cấu hình duy nhất `docker-compose.yml`:

```powershell
docker compose up -d --build
docker compose ps
```

Giao diện ở `http://localhost:8080`, API ở `http://localhost:8001/docs`; dừng an toàn bằng `docker compose down` hoặc `python run.py down`. Lệnh `down` giữ named volume dữ liệu. CI kiểm tra cấu hình bằng `docker compose config --quiet` trong `.github/workflows/ci.yml`.

---

## 10. Biến môi trường

Căn cứ theo `backend/app/core/config.py` và file mẫu `backend/.env.example`:

| Tên biến | Kiểu dữ liệu | Giá trị mặc định trong mã | Ý nghĩa & Mục đích |
| :--- | :--- | :--- | :--- |
| `PROJECT_NAME` | String | `EV Charging Station Management System` | Tên định danh dự án trên Swagger |
| `VERSION` | String | `1.0.0` | Phiên bản ứng dụng |
| `API_V1_STR` | String | `/api/v1` | Tiền tố đường dẫn API v1 |
| `DATABASE_URL` | String | `sqlite:///./ev_csms.db` | Chuỗi kết nối CSDL (hỗ trợ SQLite / PostgreSQL) |
| `SECRET_KEY` | String | *(Khóa dev mặc định)* | Khóa bí mật dùng để ký và giải mã JWT token |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Integer | `1440` (24 giờ) | Thời gian hiệu lực của phiên đăng nhập |
| `MAX_FAILED_LOGIN_ATTEMPTS` | Integer | `5` | Số lần đăng nhập sai tối đa trước khi khóa tạm thời |
| `LOCKOUT_DURATION_MINUTES` | Integer | `15` | Thời gian khóa tạm thời tài khoản tính theo phút |
| `NEGATIVE_BALANCE_LIMIT` | Integer | `-300000` | Ngưỡng số dư ví kích hoạt khóa tài khoản (-300.000 VND) |
| `MAX_SAFE_DEBT_LIMIT` | Integer | `-500000` | Hạn mức CSDL CheckConstraint chặn cứng chống tràn (-500.000 VND) |
| `RECONCILE_INTERVAL_MINUTES` | Integer | `15` | Chu kỳ job so sánh tổng sổ cái với số dư từng ví; ví lệch bị khóa giao dịch mới |
| `BACKEND_CORS_ORIGINS` | JSON List | `["http://localhost:5173", ...]` | Danh sách origin trình duyệt được phép gọi API |
| `ENABLE_DEMO_ACCOUNTS` | Boolean | Compose phát triển: `true`; staging: không bật | Đồng bộ tài khoản demo chỉ cho stack phát triển; không bật trên staging |
| `GEMINI_API_KEY` | String | `""` | Khóa API dịch vụ AI Google Gemini (tùy chọn) |
| `AI_MODEL_NAME` | String | `gemini-1.5-flash` | Định danh mô hình AI phân tích tải trạm |
| `HEARTBEAT_INTERVAL_SECONDS` | Integer | `300` | Chu kỳ heartbeat trả trong BootNotification OCPP 1.6J (giây) |
| `OCPP_CALL_TIMEOUT_SECONDS` | Float | `30.0` | Thời gian chờ CALL do CSMS gửi xuống trụ khi không truyền timeout riêng (giây) |
| `ABNORMAL_SESSION_THRESHOLD_SECONDS` | Integer | `500` | Ngưỡng thời gian không nhận liên lạc trước khi job gắn cờ phiên đang sạc bất thường (giây); job không tự đóng phiên |
| `IDLE_FEE_MAX_MINUTES` | Integer | `240` | Trần số phút chịu phí chiếm trụ trong một phiên, sau khi trừ thời gian ân hạn |
| `ALLOW_REMOTE_START_SIMULATION` | Boolean | `false` | Tắt mô phỏng RemoteStart/RemoteStop theo mặc định; chỉ ADMIN có thể dùng khi chủ động bật cấu hình |
| `TESTING` | Boolean | `false` | Cờ kiểm thử; không tự mở mô phỏng nếu không có một test pytest đang chạy; không bật trong triển khai |

---

## 11. Chạy lại spike K-01 (mã thử vứt đi)

Không áp dụng: repo không lưu script spike dùng một lần này trong cây thư mục chính. Các dữ kiện kỹ thuật và kết quả đo đạc được lưu trữ tài liệu hóa tại [docs/research/K-01-ocpp-simulator.md](../research/K-01-ocpp-simulator.md).

---

## 12. Chạy thủ công không qua script (nâng cao)

Căn cứ theo `backend/README.md:12-25` và `frontend/package.json:6-10`:

### Bước 1: Khởi động Backend
Mở cửa sổ dòng lệnh thứ nhất tại thư mục gốc:
```powershell
cd backend
pip install -r requirements.txt
python seed_data.py
uvicorn app.main:app --reload --port 8000
```
*Backend sẵn sàng tại `http://localhost:8000`.*

### Bước 2: Khởi động Frontend
Mở cửa sổ dòng lệnh thứ hai tại thư mục gốc:
```powershell
cd frontend
npm install
npm run dev
```
*Frontend sẵn sàng tại `http://localhost:5173`.*
