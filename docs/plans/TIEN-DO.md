# NHẬT KÝ TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS TRACKER)

## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

---

### QUY ĐỊNH VỀ RANH GIỚI TÀI LIỆU

- **`docs/plans/` (Kế hoạch & Nhiệm vụ)**: Chứa 11 file kế hoạch độc lập (`Buoc-01-...md` đến `Buoc-11-...md`) và file nhật ký tiến độ này. Đây là tài liệu điều phối quá trình phát triển (Internal Execution Plans).
- **`docs/SDLC/` (Sản phẩm bàn giao - Deliverables)**: Chứa toàn bộ hồ sơ kỹ thuật, báo cáo, thiết kế dùng để nộp bài và chấm điểm theo 4 mốc bài tập cá nhân (`KT1/`, `KT2/`, `KT3/`, `final/`).
- **Nguồn sự thật về trạng thái**: File này (`docs/plans/TIEN-DO.md`) là **Nguồn sự thật tối cao (Single Source of Truth)** về trạng thái hoàn thành của từng bước và giai đoạn trong toàn bộ dự án.

---

### BẢNG THEO DÕI TIẾN ĐỘ CHUẨN (PROGRESS MATRIX)

> **Hướng dẫn cập nhật:**
>
> - Định dạng ngày: `YYYY-MM-DD`
> - Quy ước trạng thái: `Chưa bắt đầu` | `Đang thực hiện` | `Hoàn thành` | `Cần xem xét`
> - Mọi thay đổi về trạng thái hoặc sản phẩm bàn giao thực tế trong các file kế hoạch `Buoc-01` đến `Buoc-11` đều được phản ánh đồng bộ tại bảng này.

