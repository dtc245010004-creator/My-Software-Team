# MASTER ROADMAP

## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

> **Vai trò của file này:** Bức tranh toàn cảnh — la bàn định hướng cho toàn bộ dự án và liên kết sang từng bước thực thi chi tiết.
> Xem `GEMINI.md §9` để hiểu quy ước nguồn sự thật và khi nào cập nhật file này.

---

## Phân cấp nguồn sự thật

```text
docs/plans/TIEN-DO.md          ← Trạng thái thực tế (tick ✅ ở đây là chính thức)
     ↑ đồng bộ
MASTER-ROADMAP.md   ← Bức tranh toàn cảnh + điều hướng (file này)
     ↓ link sang
Buoc-NN.md          ← Spec thực thi chi tiết cho từng bước
```

**Khi hai file mâu thuẫn:** TIEN-DO.md thắng về trạng thái; Buoc-NN.md thắng về cách làm.

---

## Trạng thái tổng quan

| Giai đoạn | Mô tả | Mốc SDLC | Tiến độ |
| :---: | --- | :---: | :---: |
| **0** | Nền tảng dự án & Khởi tạo tài liệu | — | ✅ Hoàn thành |
| **1** | Đặc tả & Thiết kế CSDL (ERD) | KT1 | ✅ Hoàn thành |
| **2** | Backend Auth + Quản lý Hạ tầng trạm | KT2 | ⬜ Chưa bắt đầu |
| **3** | Biểu giá, Ví tiền & Phiên sạc (ACID) | KT2 | ⬜ Chưa bắt đầu |
| **4** | Simulator sạc xe điện & Telemetry WebSocket | KT2 | ⬜ Chưa bắt đầu |
| **5** | AI Smart Charging, Bảo trì & Fallback | KT3 | ⬜ Chưa bắt đầu |
| **6** | Xây dựng Frontend Web (React + Tailwind) | KT3 | ⬜ Chưa bắt đầu |
| **7** | Kiểm thử, Seed Data & Đóng gói Cuối kỳ | Cuối kỳ | ⬜ Chưa bắt đầu |

> **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét

---

## Chi tiết từng giai đoạn

---

### GIAI ĐOẠN 0 — Nền tảng dự án & Khởi tạo

> **Mục tiêu:** Hoàn thiện khung đặc tả, sơ đồ kiến trúc và quy ước làm việc trước khi viết mã nguồn.
> **Dependency:** Không có — thực hiện đầu tiên.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 0.1 | Khởi tạo đặc tả `nentang.md`, `Prompt.md` & `sodo.md` | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `nentang.md`, `Prompt.md`, `sodo.md` | ✅ |
| 0.2 | Chuẩn hóa `GEMINI.md`, `CLAUDE.md`, `README.md`, `HUONGDAN.md` | 🔴 P0 | — | File quy tắc & hướng dẫn vận hành | ✅ |
| 0.3 | Cấu hình Backend: `requirements.txt`, `.env.example`, `database.py` | 🔴 P0 | [Buoc-03](plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md) | FastAPI app khởi động được tại `/health` | ✅ |
| 0.4 | Khởi tạo Frontend: React 18 + Vite + Tailwind CSS + Lucide Icons | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | Frontend chạy được tại `localhost:5173` | ⬜ |

---

### GIAI ĐOẠN 1 — Thiết kế Hệ thống & Hồ sơ KT1

