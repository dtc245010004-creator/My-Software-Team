# Codebase Map

> File này bắt buộc cập nhật khi thêm / xóa / đổi vai trò file. Xem `GEMINI.md §9`.
> **Cập nhật lần cuối:** 2026-09-24 (phiên cuối: fix input mất chữ + thêm `/auth/register` + trang `/register`, dọn scripts rác).

## Backend (`backend/`)

### Đã có

| File | Vai trò |
|---|---|
| `backend/requirements.txt` | Python deps (FastAPI, SQLAlchemy 2.0, Alembic, psycopg2-binary, pydantic-settings) |
| `backend/Dockerfile` | Docker image Python 3.12-slim chạy Uvicorn port 8000 |
| `backend/alembic.ini` | Cấu hình Alembic |
| `backend/app/main.py` | FastAPI app — endpoint `/` health check + include `app.api.auth` router (auth_router) |
| `backend/app/core/config.py` | Pydantic Settings — đọc CSDL từ biến môi trường |
| `backend/app/core/database.py` | SQLAlchemy engine, SessionLocal, dependency `get_db()` |
| `backend/migrations/env.py` | Môi trường Alembic |
| `backend/migrations/script.py.mako` | Template Alembic |
| `backend/migrations/versions/5bd3f74937cd_init.py` | Migration khởi tạo |

### Chưa có — sẽ tạo theo Buoc-NN

| File | Buoc | Vai trò |
|---|:---:|---|
| `backend/.env.example` | 03 | Mẫu biến môi trường (DATABASE_URL, JWT_SECRET...) |
| `backend/app/core/security.py` | 05 | bcrypt hash + JWT encode/decode |
| `backend/app/core/websocket.py` | 04 / 08 | WebSocketManager + Ticket handshake |
| `backend/app/api/v1/endpoints/auth.py` | 05 | `POST /api/auth/login`, `/api/auth/me`, `/api/auth/ws-ticket`, `POST /api/auth/register` (role mặc định `driver`), `POST /api/auth/logout` |
| `backend/app/models/user.py` | 02 / 05 | Model `User` (admin/operator/customer), bcrypt password |
| `backend/app/models/station.py` | 02 / 06 | `Station`, `ChargingPoint`, `Connector` |
| `backend/app/models/tariff.py` | 02 / 07 | `Tariff` (TOU) |
| `backend/app/models/wallet.py` | 02 / 07 | `Wallet` + `WalletTransaction` |
| `backend/app/models/session.py` | 02 / 07 | `ChargingSession` |
| `backend/app/api/v1/endpoints/stations.py` | 06 | CRUD Trạm/Trụ/Cổng |
| `backend/app/api/v1/endpoints/tariffs.py` | 07 | CRUD Biểu giá |
| `backend/app/api/v1/endpoints/wallet.py` | 07 | Nạp ví + xem số dư |
| `backend/app/api/v1/endpoints/sessions.py` | 07 | Bắt đầu/dừng sạc |
| `backend/app/api/v1/endpoints/simulator.py` | 08 | Điều khiển giả lập |
| `backend/app/services/*.py` | 06-09 | Business logic |
| `backend/app/simulator/charging_simulator.py` | 08 | CC-CV curve + telemetry |
| `backend/tests/` | 11 | pytest — 48/51 pass. 3 fail đang chờ fix (response schema login đổi): `test_auth::test_login_success_sets_httponly_cookie`, `test_auth_flow::test_login_happy_path_sets_cookie_and_returns_user`, `test_auth_flow::test_logout_happy_path_clears_cookie` |
| `backend/seed_data.py` | 11 | Seed dữ liệu mẫu |

## Frontend (`frontend/`)

### Đã có

