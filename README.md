# EV CSMS — Hệ thống quản lý vận hành trạm sạc xe điện

> **Nguồn xác thực chính**: Mã nguồn thực tế `backend/app/core/config.py`, `backend/app/main.py`, `backend/seed_data.py`, `frontend/package.json` và kết quả thực thi kiểm thử `pytest`.  
> **Phạm vi**: Quản lý mạng lưới trạm/trụ sạc, phiên sạc, ví và biểu giá; giao tiếp OCPP 1.6J; giám sát telemetry thời gian thực; hỗ trợ điều phối công suất.

---

## Trạng thái nhanh

- **Backend**: Python 3.12+ / FastAPI, SQLAlchemy ORM, SQLite WAL mode (`sqlite:///./ev_csms.db`). *(Nguồn: `backend/app/core/config.py`)*
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts. *(Nguồn: `frontend/package.json`)*
- **Kiểm thử tự động**: Backend full suite trong Docker gần nhất đạt **451 passed, 307 warnings**. Lỗi khởi động Compose do SQLite volume cũ thiếu cột khóa đối soát đã được sửa và backend healthy trở lại.
- **Chức năng OCPP**: Bao gồm MeterValues, chống số đo lùi/trùng, khôi phục phiên khi reconnect, RemoteStart/RemoteStop và audit log giới hạn theo quyền sở hữu trạm.
- **Kiến trúc dữ liệu**: SQLAlchemy khai báo 18 bảng; các bảng kỹ thuật gồm `ocpp_messages`, `id_tags`, `meter_values`, `remote_start_requests`, `audit_logs` và `session_billing_segments`. Bảng mới giữ nguyên giá/kWh và thành tiền của từng đoạn phiên. *(Nguồn: `backend/app/models/`)*
- **Migration Alembic**: `backend/alembic.ini` trỏ tới `backend/alembic/`; `alembic heads` ngày 10/10/2026 xác nhận head duy nhất `f41a0b7c9d22`. Đã kiểm tra toàn chuỗi migration và trigger trên PostgreSQL tạm; DB dự án không bị migrate.
- **Biểu giá và billing S-28**: `billing.py` gom bốn điểm tính tiền phiên; phí chiếm trụ chỉ tính khi billing đã biết cả mốc bắt đầu và `Available`, chịu trần `IDLE_FEE_MAX_MINUTES` (mặc định 240). Nếu `Available` đến muộn, không sửa hóa đơn/sổ cái hoặc tự trừ ví lần hai; mentor cần xác nhận cơ chế quyết toán phí bổ sung.
- **Sổ cái ví S-41**: Nạp/trừ được ghi qua một hàm append-only; job đối soát chạy mỗi `RECONCILE_INTERVAL_MINUTES` (mặc định 15) và khóa ví lệch. Compose mặc định dùng SQLite và tự bổ sung schema còn thiếu trên volume cũ; không backfill ví legacy.
- **Realtime theo dõi phiên**: ActiveSession nhận dữ liệu qua WebSocket singleton dùng cùng-origin `/ws/telemetry` và ánh xạ tên trường backend (`energy_kwh`, `cost_estimate`, `soc`, `temp_c`) sang giao diện. Đã có test frontend cho mapper và smoke WebSocket runtime `CONNECTED/SUBSCRIBED/PONG`; chưa kiểm tra trực quan qua trình duyệt.
- **Mô phỏng RemoteStart/RemoteStop**: mặc định tắt (`ALLOW_REMOTE_START_SIMULATION=false`); khi được chủ động bật, chỉ ADMIN dùng được ngoài pytest. `TESTING` mặc định false và không được bật trong triển khai.
- **Docker & CI/CD**: `docker-compose.yml` chạy stack Backend, Frontend, PostgreSQL và simulator 20 trụ dùng chung cho Sprint 1–4. CI cấu hình tại `.github/workflows/`.

---

## 1. Chạy dự án

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

### Cách 2: Khởi chạy toàn bộ hệ thống bằng Docker Compose

Mở terminal tại thư mục gốc. Compose tự nhận `docker-compose.yml`; tên project dùng chung `ev-csms` cho toàn bộ Sprint 1–4. Hai volume dữ liệu phát triển hiện có vẫn được giữ nguyên.

```powershell
docker compose up -d --build
docker compose ps
```

- Giao diện: `http://localhost:8080`
- API Swagger: `http://localhost:8001/docs`
- Backend, frontend, PostgreSQL và 20 trụ OCPP ảo dùng chung một cấu hình cho toàn bộ code Sprint 1–4.
- Tài khoản demo được khởi tạo an toàn khi backend Compose phát triển khởi động.
- Dừng và giữ dữ liệu: `docker compose down` (không thêm `-v`).

Có thể dùng `py run.py` để build và chạy stack; xem trạng thái bằng `py run.py ps`, xem log bằng `py run.py logs`, và dừng an toàn bằng `py run.py down`.

---

## 2. Dùng thử hệ thống

