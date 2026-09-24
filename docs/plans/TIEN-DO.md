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
| 2026-09-24 | K-01 / SCRUM-9 | (Spike) Trụ sạc ảo kết nối vào WebSocket server tối giản | Hoàn thành | `spike/ws_server_spike.py`, `spike/simulator_spike.py`, `spike/K-01-ket-qua.md` | Đã thực hiện spike: tạo server WebSocket tối giản bằng python websockets, giả lập phiên sạc hoàn chỉnh bằng ocpp library, ghi lại 8 loại message OCPP cần thiết, và tổng hợp tài liệu kết quả [K-01 Kết quả Spike](file:///c:/Users/Admin/Documents/csms-backend/My-Software-Team/spike/K-01-ket-qua.md) |

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

#### 12. Ngày 2026-09-24 (Sáng) | Người thực hiện: KimiCoNY
* **Nhiệm vụ thực hiện:** Scrum 8 - Xử lý lỗi CI/CD Test Pipeline (Authentication & RBAC).
* **Nội dung thực hiện cụ thể:**
  - Sửa lỗi 401 trên GitHub Actions do `RBACMiddleware` gọi trực tiếp vào DB thật thay vì DB Test: sử dụng `monkeypatch.setattr` cho `app.core.rbac.get_db` trong `test_auth_flow.py`.
  - Sửa lỗi `test_rbac.py` do hardcode tên cookie `"session_token"` không khớp biến môi trường CI: cập nhật thành `settings.session_cookie_name`.
  - Cập nhật payload `test_auth.py` và `test_auth_flow.py` để phù hợp định dạng trả về mới chứa thuộc tính `user` lồng nhau. Thêm dependency `email-validator`.
* **Trạng thái:** **Hoàn thành** (Passed toàn bộ CI/CD Pipeline).

---

#### 13. Ngày 2026-09-24 (Chiều) | Người thực hiện: KimiCoNY
* **Nhiệm vụ thực hiện:** Scrum 9 (Task K-01) - Spike nghiên cứu Trụ sạc ảo kết nối WebSocket.
* **Nội dung thực hiện cụ thể:**
  - Xây dựng thành công `spike/ws_server_spike.py` (tối giản) và `spike/simulator_spike.py` sử dụng thư viện `websockets` và `ocpp` Python.
  - Mô phỏng trọn vẹn 1 phiên sạc và giao tiếp chuẩn 8 loại message OCPP 1.6J. 
  - Trích xuất thành công log tin nhắn và tài liệu hóa cấu trúc các trường cần thiết để chuẩn bị thiết kế CSDL vào file `spike/K-01-ket-qua.md`. Tuyệt đối không can thiệp thư mục `backend/app` của dự án.
* **Trạng thái:** **Hoàn thành**.
