# NỀN TẢNG VẬN HÀNH TRẠM SẠC XE ĐIỆN TÍCH HỢP AI (EV CHARGING STATION MANAGEMENT SYSTEM - EV CSMS)

## 1. Tổng quan dự án

Dự án xây dựng một **Nền tảng web vận hành và quản lý mạng lưới trạm sạc xe điện hoàn chỉnh** (EV Charging Station Management System - EV CSMS), đáp ứng tiêu chuẩn quản lý hạ tầng hiện đại, giám sát sạc thời gian thực, quản lý biểu giá và thanh toán minh bạch, đồng thời tích hợp **Trí tuệ nhân tạo (AI)** hỗ trợ điều phối tải thông minh (Smart Charging), cảnh báo bảo trì dự đoán (Predictive Maintenance) và tư vấn biểu giá tối ưu.

Hệ thống trong **Giai đoạn 1 (MVP thực tế phục vụ chấm điểm)** được thiết kế theo kiến trúc tinh gọn, tập trung tối đa vào luồng vận hành cốt lõi:

- **Backend**: FastAPI (Python 3.10+) + SQLAlchemy 2.0 + SQLite local + WebSocket phục vụ telemetry realtime (chạy trực tiếp bằng `uvicorn`).
- **Frontend**: React 18 + Vite + Tailwind CSS + Lucide Icons + Recharts cho dashboard và biểu đồ sạc realtime (chạy trực tiếp bằng `npm run dev`).
- **AI Engine**: Google Gemini API + Heuristic Fallback Engine (kịch bản demo trọng tâm: khi mất mạng hoặc ngắt kết nối Gemini API, hệ thống vẫn tự động duy trì điều phối tải và cảnh báo an toàn bằng thuật toán nội bộ).
- **Mô phỏng trạm sạc (Charging Simulator)**: Tích hợp module giả lập tín hiệu trụ sạc (dựa trên máy trạng thái lấy cảm hứng từ OCPP) để chạy thử nghiệm và demo trực tiếp từng phiên sạc mà không cần phần cứng vật lý.
- **Ví điện tử & Nạp tiền**: Cơ chế Sandbox / Mock Top-up (nút bấm nạp tiền cộng thẳng vào ví qua giao dịch Database ACID, cam kết không âm tiền).

---

## 2. Các Actor và Phân quyền người dùng (RBAC)

Hệ thống thiết kế xác thực bằng **JWT đơn giản** (không sử dụng Refresh Token hay OAuth phức tạp), phân quyền trực tiếp cho 3 vai trò:

| Actor | Vai trò | Chức năng chính |
| --- | --- | --- |
| **System Admin (Quản trị viên hệ thống)** | Quản trị toàn hệ thống | Quản lý người dùng, phân quyền, quản lý đối tác vận hành trạm (CPO), cấu hình hệ thống, quản lý khóa API AI, xem báo cáo tổng thể toàn mạng lưới trạm sạc. |
| **Station Operator / CPO (Đơn vị vận hành trạm)** | Quản trị trạm & kỹ thuật | Quản lý danh mục trạm sạc, trụ sạc, cổng sạc; cấu hình biểu giá (Tariff); theo dõi trạng thái trụ sạc realtime; xem cảnh báo sự cố kỹ thuật; nhận khuyến nghị điều phối tải và bảo trì từ AI. |
| **EV Driver / Customer (Khách hàng lái xe điện)** | Người dùng cuối | Tìm kiếm trạm sạc (theo vị trí, công suất, loại cổng); quản lý ví tiền (nạp tiền mock, xem biến động số dư); khởi động/dừng phiên sạc; theo dõi tiến trình sạc trực quan theo thời gian thực; nhận hóa đơn sạc. |

---

## 3. Các Phân hệ chức năng cốt lõi (Core Modules)

### 3.1. Phân hệ Quản lý Hạ tầng trạm sạc (Station & Asset Management)

- **Trạm sạc (`Station`)**:
  + Thông tin: Tên trạm, địa chỉ, kinh độ/vĩ độ (tích hợp bản đồ), tổng công suất nguồn điện cấp cho trạm (Total Grid Capacity - kW), giờ mở cửa, trạng thái hoạt động (Active, Inactive, Maintenance).
