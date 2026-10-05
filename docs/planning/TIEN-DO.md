# NHẬT KÝ TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS TRACKER)
## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

---

### QUY ĐỊNH VỀ RANH GIỚI TÀI LIỆU
- **`docs/plans/` (Kế hoạch & Nhiệm vụ)**: Chứa 11 file kế hoạch độc lập (`Buoc-01-...md` đến `Buoc-11-...md`) và file nhật ký tiến độ này. Đây là tài liệu điều phối quá trình phát triển (Internal Execution Plans).
- **`docs/SDLC/` (Sản phẩm bàn giao - Deliverables)**: Chứa toàn bộ hồ sơ kỹ thuật, báo cáo, thiết kế dùng để nộp bài và chấm điểm theo 4 mốc bài tập cá nhân (`KT1/`, `KT2/`, `KT3/`, `final/`).

---

### BẢNG THEO DÕI TIẾN ĐỘ CHUẨN (PROGRESS MATRIX)

> **Hướng dẫn cập nhật:**
> - Định dạng ngày: `YYYY-MM-DD`
> - Quy ước trạng thái: `Chưa bắt đầu` | `Đang thực hiện` | `Hoàn thành` | `Cần xem xét`
> - Sau khi thực hiện xong bước nào, cập nhật đúng dòng tương ứng dưới đây, không tự ý thay đổi cấu trúc bảng.