### Tài khoản demo (có sau khi chạy Compose phát triển)
*(Nguồn: `backend/app/services/demo_account_service.py` và `frontend/src/config/roleConfig.js`)*

| Vai trò (Role) | Tên đăng nhập | Email | Mật khẩu mặc định | Chức năng chính |
| :--- | :--- | :--- | :--- | :--- |
| **Quản trị viên (ADMIN)** | `admin` | `admin@evcsms.vn` | `12345678a` | Quản trị toàn hệ thống |
| **Quản trị viên dự phòng (ADMIN)** | `admin2` | `admin2@evcsms.vn` | `AdminPass123` | Quản trị viên dự phòng hệ thống |
| **Chủ trạm (OPERATOR)** | `operator` | `operator@evcsms.vn` | `OpPass123` | Quản lý trạm của Chủ B |
| **Chủ trạm VinFast (OPERATOR)** | `operator_a` | `cpo_vinfast@evcsms.vn` | `OpPass123` | Quản lý trạm của Chủ A |
| **Kế toán (ACCOUNTANT)** | `accountant` | `accountant@evcsms.vn` | `AccPass123` | Đối soát doanh thu và nhật ký |
| **Tài xế chuẩn (CUSTOMER)** | `customer_user` | `driver1@gmail.com` | `CusPass123` | Tài khoản tài xế mẫu |
| **Tài xế VIP (CUSTOMER)** | `driver_vip` | `driver_vip@gmail.com` | `DriverPass123` | Tài xế số dư lớn |
| **Tài xế nợ (CUSTOMER)** | `driver_debt` | `driver_debt@gmail.com` | `DriverPass123` | Ví bị khóa nợ; đăng nhập bị từ chối theo quy tắc nghiệp vụ |

Compose đồng bộ các tài khoản demo, ví còn thiếu và thẻ OCPP cho tài xế mà không xóa dữ liệu khác. Tài khoản `driver_debt` bị chặn đăng nhập có chủ đích vì ví demo đang khóa nợ.

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
**Lượt full suite hoàn chỉnh gần nhất trong Docker (10/10/2026, code commit `9ceae53`):** `451 passed, 307 warnings` trong container Python 3.12. Migration S-41 đã được kiểm tra upgrade/downgrade/upgrade trên PostgreSQL tạm; trigger chặn UPDATE/DELETE. Compose khởi động backend, PostgreSQL, frontend và OCPP simulator; backend healthcheck và `/docs` đều đạt. DB dự án không bị migrate hoặc backfill. Frontend lần kiểm chứng trước đạt 39 passed/build; chưa kiểm tra UI trực quan trên trình duyệt.

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
- **Docker Compose**: Stack chung chạy backend, frontend Nginx proxy, PostgreSQL và simulator OCPP 20 trụ; giao diện ở cổng host `8080`, API ở `8001`, PostgreSQL ở `5433`. Dữ liệu gắn với named volume để giữ lại khi dừng container.
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
Hệ thống cung cấp 9 nhóm router REST API tại tiền tố `/api/v1`:
1. `/api/v1/auth`: Đăng ký, đăng nhập JWT, lấy thông tin cá nhân.
2. `/api/v1/stations`: Quản lý trạm sạc, đo đếm phụ tải trạm.
3. `/api/v1/chargers`: Quản lý trụ sạc và cổng sạc vật lý.
4. `/api/v1/tariffs`: Quản lý biểu giá điện TOU 3 khung giờ.
5. `/api/v1/wallet`: Quản lý ví điện tử, nạp tiền, trừ cước.
6. `/api/v1/sessions`: Khởi động, dừng phiên sạc, chốt cước ACID.
7. `/api/v1/simulator`: Điều khiển bộ giả lập và đo đếm Telemetry.
8. `/api/v1/ai`: Điều phối công suất sạc thông minh và tư vấn vận hành.
9. `/api/v1/audit-logs`: Tra cứu nhật ký thao tác; Operator chỉ xem bản ghi của trạm mình quản lý.

### Giao tiếp trụ sạc OCPP 1.6J

