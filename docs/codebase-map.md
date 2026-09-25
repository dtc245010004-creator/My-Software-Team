# Bản đồ mã nguồn (Codebase Map)

> **File này bắt buộc cập nhật mỗi khi thêm, xóa hoặc đổi vai trò một file.**
> Xem `GEMINI.md §9` — trigger "thêm/xóa/đổi vai trò file bất kỳ" → cập nhật ngay lập tức.

**Cập nhật lần cuối:** 2026-09-25

---

## Hiện có

### Gốc dự án

| File | Vai trò |
| --- | --- |
| `nentang.md` | Đặc tả nền tảng trạm sạc xe điện — tài liệu gốc bài toán |
| `Prompt.md` | Đặc tả hợp nhất đầy đủ — nguồn sự thật về nghiệp vụ và kỹ thuật |
| `sodo.md` | Sơ đồ kiến trúc tổng thể, 2 vòng lặp (Dual-Loop), ma trận AI/Heuristic, luồng WS và máy trạng thái |
| `yêu cầu.md` | Bản phản biện kỹ thuật, 9 điểm rủi ro và các đề xuất bổ sung (đã hợp nhất vào `sodo.md`) |
| `GEMINI.md` | Hướng dẫn hành vi AI, quy trình làm việc, quy tắc bảo toàn dữ liệu |
| `CLAUDE.md` | Quy ước và hướng dẫn agent đồng bộ với GEMINI.md |
| `README.md` | Nhật ký vận hành phiên làm việc — hướng dẫn mở/đóng phiên cho người dùng |
| `HUONGDAN.md` | Bản hướng dẫn vận hành chi tiết đồng bộ cùng README.md |
| `phân công.md` | Bảng phân chia nhiệm vụ chi tiết cho 3 Backend và 3 Frontend kèm ma trận ghép cặp |
| `.markdownlint.json` | Cấu hình chuẩn hóa định dạng Markdown cho toàn bộ dự án |
| `.env.example` | Mẫu cấu hình biến môi trường toàn hệ thống |

### `backend/` (Hiện có)

