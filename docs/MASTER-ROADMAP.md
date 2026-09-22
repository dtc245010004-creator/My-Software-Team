# MASTER ROADMAP
## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

> **Vai trò của file này:** Bức tranh toàn cảnh — la bàn định hướng cho toàn bộ dự án và liên kết sang từng bước thực thi chi tiết.
> Xem `GEMINI.md §9` để hiểu quy ước nguồn sự thật và khi nào cập nhật file này.

---

## Phân cấp nguồn sự thật

```
docs/plans/TIEN-DO.md          ← Trạng thái thực tế (tick ✅ ở đây là chính thức)
     ↑ đồng bộ
MASTER-ROADMAP.md   ← Bức tranh toàn cảnh + điều hướng (file này)
     ↓ link sang
Buoc-NN.md          ← Spec thực thi chi tiết cho từng bước
```

**Khi hai file mâu thuẫn:** TIEN-DO.md thắng về trạng thái; Buoc-NN.md thắng về cách làm.

---

## Trạng thái tổng quan theo các Phân hệ thực tế (Concurrent Workstreams)

> **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét
>
> **Nguyên tắc phản ánh tiến độ:** Nhóm phát triển 6 người được chia thành **3 cặp phối hợp song song (Pairing Matrix)** theo [`phân công.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/phân%20công.md). Do các thành viên triển khai đồng thời nhiều mảng (không làm tuần tự từ bước 0 đến bước 7), bảng theo dõi dưới đây phản ánh đúng **tiến độ thực tế**, **sản phẩm đã có**, và **các điểm xung đột kiến trúc với [`sodo.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/sodo.md)**.

| Phân hệ | Tên phân hệ / Trục công việc | Mốc SDLC | Phụ trách chính | Trạng thái | Tiến độ | Thực tế đã làm & Xung đột với kiến trúc ban đầu (`sodo.md`) |
|:---:|---|:---:|:---:|:---:|:---:|---|
| **Phần 0** | **Đặc tả Nghiệp vụ & Kiến trúc Hệ thống** | KT1 | Lead Architect (`dtc245090028`) | 🔄 Đang thực hiện | 90% | **Đã làm:** 100% tài liệu nền tảng (`Prompt.md`, `sodo.md`, `nentang.md`, `phân công.md`).<br>**Còn thiếu:** Xuất tài liệu nộp mốc KT1 `docs/SDLC/KT1/01_SRS_and_UseCases.md`.<br>**Xung đột:** Không có. |
| **Phần I** | **Hạ tầng Môi trường, Docker & CI/CD Staging** | Toàn dự án | Study332 + Hiếu + KimiCoNY | ⚠️ Cần xem xét | 55% | **Đã làm:** Container PostgreSQL 15, Dockerfile Backend Python 3.12-slim, CI/CD GitHub Actions build Frontend.<br>**XUNG ĐỘT CSDL:** `docker-compose.yml` đặt DB `ev_charging_system` (user `admin`), `config.py` đặt `csms` (user `csms`), trong khi `sodo.md` chuẩn là **`ev_csms_db`** (user `postgres`). Chưa ghép Backend vào `docker-compose.yml`. |
| **Phần II** | **Khung Backend Core, CSDL & Kênh Realtime (Cặp A)** | KT2 | KimiCoNY (`BE1`) | ⚠️ Cần xem xét | 40% (Mốc KT2) / 75% (Task T-01) | **Đang bắt đầu làm khung:** Đã có `main.py`, `database.py`, Alembic init, Dockerfile.<br>**XUNG ĐỘT & LỖI TIỀM ẨN:** Lệch chuỗi kết nối DB; `env.py` crash `AttributeError` khi thiếu `.env`; thiếu `CORSMiddleware` (chặn Frontend port 5173); thiếu `core/websocket.py` và router `/api/v1`. |
| **Phần III** | **Khung Giao diện Web Frontend & Layout CPO (Cặp A)** | KT3 | Hiếu (`FE1`) + Study332 | ⚠️ Cần xem xét | 30% (Mốc KT3) / 85% (Task S-01) | **Đang bắt đầu làm khung:** React 19 + Vite + Oxlint chạy mượt tại `localhost:5173`, màn hình Staging sạch sẽ.<br>**XUNG ĐỘT:** Chưa cài Tailwind CSS (đang dùng CSS thuần, trái với `sodo.md`), `vite.config.js` chưa cấu hình proxy `/api` và `/ws` tới backend port 8000. |
| **Phần IV** | **Quản trị Hạ tầng Trạm, Trụ, Cổng & Biểu giá TOU (Cặp B)** | KT2 | BE2 + FE2 | ⬜ Chưa bắt đầu | 0% | Chờ hoàn thiện ERD CSDL (Bước 02) và khung phân tầng Core để bắt đầu viết models & CRUD APIs (Bước 06 & 07). |
| **Phần V** | **Ví điện tử ACID, Phiên sạc & Realtime Simulator (Cặp C)** | KT2 / KT3 | BE3 + FE3 | ⬜ Chưa bắt đầu | 0% | Trọng tâm kỹ thuật: Giao dịch trừ tiền ví không âm và mô phỏng đường cong sạc pin CC-CV + ngắt an toàn $T > 85^\circ\text{C}$ (Bước 07 & 08). |
| **Phần VI** | **Phân hệ Trí tuệ Nhân tạo & Heuristic Fallback** | KT3 | BE3 + FE2 | ⬜ Chưa bắt đầu | 0% | Kiến trúc 2 vòng lặp (Fast Loop Heuristic + Slow Loop Gemini API) theo đúng `sodo.md` (Bước 09). |
| **Phần VII** | **Kiểm thử Toàn diện (Pytest), Seed Data & Đóng gói SDLC** | Cuối kỳ | Cả 6 thành viên | ⬜ Chưa bắt đầu | 0% | Test ACID ví tiền, test ngắt sạc an toàn, nạp dữ liệu mẫu và chuẩn bị kịch bản demo bảo vệ (Bước 11). |