* Trụ đã đăng ký kết nối qua WebSocket `/ocpp/{charge_point_code}` và thương lượng subprotocol `ocpp1.6`.
* `BootNotification` lưu thông tin trụ; trạm không hoạt động nhận `Rejected`, trạm hoạt động nhận `Accepted` cùng heartbeat interval từ `HEARTBEAT_INTERVAL_SECONDS`.
* `Authorize` tra `id_tags`: kiểm tra trạng thái thẻ, thời hạn và trạng thái hoạt động của trạm trước khi trả `Accepted`, `Blocked`, `Expired` hoặc `Invalid`.
* `MeterValues` chỉ lưu `Energy.Active.Import.Register` theo phiên `CHARGING`, giữ nguyên đơn vị OCPP; nếu không tìm thấy phiên thì ghi payload vào `orphan_messages`. Gateway gửi CALLRESULT trước thao tác DB.
* MeterValues bỏ qua mẫu có timestamp cũ và ghi cảnh báo, bỏ qua mẫu trùng timestamp+value im lặng. Counter thấp hơn tại timestamp mới vẫn được lưu và bật `charging_sessions.needs_review`; cùng timestamp nhưng value khác được lưu để đối soát.
* Sau reconnect, `StatusNotification(Charging)` giữ phiên CHARGING đã lưu; StartTransaction gửi lại với cùng thẻ và meterStart nhận lại transactionId cũ. MeterValues gắn theo transactionId DB; StopTransaction đóng phiên ngay cả khi trụ đã offline và dùng timestamp trong tin nhắn.
* API `GET /api/v1/sessions/current` trả phiên sạc hiện tại cùng số đo mới nhất; `POST /api/v1/sessions/remote-start` gửi lệnh RemoteStartTransaction và có endpoint tra trạng thái yêu cầu.
* RemoteStopTransaction chờ StopTransaction thật từ trụ để chốt phiên; trường hợp trụ nhận lệnh nhưng không gửi StopTransaction sẽ đánh dấu phiên cần xem xét.
* Nhật ký thao tác được ghi append-only; quyền Operator bị giới hạn theo trạm sở hữu.
* Job APScheduler kiểm tra phiên CHARGING mỗi phút. Nếu `last_seen_at` quá `ABNORMAL_SESSION_THRESHOLD_SECONDS` (mặc định 500 giây), job gắn cờ `is_abnormal` và ghi lý do; không tự đóng phiên.
* Admin/Operator gọi `POST /api/v1/chargers/{code}/reset` với `Soft` hoặc `Hard`; offline trả 409, hết thời gian chờ trả 504. Dispatcher ghép phản hồi CALLRESULT/CALLERROR theo message ID và dùng lại được cho các action máy chủ gửi xuống sau này.
* Seed demo tạo mã thẻ active `DEMO-<USERNAME>` cho mỗi tài khoản tài xế role `CUSTOMER`.
* CALL lặp được nhận diện bằng khóa trong bảng `ocpp_messages`; cùng message ID phát lại phản hồi đã lưu, kể cả khi kết nối/session CSDL được tạo mới. Bản ghi cũ hơn 7 ngày được scheduler hiện có dọn mỗi ngày.
* Kênh OCPP trụ sạc ↔ CSMS độc lập với `/ws/telemetry`, vốn phục vụ dashboard.

---

## 6. Cấu trúc thư mục

*(Nguồn: Khảo sát thực tế cây thư mục dự án ngày 29/09/2026)*

```text
My-Software-Team/
├── backend/                           # Dịch vụ máy chủ FastAPI, Models, Services, Tests
├── frontend/                          # Giao diện người dùng Web React + Vite + Tailwind
├── docs/                              # Trung tâm tài liệu và tri thức hệ thống chuẩn hóa
├── tools/ocpp-spike/                  # Simulator OCPP và kịch bản kiểm thử tích hợp
├── .github/                           # Biểu mẫu kiểm soát chất lượng kho mã nguồn
├── .env.example                       # Biến môi trường mẫu cho toàn hệ thống
└── docker-compose.yml                # Stack phát triển Backend, Frontend và simulator
```

---

## 7. Tài liệu liên quan

- Cổng điều hướng tài liệu toàn hệ thống: [`docs/README.md`](docs/README.md)
- Bản đồ các khu vực mã nguồn: [`docs/codebase-map.md`](docs/codebase-map.md)
- Hướng dẫn chi tiết phân hệ Backend: [`backend/README.md`](backend/README.md)
- Bản đồ cấu trúc và ma trận truy vết: [`docs/architecture/PROJECT_STRUCTURE.md`](docs/architecture/PROJECT_STRUCTURE.md)
- Sổ tay vận hành kỹ thuật: [`docs/devops/OPERATIONS.md`](docs/devops/OPERATIONS.md)
- Hiến chương và sổ cái kiểm thử: [`docs/qa/STANDARD.md`](docs/qa/STANDARD.md), [`docs/qa/INVENTORY.md`](docs/qa/INVENTORY.md)
- Hồ sơ nghiệm thu OCPP S-07: [`docs/qa/stories/S-07.md`](docs/qa/stories/S-07.md)
- Hồ sơ nghiệm thu BootNotification S-08: [`docs/qa/stories/S-08.md`](docs/qa/stories/S-08.md)
- Hồ sơ nghiệm thu Authorize/idTag S-15: [`docs/qa/stories/S-15.md`](docs/qa/stories/S-15.md)
- Hồ sơ nghiệm thu dispatcher/Reset OCPP S-16: [`docs/qa/stories/S-16.md`](docs/qa/stories/S-16.md)
- Hồ sơ backend biểu giá/phí chiếm trụ S-28: [`docs/qa/stories/S-28.md`](docs/qa/stories/S-28.md)
- Hồ sơ Backend hóa đơn theo đoạn giá S-33: [`docs/qa/stories/S-33.md`](docs/qa/stories/S-33.md)
