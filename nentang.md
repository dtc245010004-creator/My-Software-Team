# NỀN TẢNG VẬN HÀNH TRẠM SẠC XE ĐIỆN TÍCH HỢP AI (EV CHARGING STATION MANAGEMENT SYSTEM - EV CSMS)

## 1. Tổng quan dự án

Dự án xây dựng một **Nền tảng web vận hành và quản lý mạng lưới trạm sạc xe điện hoàn chỉnh** (EV Charging Station Management System - EV CSMS), đáp ứng tiêu chuẩn quản lý hạ tầng hiện đại, giám sát sạc thời gian thực, quản lý biểu giá và thanh toán minh bạch, đồng thời tích hợp **Trí tuệ nhân tạo (AI)** hỗ trợ điều phối tải thông minh (Smart Charging), cảnh báo bảo trì dự đoán (Predictive Maintenance) và tư vấn biểu giá tối ưu.

Hệ thống được thiết kế theo kiến trúc chuẩn mực:
- **Backend**: FastAPI (Python 3.10+) + SQLAlchemy 2.0 + SQLite/PostgreSQL + WebSocket phục vụ telemetry realtime.
- **Frontend**: React 18 + Vite + Tailwind CSS + Lucide Icons + Recharts/Chart.js cho dashboard và biểu đồ sạc.
- **AI Engine**: Google Gemini API + Fallback Heuristic Engine (đảm bảo hệ thống vận hành 100% khi mất mạng hoặc hết quota).
- **Mô phỏng trạm sạc (Charging Simulator)**: Tích hợp module giả lập tín hiệu trụ sạc (dựa trên luồng chuẩn OCPP 1.6J) để chạy thử nghiệm và demo đầy đủ mà không cần phần cứng vật lý.

---

## 2. Các Actor và Phân quyền người dùng (RBAC)

Hệ thống thiết kế phân quyền rõ ràng cho 3 vai trò:

| Actor | Vai trò | Chức năng chính |
|---|---|---|
| **System Admin (Quản trị viên hệ thống)** | Quản trị toàn hệ thống | Quản lý người dùng, phân quyền, quản lý đối tác vận hành trạm (CPO), cấu hình hệ thống, quản lý khóa API AI, xem báo cáo tổng thể toàn mạng lưới trạm sạc. |
| **Station Operator / CPO (Đơn vị vận hành trạm)** | Quản trị trạm & kỹ thuật | Quản lý danh mục trạm sạc, trụ sạc, cổng sạc; cấu hình biểu giá (Tariff); theo dõi trạng thái trụ sạc realtime; xem cảnh báo sự cố kỹ thuật; nhận khuyến nghị điều phối tải và bảo trì từ AI. |
| **EV Driver / Customer (Khách hàng lái xe điện)** | Người dùng cuối | Tìm kiếm trạm sạc (theo vị trí, công suất, loại cổng); quản lý ví tiền (nạp tiền, xem biến động số dư); khởi động/dừng phiên sạc; theo dõi tiến trình sạc trực quan theo thời gian thực; nhận hóa đơn sạc. |

---

## 3. Các Phân hệ chức năng cốt lõi (Core Modules)

### 3.1. Phân hệ Quản lý Hạ tầng trạm sạc (Station & Asset Management)
- **Trạm sạc (`Station`)**:
  - Thông tin: Tên trạm, địa chỉ, kinh độ/vĩ độ (tích hợp bản đồ), tổng công suất nguồn điện cấp cho trạm (Total Grid Capacity - kW), giờ mở cửa, trạng thái hoạt động (Active, Inactive, Maintenance).
- **Trụ sạc (`ChargingPoint / EVSE`)**:
  - Thuộc một trạm sạc cụ thể; Mã định danh trụ sạc (ChargePoint ID), hãng sản xuất, model, công suất tối đa (kW), phiên bản firmware, trạng thái kết nối mạng (Online, Offline).
  - Trạng thái hoạt động thời gian thực: `Available` (Rảnh), `Preparing` (Đang kết nối xe), `Charging` (Đang sạc), `Finishing` (Đã đầy/Chờ rút súng), `Faulted` (Lỗi sự cố), `Unavailable` (Tạm ngưng).
- **Cổng sạc / Súng sạc (`Connector`)**:
  - Mỗi trụ có thể có 1 hoặc nhiều cổng (ví dụ: Cổng 1 CCS2 120kW, Cổng 2 Type 2 22kW).
  - Loại cổng: `CCS2` (DC sạc nhanh), `Type 2` (AC tiêu chuẩn), `CHAdeMO`, `GBT`.
  - Công suất định mức và giới hạn dòng sạc (A).

### 3.2. Phân hệ Giả lập & Giám sát sạc thời gian thực (Charging Simulator & Telemetry)
- **Module Simulator (Giả lập trụ sạc chuẩn OCPP-like)**:
  - Cho phép người dùng hoặc người đánh giá kích hoạt giả lập các trạng thái trụ sạc: Cắm súng sạc, quẹt thẻ/xác thực, bắt đầu phiên sạc, truyền dữ liệu đo đếm (`MeterValues`), ngắt sạc khẩn cấp, rút súng sạc.
- **WebSocket Realtime Telemetry**:
  - Khi xe đang sạc, hệ thống phát sóng định kỳ (mỗi 2-5 giây):
    - Phần trăm pin xe (`SoC - State of Charge` %): từ 20% -> 80% -> 100%.
    - Công suất sạc tức thời (`Power` kW).
    - Điện áp (`Voltage` V) và dòng điện (`Current` A).
    - Nhiệt độ súng sạc (`Connector Temperature` °C).
    - Tổng điện năng tiêu thụ tích lũy (`Energy` kWh).
    - Chi phí sạc tạm tính theo thời gian thực (VND).