> **Mục tiêu:** Hoàn thiện đặc tả chi tiết và thiết kế CSDL trên giấy trước khi viết mã nguồn.
> **Mốc nộp bài:** KT1

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 1.1 | Tài liệu SRS & Use Case (Admin, Operator/CPO, Driver) | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `docs/SDLC/KT1/01_SRS_and_UseCases.md` | ✅ |
| 1.2 | Thiết kế CSDL & Sơ đồ ERD (Stations, Chargers, Sessions, Wallets, Tariffs) | 🔴 P0 | [Buoc-02](plans/Buoc-02-Thiet-ke-CSDL-va-So-do-ERD.md) | `docs/SDLC/KT1/02_Database_Design_ERD.md` | ✅ |
| 1.3 | Kiến trúc AI (Smart Charging, Predictive Maintenance & Heuristic Fallback) | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `docs/SDLC/KT1/03_AI_Architecture_and_Prompts.md` | ✅ |
| 1.4 | Thiết kế Wireframe giao diện (Dashboard CPO, Simulator, Driver Portal) | 🔴 P0 | [Buoc-01](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | `docs/SDLC/KT1/04_Wireframes.md` | ✅ |
| 1.5 | Cài đặt SQLAlchemy Models tương ứng | 🔴 P0 | [Buoc-02](plans/Buoc-02-Thiet-ke-CSDL-va-So-do-ERD.md) | `backend/app/models/*.py` | 🔄 |

---

### GIAI ĐOẠN 2 — Backend Auth, RBAC & Quản lý Hạ tầng trạm sạc

> **Mục tiêu:** Hoàn thành xác thực người dùng và API quản lý trạm, trụ, cổng sạc.
> **Dependency:** Giai đoạn 1 (Models đã có).

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 2.1 | Pydantic Schemas cho Users, Stations, ChargingPoints, Connectors | 🔴 P0 | [Buoc-04](plans/Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md) | `backend/app/schemas/*.py` | ⬜ |
| 2.2 | Xác thực Auth (JWT, bcrypt) & phân quyền RBAC (`admin`, `operator`, `customer`) | 🔴 P0 | [Buoc-05](plans/Buoc-05-Xac-thuc-Dang-nhap-va-Phan-quyen-RBAC.md) | `api/v1/endpoints/auth.py`, `core/security.py` | ⬜ |
| 2.3 | CRUD Trạm sạc (`Station`) & cấu hình công suất nguồn lưới | 🔴 P0 | [Buoc-06](plans/Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md) | `api/v1/endpoints/stations.py` | ⬜ |
| 2.4 | Quản lý Trụ sạc (`ChargingPoint`) và Cổng sạc (`Connector`: CCS2, Type 2) | 🔴 P0 | [Buoc-06](plans/Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md) | `api/v1/endpoints/chargers.py` | ⬜ |

---

### GIAI ĐOẠN 3 — Biểu giá, Ví điện tử & Phiên sạc (ACID) ⭐ Trọng tâm kỹ thuật

> **Mục tiêu:** Hiện thực hóa logic tính tiền, trừ ví và quản lý phiên sạc tuyệt đối không sai lệch.
> **Dependency:** Giai đoạn 2.
> **Mốc nộp bài:** KT2

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 3.1 | Cấu hình Biểu giá linh hoạt (`Tariff`: giá TOU theo giờ cao/thấp điểm) | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `api/v1/endpoints/tariffs.py` | ⬜ |
| 3.2 | Ví điện tử (`Wallet`) & Nạp tiền: Giao dịch ACID chống âm số dư | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `services/wallet_service.py` | ⬜ |
| 3.3 | Bắt đầu & Dừng phiên sạc (`ChargingSession`): Khóa cổng sạc độc quyền | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `services/session_service.py` | ⬜ |
| 3.4 | Quyết toán phiên sạc: Trừ tiền ví, xuất hóa đơn điện tử | 🔴 P0 | [Buoc-07](plans/Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | `api/v1/endpoints/sessions.py` | ⬜ |

---

### GIAI ĐOẠN 4 — Module Giả lập Trạm sạc (Charging Simulator & Telemetry)

> **Mục tiêu:** Xây dựng module giả lập sạc pin xe điện sinh động phục vụ demo và kiểm thử.
> **Dependency:** Giai đoạn 3.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 4.1 | Thuật toán mô phỏng đường cong sạc pin xe (SoC %, kW, V, A, nhiệt độ) | 🔴 P0 | [Buoc-08](plans/Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md) | `app/simulator/charging_simulator.py` | ⬜ |
| 4.2 | Kết nối WebSocket phát dữ liệu đo đếm realtime định kỳ | 🔴 P0 | [Buoc-08](plans/Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md) | `app/core/websocket.py`, `/ws/telemetry` | ⬜ |
| 4.3 | Tự động kích hoạt dừng sạc khi: Pin đầy (100%), Hết tiền ví, hoặc Sự cố | 🔴 P0 | [Buoc-08](plans/Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md) | Ngắt sạc an toàn | ⬜ |

---

### GIAI ĐOẠN 5 — Tích hợp AI (Smart Charging & Bảo trì) + Fallback

> **Mục tiêu:** Ứng dụng AI thông minh có giá trị thực tế kết hợp cơ chế Fallback vững chắc.
> **Dependency:** Giai đoạn 4.
> **Mốc nộp bài:** KT3

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 5.1 | Tích hợp Google Gemini API: Phân tích và tạo khuyến nghị | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | `services/ai_service.py` | ⬜ |
| 5.2 | Smart Charging: Điều phối công suất chống quá tải nguồn trạm | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | API `/api/v1/ai/smart-charging` | ⬜ |
| 5.3 | Predictive Maintenance: Phát hiện quá nhiệt và cảnh báo trụ sạc xuống cấp | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | API `/api/v1/ai/predictive-maintenance` | ⬜ |
| 5.4 | Heuristic Fallback Engine: Tự động chia tải và cảnh báo khi mất mạng/hết quota | 🔴 P0 | [Buoc-09](plans/Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | `services/fallback_service.py` | ⬜ |

---

### GIAI ĐOẠN 6 — Xây dựng Giao diện Web Frontend (React + Tailwind)

> **Mục tiêu:** Giao diện Web hiện đại, trực quan, phục vụ CPO, tài xế và giả lập sạc.
> **Dependency:** Giai đoạn 3, 4, 5.

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 6.1 | Auth Flow: Đăng nhập, đăng ký, lưu token, bảo vệ Route | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/context/AuthContext.jsx` | ⬜ |
| 6.2 | Dashboard CPO: Thống kê doanh thu, trạng thái trụ, công suất trạm | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Dashboard.jsx` | ⬜ |
| 6.3 | Quản lý Trạm, Trụ sạc & Biểu giá | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Stations.jsx` | ⬜ |
| 6.4 | Màn hình Giả lập sạc (Simulator UI) & Đồ thị Realtime Recharts | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Simulator.jsx` | ⬜ |
| 6.5 | Driver Portal: Quản lý ví tiền, nạp tiền, phiên sạc của tôi | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/Wallet.jsx`, `Sessions.jsx` | ⬜ |
| 6.6 | AI Advisor UI: Xem khuyến nghị điều phối công suất & bảo trì | 🔴 P0 | [Buoc-10](plans/Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | `src/pages/AIAdvisor.jsx` | ⬜ |

---

### GIAI ĐOẠN 7 — Kiểm thử, Seed Data & Đóng gói Cuối kỳ

> **Mục tiêu:** Hệ thống kiểm thử đầy đủ, dữ liệu mẫu phong phú và kịch bản demo hoàn hảo.
> **Mốc nộp bài:** Cuối kỳ (Final)

| # | Nhiệm vụ | Ưu tiên | Kế hoạch chi tiết | Deliverable | Trạng thái |
| --- | --- | :---: | --- | --- | :---: |
| 7.1 | Bộ Test Pytest: Test ACID ví tiền, test phiên sạc, test Fallback AI | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | `backend/tests/` pass 100% | ⬜ |
| 7.2 | Script Seed Data: Tạo trạm sạc, trụ sạc, khách hàng, lịch sử phiên sạc | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | `backend/seed_data.py` | ⬜ |
| 7.3 | Hoàn thiện tài liệu SDLC (KT1 -> KT2 -> KT3 -> Final) | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | Thư mục `docs/SDLC/` đầy đủ | ⬜ |
| 7.4 | Kịch bản Demo thực tế phục vụ báo cáo hội đồng | 🔴 P0 | [Buoc-11](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | Hướng dẫn chạy & kịch bản demo | ⬜ |

---

## Lịch sử cập nhật

| Ngày | Người thực hiện | Thay đổi |
| :---: | :---: | --- |
| 2026-09-25 | AI | Đồng bộ hoàn thành Giai đoạn 0 (task 0.3) và toàn bộ hồ sơ KT1 Giai đoạn 1 (SRS, ERD, AI, Wireframes) |
| 2026-09-22 | AI | Cập nhật đồng bộ Master Roadmap với sodo.md và các file kế hoạch Buoc-01 đến Buoc-11 |
| 2026-09-22 | AI | Khởi tạo lại toàn bộ Master Roadmap chuyển đổi sang Nền tảng vận hành trạm sạc xe điện (EV CSMS) |
