# CSMS — EV Charging Station Management System

> **Nguồn xác thực chính**: Mã nguồn thực tế `backend/app/core/config.py`, `backend/app/main.py`, `backend/seed_data.py`, `frontend/package.json` và kết quả thực thi kiểm thử `pytest`.  
> **Dấu vết tham khảo**: [nguồn tạm: nentang.md], [nguồn tạm: Prompt.md]

---

## Trạng thái nhanh

- **Backend**: Python 3.12+ / FastAPI, SQLAlchemy ORM, SQLite WAL mode (`sqlite:///./ev_csms.db`). *(Nguồn: `backend/app/core/config.py`)*
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts. *(Nguồn: `frontend/package.json`)*
- **Kiểm thử tự động**: Full backend suite đạt **263 passed, 1 skipped, 181 warnings** ngày 05/10/2026; bảy suite OCPP có 53 ca. Số liệu lịch sử 84/89/90 còn mâu thuẫn `[CẦN XÁC NHẬN]`.
- **Kiến trúc dữ liệu**: Các bảng kỹ thuật OCPP gồm `ocpp_messages` (idempotency), `id_tags` (ủy quyền thẻ) và `meter_values` (số đo điện năng theo phiên). *(Nguồn: `backend/app/models/`)*
- **Migration Alembic**: `backend/alembic.ini` trỏ tới nguồn duy nhất `backend/alembic/`; revision mới nhất trong cây là `339c5001fe7a`. DB dự án chưa được migrate.
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

### Cách 2: Khởi chạy môi trường Staging qua Docker Compose (NHỚ CÀI DOCKER DESKTOP)
*Link tải: https://docs.docker.com/desktop/setup/install/windows-install/*

*(Nguồn: `docker-compose.staging.yml`, `backend/Dockerfile`, `frontend/Dockerfile`)*

*Nhớ là chạy trên terminal/powershell ở thư mục project*

```bash
# Build image Backend và Frontend
docker compose -f docker-compose.staging.yml build

# Chỉ chạy một lần khi khởi tạo database Docker mới để tạo tài khoản và dữ liệu demo
docker compose -f docker-compose.staging.yml run --rm --no-deps backend python seed_data.py

# Khởi chạy toàn bộ cụm dịch vụ Backend & Frontend (Nginx reverse proxy)
docker compose -f docker-compose.staging.yml up -d

# Kiểm tra trạng thái và logs
docker compose -f docker-compose.staging.yml logs -f

# Để tắt dự án và dọn container/network nhưng giữ database, chạy
docker compose -f docker-compose.staging.yml down

# Muốn chỉ dừng container để bật lại nhanh sau đó
docker compose -f docker-compose.staging.yml stop

# Muốn chạy lại thì
docker compose -f docker-compose.staging.yml up -d --build
```

> [!WARNING]
> `backend/seed_data.py` xóa và tạo lại toàn bộ bảng trước khi nạp dữ liệu. Chỉ chạy trên database mới/trống; nếu database đã có dữ liệu cần giữ, hãy sao lưu trước. Không chạy lại lệnh seed mỗi lần khởi động dự án.

- Giao diện người dùng Staging: `http://localhost` (cổng 80)
- API Backend Staging: `http://localhost:8000` (hoặc qua proxy `http://localhost/api/v1`)

### Cách 3: Khởi chạy Backend và Frontend cùng lúc bằng Python (Local Dev)

Cách này chạy trực tiếp trên máy, không cần Docker Desktop. Yêu cầu Python 3.12+ và Node.js/npm; mở PowerShell tại thư mục gốc dự án. Cài dependencies một lần:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm --prefix frontend install
```

Nếu cần tài khoản demo, nạp dữ liệu một lần vào database local. Lệnh này xóa và tạo lại database; hãy sao lưu `backend\ev_csms.db` trước khi chạy nếu file đã có dữ liệu:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe seed_data.py
Pop-Location
```

Khởi chạy cả Backend và Frontend trong cùng terminal:

```powershell
.\.venv\Scripts\python.exe run.py
```

- Frontend: `http://localhost:5173`
- Backend Swagger UI: `http://localhost:8000/docs`
- Nhấn `Ctrl+C` để dừng cả hai dịch vụ.
- `run.py` không tự cài dependencies hoặc nạp lại dữ liệu demo.

---

## 2. Dùng thử hệ thống

### Tài khoản demo (có sau khi nạp dữ liệu bằng `backend/seed_data.py`)
*(Nguồn: `backend/seed_data.py:44-95`)*

| Vai trò (Role) | Tên đăng nhập | Email | Mật khẩu mặc định | Chức năng chính |
| :--- | :--- | :--- | :--- | :--- |
| **Quản trị viên (ADMIN)** | `admin` | `admin@evcsms.vn` | `12345678a` | Quản trị toàn hệ thống, cấu hình tham số, giám sát tải busbar |
| **Quản trị viên dự phòng (ADMIN)** | `admin2` | `admin2@evcsms.vn` | `AdminPass123` | Quản trị viên dự phòng hệ thống |
| **Chủ trạm (OPERATOR)** | `operator` | `operator@evcsms.vn` | `OpPass123` | Quản lý trạm sạc, trụ sạc, cổng sạc, xem telemetry, AI Advisor |
| **Chủ trạm VinFast** | `operator_a` | `cpo_vinfast@evcsms.vn` | `OpPass123` | Quản trị mạng lưới trạm sạc khu vực |
| **Tài xế chuẩn (CUSTOMER)** | `customer_user` | `driver1@gmail.com` | `CusPass123` | Xem ví điện tử, nạp tiền, theo dõi phiên sạc trực tiếp |
| **Tài xế VIP (CUSTOMER)** | `driver_vip` | `driver_vip@gmail.com` | `DriverPass123` | Tài xế số dư lớn, sạc xe VF9 |
| **Tài xế nợ (CUSTOMER)** | `driver_debt` | `driver_debt@gmail.com` | `DriverPass123` | Tài khoản mô phỏng trường hợp nợ âm ví quá hạn mức |

