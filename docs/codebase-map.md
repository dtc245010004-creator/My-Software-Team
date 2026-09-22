# Bản đồ mã nguồn (Codebase Map)

> **File này bắt buộc cập nhật mỗi khi thêm, xóa hoặc đổi vai trò một file.**
> Xem `GEMINI.md §9` — trigger "thêm/xóa/đổi vai trò file bất kỳ" → cập nhật ngay lập tức.

**Cập nhật lần cuối:** 2026-09-22

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
| `backend/requirements.txt` | Danh sách Python dependencies (FastAPI, SQLAlchemy, Alembic, psycopg2...) |
| `backend/Dockerfile` | Dockerfile đóng gói backend FastAPI (Python 3.12-slim) |
| `backend/alembic.ini` | Cấu hình công cụ di chuyển CSDL Alembic |
| `backend/app/main.py` | Điểm vào FastAPI: endpoint `/` health check |
| `backend/app/core/config.py` | Pydantic Settings đọc cấu hình kết nối CSDL |
| `backend/app/core/database.py` | SQLAlchemy engine, SessionLocal, dependency `get_db()` |
| `backend/migrations/env.py` | Môi trường di chuyển Alembic (gắn Base.metadata) |
| `backend/migrations/script.py.mako` | File template sinh mã migration của Alembic |
| `backend/migrations/versions/5bd3f74937cd_init.py` | File migration khởi tạo đầu tiên |

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

---

## Chưa có — Sẽ tạo theo từng bước

### Backend (`backend/`)

| File | Sẽ tạo ở Bước | Vai trò dự kiến |
|---|:---:|---|
| `backend/.env.example` | 03 | Mẫu biến môi trường |
| `backend/app/models/user.py` | 02 / 05 | Model người dùng, phân quyền RBAC (`admin`, `operator`, `customer`) |
| `backend/app/models/station.py` | 02 / 06 | Model Trạm sạc (`Station`), Trụ sạc (`ChargingPoint`), Cổng (`Connector`) |
| `backend/app/models/session.py` | 02 / 07 | Model Phiên sạc (`ChargingSession`) |
| `backend/app/models/wallet.py` | 02 / 07 | Model Ví tiền (`Wallet`) và Nhật ký giao dịch (`WalletTransaction`) |
| `backend/app/models/tariff.py` | 02 / 07 | Model Biểu giá theo khung giờ (`Tariff`) |
| `backend/app/core/security.py` | 05 | Mã hóa mật khẩu (bcrypt), sinh & giải mã JWT token |
| `backend/app/api/v1/endpoints/auth.py` | 05 | API Đăng ký, Đăng nhập, Lấy thông tin cá nhân |
| `backend/app/schemas/station.py` | 06 | Pydantic Schemas cho Station, Charger, Connector |
| `backend/app/services/station_service.py` | 06 | Nghiệp vụ quản lý hạ tầng và trạng thái trạm sạc |
| `backend/app/api/v1/endpoints/stations.py` | 06 | API CRUD Trạm sạc, Trụ sạc và Cổng sạc |
| `backend/app/services/session_service.py` | 07 | Quản lý vòng đời phiên sạc, chốt số kWh và gọi trừ tiền ví |
| `backend/app/services/wallet_service.py` | 07 | Nghiệp vụ ví tiền với Database Transaction (chống âm số dư) |
| `backend/app/api/v1/endpoints/sessions.py` | 07 | API bắt đầu/dừng sạc, xem lịch sử phiên sạc |
| `backend/app/api/v1/endpoints/wallet.py` | 07 | API nạp tiền vào ví, xem số dư và lịch sử biến động |
| `backend/app/api/v1/endpoints/tariffs.py` | 07 | API cấu hình biểu giá điện linh hoạt |
| `backend/app/simulator/charging_simulator.py` | 08 | Module giả lập tín hiệu trụ sạc, sinh dữ liệu đo đếm SoC, kW |
| `backend/app/api/v1/endpoints/simulator.py` | 08 | API điều khiển giả lập cắm sạc/rút sạc |
| `backend/app/core/websocket.py` | 08 | Quản lý kết nối WebSocket và phát sóng telemetry thời gian thực |
| `backend/app/services/ai_service.py` | 09 | Tích hợp Google Gemini: Điều phối tải & Bảo trì dự đoán |
| `backend/app/services/fallback_service.py` | 09 | Thuật toán Heuristic chia tải & cảnh báo ngưỡng khi offline |
| `backend/app/api/v1/endpoints/ai.py` | 09 | API yêu cầu AI phân tích tải và khuyến nghị bảo trì |
| `backend/tests/test_sessions_acid.py` | 11 | Kiểm thử giao dịch trừ tiền ví và trạng thái phiên sạc |
| `backend/tests/test_ai_fallback.py` | 11 | Kiểm thử năng lực fallback khi Gemini API gặp sự cố |
| `backend/seed_data.py` | 11 | Script nạp dữ liệu mẫu sinh động (trạm, trụ, phiên sạc, ví) |

### Frontend (`frontend/`)

| File | Sẽ tạo ở Bước | Vai trò dự kiến |
|---|:---:|---|
| `frontend/src/context/AuthContext.jsx` | 10 | Context quản lý phiên đăng nhập và phân quyền giao diện |
| `frontend/src/pages/Dashboard.jsx` | 10 | Trang tổng quan mạng lưới trạm sạc, công suất và doanh thu |
| `frontend/src/pages/Stations.jsx` | 10 | Trang quản lý danh sách trạm, chi tiết trụ sạc và cổng sạc |
| `frontend/src/pages/Simulator.jsx` | 10 | Giao diện mô phỏng cắm sạc & đồ thị realtime trực quan |
| `frontend/src/pages/Sessions.jsx` | 10 | Lịch sử phiên sạc và chi tiết hóa đơn điện tử |
| `frontend/src/pages/Wallet.jsx` | 10 | Quản lý ví cá nhân, nạp tiền và lịch sử giao dịch |
| `frontend/src/pages/AIAdvisor.jsx` | 10 | Màn hình phân tích điều phối công suất & gợi ý bảo trì AI |
| `frontend/src/services/api.js` | 10 | Cấu hình Axios client và interceptor Bearer Token |
| `frontend/src/services/websocket.js` | 10 | Client kết nối WebSocket nhận telemetry sạc realtime |
