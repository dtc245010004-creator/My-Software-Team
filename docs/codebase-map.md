# Bản đồ mã nguồn (Codebase Map)

> **File này bắt buộc cập nhật mỗi khi thêm, xóa hoặc đổi vai trò một file.**
> Xem `GEMINI.md §9` — trigger "thêm/xóa/đổi vai trò file bất kỳ" → cập nhật ngay lập tức.

**Cập nhật lần cuối:** 2026-09-23

---

## Hiện có

### Gốc dự án

| File | Vai trò |
|---|---|
| `nentang.md` | Đặc tả nền tảng trạm sạc xe điện — tài liệu gốc bài toán |
| `Prompt.md` | Đặc tả hợp nhất đầy đủ — nguồn sự thật về nghiệp vụ và kỹ thuật |
| `sodo.md` | Sơ đồ kiến trúc tổng thể, 2 vòng lặp (Dual-Loop), ma trận AI/Heuristic, luồng WS và máy trạng thái |
| `yêu cầu.md` | Bản phản biện kỹ thuật, 9 điểm rủi ro và các đề xuất bổ sung |
| `GEMINI.md` | Hướng dẫn hành vi AI, quy trình làm việc, quy tắc bảo toàn dữ liệu |
| `CLAUDE.md` | Quy ước và hướng dẫn agent đồng bộ với GEMINI.md |
| `README.md` | Nhật ký vận hành phiên làm việc — hướng dẫn mở/đóng phiên cho người dùng |
| `HUONGDAN.md` | Bản hướng dẫn vận hành chi tiết đồng bộ cùng README.md |
| `phân công.md` | Bảng phân chia nhiệm vụ chi tiết cho 3 Backend và 3 Frontend kèm ma trận ghép cặp |
| `test.md` | Báo cáo đối chiếu và đánh giá độc lập cho Hiếu, Study332 và KimiCoNY |
| `huongdanfix.md` | Hướng dẫn khắc phục và đồng bộ mã nguồn chi tiết từng bước |
| `docker-compose.yml` | Cấu hình container PostgreSQL 15 cục bộ |

### `.github/`

| File | Vai trò |
|---|---|
| `.github/workflows/main.yml` | Pipeline GitHub Actions tự động build Frontend |

### `backend/`

| File | Vai trò |
|---|---|
| `backend/requirements.txt` | Danh sách Python dependencies (FastAPI, SQLAlchemy, Alembic, psycopg2, argon2-cffi, pyjwt, pytest, httpx...) |
| `backend/Dockerfile` | Dockerfile đóng gói backend FastAPI (Python 3.12-slim) |
| `backend/alembic.ini` | Cấu hình công cụ di chuyển CSDL Alembic |
| `backend/app/main.py` | Điểm vào FastAPI: endpoint `/` health check, CORS Middleware, đăng ký Auth router |
| `backend/app/core/config.py` | Pydantic Settings đọc cấu hình CSDL, Secret Key, JWT và chính sách khóa tài khoản |
| `backend/app/core/database.py` | SQLAlchemy engine, SessionLocal, dependency `get_db()` |
| `backend/app/core/security.py` | Băm mật khẩu (argon2id), kiểm tra mật khẩu, sinh & giải mã JWT token |
| `backend/app/models/user.py` | Model User với failed_login_count, locked_until, last_failed_ip và quan hệ Role |
| `backend/app/models/role.py` | Model Role cho phân quyền RBAC |
| `backend/app/schemas/auth.py` | Pydantic Schemas cho LoginRequest và UserResponse |
| `backend/app/api/deps.py` | Dependency `get_current_user` đọc cookie phiên / token JWT |
| `backend/app/api/auth.py` | Router API Auth: `/login` (khóa 15p khi sai 5 lần, httpOnly cookie), `/logout`, `/me` |
| `backend/migrations/env.py` | Môi trường di chuyển Alembic (gắn Base.metadata) |
| `backend/migrations/script.py.mako` | File template sinh mã migration của Alembic |
| `backend/migrations/versions/5bd3f74937cd_init.py` | File migration khởi tạo đầu tiên |
| `backend/migrations/versions/bc3917d064b0_add_users_and_roles.py` | File migration tạo bảng users, roles, user_roles |
| `backend/migrations/versions/45fd43d6126c_add_login_security_columns_to_users.py` | File migration thêm 3 cột bảo mật đăng nhập cho bảng users |
| `backend/seed_data.py` | Script nạp sẵn 5 vai trò và 5 tài khoản test với mật khẩu băm argon2id |
| `backend/tests/test_auth.py` | Bộ test tự động kiểm thử toàn diện quy trình đăng nhập, khóa tài khoản, cookie và AC |