- **Trụ sạc (`ChargingPoint / EVSE`)**:
  + Thuộc một trạm sạc cụ thể; Mã định danh trụ sạc (ChargePoint ID), hãng sản xuất, model, công suất tối đa (kW), phiên bản firmware, trạng thái kết nối mạng (Online, Offline).
  + Trạng thái hoạt động thời gian thực: `Available` (Rảnh), `Preparing` (Đang kết nối xe), `Charging` (Đang sạc), `Finishing` (Đã đầy/Chờ rút súng), `Faulted` (Lỗi sự cố), `Unavailable` (Tạm ngưng).
- **Cổng sạc / Súng sạc (`Connector`)**:
  + Mỗi trụ có thể có 1 hoặc nhiều cổng (ví dụ: Cổng 1 CCS2 120kW, Cổng 2 Type 2 22kW).
  + Loại cổng: `CCS2` (DC sạc nhanh), `Type 2` (AC tiêu chuẩn), `CHAdeMO`, `GBT`.
  + Công suất định mức và giới hạn dòng sạc (A).
  + **Ràng buộc độc quyền**: Một cổng sạc chỉ phục vụ tối đa 1 phiên sạc đang hoạt động (`active session`) tại một thời điểm.

### 3.2. Phân hệ Giả lập & Giám sát sạc thời gian thực (Charging Simulator & Telemetry)

- **Module Simulator (Giả lập trụ sạc OCPP-like)**:
  + Cho phép người dùng hoặc người đánh giá kích hoạt giả lập các trạng thái trụ sạc: Cắm súng sạc, quẹt thẻ/xác thực, bắt đầu phiên sạc, truyền dữ liệu đo đếm (`MeterValues`), ngắt sạc khẩn cấp, rút súng sạc.
- **WebSocket Realtime Telemetry**:
  + Khi xe đang sạc, hệ thống phát sóng định kỳ (mỗi 2-5 giây):
    - Phần trăm pin xe (`SoC - State of Charge` %): từ 20% -> 80% -> 100%.
    - Công suất sạc tức thời (`Power` kW).
    - Điện áp (`Voltage` V) và dòng điện (`Current` A).
    - Nhiệt độ súng sạc (`Connector Temperature` °C).
    - Tổng điện năng tiêu thụ tích lũy (`Energy` kWh).
    - Chi phí sạc tạm tính theo thời gian thực (VND).

### 3.3. Phân hệ Phiên sạc & Quản lý Tài chính (Charging Sessions, Tariffs & Wallet)

- **Phiên sạc (`ChargingSession`)**:
  + Mã phiên, Khách hàng, Trụ sạc, Cổng sạc, Thời gian bắt đầu (`start_time`), Thời gian kết thúc (`end_time`).
  + Chỉ số công tơ ban đầu (`meter_start`), chỉ số kết thúc (`meter_stop`), tổng điện năng (`total_kwh`).
  + Trạng thái phiên: `STARTING` -> `CHARGING` -> `STOPPED` -> `COMPLETED` / `FAILED`.
  + Lý do dừng: `CustomerStopped`, `BatteryFull`, `EmergencyStop`, `InsufficientBalance`, `SystemFault`.
- **Biểu giá linh hoạt (`Tariff`)**:
  + Quản lý biểu giá theo 3 khung giờ cơ bản (Time-of-Use - TOU):
    - Giờ bình thường (Normal Hours): Ví dụ 3,200 VND/kWh.
    - Giờ cao điểm (Peak Hours): Ví dụ 4,500 VND/kWh.
    - Giờ thấp điểm (Off-Peak Hours): Ví dụ 2,500 VND/kWh.
  + *(Lưu ý: Phí phạt chiếm chỗ Idle Fee và các phụ phí phức tạp được tạm hoãn sang Giai đoạn 2).*