| Ngày cập nhật | Mã bước | Kế hoạch chi tiết | Trạng thái | Sản phẩm bàn giao (Deliverables) đã sinh | Ghi chú kỹ thuật & Đánh giá nghiệm thu |
| :---: | :---: | :--- | :---: | :--- | :--- |
| 2026-09-25 | Bước 01 | [Đặc tả Yêu cầu & Phân tích Nghiệp vụ](Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) | Hoàn thành | `docs/SDLC/KT1/01_SRS_and_UseCases.md`, `nentang.md`, `Prompt.md`, `sodo.md`, `docs/SDLC/KT1/03_AI_Architecture_and_Prompts.md`, `docs/SDLC/KT1/04_Wireframes.md` | Đặc tả 3 Actor (Admin, CPO/Operator, Driver/Customer), ma trận quyền hạn CRUD, sơ đồ Use Case, luồng sạc - ví - ngắt khẩn cấp, phạm vi 3 bài toán AI và Heuristic Fallback. |
| 2026-09-25 | Bước 02 | [Thiết kế CSDL & Sơ đồ ERD](Buoc-02-Thiet-ke-CSDL-va-So-do-ERD.md) | Hoàn thành | `docs/SDLC/KT1/02_Database_Design_ERD.md` | Thiết kế CSDL 3NF với 9 bảng cốt lõi (User, Wallet, Transaction, Station, ChargingPoint, Connector, Tariff, Session, Maintenance), Mermaid ERD, Từ điển dữ liệu Data Dictionary, DDL SQLite & PostgreSQL. |
| 2026-09-25 | Bước 03 | [Cấu hình Môi trường, Biến Môi trường & CSDL](Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md) | Hoàn thành | `.env.example`, `backend/.env.example`, `backend/.env`, `backend/requirements.txt`, `backend/app/core/config.py` | Cấu hình Python 3.10+, FastAPI, SQLAlchemy, Pydantic Settings đọc biến môi trường, SQLite local (`sqlite:///./ev_csms.db`), CORS, JWT, WebSockets và Pytest. |
| 2026-09-25 | Bước 04 | [Cấu trúc Backend, Session & WebSocket Manager](Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md) | Hoàn thành | `backend/app/main.py`, `backend/app/core/database.py`, `backend/app/core/websocket.py`, `backend/app/api/v1/__init__.py` | Kiến trúc phân tầng Layered Architecture (Routers -> Services -> Models -> Schemas), SQLite WAL mode + Foreign Keys ON, ConnectionManager quản lý WebSocket telemetry, endpoint `/health` kiểm tra hệ thống. |
| 2026-09-25 | Bước 05 | [Xác thực, Đăng nhập & Phân quyền RBAC](Buoc-05-Xac-thuc-Dang-nhap-va-Phan-quyen-RBAC.md) | Hoàn thành | `backend/app/core/security.py`, `backend/app/models/user.py`, `backend/app/models/wallet.py`, `backend/app/schemas/user.py`, `backend/app/api/deps.py`, `backend/app/api/v1/endpoints/auth.py`, `backend/tests/test_auth.py` | Mã hóa mật khẩu bcrypt (rounds=12, loại bỏ passlib cũ), phát hành JWT token, tạo User + tạo Wallet (0 VND) nguyên tử trong 1 Transaction, chặn Privilege Escalation (role gán cứng CUSTOMER), RBAC 3 vai trò, 12/12 tests passed. |
| 2026-09-25 | Bước 06 | [Module Quản lý Hạ tầng Trạm, Trụ & Cổng sạc](Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md) | Hoàn thành | `backend/app/models/station.py`, `backend/app/schemas/station.py`, `backend/app/services/station_service.py`, `backend/app/api/v1/endpoints/stations.py`, `backend/app/api/v1/endpoints/chargers.py`, `backend/tests/test_stations.py` | Phân cấp 3 tầng (Station -> ChargingPoint -> Connector), chuẩn hóa enum `status` (ACTIVE/MAINTENANCE) tách bạch cờ `is_active` (soft-delete/reactivate), tính toán Oversubscription 2 cấp độ (Trạm và Trụ), định vị Haversine + Bounding Box + phân trang, chống IDOR 2 cấp độ, Cascade Atomicity 1 transaction, phát sự kiện WS STATUS_CHANGED, 12/12 tests passed. |
| 2026-09-25 | Bước 07 | [Module Biểu giá, Ví điện tử & Phiên sạc (ACID)](Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md) | Hoàn thành | `backend/app/models/tariff.py`, `backend/app/models/wallet.py`, `backend/app/models/session.py`, `backend/app/schemas/tariff.py`, `backend/app/schemas/wallet.py`, `backend/app/schemas/session.py`, `backend/app/services/wallet_service.py`, `backend/app/services/session_service.py`, `backend/app/api/v1/endpoints/tariffs.py`, `backend/app/api/v1/endpoints/wallet.py`, `backend/app/api/v1/endpoints/sessions.py`, `backend/alembic/`, `backend/tests/test_sessions_acid.py`, `docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md` | Biểu giá TOU 3 khung giờ chốt giá lúc cắm sạc, trừ ví ACID có khóa bi quan `with_for_update`, chính sách nợ an toàn (cho phép âm đến -300k VND, nợ kích hoạt `is_debt_locked`), khóa cổng sạc độc quyền Atomic Conditional Update, Idempotency, IDOR guard, test Concurrency thật bằng ThreadPoolExecutor (201 vs 409), 9/9 tests passed (toàn suite 34/34). |
| 2026-09-25 | Bước 08 | [Module Giả lập Trạm sạc (Simulator & Telemetry)](Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md) | Hoàn thành | `backend/app/simulator/charging_simulator.py`, `backend/app/api/v1/endpoints/simulator.py`, `backend/tests/test_simulator.py`, `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md` | Giả lập đường cong sạc pin CC-CV chân thực ($kWh = \int P(t) dt$), phát telemetry 2s/lần qua WebSocket phân luồng room theo `session_id`, Auto Cut-off trong 3 tình huống (Pin đầy 100%, Quá nhiệt >75°C, Nợ ví -300k), Checkpoint DB 30s, Startup Crash Reconciliation xử lý phiên sạc mồ côi, API điều khiển Simulator có RBAC Admin/CPO, 9/9 tests passed (với Time Acceleration, toàn suite 43/43). |
| 2026-09-25 | Bước 09 | [Module AI: Điều phối tải, Bảo trì & Fallback](Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md) | Hoàn thành | `backend/app/services/ai_service.py`, `backend/app/services/fallback_service.py`, `backend/app/services/scheduler_service.py`, `backend/app/schemas/ai.py`, `backend/app/api/v1/endpoints/ai.py`, `backend/tests/test_ai_fallback.py`, `docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md` | AI Dual-Loop (Fast Loop Heuristic 100% offline + Slow Loop Gemini AI grounding). Smart Charging phân bổ công suất chống quá tải, Predictive Maintenance cảnh báo quá nhiệt/sụt áp, Pricing Advice đề xuất TOU, Trợ lý AI Ask. APScheduler quét tải tự động 3 phút/lần. Timeout 5s tự động fallback sang Heuristic, 21/21 tests passed (toàn suite 64/64). |
| 2026-09-25 | Bước 10 | [Xây dựng Frontend Web (React + Tailwind + Charts)](Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md) | Hoàn thành | `frontend/package.json`, `frontend/vite.config.js`, `frontend/tailwind.config.js`, `frontend/src/App.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/services/api.js`, `frontend/src/services/websocket.js`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Stations.jsx`, `frontend/src/pages/Simulator.jsx`, `frontend/src/pages/Wallet.jsx`, `frontend/src/pages/Sessions.jsx`, `frontend/src/pages/AIAdvisor.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/components/...`, `docs/SDLC/KT3/02_Frontend_Architecture_and_UI_Guide.md` | Giao diện công nghiệp tông màu Obsidian `#0B0F17` & Panel Slate `#151D2A`, React 18 + Vite + Tailwind CSS + Recharts + Lucide Icons, Demo Role Switcher 1-click (Admin, CPO, Driver), CPO Dashboard (Busbar load, phụ tải 24h, trạng thái trụ), Simulator UI (đường cong CC-CV realtime, nút quá nhiệt khẩn cấp), Driver Portal (nạp ví nhanh +50k-+500k, lịch sử ACID, hóa đơn TOU), AI Advisor UI (3 màn hình riêng biệt + NLP Chatbot). |
| 2026-09-25 | Bước 11 | [Bộ Test Tự động, Seed Data & Đóng gói SDLC](Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md) | Hoàn thành | `backend/tests/test_wallet_acid.py`, `backend/tests/test_sessions.py`, `backend/seed_data.py`, `docs/SDLC/final/01_Final_Technical_Report.md`, `docs/SDLC/final/02_User_Guide_and_Demo_Script.md`, `docs/SDLC/final/03_Presentation_Slides.md` | Bộ test tự động Pytest toàn diện đạt 74/74 tests passed 100% (Zero regression), script `seed_data.py` nạp 3 trạm sạc lớn (Vincom HN, Cầu Rồng ĐN, Landmark 81 HCM), 9 trụ sạc AC/DC, 18 cổng sạc, 62 phiên sạc thực tế; bộ tài liệu bàn giao mốc Cuối kỳ đầy đủ (Báo cáo kỹ thuật tổng kết, Sổ tay vận hành 1-click & Kịch bản demo 15 phút, Đề cương 15 slide bảo vệ). |