| File | Vai trò |
|---|---|
| `frontend/package.json` | React 19 + Vite + axios + react-router-dom + sonner + lucide-react + oxlint |
| `frontend/vite.config.js` | Vite dev server port 5173 + Proxy `/api` & `/ws` → `localhost:8001` (đổi từ 8000 do socket zombie) |
| `frontend/index.html` | Entry point HTML |
| `frontend/README.md` | Hướng dẫn chạy local |
| `frontend/src/main.jsx` | React root mount |
| `frontend/src/App.jsx` | BrowserRouter + Toaster + Routes (`/login`, `/dashboard`, `/simulator`) |
| `frontend/src/App.css` | Reset cơ bản cho `#root` + `.app-loading` |
| `frontend/src/index.css` | Global variables EV CSMS theme |
| `frontend/src/services/api.js` | axios client + Bearer interceptor + `loginRequest()` + `fetchCurrentUser()` |
| `frontend/src/services/authService.js` | `performLogin()`, `loadStoredSession()`, `clearSession()`, `extractApiError()` (parse FastAPI `{detail: "..."}` 401/423/429) |
| `frontend/src/services/websocket.js` | `createTelemetrySocket()` — Heartbeat Ping 30s + auto-reconnect backoff 1s→15s + status listener |
| `frontend/src/context/AuthContext.jsx` | Provider với `useAuth()`: `user`, `isAuthenticated`, `login()`, `logout()` |
| `frontend/src/components/ProtectedRoute.jsx` | Guard route — redirect `/login` nếu chưa auth |
| `frontend/src/pages/LoginPage.jsx` | Form Đăng nhập — email + password (icon ẩn/hiện) + validate + Toast lỗi (401/423) + sai MK thì xóa trắng cả 2 ô + đọc `location.state.registeredEmail` để điền sẵn sau khi đăng ký |
| `frontend/src/pages/LoginPage.css` | Styles cho LoginPage |
| `frontend/src/pages/RegisterPage.jsx` | Form Đăng ký tài khoản customer (role mặc định `driver`) — họ tên + email + SĐT (tùy chọn) + password + confirm + validate client (EmailStr FE regex, password ≥6, full_name không trống) + gọi `POST /auth/register` → chuyển về `/login` với state.email |
| `frontend/src/pages/DashboardPage.jsx` | Dashboard — chào user + đèn báo trạng thái WebSocket + link Simulator |
| `frontend/src/pages/DashboardPage.css` | Styles cho DashboardPage |
| `frontend/src/pages/SimulatorPage.jsx` | Giả lập trụ sạc ảo — SoC %, kW, kWh, V, A, Temp + cảnh báo T > 70/85°C |
| `frontend/src/pages/SimulatorPage.css` | Styles cho SimulatorPage |
| `frontend/.oxlintrc.json` | Oxlint config |

### Chưa có — sẽ tạo theo Buoc-10

| File | Buoc | Vai trò |
|---|:---:|---|
| `frontend/src/pages/Stations.jsx` | 10 | Quản lý trạm |
| `frontend/src/pages/Wallet.jsx` | 10 | Ví & nạp tiền |
| `frontend/src/pages/Sessions.jsx` | 10 | Lịch sử phiên sạc |
| `frontend/src/pages/AIAdvisor.jsx` | 10 | Bảng khuyến nghị AI |

## Tài liệu gốc

| File | Vai trò |
|---|---|
| `nentang.md` | Đặc tả nghiệp vụ gốc |
| `Prompt.md` | Đặc tả hợp nhất |
| `sodo.md` | Sơ đồ kiến trúc + Dual-Loop |
| `yêu cầu.md` | Phản biện kỹ thuật |
| `GEMINI.md` | Quy tắc AI |
| `CLAUDE.md` | Quy tắc AI (đồng bộ) |
| `HUONGDAN.md` | Hướng dẫn vận hành |
| `phân công.md` | Phân công 6 người |
| `test.md` | Đánh giá độc lập |
| `huongdanfix.md` | Hướng dẫn khắc phục |
| `docker-compose.yml` | PostgreSQL 15 container |

## Khác

| File | Vai trò |
|---|---|
| `.github/workflows/main.yml` | CI GitHub Actions — build Frontend |