- **Ví điện tử & Giao dịch thanh toán (`Wallet & Transactions`)**:
  + Mỗi khách hàng sở hữu 1 Ví điện tử (`Wallet`).
  + **Nạp tiền mô phỏng (Mock / Sandbox Top-up)**: Cung cấp nút bấm nạp tiền nhanh (+100.000đ, +200.000đ, +500.000đ) cộng thẳng vào số dư, ghi nhận lịch sử giao dịch rõ ràng.
  + **Ràng buộc an toàn & Giao dịch ACID**:
    - Khi bắt đầu phiên sạc: Kiểm tra số dư tối thiểu (ví dụ: tối thiểu 50,000 VND).
    - Khi phiên sạc đang diễn ra: Nếu số dư ví không đủ chi trả cho điện năng đang sạc, tự động kích hoạt dừng sạc an toàn (`InsufficientBalance`).
    - Khi hoàn tất phiên sạc: Sử dụng **Database Transaction** trừ tiền trong ví, ghi nhật ký giao dịch (`WalletTransaction`), xuất hóa đơn điện tử (`Invoice`), cam kết số dư không bao giờ âm bất hợp lệ (`balance >= 0`).

### 3.4. Phân hệ Quản lý Sự cố & Bảo trì (Incident & Maintenance)

- Ghi nhận nhật ký sự cố: Quá nhiệt cổng sạc, sụt áp nguồn lưới, mất kết nối mạng trụ sạc, lỗi rò rỉ điện đất (Ground Fault).
- Trạng thái xử lý sự cố: `Reported` -> `Investigating` -> `Resolved`.
- Lịch sử kiểm tra bảo dưỡng định kỳ cho từng trụ sạc.

---

## 4. Phân hệ Trí tuệ Nhân tạo (AI Engine)

Hệ thống tích hợp Google Gemini API kết hợp cùng Thuật toán Heuristic (Fallback) xử lý 3 bài toán lớn:

### 4.1. Điều phối công suất sạc thông minh (Smart Charging & Dynamic Load Balancing)

- **Vấn đề**: Khi nhiều xe cùng cắm sạc công suất lớn vào một trạm, tổng công suất vượt quá giới hạn cấp điện của trạm (`total_grid_capacity`), gây nhảy aptomat hoặc quá tải trạm biến áp.
- **Giải pháp AI**:
  + Thuật toán phân bổ động giới hạn dòng sạc cho từng trụ dựa trên: Dung lượng pin còn lại, công suất tối đa của từng xe, thứ tự ưu tiên của khách.
  + AI sinh giải trình phân bổ tải trực quan cho CPO hiểu và theo dõi.
  + Heuristic Fallback: Nếu không có kết nối AI, tự động chia đều công suất theo công thức tỷ lệ chuẩn (Proportional Fair Sharing).

### 4.2. Bảo trì dự đoán & Phát hiện bất thường (Predictive Maintenance)

- **Vấn đề**: Trụ sạc xuống cấp, súng sạc mòn tiếp điểm dẫn đến tăng nhiệt độ đột biến hoặc tốc độ sạc sụt giảm, gây nguy cơ cháy nổ hoặc làm gián đoạn trải nghiệm người dùng.
- **Giải pháp AI**:
  + Phân tích telemetry của các phiên sạc gần nhất (nhiệt độ, độ ổn định công suất, tỷ lệ lỗi sạc).
  + Tự động phát hiện bất thường và đưa ra cảnh báo sớm cho kỹ thuật viên: "Trụ số 03 tại Trạm A có nhiệt độ tiếp điểm tăng 15% so với mức chuẩn, khuyến nghị kiểm tra vệ sinh đầu súng sạc trước ngày 25/09".

### 4.3. Trợ lý ảo CPO & Tư vấn biểu giá linh hoạt (AI Advisor & Dynamic Pricing)

- Phân tích biểu đồ tiêu thụ điện và lưu lượng xe ghé trạm theo ngày/tuần/tháng.
- Gợi ý điều chỉnh biểu giá để dịch chuyển nhu cầu sạc từ giờ cao điểm sang giờ thấp điểm.
- Chatbot hỏi đáp thông minh: Hỗ trợ CPO tra cứu nhanh doanh thu, công suất sử dụng trạm và tình trạng kỹ thuật bằng tiếng Việt tự nhiên.

---

## 5. Kiến trúc kỹ thuật & Ranh giới hệ thống