---

### BẢNG THEO DÕI THEO MỐC ĐÁNH GIÁ SDLC (DELIVERABLES MATRIX)

Hồ sơ bàn giao thực tế phân bổ theo 4 mốc chấm điểm bài tập cá nhân / đồ án:

| Mốc kiểm tra | Các bước bao hàm | Hồ sơ bàn giao kỹ thuật trong `docs/SDLC/` | Trạng thái hồ sơ |
| :---: | :--- | :--- | :---: |
| **KT1** | Bước 01, Bước 02 | - [`docs/SDLC/KT1/01_SRS_and_UseCases.md`](../SDLC/KT1/01_SRS_and_UseCases.md): Đặc tả yêu cầu SRS & 3 Actor<br>- [`docs/SDLC/KT1/02_Database_Design_ERD.md`](../SDLC/KT1/02_Database_Design_ERD.md): Hồ sơ thiết kế CSDL 9 bảng & Mermaid ERD<br>- [`docs/SDLC/KT1/03_AI_Architecture_and_Prompts.md`](../SDLC/KT1/03_AI_Architecture_and_Prompts.md): Thiết kế AI Engine & Heuristic Fallback<br>- [`docs/SDLC/KT1/04_Wireframes.md`](../SDLC/KT1/04_Wireframes.md): Cấu trúc màn hình Dashboard, Simulator, Driver Portal | ✅ Hoàn thành 100% |
| **KT2** | Bước 03, 04, 05, 06, 07, 08 | - [`docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md`](../SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md): Thiết kế giao dịch ví điện tử & phiên sạc ACID<br>- [`docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md`](../SDLC/KT2/03_Simulator_and_Telemetry_Design.md): Thiết kế bộ giả lập trạm sạc & telemetry thời gian thực | ✅ Hoàn thành 100% |
| **KT3** | Bước 09, Bước 10 | - [`docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md`](../SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md): Báo cáo tích hợp Gemini AI & Heuristic Fallback<br>- [`docs/SDLC/KT3/02_Frontend_Architecture_and_UI_Guide.md`](../SDLC/KT3/02_Frontend_Architecture_and_UI_Guide.md): Kiến trúc Frontend & Hướng dẫn giao diện người dùng | ✅ Hoàn thành 100% |
| **Cuối kỳ (Final)** | Bước 11 | - [`docs/SDLC/final/01_Final_Technical_Report.md`](../SDLC/final/01_Final_Technical_Report.md): Báo cáo kỹ thuật tổng kết toàn diện 11 bước<br>- [`docs/SDLC/final/02_User_Guide_and_Demo_Script.md`](../SDLC/final/02_User_Guide_and_Demo_Script.md): Sổ tay vận hành 1-click & Kịch bản demo 15 phút bảo vệ<br>- [`docs/SDLC/final/03_Presentation_Slides.md`](../SDLC/final/03_Presentation_Slides.md): Đề cương 15 slide bảo vệ đồ án trước hội đồng | ✅ Hoàn thành 100% |

