# HỒ SƠ THIẾT KẾ GIAO DIỆN & WIREFRAME (UI/UX SPECIFICATION)

## NỀN TẢNG VẬN HÀNH TRẠM SẠC XE ĐIỆN TÍCH HỢP AI (EV CSMS)

> **Mốc đánh giá:** KT1 — Báo cáo Đặc tả Yêu cầu, Phân tích Nghiệp vụ & Kiến trúc Hệ thống  
> **Dự án:** EV Charging Station Management System  
> **Tài liệu:** Thiết kế Bố cục Giao diện Người dùng (Wireframes)  
> **Công nghệ Frontend áp dụng:** React 18, Vite, Tailwind CSS, Lucide Icons, Recharts  
> **Phiên bản:** 1.0.0  

---

## 1. Nguyên lý Thiết kế & Hệ thống Màu sắc (Design System)

Giao diện Web của hệ thống **EV CSMS** được xây dựng theo phong cách hiện đại (Clean Modern Dark/Light Mode Dashboard), tối ưu cho việc hiển thị số liệu đo đếm công nghiệp và biểu đồ chuỗi thời gian:

- **Màu chủ đạo (Primary Green/Emerald)**: Tượng trưng cho năng lượng xanh, phương tiện xe điện và tính bền vững (`#10b981` / `emerald-500`).
- **Màu cảnh báo (Warning Amber)**: Trạng thái trụ sạc đang chuẩn bị hoặc cảnh báo nhiệt độ cấp 1 (`#f59e0b` / `amber-500`).
- **Màu nguy hiểm / Ngắt sạc (Danger Rose/Red)**: Trụ sạc sự cố (`FAULTED`), quá nhiệt súng sạc $> 85^\circ\text{C}$ hoặc dừng khẩn cấp (`#ef4444` / `rose-500`).
- **Màu công nghệ / Realtime (Cyan/Sky)**: Dòng điện, điện áp và chỉ số kết nối WebSocket Telemetry (`#06b6d4` / `cyan-500`).
- **Màu nền (Slate/Dark)**: Giúp tương phản dữ liệu biểu đồ và giảm mỏi mắt cho nhân viên trực ca (`#0f172a` / `slate-900`).

---

## 2. Wireframe 1: CPO Operator Dashboard (Bảng Điều Khiển Tổng Thể)

Màn hình chính dành cho đơn vị vận hành trạm sạc theo dõi toàn bộ mạng lưới và tổng công suất tải:

