# NHẬT KÝ TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS TRACKER)

## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

---

### QUY ĐỊNH VỀ RANH GIỚI TÀI LIỆU

- **`docs/plans/` (Kế hoạch & Nhiệm vụ)**: Chứa 11 file kế hoạch độc lập (`Buoc-01-...md` đến `Buoc-11-...md`) và file nhật ký tiến độ này. Đây là tài liệu điều phối quá trình phát triển (Internal Execution Plans).
- **`docs/SDLC/` (Sản phẩm bàn giao - Deliverables)**: Chứa toàn bộ hồ sơ kỹ thuật, báo cáo, thiết kế dùng để nộp bài và chấm điểm theo 4 mốc bài tập cá nhân (`KT1/`, `KT2/`, `KT3/`, `final/`).

---

### BẢNG THEO DÕI TIẾN ĐỘ CHUẨN (PROGRESS MATRIX)

> **Hướng dẫn cập nhật:**
>
> - Định dạng ngày: `YYYY-MM-DD`
> - Quy ước trạng thái: `Chưa bắt đầu` | `Đang thực hiện` | `Hoàn thành` | `Cần xem xét`
> - Sau khi thực hiện xong bước nào, cập nhật đúng dòng tương ứng dưới đây, không tự ý thay đổi cấu trúc bảng.

| Ngày cập nhật | Mã bước | Tên bước thực hiện | Trạng thái | Sản phẩm bàn giao (Deliverables) đã sinh | Ghi chú / Đánh giá |
| :---: | :---: | :--- | :---: | :--- | :--- |
| 2026-09-25 | Bước 01 | Đặc tả Yêu cầu & Phân tích Nghiệp vụ Trạm sạc | Hoàn thành | `docs/SDLC/KT1/01_SRS_and_UseCases.md`, `nentang.md`, `Prompt.md`, `sodo.md` | Đã hoàn thành SRS 3 Actor, CRUD matrix, Use Case sạc/ví, và ranh giới Phase 1 MVP vs Phase 2 |
| 2026-09-25 | Bước 02 | Thiết kế CSDL & Sơ đồ ERD Chuẩn EV CSMS | Hoàn thành | `docs/SDLC/KT1/02_Database_Design_ERD.md` | Đã hoàn thành sơ đồ Mermaid ERD 9 bảng, Data Dictionary và DDL tương thích SQLite/PostgreSQL |
| 2026-09-25 | Bước 03 | Cấu hình Môi trường, Docker & CSDL | Hoàn thành | `backend/requirements.txt`, `.env.example`, `backend/.env`, `app/core/config.py` | Đã cấu hình dependencies, .env, SQLite local, Pydantic Settings và kiểm thử nạp config thành công |
| 2026-09-25 | Bước 04 | Cấu trúc Backend, Session & WebSocket Manager | Hoàn thành | `backend/app/main.py`, `core/database.py`, `core/websocket.py`, `api/v1/__init__.py` | Hoàn thành khung FastAPI, CORS, SQLite WAL/FK, ConnectionManager và WebSocket endpoint |
| 2026-09-25 | Bước 05 | Xác thực, Đăng nhập & Phân quyền RBAC | Hoàn thành | `backend/app/core/security.py`, `models/user.py`, `models/wallet.py`, `schemas/user.py`, `api/deps.py`, `api/v1/endpoints/auth.py`, `tests/test_auth.py` | Hoàn thành Auth JWT, Bcrypt rounds=12, Pydantic password policy 8-72 bytes, chặn privilege escalation (role CUSTOMER hardcode), transaction nguyên tử User+Wallet, RBAC 3 role, Function-scoped test DB, 13/13 tests pass 100% |
| 2026-09-25 | Bước 06 | Module Quản lý Hạ tầng Trạm, Trụ & Cổng sạc | Hoàn thành | `backend/app/models/station.py`, `schemas/station.py`, `services/station_service.py`, `api/v1/endpoints/stations.py`, `api/v1/endpoints/chargers.py`, `tests/test_stations.py` | Hoàn thành CRUD Trạm/Trụ/Cổng, định vị Haversine, phân trang, tính Oversubscription 2 cấp, Soft-Delete & Reactivate nguyên tử, chống IDOR 2 cấp, phát WebSocket realtime, 25/25 tests pass 100% |
| 2026-09-25 | Bước 07 | Module Biểu giá, Ví điện tử & Phiên sạc (ACID) | Hoàn thành | `models/{wallet,tariff,session}.py`, `services/{wallet_service,session_service}.py`, `api/v1/endpoints/{tariffs,wallet,sessions}.py`, `alembic/versions/03906fa596ea_initial_schema_step07.py`, `tests/test_sessions_acid.py`, `docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md` | Hoàn thành TOU 3 khung giờ chốt giá lúc cắm sạc, trừ ví ACID có khóa bi quan, chính sách nợ -300k VND, chặn 402/400, khóa cổng sạc độc quyền chống Race condition (409 Conflict), Idempotency, IDOR guard, Concurrency test thật bằng ThreadPoolExecutor, 34/34 tests pass 100% |