---

#### KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST VERIFICATION)

Chạy thực tế với `pytest -v` tại thư mục `backend/` vào ngày **2026-09-26**:

```text
======================= 83 passed, 1 warning ========================
```

| Tên file test | Số ca kiểm thử (Cases) | Nội dung nghiệp vụ kiểm thử | Kết quả |
| :--- | :---: | :--- | :--- |
| `backend/tests/test_auth.py` | 12 | Đăng ký User + tạo Wallet nguyên tử, mã hóa bcrypt rounds=12, JWT access token, chặn privilege escalation, đăng nhập, bảo vệ RBAC | **12/12 PASSED** |
| `backend/tests/test_health.py` | 1 | Endpoint `/health` kiểm tra tính sẵn sàng của backend | **1/1 PASSED** |
| `backend/tests/test_stations.py` | 16 | Phân cấp Station-Charger-Connector, tìm kiếm Haversine + Bounding Box + phân trang, Oversubscription 2 cấp, Soft-Delete & Reactivate nguyên tử, chống IDOR 2 cấp, WebSocket event, Live Dashboard Metrics, Load Profile 12 khung giờ cũ, Load Profile Timeline 1440 phút và Bảo toàn 100% điện năng lũy kế (P_avg = ΔkWh * 60) bắt trọn phiên ngắn <60s | **16/16 PASSED** |
| `backend/tests/test_sessions_acid.py` | 9 | Cổng sạc độc quyền (Concurrency THẬT ThreadPoolExecutor 201 vs 409), biểu giá TOU 3 khung giờ chốt lúc start, trừ ví ACID có khóa bi quan, nợ âm an toàn đến -300k, chặn IDOR tài xế | **9/9 PASSED** |
| `backend/tests/test_simulator.py` | 10 | Đường cong sạc CC-CV, Auto Cut-off (Pin đầy 100%, Quá nhiệt >75°C, Nợ ví -300k), Checkpoint DB 30s, Startup Crash Reconciliation, Time Acceleration test, RBAC API trigger, Threadsafe coroutine khởi tạo an toàn từ worker thread | **10/10 PASSED** |
| `backend/tests/test_ai_fallback.py` | 21 | Thuật toán Heuristic Weighted Fair Sharing chia tải, quét ngưỡng cứng nhiệt độ/sụt áp, Pricing Advice TOU, trợ lý AI Ask, RBAC/IDOR endpoints AI, Mock Gemini API & tự động fallback khi lỗi, APScheduler định kỳ 3 phút | **21/21 PASSED** |
| `backend/tests/test_wallet_acid.py` | 5 | Nạp tiền vào ví, trừ tiền khi đủ số dư, cho phép nợ trong hạn mức, vượt hạn mức nợ kích hoạt khóa `is_debt_locked`, nạp bù nợ tự động mở khóa | **5/5 PASSED** |
| `backend/tests/test_sessions.py` | 5 | Vòng đời phiên sạc: Bắt đầu khi cổng AVAILABLE, chặn khi cổng CHARGING, chặn khi tài xế bị khóa nợ, chốt phiên sạc giải phóng cổng, tính lũy kế idempotency | **5/5 PASSED** |
| `backend/tests/test_driver_unauthenticated.py` | 4 | Kiểm thử toàn diện luồng Tài xế không cần đăng nhập: xem ví, nạp tiền QR kèm ghi tên, chọn dung lượng pin & mức pin ban đầu, bắt đầu/dừng sạc độc quyền | **4/4 PASSED** |
| **TỔNG CỘNG** | **82** | **Phủ kín toàn bộ các ranh giới kiến trúc cốt lõi (Zero Regression)** | **82/82 PASSED (100%)** |