---

## Chi tiết các Phân hệ công việc thực tế (Detailed Workstreams)

---

### PHẦN 0 — Đặc tả Nghiệp vụ & Kiến trúc Hệ thống (SRS & Architecture Track)

> **Mục tiêu:** Hoàn thiện khung đặc tả, sơ đồ kiến trúc 2 vòng lặp, ma trận ghép cặp và quy ước làm việc.
> **Phụ trách chính:** Lead Architect (`dtc245090028`) | **Mốc nộp:** KT1
> **Đánh giá tiến độ:** 🔄 **Đang thực hiện (90%)** — Đã xong toàn bộ đặc tả, sơ đồ; còn thiếu xuất file nộp bài KT1 `docs/SDLC/KT1/01_SRS_and_UseCases.md`.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| 0.1 | Khởi tạo đặc tả `nentang.md`, `Prompt.md` & `sodo.md` | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `nentang.md`, `Prompt.md`, `sodo.md` | ✅ | Hoàn thành xuất sắc, không xung đột. |
| 0.2 | Chuẩn hóa `GEMINI.md`, `CLAUDE.md`, `README.md`, `HUONGDAN.md`, `phân công.md` | 🔴 P0 | — | Quy tắc, bảng phân công 6 người | ✅ | Hoàn thành, làm căn cứ điều phối toàn đội ngũ. |
| 0.3 | Hồ sơ đặc tả KT1: SRS & Use Case phân quyền (Admin, CPO, Driver) | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `docs/SDLC/KT1/01_SRS_and_UseCases.md` | 🔄 | Cần trích xuất hoàn thiện file nộp KT1. |
| 0.4 | Thiết kế Wireframe giao diện (Dashboard CPO, Simulator, Driver Portal) | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `docs/SDLC/KT1/04_Wireframes.md` | ⬜ | Phối hợp cùng Lead Frontend. |

---

### PHẦN I — Hạ tầng Môi trường, Docker & CI/CD Staging (DevOps Track)

> **Mục tiêu:** Thiết lập môi trường Docker độc lập, CI/CD tự động và đồng bộ cấu hình giữa các thành viên.
> **Phụ trách:** Study332 + Hiếu + KimiCoNY | **Mốc nộp:** Toàn dự án
> **Đánh giá tiến độ:** ⚠️ **Cần xem xét (55%)** — Đã có container DB và Dockerfile Backend; **có xung đột cấu hình CSDL cần xử lý ngay**.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| I.1 | Container CSDL PostgreSQL cục bộ qua Docker | 🔴 P0 | [Buoc-03](plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md) | `docker-compose.yml` (Postgres 15) | ⚠️ | **XUNG ĐỘT:** Hiếu đặt DB `ev_charging_system`, user `admin`. Cần đồng bộ chuẩn `ev_csms_db`, user `postgres`. |
| I.2 | Đóng gói Backend Dockerfile & Dependencies | 🔴 P0 | [Buoc-03](plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md) | `backend/Dockerfile`, `requirements.txt` | 🔄 | Đã có Dockerfile Python 3.12-slim. Cần ghép service `backend` vào `docker-compose.yml`. |
| I.3 | Cấu hình biến môi trường mẫu (`.env.example`) | 🔴 P0 | [Buoc-03](plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md) | `.env.example`, `backend/.env.example` | ⚠️ | **CHƯA CÓ:** Thiếu file mẫu, gây lỗi tiềm ẩn khi dev mới clone code. |
| I.4 | Tự động hóa CI/CD GitHub Actions Pipeline | 🟡 P1 | — | `.github/workflows/main.yml` | 🔄 | Đã build Frontend. Cần bổ sung bước `npm run lint` và kiểm thử Backend `pytest`. |

