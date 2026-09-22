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
| `GEMINI.md` | Hướng dẫn hành vi AI, quy trình làm việc, quy tắc bảo toàn dữ liệu |
| `CLAUDE.md` | Quy ước và hướng dẫn agent đồng bộ với GEMINI.md |
| `README.md` | Nhật ký vận hành phiên làm việc — hướng dẫn mở/đóng phiên |

### `docs/`

| File | Vai trò |
|---|---|
| `docs/codebase-map.md` | File này — bản đồ mã nguồn, bắt buộc cập nhật khi có thay đổi file |
| `docs/MASTER-ROADMAP.md` | Bức tranh toàn cảnh 8 giai đoạn của Nền tảng trạm sạc xe điện |
| `docs/implementation_plan.md` | Phân tích yêu cầu kỹ thuật & kế hoạch kiến trúc chi tiết |
| `docs/plans/TIEN-DO.md` | Nhật ký tiến độ — **nguồn sự thật về trạng thái** các bước |
| `docs/plans/Buoc-01-*.md` đến `Buoc-11-*.md` | Kế hoạch chi tiết 11 bước thực hiện hệ thống trạm sạc |
| `docs/SDLC/KT1/README.md` | Mục tiêu & danh mục deliverable mốc KT1 (Đặc tả, ERD & Kiến trúc) |
| `docs/SDLC/KT2/README.md` | Mục tiêu & danh mục deliverable mốc KT2 (Core Backend, Simulator & ACID) |
| `docs/SDLC/KT3/README.md` | Mục tiêu & danh mục deliverable mốc KT3 (AI Smart Charging & Frontend) |
| `docs/SDLC/final/README.md` | Mục tiêu & danh mục deliverable mốc Cuối kỳ (Test, Đóng gói & Demo) |

### `backend/` — Scaffold nền tảng

| File | Vai trò |
|---|---|
| `backend/requirements.txt` | Danh sách Python dependencies (FastAPI, SQLAlchemy, pydantic, websockets, google-generativeai, pytest, httpx) |
| `backend/.env.example` | Mẫu biến môi trường — copy thành `.env` trước khi chạy |
| `backend/app/main.py` | Điểm vào FastAPI: khởi tạo app, CORS, routes & WebSocket endpoint |
| `backend/app/__init__.py` | Package marker |
| `backend/app/core/config.py` | Pydantic Settings — cấu hình JWT, Database URL, Gemini API Key |
| `backend/app/core/database.py` | SQLAlchemy engine + SessionLocal + `get_db()` dependency |
| `backend/app/api/__init__.py` | Package marker |
| `backend/app/api/v1/__init__.py` | Package marker — router v1 tập trung |
| `backend/app/models/__init__.py` | Package marker — ORM models |
| `backend/app/schemas/__init__.py` | Package marker — Pydantic schemas |
| `backend/app/services/__init__.py` | Package marker — business logic |
| `backend/tests/__init__.py` | Package marker — pytest test files |

### `frontend/` — Scaffold giao diện

| File | Vai trò |
|---|---|
| `frontend/index.html` | Entry HTML cho Vite |
| `frontend/package.json` | Node dependencies: react 18, lucide-react, recharts, axios; devDeps: vite, tailwindcss |
| `frontend/vite.config.js` | Vite config (React plugin, proxy `/api` và `/ws` → backend) |
| `frontend/postcss.config.js` | PostCSS config cho Tailwind |
| `frontend/tailwind.config.js` | Tailwind config |
| `frontend/src/main.jsx` | React root — mount `<App />` vào `#root` |
| `frontend/src/index.css` | Tailwind directives + base styles |
| `frontend/src/App.jsx` | Khung ứng dụng chính, định tuyến các trang |

---

## Chưa có — Sẽ tạo theo từng bước