### 3.3. Phân hệ Phiên sạc & Quản lý Tài chính (Charging Sessions, Tariffs & Wallet)
- **Phiên sạc (`ChargingSession`)**:
  - Mã phiên, Khách hàng, Trụ sạc, Cổng sạc, Thời gian bắt đầu (`start_time`), Thời gian kết thúc (`end_time`).
  - Chỉ số công tơ ban đầu (`meter_start`), chỉ số kết thúc (`meter_stop`), tổng điện năng (`total_kwh`).
  - Trạng thái phiên: `STARTING` -> `CHARGING` -> `STOPPED` -> `COMPLETED` / `FAILED`.
  - Lý do dừng: `CustomerStopped`, `BatteryFull`, `EmergencyStop`, `InsufficientBalance`, `SystemFault`.
- **Biểu giá linh hoạt (`Tariff`)**:
  - Quản lý biểu giá theo khung giờ (Time-of-Use - TOU):
    - Giờ bình thường (Normal Hours): Ví dụ 3,200 VND/kWh.
    - Giờ cao điểm (Peak Hours): Ví dụ 4,500 VND/kWh.
    - Giờ thấp điểm (Off-Peak Hours): Ví dụ 2,500 VND/kWh.
  - Phụ phí dịch vụ (Service Fee) hoặc phí chiếm chỗ sau khi sạc đầy (Idle Fee).
- **Ví điện tử & Giao dịch thanh toán (`Wallet & Transactions`)**:
  - Mỗi khách hàng sở hữu 1 Ví điện tử (`Wallet`).
  - **Ràng buộc an toàn & Giao dịch ACID**:
    - Khi bắt đầu phiên sạc: Kiểm tra số dư tối thiểu (ví dụ: tối thiểu 50,000 VND).
    - Khi phiên sạc đang diễn ra: Nếu số dư ví không đủ chi trả cho điện năng đang sạc, tự động kích hoạt dừng sạc an toàn (`InsufficientBalance`).
    - Khi hoàn tất phiên sạc: Sử dụng **Database Transaction** trừ tiền trong ví, ghi nhật ký giao dịch (`WalletTransaction`), xuất hóa đơn điện tử (`Invoice`), cam kết số dư không bị âm bất hợp lệ.

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
  - Thuật toán phân bổ động giới hạn dòng sạc cho từng trụ dựa trên: Dung lượng pin còn lại, công suất tối đa của từng xe, thứ tự ưu tiên của khách.
  - AI sinh giải trình phân bổ tải trực quan cho CPO hiểu và theo dõi.
  - Heuristic Fallback: Nếu không có AI, tự động chia đều công suất theo công thức tỷ lệ chuẩn (Proportional Fair Sharing).

### 4.2. Bảo trì dự đoán & Phát hiện bất thường (Predictive Maintenance)
- **Vấn đề**: Trụ sạc xuống cấp, súng sạc mòn tiếp điểm dẫn đến tăng nhiệt độ đột biến hoặc tốc độ sạc sụt giảm, gây nguy cơ cháy nổ hoặc làm gián đoạn trải nghiệm người dùng.
- **Giải pháp AI**:
  - Phân tích telemetry của các phiên sạc gần nhất (nhiệt độ, độ ổn định công suất, tỷ lệ lỗi sạc).
  - Tự động phát hiện bất thường và đưa ra cảnh báo sớm cho kỹ thuật viên: "Trụ số 03 tại Trạm A có nhiệt độ tiếp điểm tăng 15% so với mức chuẩn, khuyến nghị kiểm tra vệ sinh đầu súng sạc trước ngày 25/09".

### 4.3. Trợ lý ảo CPO & Tư vấn biểu giá linh hoạt (AI Advisor & Dynamic Pricing)
- Phân tích biểu đồ tiêu thụ điện và lưu lượng xe ghé trạm theo ngày/tuần/tháng.
- Gợi ý điều chỉnh biểu giá để dịch chuyển nhu cầu sạc từ giờ cao điểm sang giờ thấp điểm.
- Chatbot hỏi đáp thông minh: Hỗ trợ CPO tra cứu nhanh doanh thu, công suất sử dụng trạm và tình trạng kỹ thuật bằng tiếng Việt tự nhiên.

---

## 5. Kiến trúc kỹ thuật & Ranh giới hệ thống

```
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
│              DATABASE (SQLite / PostgreSQL)            │
│  users, stations, charging_points, connectors,         │
│  charging_sessions, tariffs, wallets, transactions,    │
│  maintenance_logs                                      │
└────────────────────────────────────────────────────────┘
```

## 6. Kịch bản phục vụ bài tập cá nhân & Đánh giá môn học

Dự án vừa là một sản phẩm web hoàn chỉnh, trực quan, vừa được cấu trúc tài liệu hóa bài bản phục vụ đánh giá tiến độ bài tập cá nhân:
- **KT1 (Đặc tả & Thiết kế)**: Đặc tả yêu cầu, mô hình dữ liệu (ERD), thiết kế API Contracts và giao diện mẫu.
- **KT2 (Hiện thực hóa Core Backend & Simulator)**: Hoàn thành API quản lý trạm, ví tiền, phiên sạc, module giả lập telemetry qua WebSocket với bảo toàn giao dịch ACID.
- **KT3 (Tích hợp AI & Hoàn thiện Frontend)**: Hoàn thành giao diện Web React (Dashboard CPO + Driver Portal), tích hợp AI Smart Charging & Predictive Maintenance kèm Fallback.
- **Final (Kiểm thử, Tối ưu & Đóng gói)**: Bộ test tự động pytest, seed data mẫu, hướng dẫn chạy ứng dụng một nút nhấn và video/kịch bản demo bảo vệ.