---

### PHẦN II — Khung Backend Core, CSDL & Kênh Realtime (Backend Core Track - Cặp A)

> **Mục tiêu:** Xây dựng khung FastAPI phân tầng, kết nối SQLAlchemy 2.0, Alembic và WebSocket Telemetry Hub.
> **Phụ trách:** KimiCoNY (`BE1`) | **Mốc nộp:** KT2
> **Đánh giá tiến độ:** ⚠️ **Cần xem xét (Mới bắt đầu - 40% toàn mốc / 75% Task T-01)** — Đã có khung cơ bản, nhưng có nguy cơ crash và chưa mở CORS.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| II.1 | Scaffold FastAPI & Health Check endpoint | 🔴 P0 | [Buoc-04](plans/Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md) | `backend/app/main.py` (`/`) | ⚠️ | **XUNG ĐỘT:** Thiếu `CORSMiddleware`, Frontend port 5173 không gọi được API. |
| II.2 | Cấu hình Engine CSDL, SessionLocal, Dependency `get_db()` | 🔴 P0 | [Buoc-04](plans/Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md) | `backend/app/core/database.py` | ⚠️ | **XUNG ĐỘT:** `config.py` trỏ vào DB `csms` (sai lệch với `docker-compose.yml`). Cần hỗ trợ SQLite fallback. |
| II.3 | Quản lý Di chuyển Lược đồ Alembic Migrations | 🔴 P0 | [Buoc-03](plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md) | `backend/alembic.ini`, `migrations/` | ⚠️ | **NGUY CƠ CRASH:** `env.py` gọi `None.replace(...)` khi thiếu `.env`. Cần lấy trực tiếp từ `settings.database_url`. |
| II.4 | WebSocket Manager & Cơ chế cấp vé bắt tay Ticket Handshake | 🔴 P0 | [Buoc-04](plans/Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md) | `backend/app/core/websocket.py` | ⬜ | Chưa bắt đầu, chuẩn bị viết ở task tiếp theo theo `sodo.md`. |
| II.5 | Xác thực JWT & Phân quyền RBAC (Admin, Operator, Driver) | 🔴 P0 | [Buoc-05](plans/Buoc-05-Xac-thuc-Dang-nhap-va-Phan-quyen-RBAC.md) | `api/v1/endpoints/auth.py`, `security.py` | ⬜ | Chưa bắt đầu, chờ hoàn thiện CSDL User model. |

---

### PHẦN III — Khung Giao diện Web Frontend & Layout CPO (Frontend Track - Cặp A)

> **Mục tiêu:** Xây dựng khung ứng dụng React 19 + Vite, hệ thống layout và Auth Context cho đơn vị vận hành.
> **Phụ trách:** Hiếu (`FE1`) + Study332 | **Mốc nộp:** KT3
> **Đánh giá tiến độ:** ⚠️ **Cần xem xét (Mới bắt đầu - 30% toàn mốc / 85% Task S-01)** — Khung chạy tốt nhưng thiếu styling Tailwind và Proxy.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| III.1 | Khởi tạo dự án Vite + React 19 + Oxlint | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `frontend/package.json`, `.oxlintrc.json` | ✅ | Chạy mượt tại `localhost:5173`, dọn sạch template rác. |
| III.2 | Cài đặt Tailwind CSS & Design System quy chuẩn | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `tailwind.config.js`, `src/index.css` | ⚠️ | **XUNG ĐỘT:** Hiện dùng CSS thuần. `sodo.md` bắt buộc dùng Tailwind CSS để đồng bộ giao diện. |
| III.3 | Cấu hình Vite Proxy chuyển tiếp `/api` và `/ws` | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `frontend/vite.config.js` | ⚠️ | **CHƯA CÓ:** Proxy đang để trống, chưa trỏ về backend port 8000. |
| III.4 | Hệ thống Layout (Sidebar, Navbar) & AuthContext | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/context/AuthContext.jsx`, `Layout.jsx` | ⬜ | Chưa bắt đầu. |
| III.5 | CPO Dashboard: Thống kê phụ tải trạm & Recharts | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Dashboard.jsx` | ⬜ | Chưa bắt đầu. |