---

### TỔNG HỢP CÁC QUYẾT ĐỊNH KIẾN TRÚC & ĐIỀU CHỈNH THỰC TẾ

Theo ghi nhận chi tiết tại Mục 5 của các file kế hoạch (`Buoc-05` -> `Buoc-11`), trong quá trình triển khai thực tế hệ thống đã thực hiện các cải tiến kỹ thuật quan trọng:

1. **Khởi tạo sớm Model `Wallet` (Bước 05)**:
   - Thay vì dời sang Bước 07, Model `Wallet` được tạo ngay tại Bước 05 nhằm đảm bảo tính nguyên tử: Mỗi khi User đăng ký thành công, CSDL bắt buộc tạo ngay 1 Wallet với số dư 0 VND trong cùng 1 Database Transaction, loại bỏ nguy cơ tài khoản "mồ côi" ví.
2. **Loại bỏ hoàn toàn thư viện `passlib` cũ (Bước 05)**:
   - Dùng trực tiếp `bcrypt.hashpw` và `bcrypt.checkpw` với cấu hình `BCRYPT_ROUNDS = 12` nạp từ `app/core/config.py`, khắc phục lỗi không tương thích trên Python 3.14.6 + `bcrypt >= 4.1.2`. Bổ sung validator kiểm tra giới hạn 72 bytes của bcrypt và chặn Mass Assignment (Privilege Escalation) ở API đăng ký.