### `frontend/`

| File | Vai trò |
|---|---|
| `frontend/package.json` | Node dependencies: React 19, Vite, Oxlint |
| `frontend/vite.config.js` | File cấu hình Vite cơ bản |
| `frontend/index.html` | Entry point HTML cho Vite |
| `frontend/src/main.jsx` | React root mount ứng dụng |
| `frontend/src/App.jsx` | Màn hình Staging cơ bản kiểm tra ứng dụng chạy được |
| `frontend/.oxlintrc.json` | Cấu hình bộ linter Oxlint kiểm tra cú pháp nhanh |
| `frontend/README.md` | Tài liệu hướng dẫn khởi chạy Frontend cục bộ |

### `docs/`

| File | Vai trò |
|---|---|
| `docs/codebase-map.md` | File này — bản đồ mã nguồn, bắt buộc cập nhật khi có thay đổi file |
| `docs/MASTER-ROADMAP.md` | Bức tranh toàn cảnh 8 giai đoạn của Nền tảng trạm sạc xe điện |
| `docs/implementation_plan.md` | Phân tích yêu cầu kỹ thuật & kế hoạch kiến trúc chi tiết |
| `docs/plans/TIEN-DO.md` | Nhật ký tiến độ — **nguồn sự thật về trạng thái** các bước |
| `docs/plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md` | Kế hoạch Bước 01: Đặc tả yêu cầu & SRS |
| `docs/plans/Buoc-02-Thiet-ke-CSDL-va-So-do-ERD.md` | Kế hoạch Bước 02: Thiết kế CSDL & ERD |
| `docs/plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md` | Kế hoạch Bước 03: Cấu hình môi trường & Docker |
| `docs/plans/Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md` | Kế hoạch Bước 04: Scaffold Backend & WebSocket Hub |
| `docs/plans/Buoc-05-Xac-thuc-Dang-nhap-va-Phan-quyen-RBAC.md` | Kế hoạch Bước 05: Auth & RBAC |
| `docs/plans/Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md` | Kế hoạch Bước 06: Quản lý hạ tầng Trạm, Trụ, Cổng sạc |
| `docs/plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md` | Kế hoạch Bước 07: Biểu giá TOU, Ví tiền & Phiên sạc ACID |
| `docs/plans/Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md` | Kế hoạch Bước 08: Bộ giả lập sạc & Telemetry realtime |
| `docs/plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md` | Kế hoạch Bước 09: AI Smart Charging, Bảo trì & Heuristic Fallback |
| `docs/plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md` | Kế hoạch Bước 10: Giao diện Web Frontend React + Tailwind |
| `docs/plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md` | Kế hoạch Bước 11: Pytest, Seed Data & Đóng gói SDLC |
| `docs/SDLC/KT1/README.md` | Mục tiêu & danh mục deliverable mốc KT1 (Đặc tả, ERD & Kiến trúc) |
| `docs/SDLC/KT2/README.md` | Mục tiêu & danh mục deliverable mốc KT2 (Core Backend, Simulator & ACID) |
| `docs/SDLC/KT3/README.md` | Mục tiêu & danh mục deliverable mốc KT3 (AI Smart Charging & Frontend) |
| `docs/SDLC/final/README.md` | Mục tiêu & danh mục deliverable mốc Cuối kỳ (Test, Đóng gói & Demo) |
