# Vận hành CSMS — build, chạy, dừng, khởi động lại, dữ liệu, staging

> **Loại tài liệu**: Sổ tay kỹ thuật vận hành hệ thống (DevOps & Infrastructure Runbook)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.2 số 7  
> **Quy tắc tuân thủ**: Chỉ ghi nội dung có nguồn cụ thể từ mã nguồn và cấu hình thực tế; không suy diễn; mục thiếu được đánh dấu rõ ràng.

---

## 1. Thành phần và cổng

Căn cứ theo mã nguồn cấu hình tại `backend/app/main.py:68-96`, `frontend/vite.config.js:6-19` và `backend/app/core/config.py:30-34`:

| Thành phần | Công nghệ | Cổng / Đường dẫn mặc định | Chức năng & Giao thức |
| :--- | :--- | :--- | :--- |
| **Backend API** | FastAPI / Uvicorn | `http://localhost:8000` | REST API quản lý trạm sạc, xác thực, ví tiền, phiên sạc |
| **Tài liệu API Swagger** | OpenAPI 3.0 | `http://localhost:8000/docs` | Giao diện thử nghiệm và tra cứu API tương tác |
| **Tài liệu API ReDoc** | ReDoc | `http://localhost:8000/redoc` | Tài liệu kỹ thuật API dạng tĩnh |
| **Kiểm tra sức khỏe** | FastAPI Endpoint | `http://localhost:8000/api/v1/health` | HTTP GET kiểm tra trạng thái dịch vụ và CSDL |
| **Kênh Telemetry Realtime** | WebSocket | `ws://localhost:8000/ws/telemetry` | Kênh WebSocket truyền phát thông số telemetry phiên sạc |
| **Frontend UI** | React 18 / Vite 5 | `http://localhost:5173` | Giao diện điều hành và cổng tài xế (Reverse Proxy `/api` và `/ws` về `:8000`) |

---

## 2. Yêu cầu

Căn cứ theo `backend/requirements.txt` và `frontend/package.json`:

* **Python**: Phiên bản 3.10 trở lên.
* **Node.js**: Phiên bản 18.x trở lên, kèm công cụ quản lý gói `npm` (khuyến nghị phiên bản 9.x trở lên).
* **Hệ điều hành**: Tương thích Windows 10/11, Linux (Ubuntu 20.04+) và macOS.
* **Cơ sở dữ liệu**: SQLite 3 (được tích hợp sẵn cùng Python runtime cho Giai đoạn 1 MVP).

---

## 3. Chạy: một lệnh, tự build

* **Quyết định đối với `run.py`**: **Không cần**.
* **Lý do**: Việc khởi động đã được đề xuất bằng `start.bat` hoặc `run.ps1`. Hai thứ này trùng vai trò, chọn một script shell OS thay vì viết script wrapper Python phức tạp để spawn 2 tiến trình.
* **Hiện trạng**: Khởi động các dịch vụ qua 2 cửa sổ terminal riêng biệt theo Mục 12.

### Tài khoản trên máy cá nhân

Căn cứ theo mã nguồn khởi tạo dữ liệu mẫu tại `backend/seed_data.py:44-96` và cơ chế đăng nhập nhanh tại `frontend/src/context/AuthContext.jsx:66-91`:

| Vai trò (Role) | Username / Email | Mật khẩu | Số dư ví ban đầu | Trạng thái ghi nhận |
| :--- | :--- | :--- | :--- | :--- |
| **Admin (Quản trị viên)** | `admin` (`admin@evcsms.vn`) | `AdminPass123` | 5.000.000 VND | Hoạt động bình thường |
| **CPO / Operator (Vận hành)** | `operator_a` (`cpo_vinfast@evcsms.vn`) | `OpPass123` | 2.000.000 VND | Quản lý mạng lưới trạm sạc |
| **Tài xế sạc (Customer)** | `customer_user` (`driver1@gmail.com`) | `CusPass123` | 250.000 VND | Đủ điều kiện bắt đầu sạc (> 50k) |
| **Tài xế VIP** | `driver_vip` (`driver_vip@gmail.com`) | `DriverPass123` | 1.500.000 VND | Số dư khả dụng cao |
| **Tài xế nợ (Bị khóa)** | `driver_debt` (`driver_debt@gmail.com`) | `DriverPass123` | -120.000 VND | Bị khóa nợ (`is_debt_locked: True`), chặn đăng nhập nếu âm quá ngưỡng |
| **Khách sạc vãng lai** | *(Không cần đăng nhập)* | *(Không cần)* | 0 VND | Mặc định quyền `CUSTOMER` tại client |