3. **Chuẩn hóa trạng thái Trạm sạc & Tách bạch cờ Soft-Delete (Bước 06)**:
   - Trạng thái vận hành (`status`) của trạm chỉ còn 2 giá trị: `ACTIVE` và `MAINTENANCE` (loại bỏ hoàn toàn `INACTIVE`). Việc vô hiệu hóa / xóa mềm trạm được đảm nhiệm độc quyền bởi cờ logic `is_active: bool`. Thêm các endpoint chuyên biệt `POST /reactivate` với cam kết **Cascade Atomicity** trọn vẹn trong 1 transaction duy nhất.
4. **Kiểm soát phân quyền chống IDOR 2 cấp độ (Bước 06 & 07)**:
   - Operator chỉ có quyền thao tác trên trạm và trụ sạc thuộc quyền sở hữu của mình (bao gồm cả endpoint `PATCH /chargers/{id}/status`). Tài xế (`CUSTOMER`) không thể can thiệp phiên sạc hoặc tài sản của người khác.
5. **Chính sách Thấu chi Nợ An toàn & Khóa bi quan (Bước 07)**:
   - Áp dụng khóa bi quan `with_for_update` trên dòng ví khi trừ cước. Cho phép thấu chi nợ an toàn đến `-300,000` VND để đảm bảo xe không bị ngắt điện đột ngột giữa chừng; nếu chạm ngưỡng nợ, ví tự động chuyển cờ `is_debt_locked = True` và chặn mở phiên sạc mới cho đến khi nạp tiền hoàn trả.
6. **Mô hình CC-CV, Checkpoint DB & Startup Crash Reconciliation (Bước 08)**:
   - Giả lập CC duy trì công suất tối đa khi SoC < 80%, sau đó hạ dần công suất CV về 10kW. Cứ mỗi 30s ghi nhận snapshot điện năng xuống CSDL. Khi server khởi động lại sau sự cố mất điện, hàm `reconcile_interrupted_sessions` tự động quét các session còn dang dở, chốt thành `INTERRUPTED`, trừ tiền theo checkpoint gần nhất và giải phóng cổng sạc về `AVAILABLE`.
7. **Cơ chế AI Dual-Loop & Fallback Heuristic độc lập 100% (Bước 09)**:
   - Kiến trúc vòng lặp kép: Fast Loop (Heuristic Rules xử lý tức thì, bảo đảm 100% uptime ngay cả khi offline) kết hợp Slow Loop (Gemini API phân tích chuyên sâu). Bọc timeout 5s chống nghẽn và prompt grounding chống ảo giác.
8. **Bộ giao diện công nghiệp chuẩn EV CSMS & 1-click Demo Switcher (Bước 10)**:
   - Bảng màu công nghiệp Obsidian `#0B0F17` & Slate `#151D2A`, định dạng font số kỹ thuật số `tabular-nums`. Cung cấp thanh công cụ 1-click chuyển đổi vai trò Demo (`Admin`, `CPO`, `Driver`) phục vụ bảo vệ đồ án mượt mà mà không cần đăng xuất/đăng nhập lại.
9. **Dữ liệu mẫu thực tế & Kịch bản bảo vệ 15 phút (Bước 11)**:
   - Script `seed_data.py` nạp 3 trạm sạc lớn tại Hà Nội, Đà Nẵng, TP.HCM với 9 trụ sạc, 18 cổng sạc, 62 phiên sạc thực tế và 15 tài khoản ví tiền có sẵn số dư. Biên soạn đầy đủ kịch bản demo 15 phút và 15 slide thuyết trình phục vụ bảo vệ trước hội đồng.
10. **Chuyển dịch toàn diện sang Giá trị vận hành thực tế khi chạy (Runtime Dynamic Values)**:
   - Loại bỏ hoàn toàn 2 phiên sạc "ma" treo gán cứng trong `seed_data.py`; toàn bộ 9 trụ EVSE và 18 cổng sạc sau khi seed đều ở trạng thái ban đầu `AVAILABLE` (0 / 9 Trụ đang cấp nguồn, 0.0 kW không tải).
   - Bổ sung 2 endpoint backend chuyên biệt `GET /api/v1/stations/metrics/live` và `GET /api/v1/stations/metrics/load-profile` để đo đếm trực tiếp công suất tức thời trong RAM (`simulator_manager.active_simulators`), đồng bộ trạng thái trụ về `AVAILABLE` khi phiên sạc kết thúc.
   - Nâng cấp `Dashboard.jsx` và kênh WebSocket `GRID_TELEMETRY` để các thông số phụ tải lưới, số trụ cấp nguồn và đồ thị 24 giờ phản ánh 100% giá trị thật sinh động khi người dùng bắt đầu/dừng phiên sạc.