| Ngày cập nhật | Mã bước | Tên bước thực hiện | Trạng thái | Sản phẩm bàn giao (Deliverables) đã sinh | Ghi chú / Đánh giá |
| :---: | :---: | :--- | :---: | :--- | :--- |
| 2026-09-22 | Bước 01 | Đặc tả Yêu cầu & Phân tích Nghiệp vụ Trạm sạc | Đang thực hiện | `nentang.md`, `Prompt.md`, `sodo.md`, `phân công.md`, `test.md`, `huongdanfix.md` | Đã xong đặc tả & kiến trúc 2 vòng lặp; còn thiếu file nộp mốc KT1: `01_SRS_and_UseCases.md` |
| 2026-09-22 | Bước 02 | Thiết kế CSDL & Sơ đồ ERD Chuẩn EV CSMS | Chưa bắt đầu | `docs/SDLC/KT1/02_Database_Design_ERD.md` | Thiết kế bảng Station, Charger, Session, Wallet, Tariff |
| 2026-09-22 | Bước 03 | Cấu hình Môi trường, Docker & CSDL | Đang thực hiện | `docker-compose.yml` (Postgres local) | Đã có container DB cục bộ; Còn thiếu: đổi tên DB `ev_csms_db`, `.env.example`, `backend/requirements.txt` |
| 2026-09-22 | Bước 04 | Cấu trúc Backend, Session & WebSocket Manager | Chưa bắt đầu | `backend/app/main.py`, `core/database.py`, `core/websocket.py` | Scaffold phân tầng API, CORS, quản lý kết nối realtime |
| 2026-09-22 | Bước 05 | Xác thực, Đăng nhập & Phân quyền RBAC | Chưa bắt đầu | `backend/app/api/v1/endpoints/auth.py`, `core/security.py` | JWT, phân quyền Admin, CPO/Operator, Driver/Customer |
| 2026-09-22 | Bước 06 | Module Quản lý Hạ tầng Trạm, Trụ & Cổng sạc | Chưa bắt đầu | `backend/app/models/station.py`, `api/v1/endpoints/stations.py` | CRUD Trạm, Trụ sạc (EVSE), Cổng (CCS2, Type 2) |
| 2026-09-22 | Bước 07 | Module Biểu giá, Ví điện tử & Phiên sạc (ACID) | Chưa bắt đầu | `backend/app/services/session_service.py`, `wallet_service.py` | Quản lý TOU Tariff, trừ tiền ví ACID, khóa cổng sạc |
| 2026-09-22 | Bước 08 | Module Giả lập Trạm sạc (Simulator & Telemetry) | Chưa bắt đầu | `backend/app/simulator/charging_simulator.py` | Giả lập đường cong sạc xe điện, phát WebSocket realtime |
| 2026-09-22 | Bước 09 | Module AI: Điều phối tải, Bảo trì & Fallback | Chưa bắt đầu | `backend/app/services/ai_service.py`, `fallback_service.py` | Gemini Smart Charging, Predictive Maintenance & Heuristic |
| 2026-09-22 | Bước 10 | Xây dựng Frontend Web (React 19 + Tailwind + Charts) | Đang thực hiện | Khung `frontend/` (React 19 + Vite + Oxlint, `App.jsx` staging) | Đã chạy được khung local; Còn thiếu: Tailwind CSS, proxy `vite.config.js`, các trang nghiệp vụ |
| 2026-09-24 | (FE-Jira) Form Đăng nhập + Auth Flow + WebSocket Client | Đang thực hiện | `frontend/src/pages/LoginPage.jsx`, `LoginPage.css`, `services/authService.js`, `services/api.js`, `services/websocket.js`, `context/AuthContext.jsx`, `components/ProtectedRoute.jsx`, `App.jsx`, `vite.config.js` | **FE-Jira 100% Form Đăng nhập**. Email + password (icon ẩn/hiện mắt), validate regex email phía client, loading state disable nút, gọi `POST /api/auth/login` theo FastAPI chuẩn (`{access_token, token_type:"bearer", user}`), lưu JWT+user vào `localStorage`, parse lỗi `{detail:...}` 401 (sai MK) / 423 (tài khoản khóa 15 phút) / 429 (rate limit) hiển thị Toast `sonner`. Có `ProtectedRoute`. `SimulatorPage` + `websocket.js` thêm Heartbeat Ping 30s + auto-reconnect backoff 1s→15s, đèn báo 6 trạng thái (connected/reconnecting/disconnected…). Vite proxy `/api` + `/ws` → `localhost:8000`. Build PASS (`npm run build` 410ms), lint sạch lỗi, 1 warning Fast Refresh cosmetic. **Backend cần**: Bước 05 mở `POST /api/auth/login` + JWT + `WWW-Authenticate: Bearer` 401/423 để end-to-end. |
| 2026-09-24 | (FE-Jira) Thêm trang Đăng ký + fix input mất chữ + dọn scripts rác | Hoàn thành | `frontend/src/pages/RegisterPage.jsx`, `backend/app/schemas/auth.py`, `backend/app/api/auth.py`, `frontend/src/main.jsx` (import App.css), `frontend/src/pages/LoginPage.css`, `frontend/src/pages/LoginPage.jsx` | **Bug input mất chữ**: `.login-field input` không có `color` → kế thừa root token `var(--text)` (xám/trắng). Thêm `color:#0f172a; background:#ffffff; ::placeholder color:#94a3b8`. Import `App.css` vào `main.jsx` (file có sẵn `body{color:#0f172a}` và `.app-loading` nhưng chưa được import từ trước). **Endpoint `POST /auth/register`**: schema `RegisterRequest` (EmailStr, password ≥6, full_name required, phone optional) + endpoint gán role mặc định `driver` (tự tạo nếu chưa có), 201 Created + 409 Conflict email trùng, 422 EmailStr/Pydantic. **Trang `/register`**: full_name + email + SĐT (optional) + password + confirm + validate client, navigate về `/login` kèm `state.registeredEmail`. **LoginPage**: đọc `location.state.registeredEmail` để điền sẵn email sau đăng ký; sai MK → xóa trắng cả 2 ô. **Vite proxy**: đổi `localhost:8000` → `localhost:8001` (BE đổi port do socket zombie 8000). **Dọn scripts rác**: xóa 14 file trong `backend/scripts/` (test một lần, kill_port helper) + `__pycache__/`. **Test**: 48/51 pass — 3 fail auth schema cần fix phiên sau. Build PASS (`npm run build` 339ms). |
| 2026-09-22 | Bước 11 | Bộ Test Tự động (Pytest), Seed Data & Đóng gói | Chưa bắt đầu | `backend/tests/`, `backend/seed_data.py`, `docs/SDLC/...` | Test ACID ví tiền, test sạc, seed dữ liệu & kịch bản demo |
| 2026-10-01 | (Migration) Chuẩn hóa Alembic dùng một thư mục | Hoàn thành | `backend/alembic.ini`, `backend/alembic/`; xóa `backend/migrations/` | Theo yêu cầu người dùng; người thực hiện `KimiCoNY`. Commit code `6da406b` đã đẩy lên `origin/Duong`; cây có 9 revision, head `f2c9a6d81b40`; 117 test passed. |
| 2026-10-01 | T-14 | Bộ đọc/ghi khung OCPP 1.6J (CALL, CALLRESULT, CALLERROR) | Hoàn thành | `backend/app/ocpp/__init__.py`, `backend/app/ocpp/frames.py`, `docs/qa/stories/S-07.md` | 20 ca round-trip/lỗi khung; full backend suite ngày 2026-10-01 đạt 163 passed, 1 warning. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-15 | Kiểm thử khung OCPP hợp lệ và sai định dạng | Hoàn thành | `backend/tests/test_ocpp_frames.py`, `docs/qa/stories/S-07.md` | 20 test OCPP; full backend suite ngày 2026-10-01 đạt 163 passed, 1 warning. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-16 | Handler BootNotification lưu metadata trụ sạc | Hoàn thành | `backend/app/ocpp/handlers/boot_notification.py`, `backend/app/models/station.py`, `backend/alembic/versions/5e76bf9b9e5a_add_boot_notification_fields.py`, `docs/qa/stories/S-08.md` | 8 ca S-08; full backend suite ngày 2026-10-01 đạt 163 passed, 1 warning. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-17 | Gateway OCPP, trạng thái BootNotification và heartbeat cấu hình được | Hoàn thành | `backend/app/ocpp/gateway.py`, `backend/app/main.py`, `backend/app/core/config.py`, `backend/tests/test_boot_notification.py`, `docs/qa/stories/S-08.md` | Endpoint `/ocpp/{charge_point_code}` độc lập với telemetry; full backend suite ngày 2026-10-01 đạt 163 passed, 1 warning. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-30 | Lưu phản hồi CALL OCPP theo khóa duy nhất trong CSDL | Hoàn thành | `backend/app/models/ocpp_message.py`, `backend/app/ocpp/gateway.py`, `backend/alembic/versions/057c4ed34525_add_ocpp_message_idempotency.py` | CALL trùng phát lại response từ DB; message ID trùng nhưng action khác vẫn phát response cũ và ghi cảnh báo. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-31 | Dọn định kỳ bản ghi idempotency OCPP quá 7 ngày | Hoàn thành | `backend/app/services/scheduler_service.py`, `backend/tests/test_ocpp_idempotency.py` | Dùng APScheduler hiện có; 4 test idempotency gồm cleanup 7 ngày. Full backend suite ngày 2026-10-01 đạt 163 passed, 1 warning; commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-32 | Model và migration IdTag, seed thẻ cho tài khoản tài xế | Hoàn thành | `backend/app/models/id_tag.py`, `backend/seed_data.py`, `backend/alembic/versions/45ab6640633a_add_id_tags.py` | Tài xế trong RBAC hiện tại có role `CUSTOMER`; seed tạo một thẻ mẫu mỗi tài khoản. Migration kiểm tra tiến/lùi trên DB tạm; commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-33 | Authorize OCPP và kiểm tra quyền truy cập bằng idTag | Hoàn thành | `backend/app/ocpp/handlers/authorize.py`, `backend/app/ocpp/gateway.py`, `backend/tests/test_authorize.py`, `docs/qa/stories/S-15.md` | 5 ca trạng thái tham số hóa; log thẻ không tồn tại chỉ ghi tối đa 4 ký tự cuối. Full backend suite đạt 163 passed, 1 warning; commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-34 | Dispatcher dùng lại được để gửi CALL và ghép phản hồi OCPP | Hoàn thành | `backend/app/ocpp/dispatcher.py`, `backend/app/ocpp/gateway.py`, `backend/app/core/config.py` | UUID message ID và Future ghép CALLRESULT/CALLERROR; timeout mặc định cấu hình qua `OCPP_CALL_TIMEOUT_SECONDS`; CALL khác vẫn được xử lý khi chờ. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-01 | T-35 | API Reset trụ sạc giới hạn Admin/Operator | Hoàn thành | `backend/app/api/v1/endpoints/chargers.py`, `backend/tests/test_ocpp_reset.py`, `docs/qa/stories/S-16.md` | 5 test online, offline, timeout, CALLERROR và RBAC; full backend suite đạt 163 passed, 1 warning. Commit `6370865` đã push lên `origin/Duong`. |
| 2026-10-05 | T-40 | Model và migration lưu số đo điện năng theo phiên | Hoàn thành | `backend/app/models/meter_value.py`, `backend/alembic/versions/4a0a1107f87d_add_meter_values_table.py` | Có FK tới `charging_sessions`, chỉ mục `(session_id, recorded_at)`; migration tiến/lùi đã kiểm tra trên DB tạm tại head hiện tại. Chưa áp dụng DB dự án; upgrade toàn chuỗi từ DB trống vướng migration lịch sử tạo trùng `charging_points.last_seen_at`. Chưa commit. |
| 2026-10-05 | T-41 | Handler MeterValues lưu số đo điện năng và xác nhận sớm | Hoàn thành | `backend/app/ocpp/handlers/meter_values.py`, `backend/app/ocpp/gateway.py`, `backend/tests/test_meter_values.py` | 5 test; full suite 258 passed, 1 skipped, 181 warnings; Ruff sạch. CALLRESULT gửi trước truy vấn/lưu DB; không có phiên thì dùng `orphan_messages` hiện có. Chưa commit. |
| 2026-10-05 | T-42 | Loại bỏ số đo lùi/trùng trong transaction có khóa | Hoàn thành | `backend/app/ocpp/handlers/meter_values.py`, `backend/app/models/session.py`, `backend/alembic/versions/339c5001fe7a_add_session_needs_review_flag.py` | Khóa SQLite `BEGIN IMMEDIATE`, DB hỗ trợ row lock dùng `SELECT FOR UPDATE`; mẫu cũ bỏ qua/cảnh báo, trùng hoàn toàn bỏ qua, counter giảm ở timestamp mới bật `needs_review`. Migration tiến/lùi trên DB tạm. Chưa commit. |
| 2026-10-05 | T-43 | Kiểm thử số đo lùi, trùng, giảm counter và concurrency | Hoàn thành | `backend/tests/test_meter_values_dedup.py` | 5 test mới; suite MeterValues 10 passed; full backend 263 passed, 1 skipped, 181 warnings; Ruff sạch. Chưa commit. |
| 2026-10-05 | T-44 | Khôi phục phiên Charging sau reconnect theo dữ liệu DB | Hoàn thành | `backend/app/ocpp/handlers/status_notification.py`, `backend/app/ocpp/handlers/start_transaction.py`, `backend/app/ocpp/handlers/meter_values.py` | Status Charging đọc phiên CHARGING đã lưu; StartTransaction gửi lại với cùng thẻ/meterStart dùng lại transactionId hiện có; MeterValues khớp transactionId trong DB. Kịch bản reconnect 5 và 20 trụ đều đạt 3/3 vòng. Chưa commit. |
| 2026-10-05 | T-45 | Xử lý StopTransaction sau offline theo timestamp tin nhắn | Hoàn thành | `backend/app/ocpp/handlers/stop_transaction.py`, `backend/tests/integration/test_reconnect_scenario.py` | Tra transactionId trong phạm vi đúng trụ, đóng phiên kể cả khi trạng thái trụ Offline và lấy ended_at từ timestamp payload; kịch bản kiểm tra 5 kWh mỗi phiên. Chưa commit. |
| 2026-10-05 | T-46 | Kiểm thử tích hợp mất kết nối và khôi phục nhiều trụ | Hoàn thành | `backend/tests/integration/test_reconnect_scenario.py` | Ba vòng liên tiếp đạt với mặc định 5 trụ; cũng đạt khi cấu hình 20 trụ. Full backend: 264 passed, 1 skipped, 298 warnings; Ruff các file thay đổi sạch. Chưa commit. |
| 2026-10-05 | T-53 | Phát hiện và đánh dấu phiên sạc bất thường | Hoàn thành | `backend/app/models/session.py`, `backend/app/services/scheduler_service.py`, `backend/alembic/versions/c4ab19f2d7e1_add_abnormal_session_flags.py`, `backend/tests/test_abnormal_session_job.py` | Ngưỡng cấu hình mặc định 500 giây; job chạy mỗi phút, chỉ đặt `is_abnormal`/`abnormal_reason`, không đổi trạng thái phiên. 3 test mới đạt; full backend 267 passed, 1 skipped, 298 warnings; migration tiến/lùi/tiến đạt trên DB tạm. Commit `7af7b19` trên nhánh `Duong`. |