| File | Vai trò |
| --- | --- |
| `backend/requirements.txt` | Danh mục thư viện Python (FastAPI, SQLAlchemy, PyJWT, WebSockets, Pytest...) |
| `backend/.env.example` | Mẫu cấu hình môi trường cho backend |
| `backend/pytest.ini` | Cấu hình Pytest (pythonpath, testpaths) |
| `backend/app/core/config.py` | Pydantic Settings — nạp biến môi trường cho JWT, SQLite, CORS, Gemini, Bcrypt rounds |
| `backend/app/core/database.py` | SQLAlchemy engine kết nối SQLite (WAL mode, Foreign Keys ON), `SessionLocal` và `get_db()` |
| `backend/app/core/security.py` | Mã hóa mật khẩu trực tiếp bằng bcrypt (rounds=12), sinh & giải mã JWT access token |
| `backend/app/core/websocket.py` | `ConnectionManager` quản lý kết nối và phát sóng telemetry realtime |
| `backend/app/models/__init__.py` | Export các SQLAlchemy Models (`User`, `Wallet`, `Station`, `ChargingPoint`, `Connector`) |
| `backend/app/models/user.py` | Model người dùng `User`, phân quyền RBAC (`ADMIN`, `OPERATOR`, `CUSTOMER`) và quan hệ 1-1 với `Wallet` |
| `backend/alembic.ini` | Cấu hình Alembic database migrations |
| `backend/alembic/env.py` | Cấu hình môi trường migration trỏ vào `Base.metadata` và CSDL |
| `backend/alembic/versions/03906fa596ea_initial_schema_step07.py` | Migration revision khởi tạo các bảng `tariffs`, `wallet_transactions`, `charging_sessions` |
| `backend/app/models/wallet.py` | Model Ví điện tử `Wallet` (ràng buộc `balance >= -1000000`, `is_debt_locked`) và `WalletTransaction` |
| `backend/app/models/tariff.py` | Model Biểu giá điện TOU 3 khung giờ (`Tariff`: Peak, Off-peak, Normal) |
| `backend/app/models/session.py` | Model Phiên sạc xe điện (`ChargingSession`: `applied_price_per_kwh`, chỉ số kWh, trạng thái, tiền cước) |
| `backend/app/schemas/wallet.py` | Pydantic Schemas nạp tiền (`TopupRequest`), số dư ví và nhật ký giao dịch dùng `Decimal` |
| `backend/app/schemas/tariff.py` | Pydantic Schemas cấu hình biểu giá TOU (`TariffCreate`, `TariffUpdate`, `TariffResponse`) |
| `backend/app/schemas/session.py` | Pydantic Schemas bắt đầu (`SessionStartRequest`), dừng (`SessionStopRequest`) và chi tiết phiên sạc |
| `backend/app/services/wallet_service.py` | Nghiệp vụ ví tiền ACID: nạp ví `topup_wallet`, trừ cước `deduct_charging_fee` (khóa bi quan, nợ đến -300k VND) |
| `backend/app/services/session_service.py` | Nghiệp vụ phiên sạc: khóa cổng độc quyền (Atomic Update), chốt giá TOU lúc start, dừng phiên ACID, chống IDOR |
| `backend/app/api/v1/endpoints/tariffs.py` | API CRUD và soft-delete cấu hình biểu giá điện TOU |
| `backend/app/api/v1/endpoints/wallet.py` | API nạp tiền vào ví (`POST /topup`), xem số dư và lịch sử giao dịch (`GET /me`) |
| `backend/app/api/v1/endpoints/sessions.py` | API bắt đầu (`POST /start`), dừng phiên sạc (`POST /{id}/stop`), xem lịch sử cá nhân (`GET /me`) |
| `backend/tests/test_sessions_acid.py` | Bộ 9 test cases tự động kiểm thử toàn diện ACID: TOU, Concurrency thật (409 Conflict), nợ âm, Idempotency, IDOR |
| `backend/app/simulator/__init__.py` | Export module simulator |
| `backend/app/simulator/charging_simulator.py` | Core ChargingSimulator: đường cong CC-CV, an toàn Auto Cut-off (Pin đầy, Quá nhiệt >75°C, Nợ ví -300k), Checkpoint DB 30s |
| `backend/app/api/v1/endpoints/simulator.py` | REST API điều khiển giả lập (trigger-event, set-power-limit, get telemetry từ RAM), bảo vệ RBAC Admin/CPO |
| `backend/tests/test_simulator.py` | Bộ 9 test cases kiểm thử Simulator, CC-CV, Auto Cut-off, Checkpoint, Startup Crash Reconciliation, RBAC |
| `backend/app/schemas/ai.py` | Pydantic schemas cho Smart Charging, Maintenance, Pricing Advice và AI Ask |
| `backend/app/services/fallback_service.py` | Động cơ Heuristic Fallback độc lập 100%: Weighted Fair Sharing theo SoC, ngưỡng cứng nhiệt độ, TOU occupancy |
| `backend/app/services/ai_service.py` | AI Service gọi Google Gemini API, bọc timeout 5s, prompt grounding và tự động fallback sang Heuristic |
| `backend/app/services/scheduler_service.py` | APScheduler lập lịch phân tích tải định kỳ 3 phút và phát sóng WebSocket realtime |
| `backend/app/api/v1/endpoints/ai.py` | REST API cho 4 chức năng AI (smart-charging, predictive-maintenance, pricing-advice, ask) kèm RBAC/IDOR |
| `backend/tests/test_ai_fallback.py` | Bộ 21 test cases kiểm thử Heuristic, RBAC/IDOR, Fallback khi offline, Mock Gemini AI và Scheduler |
| `docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md` | Tài liệu bàn giao kỹ thuật mốc KT2: Thiết kế giao dịch ví điện tử và phiên sạc ACID |
| `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md` | Tài liệu bàn giao kỹ thuật mốc KT2: Thiết kế bộ giả lập trạm sạc và telemetry thời gian thực |
| `docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md` | Tài liệu bàn giao kỹ thuật mốc KT3: Tích hợp AI, đánh giá Prompt và Heuristic Fallback Engine |
| `docs/SDLC/KT3/02_Frontend_Architecture_and_UI_Guide.md` | Tài liệu bàn giao kỹ thuật mốc KT3: Kiến trúc Frontend và hướng dẫn giao diện vận hành |

### `frontend/`

| File | Vai trò |
| --- | --- |
| `frontend/package.json` | Cấu hình Node dependencies (React 18, Vite, Tailwind CSS, Recharts, Lucide Icons, Axios) |
| `frontend/vite.config.js` | Cấu hình Vite reverse proxy `/api` và `/ws` trỏ tới FastAPI backend |
| `frontend/tailwind.config.js` | Bảng màu công nghiệp trạm sạc: Obsidian `#0B0F17`, Panel Slate `#151D2A`, Electric Cyan, Grid Green |
| `frontend/index.html` | Entry HTML nạp Google Fonts (Inter & JetBrains Mono) |
| `frontend/src/index.css` | Cấu hình Tailwind và quy tắc `tabular-nums` cho số liệu đo lường |
| `frontend/src/main.jsx` | Mount React root app |
| `frontend/src/App.jsx` | Khung ứng dụng chính, bảo vệ layout và định tuyến 7 trang chức năng |
| `frontend/src/context/AuthContext.jsx` | Quản lý JWT Token, phân quyền và nút 1-click chuyển đổi vai trò Demo |
| `frontend/src/services/api.js` | Axios instance tự động chèn JWT Bearer Token |
| `frontend/src/services/websocket.js` | Client WebSocket truyền phát telemetry thời gian thực và subscribe theo session |
| `frontend/src/components/Header.jsx` | Thanh điều hướng đầu trang, hiển thị tín hiệu WebSocket live và Demo Role Switcher |
| `frontend/src/components/Navigation.jsx` | Menu điều hướng các không gian làm việc |
| `frontend/src/components/BusbarLoadIndicator.jsx` | Thanh cái phụ tải lưới điện phân tầng màu theo % công suất an toàn 95% |
| `frontend/src/components/MetricBox.jsx` | Khung hiển thị thông số kỹ thuật chuẩn công nghiệp |
| `frontend/src/pages/Dashboard.jsx` | Bảng điều khiển phụ tải lưới, trạng thái trụ sạc và đồ thị phụ tải 24h |
| `frontend/src/pages/Stations.jsx` | Quản lý danh mục trạm sạc, trụ sạc (EVSE bays) và cổng sạc (connectors) |
| `frontend/src/pages/Simulator.jsx` | Bảng điều khiển sạc CC-CV realtime, đồ thị Recharts, nút quá nhiệt khẩn cấp |
| `frontend/src/pages/Wallet.jsx` | Quản lý ví cá nhân, nạp tiền nhanh (+50k đến +500k), cảnh báo nợ và lịch sử ACID |
| `frontend/src/pages/Sessions.jsx` | Lịch sử phiên sạc, bộ lọc trạng thái và hóa đơn điện tử TOU |
| `frontend/src/pages/AIAdvisor.jsx` | 3 màn hình AI riêng biệt: Busbar load allocation, Thermal Heat Strip, 24h TOU load curve & NLP chat |
| `frontend/src/pages/Login.jsx` | Màn hình đăng nhập tài khoản và 1-click Demo Roles cho buổi bảo vệ |