---

## 4. Dừng, khởi động lại

Căn cứ theo cơ chế vận hành tiến trình Node.js & Python:

* **Dừng dịch vụ**: Tại cửa sổ dòng lệnh (Terminal) đang chạy tiến trình, bấm tổ hợp phím `Ctrl + C`.
* **Khởi động lại**: Thực hiện lại lệnh khởi chạy tương ứng của từng phân hệ (xem Mục 12).

---

## 5. Lệnh Docker tương đương (khi cần làm tay)

* **Quyết định đối với `docker-compose.yml` (kèm `Dockerfile`)**: **Để sau, đã duyệt**.
* **Lý do**: Chỉ đáng làm khi cần demo hoặc nộp bài trên máy khác chưa cài môi trường. Hệ thống hiện đang chạy trực tiếp ổn định trên môi trường máy chủ cục bộ (Host Python/Node runtime).

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
  `backend/alembic.ini` trỏ tới nguồn migration duy nhất `backend/alembic/`. Revision mới nhất trong cây là `4a0a1107f87d`, tạo bảng `meter_values`; các revision trước tạo `id_tags` và `ocpp_messages`. Migration MeterValues đã kiểm tra tiến/lùi trên DB tạm ở head hiện tại, chưa áp dụng lên DB dự án. Lưu ý: upgrade từ DB trống hiện lỗi tại migration lịch sử `5ba0e05433d7` vì cột `charging_points.last_seen_at` đã tồn tại; Docker daemon cũng không khả dụng trong lần kiểm tra 05/10/2026. Sao lưu cơ sở dữ liệu đích theo đúng loại backend trước khi chạy lệnh nâng cấp.

---

## 8. Kiểm thử

* **Quyết định đối với `test.py` & `tools/test_run.py`**: **Không cần**.
* **Lý do**: Dự án đã có công cụ chuẩn `pytest` và file cấu hình `backend/pytest.ini`. Viết script wrapper `test.py` chỉ làm phân mảnh cách chạy và tăng nguy cơ lệch môi trường.

Căn cứ theo `backend/pytest.ini`, `backend/tests/` và `frontend/package.json:9`:

### Kiểm thử Backend (Pytest)
Thực thi toàn bộ bộ test tự động trong `backend/.venv`. Tổng lịch sử cũ 84/89/90 vẫn mâu thuẫn `[CẦN XÁC NHẬN]`; lần chạy mới nhất ngày 05/10/2026 đạt 258 passed, 1 skipped, 181 warnings (đã gồm 48 ca OCPP):
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

## 9. Staging (Docker & CI/CD)

* **Cấu hình Staging Container**:
  * Dự án cung cấp file cấu hình điều phối cụm dịch vụ Staging tại `docker-compose.staging.yml`.
  * Đóng gói Backend qua `backend/Dockerfile` (Python 3.12 / FastAPI / Uvicorn).
  * Đóng gói Frontend qua `frontend/Dockerfile` (Node 20 build -> Nginx Alpine reverse proxy).
  * Đường dẫn kiểm thử tự động CI/CD: `.github/workflows/ci-staging.yml` (chạy `pytest backend/tests` và `npm run build` trên GitHub Actions).
* **Lệnh khởi chạy môi trường Staging**:
  ```bash
  # Build và khởi chạy ngầm toàn bộ dịch vụ staging
  docker compose -f docker-compose.staging.yml up -d --build

  # Kiểm tra nhật ký hoạt động
  docker compose -f docker-compose.staging.yml logs -f

  # Dừng và dọn dẹp cụm staging
  docker compose -f docker-compose.staging.yml down
  ```
* **Lưu ý đám mây**: Đối với nền tảng Render.com, chỉ tạo file `render.yaml` khi có yêu cầu chỉ định triển khai lên hạ tầng này.

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
| `BACKEND_CORS_ORIGINS` | JSON List | `["http://localhost:5173", ...]` | Danh sách origin trình duyệt được phép gọi API |
| `GEMINI_API_KEY` | String | `""` | Khóa API dịch vụ AI Google Gemini (tùy chọn) |
| `AI_MODEL_NAME` | String | `gemini-1.5-flash` | Định danh mô hình AI phân tích tải trạm |
| `HEARTBEAT_INTERVAL_SECONDS` | Integer | `300` | Chu kỳ heartbeat trả trong BootNotification OCPP 1.6J (giây) |
| `OCPP_CALL_TIMEOUT_SECONDS` | Float | `30.0` | Thời gian chờ CALL do CSMS gửi xuống trụ khi không truyền timeout riêng (giây) |

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