```text
+---------------------------------------------------------------------------------------------------+
|  [⚡ EV-CSMS]   Trang chủ   Trạm sạc   Phiên sạc   Biểu giá   Simulator   AI Advisor   [👤 Operator] |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  TỔNG QUAN MẠNG LƯỚI TRẠM SẠC TOÀN HỆ THỐNG                     [🟢 WebSocket: Connected]         |
|                                                                                                   |
|  +--------------------+  +--------------------+  +--------------------+  +---------------------+  |
|  | 🏢 Tổng Trạm Sạc   |  | 🔌 Cổng Đang Sạc   |  | ⚡ Tổng Công Suất  |  | 💰 Doanh Thu Ngày   |  |
|  |       12 Trạm      |  |     28 / 40 Cổng   |  |    1,450 / 2,000 kW|  |     38,450,000 VND  |  |
|  | (+2 trạm mới)      |  | (Tỷ lệ lấp đầy 70%)|  | (Phụ tải 72.5%)    |  | (+15% so với h.qua) |  |
|  +--------------------+  +--------------------+  +--------------------+  +---------------------+  |
|                                                                                                   |
|  +-------------------------------------------------+  +----------------------------------------+  |
|  | BIỂU ĐỒ PHỤ TẢI CÔNG SUẤT THEO GIỜ (kW)         |  | TRẠNG THÁI TRỤ SẠC THEO TRẠM           |  |
|  |                                                 |  |                                        |  |
|  |  kW ^                                           |  |  [ Trạm Sạc Tân Bình - 500kW ]         |  |
|  | 500 |             __/\_ (Giờ cao điểm)          |  |  • Trụ 01: [CCS2-01: CHARGING] (80kW)  |  |
|  | 250 |       _/\__/     \___                     |  |  • Trụ 02: [CCS2-02: AVAILABLE] (0kW)  |  |
|  |   0 +--------------------------> Thời gian      |  |  • Trụ 03: [TYPE2-01: AVAILABLE] (0kW) |  |
|  |     00:00  08:00  12:00  18:00  23:00           |  |  • Trụ 04: [CCS2-03: FAULTED] (Lỗi cáp)| |
|  +-------------------------------------------------+  +----------------------------------------+  |
|                                                                                                   |
|  CẢNH BÁO BẢO TRÌ & SỰ CỐ GẦN NHẤT                                              [Xem tất cả ->]   |
|  +--------+---------------+----------------------------------------+------------------+--------+  |
|  | Mức độ | Trụ sạc       | Mô tả phát hiện cảnh báo               | Thời gian        | Xử lý  |  |
|  +--------+---------------+----------------------------------------+------------------+--------+  |
|  | [HIGH] | CP-TB-04      | Nhiệt độ đầu súng tăng vọt (78.5°C)    | 5 phút trước     | [Xem]  |  |
|  | [MED]  | CP-Q1-02      | Sụt áp tiếp xúc cổng 12% (>10%)        | 30 phút trước    | [Xem]  |  |
|  +--------+---------------+----------------------------------------+------------------+--------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Wireframe 2: Màn hình Giả lập Sạc & Telemetry Realtime (Simulator UI)

Trọng tâm phục vụ demo trực quan, tương tác trực tiếp:

```text
+---------------------------------------------------------------------------------------------------+
|  BỘ MÔ PHỎNG PHIÊN SẠC & TELEMETRY THỜI GIAN THỰC               [Chế độ: Độc lập / Demo Board]    |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [1. CẤU HÌNH XE VÀ CỔNG SẠC]               [2. ĐỒ THỊ TELEMETRY TRỰC QUAN (REALTIME)]            |
|  +--------------------------------------+   +--------------------------------------------------+  |
|  | Chọn Trạm: [ Trạm Sạc Quận 1       ▼] |   | Tỷ lệ Nạp Pin (SoC %)                            |  |
|  | Chọn Cổng: [ Cổng CCS2 - 120kW     ▼] |   | [====================================>    ] 74%  |  |
|  | Dung lượng pin xe: [ 75 kWh (VF8)  ▼] |   |                                                  |  |
|  | Mức pin ban đầu:   [ 20%           ▼] |   | Công suất tức thời:    [ 98.4 kW ]               |  |
|  | Biểu giá áp dụng:  [ Giờ Cao Điểm   ▼] |   | Điện áp sạc:           [ 398.2 V ]               |  |
|  |                                      |   | Dòng điện sạc:         [ 247.1 A ]               |  |
|  | [⚡ BẮT ĐẦU SẠC]   [🛑 DỪNG SẠC]     |   | Nhiệt độ súng sạc:     [ 68.2 °C ] (An toàn)     |  |
|  +--------------------------------------+   | Điện năng tiêu thụ:    [ 32.5 kWh ]              |  |
|                                             | Chi phí tạm tính:      [ 124,500 VND ]           |  |
|  [3. NÚT TEST KỊCH BẢN ĐẶC BIỆT]            +--------------------------------------------------+  |
|  +--------------------------------------+                                                         |
|  | 🔥 [Thử Quá Nhiệt > 85°C]            |   [4. TRẠNG THÁI AI & DỰ PHÒNG HEURISTIC]               |
|  |    (Kích hoạt ngắt khẩn cấp an toàn) |   +--------------------------------------------------+  |
|  |                                      |   | Trạng thái AI Engine:                            |  |
|  | 🔌 [Ngắt Kết Nối AI (Simulate 500)]  |   | [🟢 AI Online - Gemini 1.5 Flash]                |  |
|  |    (Kiểm thử kích hoạt Fallback)     |   | [Nhấn nút ngắt kết nối để thử nghiệm Fallback]   |  |
|  +--------------------------------------+   +--------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 4. Wireframe 3: Cổng Khách Hàng & Quản Lý Ví Tiền (Driver Portal)

Dành cho tài xế xe điện nạp tiền, theo dõi số dư và quản lý phiên sạc cá nhân:

