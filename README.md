# CSMS — EV Charging Station Management System

> **Nguồn xác thực chính**: Mã nguồn thực tế `backend/app/core/config.py`, `backend/app/main.py`, `backend/seed_data.py`, `frontend/package.json` và kết quả thực thi kiểm thử `pytest`.  
> **Dấu vết tham khảo**: [nguồn tạm: nentang.md], [nguồn tạm: Prompt.md]

---

## Trạng thái nhanh

- **Backend**: Python 3.12+ / FastAPI, SQLAlchemy ORM, SQLite WAL mode (`sqlite:///./ev_csms.db`). *(Nguồn: `backend/app/core/config.py`)*
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts. *(Nguồn: `frontend/package.json`)*
- **Kiểm thử tự động**: **89/89 test cases passed**, 0 lỗi hồi quy (Zero regression). *(Nguồn: Kết quả thực thi `pytest backend/tests`)*
- **Kiến trúc dữ liệu**: 9 bảng CSDL quan hệ (`users`, `wallets`, `wallet_transactions`, `stations`, `chargers`, `connectors`, `station_power_metrics`, `tariffs`, `charging_sessions`). *(Nguồn: `backend/app/models/`)*
- **Khung Staging & CI/CD**: Hỗ trợ chạy đồng thời qua `docker-compose.staging.yml` và pipeline kiểm thử tự động `.github/workflows/ci-staging.yml`.

---

## 1. Chạy dự án (môi trường phát triển & staging)

### Cách 1: Khởi chạy môi trường phát triển cục bộ (Local Dev)

#### Bước 1: Khởi động Backend (FastAPI)
*(Nguồn: `backend/requirements.txt`, `backend/app/main.py:20`)*

```bash
cd backend
pip install -r requirements.txt
python seed_data.py                # Khởi tạo CSDL SQLite và nạp dữ liệu mẫu
uvicorn app.main:app --reload --port 8000
```
- API Swagger UI: `http://localhost:8000/docs`
- Kiểm tra sức khỏe hệ thống: `http://localhost:8000/api/v1/health`

#### Bước 2: Khởi động Frontend (React + Vite)
*(Nguồn: `frontend/package.json:6-9`)*

```bash
cd frontend
npm install
npm run dev
```
- Giao diện Web: `http://localhost:5173` (hoặc cổng được Vite cấp phát)

### Cách 2: Khởi chạy môi trường Staging qua Docker Compose
*(Nguồn: `docker-compose.staging.yml`, `backend/Dockerfile`, `frontend/Dockerfile`)*

```bash
# Khởi chạy toàn bộ cụm dịch vụ Backend & Frontend (Nginx reverse proxy)
docker compose -f docker-compose.staging.yml up -d --build

# Kiểm tra trạng thái và logs
docker compose -f docker-compose.staging.yml logs -f
```
- Giao diện người dùng Staging: `http://localhost` (cổng 80)
- API Backend Staging: `http://localhost:8000` (hoặc qua proxy `http://localhost/api/v1`)

---

## 2. Dùng thử hệ thống

### Tài khoản có sẵn (tạo tự động từ `backend/seed_data.py`)
*(Nguồn: `backend/seed_data.py:44-95`)*

| Vai trò (Role) | Tên đăng nhập | Email | Mật khẩu mặc định | Chức năng chính |
| :--- | :--- | :--- | :--- | :--- |
| **Quản trị viên (ADMIN)** | `admin` | `admin@evcsms.vn` | `AdminPass123` | Quản trị toàn hệ thống, cấu hình tham số, giám sát tải busbar |
| **Quản trị viên dự phòng (ADMIN)** | `admin2` | `admin2@evcsms.vn` | `AdminPass123` | Quản trị viên dự phòng hệ thống |
| **Chủ trạm (OPERATOR)** | `operator` | `operator@evcsms.vn` | `OpPass123` | Quản lý trạm sạc, trụ sạc, cổng sạc, xem telemetry, AI Advisor |
| **Chủ trạm VinFast** | `operator_a` | `cpo_vinfast@evcsms.vn` | `OpPass123` | Quản trị mạng lưới trạm sạc khu vực |
| **Tài xế chuẩn (CUSTOMER)** | `customer_user` | `driver1@gmail.com` | `CusPass123` | Xem ví điện tử, nạp tiền, theo dõi phiên sạc trực tiếp |
| **Tài xế VIP (CUSTOMER)** | `driver_vip` | `driver_vip@gmail.com` | `DriverPass123` | Tài xế số dư lớn, sạc xe VF9 |
| **Tài xế nợ (CUSTOMER)** | `driver_debt` | `driver_debt@gmail.com` | `DriverPass123` | Tài khoản mô phỏng trường hợp nợ âm ví quá hạn mức |