| 2026-09-25 | Bước 08 | Module Giả lập Trạm sạc (Simulator & Telemetry) | Hoàn thành | `app/simulator/charging_simulator.py`, `api/v1/endpoints/simulator.py`, `tests/test_simulator.py`, `alembic/versions/f99adeda980d_add_checkpoint_and_soc_to_sessions.py`, `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md` | Hoàn thành mô phỏng đường cong sạc CC-CV, SoC random an toàn, Auto Cut-off (BatteryFull, Overheat >75°C, DebtLimit -300k), Checkpoint định kỳ 30s, Server Crash Startup Reconciliation, WebSocket phân kênh Room Session, RBAC Admin/CPO bảo vệ API simulator, giải quyết 2 nợ kỹ thuật KT2, 43/43 tests pass 100% |

| 2026-09-25 | Bước 09 | Module AI: Điều phối tải, Bảo trì & Fallback | Hoàn thành | `schemas/ai.py`, `services/fallback_service.py`, `services/ai_service.py`, `services/scheduler_service.py`, `api/v1/endpoints/ai.py`, `tests/test_ai_fallback.py`, `docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md` | Hoàn thành kiến trúc Dual-Loop (Fast Loop = Heuristic, Slow Loop = Gemini AI), AI Advisory Only, chuẩn hóa source/is_fallback, tự động fallback 100% khi mất mạng/hết quota (không ném HTTP 500), Smart Charging Weighted Fair Sharing theo SoC, Predictive Maintenance (ngưỡng cứng + health score liên tục + thermal trend), Dynamic Pricing TOU occupancy shift, NLP ask với DB grounding, RBAC/IDOR guard, Event-driven SoC delta >= 5%, Scheduler 3 phút, 64/64 tests pass 100% |
| 2026-09-25 | Bước 11 | Bộ Test Tự động (Pytest), Seed Data & Đóng gói | Hoàn thành | `backend/tests/test_wallet_acid.py`, `backend/tests/test_sessions.py`, `backend/seed_data.py`, `docs/SDLC/final/01_Final_Technical_Report.md`, `docs/SDLC/final/02_User_Guide_and_Demo_Script.md`, `docs/SDLC/final/03_Presentation_Slides.md` | Hoàn thành bộ kiểm thử tự động toàn diện 74/74 tests xanh lá 100% (Wallet ACID, Session exclusive 409, Debt lockout 402, Crash reconcile, Dual-Loop AI Fallback), nạp Seed Data chân thực 3 trạm sạc, 9 trụ EVSE, 18 cổng sạc, 62 phiên sạc 30 ngày, tài khoản demo 1-click, đóng gói 3 tài liệu Cuối kỳ (Final Technical Report, User Guide & Demo Script 15 phút, 15 Slides đề cương bảo vệ) |

