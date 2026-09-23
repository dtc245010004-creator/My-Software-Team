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
> - **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét
> - Ghi rõ nguyên nhân trạng thái: tiến độ thực tế, những gì đã làm, và các xung đột kiến trúc với `sodo.md`.

| Ngày cập nhật | Mã bước | Tên bước thực hiện | Trạng thái | Sản phẩm bàn giao (Deliverables) đã sinh | Tiến độ & Xung đột kiến trúc với `sodo.md` |
| :---: | :---: | :--- | :---: | :--- | :--- |
| 2026-09-22 | Bước 01 | Đặc tả Yêu cầu & Phân tích Nghiệp vụ Trạm sạc | 🔄 Đang thực hiện | `nentang.md`, `Prompt.md`, `sodo.md`, `phân công.md`, `test.md`, `huongdanfix.md` | **Đạt 90%**. Đã xong đặc tả & kiến trúc 2 vòng lặp; còn thiếu xuất file nộp mốc KT1: `01_SRS_and_UseCases.md`. Không có xung đột. |
| 2026-09-22 | Bước 02 | Thiết kế CSDL & Sơ đồ ERD Chuẩn EV CSMS | ⬜ Chưa bắt đầu | `docs/SDLC/KT1/02_Database_Design_ERD.md` | **Đạt 0%**. Chuẩn bị thiết kế bảng Station, Charger, Session, Wallet, Tariff. |
| 2026-09-22 | Bước 03 | Cấu hình Môi trường, Docker & CSDL | ⚠️ Cần xem xét | `docker-compose.yml`, `backend/Dockerfile`, `backend/requirements.txt`, `.github/workflows/main.yml` | **Mới bắt đầu - Đạt 55%**. Đã có container DB (Hiếu), Dockerfile Backend (KimiCoNY) và CI/CD Pipeline (Study332). **XUNG ĐỘT CSDL:** `docker-compose.yml` đặt DB `ev_charging_system` (user `admin`), `config.py` đặt `csms` (user `csms`), chuẩn tài liệu là **`ev_csms_db`** (user `postgres`). Thiếu `.env.example`. |
| 2026-09-22 | Bước 04 | Cấu trúc Backend, Session & WebSocket Manager | ⚠️ Cần xem xét | `backend/app/main.py`, `backend/app/core/database.py`, `backend/app/core/config.py`, `alembic.ini`, `migrations/` | **Mới bắt đầu - Đạt 40% toàn bước (75% Task T-01)**. Đã có khung FastAPI, DB engine, Alembic init. **XUNG ĐỘT & LỖI TIỀM ẨN:** Bị lệch DB; thiếu `CORSMiddleware` (chặn web gọi API); `env.py` crash khi thiếu `.env`; thiếu router `/api/v1` và `websocket.py`. |
| 2026-09-23 | Bước 05 | Xác thực, Đăng nhập & Phân quyền RBAC | ✅ Hoàn thành | `backend/app/api/auth.py`, `backend/app/api/deps.py`, `backend/app/core/security.py`, `backend/app/schemas/auth.py`, `backend/migrations/versions/45fd43d6126c_*.py`, `backend/tests/test_auth.py` | **Đạt 100%**. Băm mật khẩu Argon2id, JWT token, cookie httpOnly, khóa 15p khi sai 5 lần, chống enumeration, 4/4 pytest passed. |
| 2026-09-22 | Bước 06 | Module Quản lý Hạ tầng Trạm, Trụ & Cổng sạc | ⬜ Chưa bắt đầu | `backend/app/models/station.py`, `api/v1/endpoints/stations.py` | **Đạt 0%**. CRUD Trạm, Trụ sạc (EVSE), Cổng (CCS2, Type 2), kiểm tra quyền sở hữu CPO. |
| 2026-09-22 | Bước 07 | Module Biểu giá, Ví điện tử & Phiên sạc (ACID) | ⬜ Chưa bắt đầu | `backend/app/services/session_service.py`, `wallet_service.py` | **Đạt 0%**. Quản lý TOU Tariff, trừ tiền ví ACID không bao giờ âm, khóa cổng sạc độc quyền. |
| 2026-09-22 | Bước 08 | Module Giả lập Trạm sạc (Simulator & Telemetry) | ⬜ Chưa bắt đầu | `backend/app/simulator/charging_simulator.py` | **Đạt 0%**. Giả lập đường cong sạc xe điện CC-CV, rơ-le ngắt an toàn $T > 85^\circ\text{C}$, phát WebSocket realtime. |
| 2026-09-22 | Bước 09 | Module AI: Điều phối tải, Bảo trì & Fallback | ⬜ Chưa bắt đầu | `backend/app/services/ai_service.py`, `fallback_service.py` | **Đạt 0%**. Kiến trúc 2 vòng lặp: Fast Loop Heuristic chia tải + Slow Loop Gemini phân tích phụ tải. |
| 2026-09-22 | Bước 10 | Xây dựng Frontend Web (React 19 + Tailwind + Charts) | ⚠️ Cần xem xét | `frontend/package.json`, `vite.config.js`, `src/App.jsx`, `src/main.jsx`, `.oxlintrc.json` | **Mới bắt đầu - Đạt 30% toàn bước (85% Task S-01)**. Đã chạy được khung local tại `localhost:5173`. **XUNG ĐỘT:** Dùng CSS thuần thay vì Tailwind CSS theo `sodo.md`; `vite.config.js` thiếu cấu hình proxy `/api` và `/ws`. |
| 2026-09-22 | Bước 11 | Bộ Test Tự động (Pytest), Seed Data & Đóng gói | ⬜ Chưa bắt đầu | `backend/tests/`, `backend/seed_data.py`, `docs/SDLC/...` | **Đạt 0%**. Test ACID ví tiền, test sạc, seed dữ liệu mẫu sinh động & kịch bản demo bảo vệ. |

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
    - Xét theo **toàn bộ Bước 10 (Giao diện Web hoàn chỉnh mốc KT3)**: **Đạt 30%** (mới hoàn thành phần móng khung, chưa có các trang và component nghiệp vụ).
  - **Bước 03 (`Buoc-03`)**: Đóng góp container PostgreSQL cục bộ chạy được ngay qua `docker compose up -d` (đóng góp 40% hạ tầng môi trường ban đầu). Còn thiếu: đổi tên DB thành `ev_csms_db`, file `.env.example`, và các container backend/frontend.

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
* **Đối chiếu với yêu cầu Plans:**
  - **Hạ tầng CI/CD Staging (Bước 03)**: Đã tự động hóa build được Frontend. Còn thiếu: thêm bước `npm run lint` cho frontend, cấu hình test backend Python (`pytest`), và validate cú pháp `docker-compose.yml`.