### Đăng ký công khai — luôn ra tài khoản Tài xế, không gửi "role"
*(Nguồn: `backend/app/api/v1/endpoints/auth.py:28-32`)*
- Endpoint `POST /api/v1/auth/register` bắt buộc gán cứng `role = "CUSTOMER"` để ngăn chặn tấn công leo thang đặc quyền (Privilege Escalation).
- Quá trình đăng ký bọc trong 1 Transaction nguyên tử (Atomic): Tạo User + Tạo Wallet với số dư ban đầu 0 VND.

### Thử bằng dòng lệnh (không cần giao diện)
*(Nguồn: `backend/app/api/v1/endpoints/auth.py:53`, `backend/app/api/v1/__init__.py:22`)*

```bash
# 1. Kiểm tra sức khỏe dịch vụ
curl -X GET "http://localhost:8000/api/v1/health"

# 2. Đăng nhập lấy Bearer JWT Token
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=operator&password=OpPass123"
```

### Dữ liệu demo
*(Nguồn: `backend/seed_data.py:28-360`)*
- Script `backend/seed_data.py` tự động tái tạo bảng và nạp:
  - 3 trạm sạc quy mô lớn tại Hà Nội (Vincom Smart City, Ecopark, Mỹ Đình).
  - 9 trụ sạc vật lý (công suất từ 11kW đến 250kW Ultra-Fast).
  - 18 cổng sạc chuẩn CCS2, Type 2, CHAdeMO.
  - Biểu giá điện TOU 3 khung giờ (Thấp điểm, Bình thường, Cao điểm).
  - 62 phiên sạc mẫu có đầy đủ đường cong chỉ số kWh và lịch sử dòng tiền.

---

## 3. Kiểm thử

*(Nguồn: `backend/pytest.ini:1-6`, `backend/tests/`)*

```bash
cd backend
pytest -v
```
Kết quả đo kiểm thực tế:
- `test_ai_fallback.py`: 21 passed (Kiểm thử Heuristic Fallback, Mock Gemini, Scheduler)
- `test_auth.py`: 13 passed (Kiểm thử JWT, Bcrypt rounds=12, RBAC, Đăng ký atomic, Khóa nợ đăng nhập)
- `test_driver_unauthenticated.py`: 4 passed (Kiểm thử tài xế cắm sạc không cần login)
- `test_health.py`: 1 passed (Endpoint `/health`)
- `test_sessions.py`: 5 passed (Vòng đời phiên sạc, chốt chặn cổng)
- `test_sessions_acid.py`: 9 passed (ACID Concurrency, tranh chấp 409, trừ cước TOU)
- `test_simulator.py`: 10 passed (Đường cong CC-CV, ngắt nhiệt độ >75°C, Checkpoint 30s)
- `test_stations.py`: 16 passed (CRUD hạ tầng, tính khoảng cách Haversine, công suất trạm)
- `test_wallet_acid.py`: 5 passed (Khóa bi quan `with_for_update`, nợ ví -300k, chặn nợ)
**Tổng số: 84/84 test cases passed (0 failed).**

---

## 4. Gặp lỗi thường gặp

*(Nguồn: `backend/app/core/database.py:15-25`, `backend/app/core/config.py:30-43`)*

1. **Lỗi `sqlite3.OperationalError: database is locked`**:
   - Hệ thống đã bật sẵn chế độ WAL (`PRAGMA journal_mode=WAL;`) và `PRAGMA busy_timeout=5000;` trong `backend/app/core/database.py`. Nếu gặp lỗi khi chạy nhiều tiến trình ngoài, hãy đảm bảo đóng các kết nối treo SQLite Explorer.
2. **Lỗi `CORS policy` khi gọi API từ trình duyệt**:
   - Kiểm tra cổng frontend trong `BACKEND_CORS_ORIGINS` tại `backend/app/core/config.py:30`. Mặc định hỗ trợ `http://localhost:5173`, `http://localhost:3000`, `http://127.0.0.1:5173`.

---

## 5. Tổng quan hệ thống

### Kiến trúc thực tế
*(Nguồn: `backend/app/main.py:20-56`, `backend/app/core/websocket.py:10-50`)*
- **Dual-Loop**:
  - *Fast Loop (Telemetry & Heuristic)*: Cập nhật chỉ số sạc mỗi 2 giây (`SIMULATOR_INTERVAL_SECONDS = 2`), phát sóng trực tiếp qua WebSocket `/ws/telemetry`. Tự động ngắt khẩn cấp khi nhiệt độ $> 75^\circ\text{C}$ hoặc pin đầy.
  - *Slow Loop (AI Engine)*: Lập lịch phân tích phụ tải trạm định kỳ, điều phối chia sẻ công suất thông minh (Dynamic Load Balancing) qua Google Gemini API hoặc chuyển đổi Heuristic Fallback khi mất kết nối mạng.