---

### PHẦN IV — Quản trị Hạ tầng Trạm, Trụ, Cổng & Biểu giá TOU (Station Track - Cặp B)

> **Mục tiêu:** Xây dựng mô hình dữ liệu và CRUD APIs cho mạng lưới trạm sạc, cấu hình biểu giá điện linh hoạt.
> **Phụ trách:** Backend 2 + Frontend 2 (Cặp B) | **Mốc nộp:** KT2
> **Đánh giá tiến độ:** ⬜ **Chưa bắt đầu (0%)** — Sẽ kích hoạt ngay sau khi hoàn thiện CSDL mốc KT1.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| IV.1 | Thiết kế CSDL & Sơ đồ ERD các thực thể trạm sạc | 🔴 P0 | [Buoc-02](plans/Buoc-02-Thiet-ke-CSDL-va-So-do-ERD.md) | `docs/SDLC/KT1/02_Database_Design_ERD.md` | ⬜ | Bảng Station, ChargingPoint, Connector. |
| IV.2 | Models SQLAlchemy & CRUD APIs Trạm sạc (`Station`) | 🔴 P0 | [Buoc-06](plans/Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md) | `app/models/station.py`, `endpoints/stations.py` | ⬜ | Ràng buộc quyền sở hữu CPO (Multi-tenancy). |
| IV.3 | Quản lý Trụ sạc (`ChargingPoint`) và Cổng sạc (`Connector`) | 🔴 P0 | [Buoc-06](plans/Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md) | `endpoints/chargers.py` | ⬜ | Đảm bảo trạng thái độc quyền cổng sạc. |
| IV.4 | Cấu hình Biểu giá TOU linh hoạt & Phí chiếm chỗ | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `app/models/tariff.py`, `endpoints/tariffs.py` | ⬜ | Khung giờ cao điểm, thấp điểm, bình thường. |
| IV.5 | Giao diện Quản lý Trạm & Biểu giá trên Web | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Stations.jsx`, `Tariffs.jsx` | ⬜ | FE2 phụ trách. |

---

### PHẦN V — Ví điện tử ACID, Phiên sạc & Realtime Simulator (Session & Simulator Track - Cặp C)

> **Mục tiêu:** Trọng tâm kỹ thuật bảo toàn dữ liệu: Giao dịch trừ tiền ví không âm và bộ giả lập đo đếm sạc xe.
> **Phụ trách:** Backend 3 + Frontend 3 (Cặp C) | **Mốc nộp:** KT2 / KT3
> **Đánh giá tiến độ:** ⬜ **Chưa bắt đầu (0%)** — Sẽ kích hoạt khi có khung CSDL và WebSocket.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| V.1 | Ví điện tử (`Wallet`) & Giao dịch ACID chống âm số dư | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `services/wallet_service.py` | ⬜ | Bắt buộc dùng `with_for_update` và CHECK (balance >= 0). |
| V.2 | Quản lý Vòng đời Phiên sạc & Quyết toán Hóa đơn | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `services/session_service.py` | ⬜ | Hold 50.000đ trước khi sạc; chốt số kWh. |
| V.3 | Charging Simulator: Đường cong sạc CC-CV & Rơ-le an toàn | 🔴 P0 | [Buoc-08](plans/Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md) | `app/simulator/charging_simulator.py` | ⬜ | Ngắt khẩn cấp khi $T > 85^\circ\text{C}$ hoặc hết tiền ví. |
| V.4 | In-Memory State Buffer & Phát sóng Telemetry 2-5s | 🔴 P0 | [Buoc-08](plans/Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md) | WebSocket Stream `/ws/telemetry` | ⬜ | Giảm tải I/O đĩa, cập nhật RAM theo `sodo.md`. |
| V.5 | Màn hình Mô phỏng Cắm sạc & Driver Portal | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Simulator.jsx`, `Wallet.jsx` | ⬜ | FE3 phụ trách: Đồng hồ LiveGauge & Nạp tiền Sandbox. |