---

### NHẬT KÝ THỰC HIỆN CHI TIẾT THEO NGÀY & THÀNH VIÊN (EXECUTION LOG)

#### 1. Ngày 2026-09-22 (13:43 – 14:00) | Người thực hiện: `dtc245090028-ui`
* **Nhiệm vụ thực hiện:** Khởi tạo tài liệu nền tảng, kiến trúc hệ thống và phân bổ nhân sự (Commit `458e43c`, `d55489f`).
* **Nội dung thực hiện cụ thể:**
  - `Prompt.md`: Đặc tả hợp nhất hệ thống (3 Actor, 4 phân hệ, 3 bài toán AI, 2 rơ-le an toàn).
  - `sodo.md`: Sơ đồ kiến trúc tổng thể, 2 vòng lặp (Fast/Slow Loop), ma trận AI/Heuristic, luồng WebSocket Ticket Handshake, Multi-tenancy isolation.
  - `phân công.md`: Bảng ma trận phân công 6 thành viên (3 Backend + 3 Frontend).
  - `docs/MASTER-ROADMAP.md`, `GEMINI.md`, `CLAUDE.md`, `HUONGDAN.md`.
* **Đối chiếu với yêu cầu Plans:**
  - **Bước 01 (`Buoc-01`)**: **Đạt 90%**. Đầy đủ 100% đặc tả yêu cầu, use case và kiến trúc; chỉ còn thiếu bước xuất file nộp bài KT1 `docs/SDLC/KT1/01_SRS_and_UseCases.md`.

