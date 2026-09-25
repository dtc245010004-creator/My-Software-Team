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
| 2026-09-25 | Bước 01 | Đặc tả Yêu cầu & Phân tích Nghiệp vụ Trạm sạc | Hoàn thành | `nentang.md`, `Prompt.md`, `sodo.md`, `docs/plans/` | Đã hoàn thành đặc tả actor, phân hệ trạm sạc, biểu giá TOU, ví, AI và chốt phân kỳ Giai đoạn 1 vs 2 |
| 2026-09-25 | Bước 02 | Thiết kế CSDL & Sơ đồ ERD Chuẩn EV CSMS | Hoàn thành | `docs/SDLC/KT1/02_Database_Design_ERD.md` | Đã hoàn thành sơ đồ Mermaid ERD 9 bảng, Data Dictionary và DDL tương thích SQLite/PostgreSQL |
| 2026-09-25 | Bước 03 | Cấu hình Môi trường, Docker & CSDL | Hoàn thành | `.env.example`, `backend/requirements.txt`, `app/core/config.py` | Đã cấu hình dependencies, .env, SQLite local, Pydantic Settings và kiểm thử nạp config thành công |
| 2026-09-22 | Bước 04 | Cấu trúc Backend, Session & WebSocket Manager | Chưa bắt đầu | `backend/app/main.py`, `core/database.py`, `core/websocket.py` | Scaffold phân tầng API, CORS, quản lý kết nối realtime |
| 2026-09-22 | Bước 05 | Xác thực, Đăng nhập & Phân quyền RBAC | Chưa bắt đầu | `backend/app/api/v1/endpoints/auth.py`, `core/security.py` | JWT đơn giản, phân quyền 3 role (Admin, Operator/CPO, Driver) |
| 2026-09-22 | Bước 06 | Module Quản lý Hạ tầng Trạm, Trụ & Cổng sạc | Chưa bắt đầu | `backend/app/models/station.py`, `api/v1/endpoints/stations.py` | CRUD Trạm, Trụ sạc (EVSE), Cổng (CCS2, Type 2) |
| 2026-09-22 | Bước 07 | Module Biểu giá, Ví điện tử & Phiên sạc (ACID) | Chưa bắt đầu | `backend/app/services/session_service.py`, `wallet_service.py` | Quản lý TOU 3 khung giờ, trừ tiền ví ACID, Mock Top-up (hoãn Idle Fee) |
| 2026-09-22 | Bước 08 | Module Giả lập Trạm sạc (Simulator & Telemetry) | Chưa bắt đầu | `backend/app/simulator/charging_simulator.py` | Giả lập đường cong sạc xe điện, phát WebSocket realtime |
| 2026-09-22 | Bước 09 | Module AI: Điều phối tải, Bảo trì & Fallback | Chưa bắt đầu | `backend/app/services/ai_service.py`, `fallback_service.py` | Gemini Smart Charging, Predictive Maintenance & Heuristic Fallback |
| 2026-09-22 | Bước 10 | Xây dựng Frontend Web (React + Tailwind + Charts) | Chưa bắt đầu | `frontend/src/pages/Dashboard.jsx`, `Simulator.jsx`, `...` | Giao diện CPO, Driver Portal, Simulator UI trực quan |
| 2026-09-22 | Bước 11 | Bộ Test Tự động (Pytest), Seed Data & Đóng gói | Chưa bắt đầu | `backend/tests/`, `backend/seed_data.py`, `docs/SDLC/...` | 3-5 unit test Wallet ACID, seed data & kịch bản demo |