11. **Hỗ trợ Role Tài xế Tự do Không Cần Đăng Nhập & Cổng Nạp Tiền Chuyển Khoản QR Ghi Tên (Unauthenticated Driver Flow)**:
   - Chuẩn hóa ranh giới phân quyền: Quản trị viên (`ADMIN`) và CPO (`OPERATOR`) giữ nguyên cơ chế bảo vệ nghiêm ngặt bằng JWT + RBAC; riêng vai trò Tài xế (`CUSTOMER`) cho phép sử dụng tự do 100% mà không bị ép buộc đăng ký hay đăng nhập tài khoản.
   - Bổ sung dependency `get_current_user_or_driver_guest` tại backend: tự động liên kết tài xế khách với tài khoản ví hợp lệ, cho phép gọi `/wallet/me`, `/wallet/topup`, `/sessions/start`, `/sessions/stop`, `/sessions/me` ngay lập tức mà không cần token.
   - Nâng cấp giao diện Ví điện tử (`Wallet.jsx`): Khi nạp tiền, hiển thị cửa sổ Modal chuyên nghiệp gồm ô Ghi tên người nạp (`full_name`), chọn mệnh giá nạp, hiển thị mã VietQR chuyển khoản ngân hàng thời gian thực và nút **"XÁC NHẬN ĐÃ CHUYỂN TIỀN"** giúp cộng tiền ngay lập tức vào số dư khả dụng.
12. **Cấu hình Dung lượng Pin & Điền Mức Pin Hiện Có (Simulator Vehicle Config)**:
   - Mở rộng schema `SessionStartRequest` với 2 trường tuỳ biến: `battery_capacity_kwh: float` (10.0 - 250.0 kWh) và `initial_soc: float` (0.0% - 99.0%).
   - Tầng Simulator: Khởi tạo đường cong sạc CC-CV theo đúng dung lượng pin xe thực tế và tích hợp mức pin ban đầu do người dùng thiết lập, loại bỏ giá trị ngẫu nhiên khi người dùng chỉ định cụ thể.
   - Giao diện Simulator (`Simulator.jsx`): Bổ sung mục chọn nhanh mẫu xe/dung lượng pin (VF 5: 42kWh, VF 6: 60kWh, VF 8: 87.7kWh, VF 9: 123kWh hoặc tùy chỉnh) và thanh điều chỉnh / nhập số mức pin hiện có (10%, 20%, 35%, 50%, 70%...).
13. **Khắc phục Đứt gãy Async Coroutine từ Worker Thread & Đồng bộ Telemetry Tức thì**:
   - Giải quyết triệt để nguyên nhân Simulator bị kẹt thông số `0.0 kW, 0.0%, 30.0°C, 0 đ`: Endpoint `POST /sessions/start` là synchronous route chạy trên `ThreadPoolExecutor` của FastAPI. Trước đó hàm khởi tạo gọi `asyncio.get_event_loop()`, trên Python 3.10+/3.14 trong worker thread sẽ ném `RuntimeError: There is no current event loop in thread`.
   - Cung cấp cơ chế liên kết `SimulatorManager.set_main_loop(loop)` gắn với Main AsyncIO Event Loop trong FastAPI `lifespan` và điều phối an toàn qua `asyncio.run_coroutine_threadsafe(sim.run_loop(), target_loop)` khi được gọi từ worker thread.
   - Khi client gửi yêu cầu `{"action": "subscribe", "session_id": sid}` qua WebSocket, server lập tức đẩy ngay gói tin snapshot telemetry hiện tại, loại bỏ độ trễ 2 giây.
   - Nâng cấp giao diện Simulator (`Simulator.jsx`): Bổ sung thanh trạng thái rơ-le sạc trực quan (`MỞ - CHỜ BẬT RƠ-LE` vs `ĐÃ ĐÓNG RƠ-LE - ĐANG TRUYỀN PHÁT`), hiển thị mức pin hiện có do người dùng đã chọn thay vì `0.0%`, kèm chú thích trạng thái chờ cấp nguồn rõ ràng.