---

### PHẦN VI — Phân hệ Trí tuệ Nhân tạo & Heuristic Fallback (AI Engine Track)

> **Mục tiêu:** Kiến trúc 2 vòng lặp (Dual-Loop): Fast Loop Heuristic chia tải tức thời + Slow Loop Gemini API phân tích chiến lược.
> **Phụ trách:** Backend 3 + Frontend 2 | **Mốc nộp:** KT3
> **Đánh giá tiến độ:** ⬜ **Chưa bắt đầu (0%)**.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| VI.1 | Fast Loop: Heuristic điều phối công suất (Proportional Sharing) | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | `services/smart_charging_service.py` | ⬜ | Đảm bảo $\sum P_i \le P_{\text{grid\_max}}$ mỗi tick. |
| VI.2 | Slow Loop: Tích hợp Google Gemini API phân tích phụ tải | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | `services/ai_service.py` | ⬜ | Chu kỳ 1–5 phút; dự báo xu hướng bảo trì trụ sạc. |
| VI.3 | Heuristic Fallback Engine khi mất mạng / lỗi 429 Quota | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | `services/fallback_service.py` | ⬜ | Đảm bảo hệ thống web hoạt động 100% offline. |
| VI.4 | Màn hình AI Advisor: Load Balancing & Cảnh báo bảo trì | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/AIAdvisor.jsx` | ⬜ | FE2 phụ trách hiển thị biểu đồ và khuyến nghị. |

---

### PHẦN VII — Kiểm thử Tự động, Seed Data & Đóng gói Bàn giao (QA & Release Track)

> **Mục tiêu:** Kiểm thử tự động toàn diện, chuẩn bị dữ liệu mẫu sinh động và kịch bản demo bảo vệ trước hội đồng.
> **Phụ trách:** Cả 6 thành viên | **Mốc nộp:** Cuối kỳ (Final)
> **Đánh giá tiến độ:** ⬜ **Chưa bắt đầu (0%)**.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái | Ghi chú & Xung đột kiến trúc |
|---|---|:---:|---|---|:---:|---|
| VII.1 | Bộ Test Pytest tự động: Test ACID ví tiền & ngắt an toàn | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | `backend/tests/` (100% Pass) | ⬜ | Chống test giả: Assert dữ liệu thật, không mock lớp test. |
| VII.2 | Script `seed_data.py`: Tạo 3 trạm GPS thật, 8 trụ, 15 ví, 50 phiên sạc | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | `backend/seed_data.py` | ⬜ | Dữ liệu mẫu phong phú phục vụ demo hội đồng. |
| VII.3 | Hoàn thiện toàn bộ hồ sơ nộp SDLC (KT1, KT2, KT3, Final) | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | Thư mục `docs/SDLC/` đầy đủ | ⬜ | Khớp tiêu chí chấm điểm bài tập cá nhân. |
| VII.4 | Đóng gói Kịch bản Demo thực nghiệm (Showcase Script) | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | Video / Slide & Kịch bản tương tác | ⬜ | Demo cắm sạc, trừ ví, quá nhiệt $85^\circ\text{C}$ và AI chia tải. |

---

## Lịch sử cập nhật

| Ngày | Người thực hiện | Thay đổi |
|:---:|:---:|---|
| 2026-09-22 | KimiCoNY (`dtc245010029`) | Khởi tạo khung Backend FastAPI + SQLAlchemy 2.0 + Alembic migrations + Dockerfile (Commit `8d6818d`, Merge `c731ae7` - Task T-01) |
| 2026-09-22 | Study332 (`Study332`) | Review merge PR #1 và thiết lập CI/CD GitHub Actions Pipeline cho Frontend (Commit `99a2241`, `bbc706f`) |
| 2026-09-22 | Hiếu (`hieudz1235`) | Khởi tạo khung Frontend React 19 + Vite + Oxlint và cấu hình Docker PostgreSQL cục bộ (Commit `9c3a00e`, PR #1 - Task S-01) |
| 2026-09-22 | dtc245090028 | Cập nhật đồng bộ Master Roadmap với sodo.md và các file kế hoạch Buoc-01 đến Buoc-11 |
| 2026-09-22 | dtc245090028 | Khởi tạo lại toàn bộ Master Roadmap chuyển đổi sang Nền tảng vận hành trạm sạc xe điện (EV CSMS) |