```text
┌────────────────────────────────────────────────────────┐
│                   FRONTEND WEB APP                     │
│  React 18 + Vite + Tailwind CSS + Recharts + WebSocket │
│  - Driver Portal: Tìm trạm, ví tiền, phiên sạc realtime│
│  - CPO Dashboard: Quản lý trạm/trụ, biểu giá, bảo trì  │
│  - Simulator UI: Công cụ giả lập trụ sạc và xe sạc     │
└───────────────────────────▲────────────────────────────┘
                            │ REST API + WebSocket
┌───────────────────────────▼────────────────────────────┐
│                    BACKEND (FastAPI)                   │
│  ├── API Layer: /api/v1 (stations, sessions, wallet...)│
│  ├── WebSocket: /ws/telemetry (thông số sạc realtime)  │
│  ├── Services: StationService, SessionService, Wallet  │
│  │   (Đảm bảo ACID Transactions, không âm tiền ví)     │
│  ├── Simulator Service: Tạo xung nhịp & số đo giả lập  │
│  └── AI Service: Gemini API + Fallback Heuristic       │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  DATABASE (SQLite local)               │
│  users, stations, charging_points, connectors,         │
│  charging_sessions, tariffs, wallets, transactions,    │
│  maintenance_logs                                      │
└────────────────────────────────────────────────────────┘
```

---

## 6. Kịch bản phục vụ bài tập cá nhân & Đánh giá môn học

Dự án vừa là một sản phẩm web hoàn chỉnh, trực quan, vừa được cấu trúc tài liệu hóa bài bản phục vụ đánh giá tiến độ bài tập cá nhân:

- **KT1 (Đặc tả & Thiết kế)**: Đặc tả yêu cầu, mô hình dữ liệu (ERD), thiết kế API Contracts và giao diện mẫu wireframe.
- **KT2 (Hiện thực hóa Core Backend & Simulator)**: Hoàn thành API quản lý trạm, ví tiền Mock Top-up, phiên sạc, module giả lập telemetry qua WebSocket với bảo toàn giao dịch ACID.
- **KT3 (Tích hợp AI & Hoàn thiện Frontend)**: Hoàn thành giao diện Web React (Dashboard CPO + Driver Portal + Simulator UI), tích hợp AI Smart Charging & Predictive Maintenance kèm Fallback Heuristic.
- **Final (Kiểm thử trọng tâm, Tối ưu & Đóng gói)**: Viết bộ 3–5 unit test trọng tâm cho nghiệp vụ Ví tiền ACID (chặn hoàn toàn số dư âm), nạp seed data mẫu, hoàn thiện kịch bản demo bảo vệ.

---

## 7. Phân kỳ Kế hoạch: Phạm vi Giai đoạn 1 (Hiện tại) vs Hạng mục hoãn sang Giai đoạn 2

> **Nguyên tắc thực thi thẳng thắn:** Dự án chủ động phân định rạch ròi giữa mục tiêu hoàn thành đồ án tuần này (Giai đoạn 1) và các tính năng mở rộng nâng cao (Giai đoạn 2). Các hạng mục phức tạp dưới đây **tuyệt đối không phải bị hủy bỏ**, mà được tạm hoãn có kế hoạch do giới hạn về thời gian và tinh lực phát triển; sẽ trình bày minh bạch trước hội đồng đánh giá như một lộ trình nâng cấp công nghệ dài hạn (Production Roadmap) khi và chỉ khi có đủ thời gian và nguồn lực.