Seed tạo một thẻ OCPP active cho mỗi tài khoản tài xế role `CUSTOMER`, theo mẫu `DEMO-<USERNAME>`.

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
- Khi được chạy chủ động, script `backend/seed_data.py` tái tạo bảng và nạp:
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

Chạy riêng kiểm thử bộ khung OCPP 1.6J:

```bash
py -m pytest --noconftest -p no:cacheprovider tests/test_ocpp_frames.py
```

Kết quả đo kiểm backend dưới đây là baseline đã ghi nhận trước khi thêm suite OCPP, không đại diện cho lần hồi quy hiện tại:
- `test_ai_fallback.py`: 21 passed (Kiểm thử Heuristic Fallback, Mock Gemini, Scheduler)
- `test_auth.py`: 13 passed (Kiểm thử JWT, Bcrypt rounds=12, RBAC, Đăng ký atomic, Khóa nợ đăng nhập)
- `test_driver_unauthenticated.py`: 4 passed (Kiểm thử tài xế cắm sạc không cần login)
- `test_health.py`: 1 passed (Endpoint `/health`)
- `test_sessions.py`: 5 passed (Vòng đời phiên sạc, chốt chặn cổng)
- `test_sessions_acid.py`: 9 passed (ACID Concurrency, tranh chấp 409, trừ cước TOU)
- `test_simulator.py`: 10 passed (Đường cong CC-CV, ngắt nhiệt độ >75°C, Checkpoint 30s)
- `test_stations.py`: 16 passed (CRUD hạ tầng, tính khoảng cách Haversine, công suất trạm)
- `test_wallet_acid.py`: 5 passed (Khóa bi quan `with_for_update`, nợ ví -300k, chặn nợ)
**Baseline trước OCPP:** các tài liệu ghi tổng khác nhau (84 ca ở danh sách suite này, 89 trong README/QA Inventory, 90 trong Sprint Status) `[CẦN XÁC NHẬN]`. Các checkpoint sau S-16 đạt 163 passed, 1 warning với 43 test OCPP (01/10/2026); full backend gần nhất sau T-42/T-43 đạt 263 passed, 1 skipped, 181 warnings với 53 test OCPP (05/10/2026).

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

### Giao tiếp trụ sạc OCPP 1.6J

* Trụ đã đăng ký kết nối qua WebSocket `/ocpp/{charge_point_code}` và thương lượng subprotocol `ocpp1.6`.
* `BootNotification` lưu thông tin trụ; trạm không hoạt động nhận `Rejected`, trạm hoạt động nhận `Accepted` cùng heartbeat interval từ `HEARTBEAT_INTERVAL_SECONDS`.
* `Authorize` tra `id_tags`: kiểm tra trạng thái thẻ, thời hạn và trạng thái hoạt động của trạm trước khi trả `Accepted`, `Blocked`, `Expired` hoặc `Invalid`.
* `MeterValues` chỉ lưu `Energy.Active.Import.Register` theo phiên `CHARGING`, giữ nguyên đơn vị OCPP; nếu không tìm thấy phiên thì ghi payload vào `orphan_messages`. Gateway gửi CALLRESULT trước thao tác DB.
* MeterValues bỏ qua mẫu có timestamp cũ và ghi cảnh báo, bỏ qua mẫu trùng timestamp+value im lặng. Counter thấp hơn tại timestamp mới vẫn được lưu và bật `charging_sessions.needs_review`; cùng timestamp nhưng value khác được lưu để đối soát.
* Admin/Operator gọi `POST /api/v1/chargers/{code}/reset` với `Soft` hoặc `Hard`; offline trả 409, hết thời gian chờ trả 504. Dispatcher ghép phản hồi CALLRESULT/CALLERROR theo message ID và dùng lại được cho các action máy chủ gửi xuống sau này.
* Seed demo tạo mã thẻ active `DEMO-<USERNAME>` cho mỗi tài khoản tài xế role `CUSTOMER`.
* CALL lặp được nhận diện bằng khóa trong bảng `ocpp_messages`; cùng message ID phát lại phản hồi đã lưu, kể cả khi kết nối/session CSDL được tạo mới. Bản ghi cũ hơn 7 ngày được scheduler hiện có dọn mỗi ngày.
* Kênh OCPP trụ sạc ↔ CSMS độc lập với `/ws/telemetry`, vốn phục vụ dashboard.

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
- Hồ sơ nghiệm thu OCPP S-07: [`docs/qa/stories/S-07.md`](docs/qa/stories/S-07.md)
- Hồ sơ nghiệm thu BootNotification S-08: [`docs/qa/stories/S-08.md`](docs/qa/stories/S-08.md)
- Hồ sơ nghiệm thu Authorize/idTag S-15: [`docs/qa/stories/S-15.md`](docs/qa/stories/S-15.md)
- Hồ sơ nghiệm thu dispatcher/Reset OCPP S-16: [`docs/qa/stories/S-16.md`](docs/qa/stories/S-16.md)