```text
+---------------------------------------------------------------------------------------------------+
|  [⚡ EV-CSMS]   Trạm sạc gần bạn   Phiên sạc của tôi   Ví điện tử          [👤 Nguyễn Văn A]      |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  VÍ ĐIỆN TỬ CỦA TÔI                                                                               |
|  +---------------------------------------------------------------------------------------------+  |
|  |  SỐ DƯ KHẢ DỤNG:                                                                            |  |
|  |  250,000 VND                                    [➕ Nạp tiền vào ví (Mock Top-up)]           |  |
|  |  (Trạng thái: Hợp lệ - Đủ điều kiện bắt đầu sạc xe >= 50,000 VND)                           |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  MODAL NẠP TIỀN THỬ NGHIỆM (KHI BẤM NÚT NẠP TIỀN):                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  | Chọn mệnh giá nạp thử nghiệm:                                                               |  |
|  | ( ) 50,000 VND     ( ) 100,000 VND     (*) 200,000 VND     ( ) 500,000 VND                  |  |
|  | Phương thức: Mock Giao Dịch (Hệ thống tự động cộng số dư vào ví qua Database Transaction)   |  |
|  |                                                 [ Hủy bỏ ]   [ Xác nhận Nạp tiền ]          |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  LỊCH SỬ BIẾN ĐỘNG SỐ DƯ GẦN ĐÂY                                                                  |
|  +---------------------+-------------------+-------------------+------------------+-------------+  |
|  | Thời gian           | Loại giao dịch    | Số tiền           | Số dư sau GD     | Trạng thái  |  |
|  +---------------------+-------------------+-------------------+------------------+-------------+  |
|  | 25/09/2026 14:30:15 | Nạp tiền (Top-up) | +200,000 VND      | 250,000 VND      | Thành công  |  |
|  | 24/09/2026 18:15:20 | Tiền sạc xe       | -125,000 VND      | 50,000 VND       | Đã thanh toán| |
|  +---------------------+-------------------+-------------------+------------------+-------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 5. Wireframe 4: Màn hình Cố Vấn Vận Hành AI (AI Advisor Screen)

Hiển thị khuyến nghị phân bổ công suất và phân tích nguy cơ sự cố:

```text
+---------------------------------------------------------------------------------------------------+
|  TRỢ LÝ CỐ VẤN VẬN HÀNH AI (AI ADVISOR & PREDICTIVE MAINTENANCE)                                  |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  TRẠNG THÁI HỆ THỐNG: [🟢 GOOGLE GEMINI 1.5 FLASH: HOẠT ĐỘNG]   [Cơ chế Heuristic: Chế độ chờ]    |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  | ⚡ ĐIỀU PHỐI CÔNG SUẤT THÔNG MINH (SMART CHARGING RECOMMENDATIONS)                          |  |
|  | Tổng công suất trạm: 500 kW | Công suất sạc thực tế yêu cầu: 560 kW (VƯỢT NGUỒN LƯỚI 12%)   |  |
|  |                                                                                             |  |
|  | Khuyến nghị phân bổ tối ưu từ Gemini:                                                       |  |
|  | • Cổng CCS2-01 (Pin 35%, Xe VF8):  Cấp 120 kW (Ưu tiên cao - Xe cạn pin)                    |  |
|  | • Cổng CCS2-02 (Pin 85%, Xe Ioniq): Hạ xuống 40 kW (Hạn chế quá nhiệt, bảo vệ pin)         |  |
|  | • Cổng CCS2-03 (Pin 60%, Xe VF9):  Cấp 90 kW (Công suất tiêu chuẩn)                         |  |
|  | => Tổng phân bổ sau điều phối: 450 kW (Đạt 90% tải an toàn, chống nhảy Aptomat tổng)        |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  | 🛠️ DỰ BÁO BẢO TRÌ KỸ THUẬT (PREDICTIVE MAINTENANCE ANOMALIES)                               |  |
|  | • Trụ CP-TB-04: ĐIỂM SỨC KHỎE: 62/100 [CẢNH BÁO MỨC TRUNG BÌNH]                             |  |
|  |   - Hiện tượng: Nhiệt độ đầu súng có xu hướng tăng nhanh hơn 1.8 lần so với trung bình.     |  |
|  |   - Khuyến nghị: Kiểm tra đầu cốt kẹp cáp và vệ sinh ngàm cắm trước ngày 28/09.             |  |
|  | • Trụ CP-TB-01: ĐIỂM SỨC KHỎE: 98/100 [HOẠT ĐỘNG HOÀN HẢO]                                  |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 6. Kết luận & Sẵn sàng Chuyển tiếp Frontend

Bản thiết kế Wireframe này là định hướng trực quan rõ ràng, giúp đội ngũ lập trình Frontend triển khai nhanh chóng các Component và Page ở Bước 10 bằng React 18, Tailwind CSS, Lucide Icons và Recharts mà không phải tốn thời gian cân nhắc lại bố cục hay trải nghiệm người dùng.