---

## Chưa có — Sẽ tạo theo từng bước

### Backend (`backend/`)

| File | Sẽ tạo ở Bước | Vai trò dự kiến |
| --- | :---: | --- |
| `backend/seed_data.py` | 11 | Script nạp dữ liệu mẫu sinh động (trạm, trụ, phiên sạc, ví) |

| File | Vai trò |
| --- | --- |
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
| `docs/SDLC/KT1/01_SRS_and_UseCases.md` | Tài liệu đặc tả yêu cầu phần mềm (SRS), 3 Actor, CRUD Matrix & sơ đồ Use Case |
| `docs/SDLC/KT1/02_Database_Design_ERD.md` | Hồ sơ thiết kế CSDL, sơ đồ Mermaid ERD, Từ điển dữ liệu và DDL cho KT1 |
| `docs/SDLC/KT1/03_AI_Architecture_and_Prompts.md` | Kiến trúc tích hợp Gemini API, kỹ thuật Prompting và thuật toán Fallback Heuristic |
| `docs/SDLC/KT1/04_Wireframes.md` | Bản thiết kế cấu trúc giao diện Wireframe cho Dashboard CPO, Simulator, Driver Portal |
| `docs/SDLC/KT2/README.md` | Mục tiêu & danh mục deliverable mốc KT2 (Core Backend, Simulator & ACID) |
| `docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md` | Hồ sơ thiết kế giao dịch ACID ví tiền và phiên sạc mốc KT2 |
| `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md` | Hồ sơ thiết kế bộ giả lập trạm sạc và telemetry thời gian thực mốc KT2 |
| `docs/SDLC/KT3/README.md` | Mục tiêu & danh mục deliverable mốc KT3 (AI Smart Charging & Frontend) |
| `docs/SDLC/final/README.md` | Mục tiêu & danh mục deliverable mốc Cuối kỳ (Test, Đóng gói & Demo) |

---

| `backend/seed_data.py` | Script nạp dữ liệu mẫu sinh động (3 trạm lớn, 9 trụ, 18 cổng, 62 phiên sạc, tài khoản demo) |
| `backend/tests/test_wallet_acid.py` | Bộ 5 test cases kiểm thử tính toàn vẹn ACID của Ví: Pessimistic Lock, Overdraft Limit, Auto Clear Lock |
| `backend/tests/test_sessions.py` | Bộ 5 test cases kiểm thử vòng đời phiên sạc: 409 Conflict cổng độc quyền, 402 chặn nợ, Idempotency |
| `docs/SDLC/final/01_Final_Technical_Report.md` | Báo cáo kỹ thuật tổng kết toàn diện 11 bước đề tài EV CSMS mốc Cuối kỳ |
| `docs/SDLC/final/02_User_Guide_and_Demo_Script.md` | Sổ tay hướng dẫn vận hành 1-click & Kịch bản demo 15 phút bảo vệ trước hội đồng |
| `docs/SDLC/final/03_Presentation_Slides.md` | Đề cương chi tiết 15 slide thuyết trình bảo vệ đồ án tốt nghiệp/cuối kỳ |

---

## Trạng thái hoàn thành toàn diện

Toàn bộ **11/11 bước** trong lộ trình phát triển đã được hoàn thành 100% với chất lượng cao nhất:

- Không còn bất kỳ file dự kiến nào chưa tạo.
- Bộ kiểm thử tự động đạt 74/74 test cases passed 100% (Zero regression).
- CSDL đã nạp đầy đủ dữ liệu mẫu sẵn sàng phục vụ trình diễn và bảo vệ đồ án.