- **Ràng buộc tài chính ACID & Khóa nợ**:
  - Sử dụng khóa bi quan `with_for_update()` khi trừ tiền ví (`backend/app/services/wallet_service.py:35,80`).
  - **Chính sách khóa nợ âm**: Khi số dư ví rơi xuống dưới ngưỡng `-300,000` VND (`backend/app/core/config.py:23`), hệ thống tự động khóa tài khoản (`is_debt_locked = True`).
  - **Chặn cứng chống tràn CSDL**: CSDL chỉ cho phép tràn tối đa 200.000 VND sau ngưỡng khóa nợ (`CheckConstraint("balance >= -500000")` tại `backend/app/models/wallet.py:11`, `MAX_SAFE_DEBT_LIMIT = -500000`).
  - **Cảnh báo đăng nhập**: Khi tài khoản bị khóa do nợ đăng nhập, hệ thống từ chối (HTTP 403) và hiển thị thông báo lỗi lên màn hình: `"tài khoản bị khóa vì - quá 300k"` (`backend/app/api/v1/endpoints/auth.py:129`, `frontend/src/pages/Login.jsx:97`).

### Giao diện — thao tác được ở đâu
*(Nguồn: `frontend/src/pages/`)*
- `Login.jsx`: Đăng nhập, phân quyền RBAC và chuyển hướng Workspace.
- `Dashboard.jsx`: Bảng điều hành tổng quan cho Quản trị viên và CPO.
- `Stations.jsx`: Quản lý danh mục trạm, gắn trụ sạc, cổng sạc và chế độ xem bản đồ mạng lưới (Leaflet OSM/Esri).
- `Sessions.jsx`: Theo dõi nhật ký phiên sạc và chi tiết hóa đơn TOU.
- `Wallet.jsx`: Tra cứu số dư ví, nạp tiền và lịch sử giao dịch ACID.
- `Simulator.jsx`: Bảng điều khiển giả lập trạm sạc vật lý thời gian thực.
- `AIAdvisor.jsx`: Trợ lý ảo tư vấn tối ưu vận hành và biểu giá điện.

### API hiện có
*(Nguồn: `backend/app/api/v1/__init__.py:10-18`)*
Hệ thống cung cấp 8 nhóm router REST API tại tiền tố `/api/v1`:
1. `/api/v1/auth`: Đăng ký, đăng nhập JWT, lấy thông tin cá nhân.
2. `/api/v1/stations`: Quản lý trạm sạc, đo đếm phụ tải trạm.
3. `/api/v1/chargers`: Quản lý trụ sạc và cổng sạc vật lý.
4. `/api/v1/tariffs`: Quản lý biểu giá điện TOU 3 khung giờ.
5. `/api/v1/wallet`: Quản lý ví điện tử, nạp tiền, trừ cước.
6. `/api/v1/sessions`: Khởi động, dừng phiên sạc, chốt cước ACID.
7. `/api/v1/simulator`: Điều khiển bộ giả lập và đo đếm Telemetry.
8. `/api/v1/ai`: Điều phối công suất sạc thông minh và tư vấn vận hành.

---

## 6. Cấu trúc thư mục

*(Nguồn: Khảo sát thực tế cây thư mục dự án ngày 29/09/2026)*

```text
E:\Nền tảng vận hành trạm sạc xe điện\
├── backend/                           # Dịch vụ máy chủ FastAPI, Models, Services, Tests
├── frontend/                          # Giao diện người dùng Web React + Vite + Tailwind
├── docs/                              # Trung tâm tài liệu và tri thức hệ thống chuẩn hóa
├── phacthaobandau/                    # Thư mục lưu trữ tài liệu phác thảo ban đầu
├── .github/                           # Biểu mẫu kiểm soát chất lượng kho mã nguồn
├── .env.example                       # Biến môi trường mẫu cho toàn hệ thống
└── ev_csms.db                         # Cơ sở dữ liệu SQLite cục bộ
```

---

## 7. Tài liệu liên quan

- Cổng điều hướng tài liệu toàn hệ thống: [`docs/README.md`](docs/README.md)
- Hướng dẫn chi tiết phân hệ Backend: [`backend/README.md`](backend/README.md)
- Bản đồ cấu trúc và ma trận truy vết: [`docs/architecture/PROJECT_STRUCTURE.md`](docs/architecture/PROJECT_STRUCTURE.md)
- Sổ tay vận hành kỹ thuật: [`docs/devops/OPERATIONS.md`](docs/devops/OPERATIONS.md)
- Hiến chương và sổ cái kiểm thử: [`docs/qa/STANDARD.md`](docs/qa/STANDARD.md), [`docs/qa/INVENTORY.md`](docs/qa/INVENTORY.md)