| Hạng mục kỹ thuật | Giai đoạn 1 (Làm ngay — Đủ để bảo vệ & chấm điểm) | Giai đoạn 2 (Tạm hoãn — Khi đủ thời gian & tinh lực) | Lý do kỹ thuật & Giá trị thực tế mang lại |
| --- | --- | --- | --- |
| **Cổng thanh toán (Payment Gateway)** | **Mock / Sandbox Top-up**: Giao diện cung cấp các nút bấm nạp tiền nhanh (+100k, +200k, +500k) cộng thẳng số dư ví qua Database Transaction. | Tích hợp cổng thanh toán trực tuyến bên thứ ba (VNPay, MoMo, ZaloPay, VietQR qua Open Banking). | Tránh phụ thuộc vào tài khoản doanh nghiệp (Merchant) và độ trễ webhook sandbox của bên thứ ba; tập trung 100% vào việc bảo đảm thuật toán trừ tiền và số dư ví chính xác tuyệt đối theo chuẩn ACID. |
| **Cơ sở dữ liệu & Triển khai** | **SQLite local**: Chạy trực tiếp `uvicorn` (Backend) và `npm run dev` (Frontend). CSDL SQLite dạng file gọn nhẹ, không cần cài đặt dịch vụ nền. | **PostgreSQL + Docker Compose + Deploy Cloud**: Cấu hình Docker đa container, migration sang PostgreSQL quản trị tập trung, CI/CD lên VPS/Cloud. | Loại bỏ triệt để các rủi ro xung đột cổng mạng, lỗi cấu hình Docker daemon và tài nguyên máy dev trong tuần thi cử; đảm bảo cả đội chạy ứng dụng mượt mà trong 1 phút. |
| **Xác thực & Phân quyền (Auth)** | **JWT Bearer đơn giản**: Đăng nhập trả Access Token, giải mã 3 role định danh (`admin`, `operator`, `customer`), không làm Refresh flow. | **Hệ thống Auth chuẩn doanh nghiệp**: OAuth2 (Google / Apple Login), cơ chế Refresh Token xoay vòng (Token Rotation), Blacklist Token (Redis), OTP SMS/Email. | Luồng JWT đơn giản đã đáp ứng đầy đủ yêu cầu phân quyền RBAC và kiểm tra quyền sở hữu trạm (Ownership Check), không tiêu tốn thời gian vào việc xử lý hết hạn token khi đang demo. |
| **Biểu giá & Phụ phí (Tariffs & Fees)** | **Biểu giá TOU 3 khung giờ cơ bản**: Áp dụng đơn giá theo giờ Bình thường, Cao điểm và Thấp điểm. | **Phí chiếm chỗ (Idle Fee) & Phụ phí lũy tiến**: Đếm ngược thời gian ân hạn (grace period), tính phí phạt theo từng phút khi sạc đầy chưa rút súng, phụ phí ngày lễ. | Biểu giá TOU 3 khung giờ là bài toán cốt lõi nhất của ngành điện lực xe điện; tạm hoãn Idle Fee giúp thuật toán tính tiền trong phiên sạc trong sáng, dễ giải trình trước hội đồng. |
| **Khả năng chạy Ngoại tuyến (Resilience)** | **AI Heuristic Fallback**: Khi mất kết nối mạng Internet hoặc Google Gemini API gặp sự cố (429/500), hệ thống tự động fallback 100% sang Heuristic chia tải và cảnh báo ngưỡng. | **Offline-Sync phần cứng trạm sạc**: Trụ sạc mất kết nối Internet vẫn tự sạc và lưu bộ nhớ đệm local, khi có mạng trở lại sẽ tự động sync dữ liệu về máy chủ trung tâm. | Đồng bộ dữ liệu ngoại tuyến phần cứng (Offline-sync) cực kỳ phức tạp và dễ phát sinh xung đột bản ghi (conflict resolution). Ngược lại, kịch bản **"Rút dây mạng / tắt API Gemini mà hệ thống vẫn tự động chạy Heuristic"** là màn demo cực kỳ ấn tượng, chi phí lập trình thấp mà ghi điểm tối đa về độ tin cậy. |
| **Kiểm thử tự động (Unit Test)** | **3–5 Unit Test trọng tâm cho Ví tiền (Wallet)**: Viết test cho transaction nạp ví, trừ cước phiên sạc, chặn số dư âm và kiểm thử giao dịch đồng thời (Concurrency). | **Bộ Test Suite bao phủ toàn diện**: Viết test tự động cho toàn bộ các endpoint CRUD, WebSocket telemetry, logic phân quyền, độ phủ code đạt > 80%. | Phân hệ Ví tiền là nơi có rủi ro kỹ thuật cao nhất (sai sót logic dẫn đến âm tiền hoặc tranh chấp tài chính). Việc dồn lực viết 3–5 test chuẩn chỉ cho nghiệp vụ Ví mang lại giá trị bảo vệ chất lượng cao hơn nhiều so với viết test hình thức dàn trải. |