---

#### 5. Ngày 2026-09-22 (20:09 – 20:11) | Người thực hiện: KimiCoNY (`dtc245010029` - Lead Backend / BE1)
* **Nhiệm vụ thực hiện:** Task T-01 – Khởi tạo khung Backend FastAPI, kết nối PostgreSQL và tích hợp Alembic migration (Commit `8d6818d`, Merge `c731ae7`).
* **Nội dung thực hiện cụ thể:**
  - `backend/requirements.txt`: Khai báo bộ thư viện cốt lõi (`fastapi`, `uvicorn`, `sqlalchemy>=2.0`, `psycopg2-binary`, `alembic`, `pydantic-settings`).
  - `backend/Dockerfile`: Đóng gói ứng dụng Python 3.12-slim chạy Uvicorn port 8000.
  - `backend/app/main.py`: Khởi tạo FastAPI app với endpoint `/` health check (`{"status": "ok", "service": "csms-backend"}`).
  - `backend/app/core/database.py`: Quản lý engine, SessionLocal, Base declarative, dependency `get_db()`.
  - `backend/app/core/config.py`: Đọc cấu hình kết nối CSDL từ Pydantic Settings.
  - `backend/alembic.ini`, `backend/migrations/`: Khởi tạo môi trường di chuyển lược đồ CSDL và migration init.
  - `backend/.gitignore`: Bỏ qua môi trường ảo và file `.env`.
* **Đối chiếu với yêu cầu Plans:**
  - **Bước 03 (`Buoc-03`)**: Bổ sung Dockerfile Backend và danh sách dependencies, nâng mức hoàn thành môi trường lên **55%**. Còn thiếu: tạo `.env.example`, đồng bộ tên DB `ev_csms_db`, và ghép service backend vào `docker-compose.yml`.
  - **Bước 04 (`Buoc-04`)**: Xét theo phạm vi **Task T-01: Đạt 75%**; xét theo **toàn bộ Bước 04: Đạt 40%**.

---

#### 6. Ngày 2026-09-23 (00:37 – 00:57) | Người thực hiện: AI Pair Programmer (Antigravity)
* **Nhiệm vụ thực hiện:** Bước 05 – Hiện thực hóa Module Xác thực, Đăng nhập bảo mật và Khóa tài khoản (Task 1 -> 14).
* **Nội dung thực hiện cụ thể:**
  - `backend/requirements.txt`: Bổ sung `argon2-cffi`, `pyjwt`, `pytest`, `httpx`.
  - `backend/app/core/config.py`: Thêm `secret_key`, `jwt_algorithm`, `access_token_expire_minutes`, `session_cookie_name`, `max_failed_logins`, `lockout_duration_minutes`.
  - `backend/app/core/security.py`: Hiện thực 4 hàm băm mật khẩu `hash_password` (argon2id), `verify_password`, `create_access_token`, `decode_access_token`.
  - `backend/app/models/user.py`: Thêm cột `failed_login_count`, `locked_until`, `last_failed_ip`, property `role_names` và helper `get_role_names()`.
  - `backend/migrations/versions/45fd43d6126c_add_login_security_columns_to_users.py`: Migration Alembic áp dụng 3 cột mới vào PostgreSQL.
  - `backend/app/schemas/auth.py`: Pydantic Schemas `LoginRequest` và `UserResponse`.
  - `backend/app/api/deps.py`: Dependency `get_current_user` đọc cookie phiên / token JWT, kiểm tra người dùng hợp lệ và active.
  - `backend/app/api/auth.py`: Router `/api/v1/auth` chứa `/login` (chống enumeration, khóa 15 phút sau 5 lần sai, cấp cookie `httpOnly`), `/logout`, `/me`.
  - `backend/app/main.py`: Gắn `CORSMiddleware` và đăng ký `auth_router`.
  - `backend/seed_data.py`: Nạp sẵn 5 vai trò và 5 tài khoản test với mật khẩu băm Argon2id.
  - `backend/tests/test_auth.py`: Bộ kiểm thử tự động xác thực toàn bộ các tiêu chí AC (4/4 passed 100%).
* **Đối chiếu với yêu cầu Plans:**
  - **Bước 05 (`Buoc-05`)**: **Đạt 100%**.