14. **Triển khai Biểu đồ Phụ Tải Lưới 24h Dạng Cột Mật Độ Cao Theo Phút (Equalizer) & Bảo Toàn Tương Thích Ngược**:
   - Bổ sung Model `StationPowerMetric` (UniqueConstraint `station_id` + `timestamp`) lưu vết phụ tải lưới theo từng phút.
   - Bổ sung Job 1 phút trong `scheduler_service.py` đọc từ `simulator_manager` lọc chuẩn xác theo `station_id` (tránh cộng dồn sai trạm) và ghi `0.0 kW` cho trạm không có tải để chống lủng lỗ dữ liệu.
   - Endpoint mới `GET /api/v1/stations/metrics/load-profile-timeline` trả về 1440 điểm (00:00 - 23:59), tách bạch trạng thái phút tương lai (`isPlaceholder=true, noData=false`) và phút quá khứ chưa có log (`isPlaceholder=true, noData=true`).
   - Giữ nguyên 100% endpoint cũ `/metrics/load-profile` (12 mốc 2h) giúp bảo toàn bộ test regression 82/82 passed.
   - Frontend `Dashboard.jsx`: Downsample 1440m -> 480 cột (3 phút/cột) đạt chuẩn hiển thị mượt mà 60 FPS, Recharts `<BarChart>` phong cách Equalizer âm thanh, hỗ trợ Toggle Switcher 1-click chuyển đổi qua lại giữa Equalizer và 12 Mốc TOU.
15. **Chuẩn Hóa Múi Giờ Việt Nam (Asia/Ho_Chi_Minh), Sửa Lỗi Chốt Giá TOU & Khắc Phục Lệch 7 Tiếng**:
   - **Backend Core**: Tạo helper `app/core/datetime_utils.py` cung cấp `get_vn_now()`, `to_vn_time()`, `ensure_utc()` và Pydantic `UTCDateTime`.
   - **Sửa lỗi tính cước TOU nghiêm trọng**: Tại `session_service.start_charging_session`, chuyển đổi `now` sang giờ Việt Nam trước khi so khớp với khung giờ cao/thấp điểm trong bảng `tariffs`, loại bỏ hoàn toàn việc dùng giờ UTC so với giờ địa phương Việt Nam.
   - **Đồng bộ đồ thị phụ tải 24h**: Tại `stations.py`, chuyển đổi ranh giới ngày và phân loại khung giờ sang giờ Việt Nam, đảm bảo điểm live và vạch placeholder tương lai hiển thị chuẩn xác với đồng hồ người dùng.
   - **Response Serializer**: Toàn bộ Pydantic schema (`SessionResponse`, `WalletResponse`, `WalletTransactionResponse`, `StationResponse`, `TariffResponse`, `UserResponse`) áp dụng `UTCDateTime`, luôn serialize kèm hậu tố `Z` thay vì naive string.
   - **Frontend**: Tạo helper dùng chung `frontend/src/utils/formatTime.js` (`formatVNDateTime`, `formatVNTime`), thay thế toàn bộ các lệnh parse/format rải rác trong `Sessions.jsx`, `Wallet.jsx`, `Simulator.jsx`, tự động chuyển đổi chuẩn xác sang giờ Việt Nam với độ lệch = 0 giây.


