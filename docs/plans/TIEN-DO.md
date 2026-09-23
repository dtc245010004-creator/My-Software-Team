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
| 2026-09-22 | Bước 11 | Bộ Test Tự động (Pytest), Seed Data & Đóng gói | Chưa bắt đầu | `backend/tests/`, `backend/seed_data.py`, `docs/SDLC/...` | Test ACID ví tiền, test sạc, seed dữ liệu & kịch bản demo |

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