| File | Sẽ tạo ở Bước | Vai trò dự kiến |
|---|:---:|---|
| `backend/app/models/user.py` | 02 | Model người dùng, phân quyền RBAC (`admin`, `operator`, `customer`) |
| `backend/app/models/station.py` | 02 | Model Trạm sạc (`Station`), Trụ sạc (`ChargingPoint`), Cổng (`Connector`) |
| `backend/app/models/session.py` | 02 | Model Phiên sạc (`ChargingSession`) |
| `backend/app/models/wallet.py` | 02 | Model Ví tiền (`Wallet`) và Nhật ký giao dịch (`WalletTransaction`) |
| `backend/app/models/tariff.py` | 02 | Model Biểu giá theo khung giờ (`Tariff`) |
| `backend/app/core/security.py` | 05 | Mã hóa mật khẩu (bcrypt), sinh & giải mã JWT token |
| `backend/app/api/v1/endpoints/auth.py` | 05 | API Đăng ký, Đăng nhập, Lấy thông tin cá nhân |
| `backend/app/api/v1/endpoints/stations.py` | 06 | API CRUD Trạm sạc, Trụ sạc và Cổng sạc |
| `backend/app/services/station_service.py` | 06 | Nghiệp vụ quản lý hạ tầng và trạng thái trạm sạc |
| `backend/app/services/session_service.py` | 07 | Quản lý vòng đời phiên sạc, chốt số kWh và gọi trừ tiền ví |
| `backend/app/services/wallet_service.py` | 07 | Nghiệp vụ ví tiền với Database Transaction (chống âm số dư) |
| `backend/app/api/v1/endpoints/sessions.py` | 07 | API bắt đầu/dừng sạc, xem lịch sử phiên sạc |
| `backend/app/api/v1/endpoints/wallet.py` | 07 | API nạp tiền vào ví, xem số dư và lịch sử biến động |
| `backend/app/simulator/charging_simulator.py` | 08 | Module giả lập tín hiệu trụ sạc, sinh dữ liệu đo đếm SoC, kW |
| `backend/app/api/v1/endpoints/simulator.py` | 08 | API điều khiển giả lập cắm sạc/rút sạc |
| `backend/app/core/websocket.py` | 08 | Quản lý kết nối WebSocket và phát sóng telemetry thời gian thực |
| `backend/app/services/ai_service.py` | 09 | Tích hợp Google Gemini: Điều phối tải & Bảo trì dự đoán |
| `backend/app/services/fallback_service.py` | 09 | Thuật toán Heuristic chia tải & cảnh báo ngưỡng khi offline |
| `backend/app/api/v1/endpoints/ai.py` | 09 | API yêu cầu AI phân tích tải và khuyến nghị bảo trì |
| `frontend/src/pages/Dashboard.jsx` | 10 | Trang tổng quan mạng lưới trạm sạc, công suất và doanh thu |
| `frontend/src/pages/Stations.jsx` | 10 | Trang quản lý danh sách trạm, chi tiết trụ sạc và cổng sạc |
| `frontend/src/pages/Simulator.jsx` | 10 | Giao diện mô phỏng cắm sạc & đồ thị realtime trực quan |
| `frontend/src/pages/Sessions.jsx` | 10 | Lịch sử phiên sạc và chi tiết hóa đơn điện tử |
| `frontend/src/pages/Wallet.jsx` | 10 | Quản lý ví cá nhân, nạp tiền và lịch sử giao dịch |
| `frontend/src/pages/AIAdvisor.jsx` | 10 | Màn hình phân tích điều phối công suất & gợi ý bảo trì AI |
| `backend/tests/test_sessions_acid.py` | 11 | Kiểm thử giao dịch trừ tiền ví và trạng thái phiên sạc |
| `backend/tests/test_ai_fallback.py` | 11 | Kiểm thử năng lực fallback khi Gemini API gặp sự cố |
| `backend/seed_data.py` | 11 | Script nạp dữ liệu mẫu sinh động (trạm, trụ, phiên sạc, ví) |