---

#### 2. Ngày 2026-09-22 (17:35) | Người thực hiện: Hiếu (`hieudz1235`)
* **Nhiệm vụ thực hiện:** Task S-01 – Tạo khung ứng dụng chạy máy cá nhân & Cấu hình Docker DB cục bộ (Commit `9c3a00e`, PR #1).
* **Nội dung thực hiện cụ thể:**
  - `frontend/package.json`: Khởi tạo khung Vite + React 19 (`"react": "^19.2.8"`, `"vite": "^8.3.0"`, `"oxlint": "^1.81.0"`).
  - `frontend/.oxlintrc.json`: Cấu hình linter Oxlint kiểm tra cú pháp nhanh.
  - `frontend/src/App.jsx`: Màn hình Staging sạch sẽ, dọn sạch code mẫu mặc định của Vite, gắn nhãn dự án EV CSMS.
  - `frontend/src/main.jsx`, `frontend/index.html`: Entry point cho ứng dụng React.
  - `docker-compose.yml`: Cấu hình container PostgreSQL 15 Alpine (`ev_charging_db`), port `5432:5432`, volume `postgres_data`.
  - `frontend/README.md`: Hướng dẫn chạy local (khởi động DB bằng Docker).
* **Đối chiếu với yêu cầu Plans:**
  - **Bước 10 (`Buoc-10`)**:
    - Xét theo phạm vi **Task S-01 (Khung ứng dụng chạy máy cá nhân)**: **Đạt 85%**. Khung chạy mượt qua `npm run dev`, build sạch, có linter. Còn thiếu: Tailwind CSS + PostCSS, proxy trong `vite.config.js`, hoàn thiện hướng dẫn `npm install` / `npm run dev` trong `README.md`.
    - Xét theo **toàn bộ Bước 10 (Giao diện Web hoàn chỉnh mốc KT3)**: **Đạt 25%** (mới hoàn thành phần móng khung, chưa có các trang và component nghiệp vụ).
  - **Bước 03 (`Buoc-03`)**: **Đạt 40%**. Đã có container PostgreSQL cục bộ chạy được ngay qua `docker compose up -d`. Còn thiếu: đổi tên DB thành `ev_csms_db`, file `.env.example`, và các container backend/frontend.

---

#### 3. Ngày 2026-09-22 (17:40) | Người thực hiện: Study332 (`Study332`)
* **Nhiệm vụ thực hiện:** Review và Merge Pull Request #1 từ branch `feature/S-01-khung-ung-dung-staging` vào `main` (Commit `99a2241`).
* **Nội dung thực hiện cụ thể:** Đưa toàn bộ mã nguồn khung ứng dụng và Docker của Hiếu vào nhánh chính `main`.
* **Đối chiếu với yêu cầu Plans:** Hoàn thành tích hợp mã nguồn vào nhánh chính. Tuy nhiên cần hoàn thiện khâu kiểm duyệt để nhắc nhở thành viên bổ sung Tailwind CSS và hoàn thiện README trước khi merge.

---

#### 4. Ngày 2026-09-22 (17:46) | Người thực hiện: Study332 (`Study332`)
* **Nhiệm vụ thực hiện:** Thiết lập CI/CD Pipeline tự động hóa trên GitHub Actions (Commit `bbc706f`).
* **Nội dung thực hiện cụ thể:**
  - `.github/workflows/main.yml`: Tự động checkout code, cài đặt Node 20, chạy `npm install` và `npm run build` cho `frontend` khi có push/PR vào `main`.
* **Đối chiếu với yêu cầu Plans:** **Đạt 35% hạ tầng CI/CD Staging**. Đã tự động hóa build được Frontend. Còn thiếu: thêm bước `npm run lint` cho frontend, cấu hình test backend Python (`pytest`), và validate cú pháp `docker-compose.yml`.

---

#### 5. Ngày 2026-09-22 (tối) | Người thực hiện: KimiCoNY
* **Nhiệm vụ thực hiện:** T-01 — Dựng khung dự án & kết nối DB (Sprint 1 Backlog).
* **Nội dung thực hiện cụ thể:** Dựng khung dự án, cấu hình kết nối PostgreSQL, chạy được migration đầu tiên. Viết docker-compose.yml gồm ứng dụng + DB. Đặt tên bảng/cột theo snake_case, khóa chính 'id', cột created_at/updated_at — đây là mẫu cho mọi migration sau. AC: chuỗi kết nối đọc từ biến môi trường, migration chạy tiến và lùi được.

---

#### 6. Ngày 2026-09-23 | Người thực hiện: KimiCoNY
* **Nhiệm vụ thực hiện:** T-02 — Pipeline CI cho Backend (Sprint 1 Backlog).
* **Nội dung thực hiện cụ thể:**
  - `.github/workflows/main.yml`: Thêm job `backend-ci` chạy song song với `frontend-ci` — checkout, setup Python 3.12, `pip install -r backend/requirements.txt`, `ruff check backend/`, `pytest backend/tests -v`.
  - `backend/requirements.txt`: Thêm `ruff` cho lint trong CI.
  - `backend/tests/test_placeholder.py`: Test nhẹ không phụ thuộc DB, đảm bảo pytest luôn có ít nhất 1 test thực thi.
  - `docs/codebase-map.md`: Bổ sung mục `.github/workflows/` (ghi chú `backend-ci`) và `backend/tests/`.
* **Trạng thái T-02:** **Hoàn thành** (2026-09-23).
* **AC đạt được:**
  - Push code sai lint (biến không dùng, import thừa) → `ruff check` fail → pipeline báo đỏ, chặn merge.
  - Commit sạch → cả 2 job `frontend-ci` + `backend-ci` chạy xong dưới 5 phút.
  - Luôn có ít nhất 1 test thật (`test_placeholder.py`) thi hành trong bước pytest.

---

#### 7. Ngày 2026-09-23 (08:58) | Người thực hiện: hungblubu
* **Nhiệm vụ thực hiện:** T-05 — Xử lý đăng nhập, phiên, khóa tạm (Sprint 1 Backlog).
* **Nội dung thực hiện cụ thể:** Backend xử lý đăng nhập: kiểm tra thông tin, tạo phiên bằng cookie httpOnly. Lưu số lần sai + thời điểm khóa vào bảng users. AC: sai 5 lần thì lần 6 bị khóa 15 phút, khởi động lại ứng dụng vẫn còn khóa; lỗi không tiết lộ email có tồn tại hay không.

---

#### 8. Ngày 2026-09-23 (11:15) | Người thực hiện: idbibbool-arch
* **Nhiệm vụ thực hiện:** T-04 — Bảng users, roles + seed 5 vai trò (Sprint 1 Backlog).
* **Nội dung thực hiện cụ thể:** Thêm bảng users, roles, bảng nối user_roles. Seed sẵn 5 vai trò: tài xế, chủ trạm, vận hành viên, kế toán, quản trị. Cột email có ràng buộc unique. AC: sau seed có đúng 5 dòng trong roles; cột mật khẩu đủ dài cho hash argon2id.

---

#### 9. Ngày 2026-09-23 | Người thực hiện: KimiCoNY
* **Nhiệm vụ thực hiện:** T-10 — Bảng charge_points, connectors (Sprint 1 Backlog).
* **Nội dung thực hiện cụ thể:** Tạo model `ChargePoint` và `Connector`. Thêm ràng buộc `UNIQUE` cho `charge_points.code` (để tra cứu OCPP) và `UNIQUE(charge_point_id, connector_number)` cho `connectors`. Import vào `__init__.py` và chạy migration Alembic. Cập nhật test case kiểm chứng vi phạm constraint.
* **Trạng thái T-10:** **Hoàn thành** (2026-09-23).
* **AC đạt được:**
  - Chèn 2 charge_points cùng code -> báo lỗi `IntegrityError`.
  - Chèn 2 connectors cùng `(charge_point_id, connector_number)` -> báo lỗi `IntegrityError`.
  - Alembic `upgrade head`, `downgrade -1`, `upgrade head` hoạt động trơn tru.

---

#### 10. Ngày 2026-09-24 | Người thực hiện: `dtc245090028-ui`
* **Nhiệm vụ thực hiện:** FE-Jira-Login + FE-Jira-Simulator — Hoàn thiện Form Đăng nhập, Auth Flow và WebSocket Client (theo Mẫu Description Jira trong yêu cầu ngày 24/09).
* **Nội dung thực hiện cụ thể:**
  - `frontend/package.json`: Bổ sung `axios`, `react-router-dom`, `sonner`, `lucide-react`.
  - `frontend/vite.config.js`: Thêm proxy `/api` → `http://localhost:8000` và `/ws` → `ws://localhost:8000` (chuyển tiếp `/ws/telemetry`).
  - `frontend/src/services/api.js`: axios client + Bearer interceptor + `loginRequest()` + `fetchCurrentUser()`.
  - `frontend/src/services/authService.js`: `performLogin()` lưu JWT, `loadStoredSession()`, `clearSession()`, `extractApiError()` map 401/423/429/5xx/time-out.
  - `frontend/src/services/websocket.js`: `createTelemetrySocket()` — Heartbeat Ping 30s, auto-reconnect backoff 1s→15s, status listener (6 trạng thái).
  - `frontend/src/context/AuthContext.jsx`: Provider với `useAuth()` — `user`, `token`, `isAuthenticated`, `login()`, `logout()`.
  - `frontend/src/components/ProtectedRoute.jsx`: Guard route — redirect `/login` nếu chưa auth.
  - `frontend/src/pages/LoginPage.jsx` + `.css`: Form (Mail + Lock icon, nút ẩn/hiện mật khẩu dùng lucide-react `Eye/EyeOff`), validate regex email, disable nút khi loading, Toast `sonner` cho 401/423/429.
  - `frontend/src/pages/DashboardPage.jsx` + `.css`: Chào user + đèn báo WS (connected/reconnecting/disconnected) + link `/simulator`.
  - `frontend/src/pages/SimulatorPage.jsx` + `.css`: 4 thẻ telemetry (SoC %, kW, V/A, nhiệt °C với cảnh báo >70/85°C), HTTP mock fallback.
  - `frontend/src/App.jsx`: BrowserRouter + AuthProvider + Toaster + lazy-load 3 pages + Suspense + 3 routes (`/login`, `/dashboard`, `/simulator`).
  - `frontend/src/App.css`: Reset cơ bản, dọn sạch template rác.
  - `docs/codebase-map.md`: Cập nhật toàn bộ bản đồ file (đã được reset, viết lại từ scratch).
* **Đối chiếu với yêu cầu Jira:**
  - **Form & Validation**: ✅ email regex, password required, icon ẩn/hiện, loading state.
  - **API & Token**: ✅ `POST /api/auth/login`, lưu `localStorage`, cập nhật AuthContext, redirect `/dashboard`.
  - **Error Handling**: ✅ 401 (sai MK) + 423 (khóa 15 phút) + 429 (rate limit) + 5xx + mất mạng.
  - **FE Deliverables**: ✅ Simulator UI test WS, ✅ Heartbeat Ping/Pong 30s, ✅ Đèn báo 6 trạng thái.
* **Verify:**
  - `npm install` — clean (29 packages added, 1 removed).
  - `npm run build` — PASS (1636 modules → dist, 410ms với cache).
  - `npm run lint` — 0 error, 1 warning Fast Refresh cosmetic (chấp nhận).
  - Vite proxy tự động forward `/api` & `/ws` qua dev server port 5173.
* **Phụ thuộc Backend (Bước 05):** Cần `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/auth/ws-ticket`, JWT bearer; schema User (`id, email, role`). Khi backend sẵn sàng, flow login end-to-end sẽ hoạt động không cần sửa FE.

---

#### 11. Ngày 2026-09-24 (02:30 – 02:50) | Người thực hiện: `dtc245090028-ui` (phiên cuối)
* **Nhiệm vụ thực hiện:** Bug input mất chữ + Thêm trang Đăng ký + Dọn scripts rác.
* **Nội dung thực hiện cụ thể:**
  - **Bug input mất chữ (LoginPage.css)**: `.login-field input` không có `color` → kế thừa root `var(--text)`. Fix: `color:#0f172a; background:#ffffff; ::placeholder color:#94a3b8`. Đồng thời import `App.css` vào `main.jsx` (file có sẵn `body{color:#0f172a}` + `.app-loading` nhưng chưa từng được import — style đang thiếu).
  - **BE endpoint `POST /api/v1/auth/register`** (`backend/app/schemas/auth.py` + `backend/app/api/auth.py`): schema `RegisterRequest` (EmailStr, password ≥6, full_name required, phone optional) + endpoint gán role mặc định `driver` (tự tạo nếu chưa có), 201/409/422.
  - **Trang FE `/register`** (`RegisterPage.jsx`): form full_name + email + SĐT (optional) + password + confirm + validate client, navigate về `/login` kèm `state.registeredEmail`. CSS dùng chung `LoginPage.css` + 2 class bổ sung (`login-card-wide`, `login-optional`).
  - **LoginPage**: đọc `location.state.registeredEmail` để điền sẵn email; sai MK → xóa trắng cả 2 ô.
  - **Vite proxy**: đổi `localhost:8000` → `localhost:8001` (BE đổi port do socket zombie 8000).
  - **Dọn scripts rác**: xóa 14 file trong `backend/scripts/` (test một lần, kill_port helper, SQL check) + `__pycache__/`. Còn lại `__init__.py` rỗng (giữ package marker).
* **Resolve conflict marker**: trong `backend/app/api/auth.py` còn `<<<<<<< HEAD` cũ chưa resolve ở endpoint `/me`. Đã merge giữ phiên bản `Annotated[User, Depends(get_current_user)]`.
* **Verify:**
  - `py scripts/test_register_8001.py` — 201 Created với role `driver`; 422 cho email trống / sai format / password < 6.
  - `pytest` — 48/51 pass; 3 fail (`test_auth::test_login_success_sets_httponly_cookie`, `test_auth_flow::test_login_happy_path_sets_cookie_and_returns_user`, `test_auth_flow::test_logout_happy_path_clears_cookie`) — nghi do response schema login đổi gần đây. **Giữ lại để phiên sau fix** theo yêu cầu user.
  - `npm run build` — PASS (339ms với cache).
* **Tài liệu**: cập nhật `docs/codebase-map.md` (thêm RegisterPage, port 8001, test status 48/51) + `docs/plans/TIEN-DO.md` (thêm dòng bảng tiến độ + mục 11 nhật ký).

---

#### 12. Ngày 2026-10-01 | Người thực hiện: `KimiCoNY`
* **Người yêu cầu:** Người dùng.
* **Nhiệm vụ thực hiện:** Chuẩn hóa nguồn migration về `backend/alembic/`, xóa cây migration cũ `backend/migrations/`.
* **Trạng thái code:** Commit `6da406b` đã đẩy lên nhánh `origin/Duong`; cấu hình `backend/alembic.ini` trỏ tới `backend/alembic/`.
* **Xác minh:** `alembic heads` trong Docker trả về `f2c9a6d81b40 (head)`; bộ test backend chạy trong container tạm đạt **117 passed**, có 2 cảnh báo thư viện. Không chạy `alembic upgrade head` và không sửa database.

---

#### 13. Ngày 2026-10-01 | Người thực hiện: `KimiCoNY`
* **Người yêu cầu:** Người dùng.
* **Nhiệm vụ thực hiện:** Hoàn thành các task OCPP của Story S-07, S-08, S-14, S-15 và S-16: T-14/T-15, T-16/T-17, T-30/T-31, T-32/T-33, T-34/T-35.
* **Nội dung thực hiện:** Tạo package `backend/app/ocpp/` với parser/serializer frame OCPP 1.6J, gateway WebSocket riêng `/ocpp/{charge_point_code}`, BootNotification, idempotency dựa trên DB và cleanup scheduler, Authorize/idTag, dispatcher dùng chung và API Reset có RBAC. Kênh `/ws/telemetry` không bị thay đổi.
* **Xác minh:** `pytest backend/tests` chạy từ thư mục tạm đạt **163 passed, 1 warning** ngày 2026-10-01; cảnh báo là `FutureWarning` của `google.generativeai` trong `app/services/ai_service.py`.

