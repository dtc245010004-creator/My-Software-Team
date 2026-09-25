# BỘ SƯU TẬP ẢNH MÀN HÌNH KIỂM THỬ E2E HỆ THỐNG EV CSMS

## (END-TO-END SCREENSHOT GALLERY ACROSS ALL ROLES & INTERFACES)

---

- **Công cụ kiểm thử E2E:** Playwright (Headless Chromium) v1.63.0
- **Độ phân giải hiển thị chuẩn:** Desktop Full HD (1920 x 1080)
- **Môi trường ứng dụng:** Backend FastAPI (Port 8000) + Frontend React 18 / Vite (Port 5173)
- **Thời gian thực thi:** 2026-09-25 22:26:00 (UTC+7)
- **Đường dẫn lưu trữ vật lý:**
  + Thư mục Scratch: `C:\Users\d8645\.gemini\antigravity-cli\brain\b802d43f-142f-43b8-80f5-bf5fb78b45cf\scratch\screenshots\`
  + Thư mục Dự án: `E:\AAA\docs\screenshots\`

---

## 1. MÀN HÌNH ĐĂNG NHẬP & PHÂN QUYỀN (LOGIN & 1-CLICK DEMO ROLES)

Giao diện đăng nhập chuẩn công nghiệp (Obsidian `#0B0F17`), hỗ trợ bộ nút **Đăng nhập nhanh 1-Click** chuyển đổi vai trò tức thì phục vụ bảo vệ đồ án:

![01_login_screen](./screenshots/01_login_screen.png)
*Hình 01: Màn hình Đăng nhập hệ thống, Form xác thực và 3 nút 1-Click Demo Roles (Quản trị viên, Vận hành CPO, Tài xế sạc).*

---

## 2. VAI TRÒ ĐƠN VỊ VẬN HÀNH TRẠM SẠC (ROLE: OPERATOR / CPO)

*Tài khoản: `operator_a` (Quản lý các trạm sạc khu vực TP.HCM và Hà Nội)*

### 2.1. Dashboard Vận Hành Trung Tâm

![02_cpo_dashboard](./screenshots/02_cpo_dashboard.png)
*Hình 02: Bảng điều khiển phụ tải biến áp trạm, đo lường tổng công suất lưới, trạng thái 18 cổng sạc và biểu đồ phụ tải 24h.*

### 2.2. Quản Lý Hạ Tầng Trạm Sạc & Trụ Sạc EVSE

![03_cpo_stations](./screenshots/03_cpo_stations.png)
*Hình 03: Danh mục trạm sạc, trụ sạc (AC 22kW, DC 60kW, DC 150kW, DC 300kW) và cổng sạc vật lý.*

### 2.3. Bảng Điều Khiển Giả Lập Sạc Realtime (Simulator Console)

![04_cpo_simulator_idle](./screenshots/04_cpo_simulator_idle.png)
*Hình 04: Bộ điều khiển mô phỏng sạc pin ở trạng thái sẵn sàng (Idle).*

![05_cpo_simulator_active](./screenshots/05_cpo_simulator_active.png)
*Hình 05: Phiên sạc đang chạy thực tế: Đồng hồ đo mức pin (SoC %), Công suất (kW), Nhiệt độ đầu sạc (°C) và chi phí tích lũy nhảy số liên tục qua WebSocket nhịp 2s.*

### 2.4. Trung Tâm Điều Khiển Trí Tuệ Nhân Tạo (AI Advisor)

![06_cpo_ai_smart_charging](./screenshots/06_cpo_ai_smart_charging.png)
*Hình 06: Tab Smart Charging — Thuật toán chia tải Weighted Fair Sharing theo mức pin SoC, bảo vệ thanh cái trạm không quá 95% công suất lưới.*

![07_cpo_ai_predictive_maintenance](./screenshots/07_cpo_ai_predictive_maintenance.png)
*Hình 07: Tab Bảo trì dự đoán (Predictive Maintenance) — Ma trận cảnh báo nhiệt độ tức thời, tốc độ tăng nhiệt và độ sụt áp tiếp điểm.*

![08_cpo_ai_dynamic_pricing](./screenshots/08_cpo_ai_dynamic_pricing.png)
*Hình 08: Tab Tối ưu biểu giá TOU (Dynamic Pricing) — Biểu đồ phụ tải 24h và khuyến nghị điều chỉnh giá để kéo giãn phụ tải sang giờ thấp điểm.*

![09_cpo_ai_ask_advisor](./screenshots/09_cpo_ai_ask_advisor.png)
*Hình 09: Tab Trợ lý vận hành AI — Khung hội thoại hỏi đáp tiếng Việt được grounding trực tiếp với dữ liệu cảm biến trạm.*

### 2.5. Lịch Sử Phiên Sạc & Hóa Đơn Điện Tử

![10_cpo_sessions](./screenshots/10_cpo_sessions.png)
*Hình 10: Bảng danh sách 60+ phiên sạc với biểu giá TOU chốt tại thời điểm cắm và trạng thái quyết toán.*

### 2.6. Quản Lý Ví Tiền & Nạp Tiền

![11_cpo_wallet](./screenshots/11_cpo_wallet.png)
*Hình 11: Số dư ví, các nút nạp tiền nhanh (+100k, +200k, +500k, +1M) và lịch sử biến động số dư ACID.*

---

## 3. VAI TRÒ KHÁCH HÀNG LÁI XE ĐIỆN CHUẨN (ROLE: CUSTOMER)

*Tài khoản: `customer_user` (Số dư ví khả dụng: 250,000 VND)*

### 3.1. Dashboard Khách Hàng

![12_customer_dashboard](./screenshots/12_customer_dashboard.png)
*Hình 12: Giao diện theo dõi mạng lưới trạm và trạng thái các cổng sạc khả dụng của tài xế.*

### 3.2. Ví Điện Tử Khách Hàng

![13_customer_wallet](./screenshots/13_customer_wallet.png)
*Hình 13: Ví điện tử của tài xế với số dư xanh lá an toàn và lịch sử thanh toán các phiên sạc.*

### 3.3. Trải Nghiệm Cắm Sạc Trực Quan

![14_customer_simulator](./screenshots/14_customer_simulator.png)
*Hình 14: Tài xế lựa chọn cổng sạc khả dụng tại trạm và kích hoạt phiên sạc cá nhân.*

---

## 4. VAI TRÒ KHÁCH HÀNG NỢ TIỀN & CẢNH BÁO AN TOÀN (ROLE: DEBT CUSTOMER)

*Tài khoản: `driver_debt` (Số dư âm: -120,000 VND — Đang nợ cước)*

### 4.1. Ví Điện Tử Cảnh Báo Nợ

![15_debt_customer_wallet](./screenshots/15_debt_customer_wallet.png)
*Hình 15: Số dư hiển thị màu đỏ âm tiền (-120,000 VND) kèm thông báo cảnh báo thấu chi có kiểm soát.*

### 4.2. Chặn Khởi Động Phiên Sạc Mới (HTTP 402 Payment Required)

![16_debt_customer_blocked](./screenshots/16_debt_customer_blocked.png)
*Hình 16: Hệ thống kích hoạt cơ chế khóa nợ tự động, chặn không cho tài xế nợ tiền bắt đầu phiên sạc mới.*

---

## 5. VAI TRÒ QUẢN TRỊ VIÊN TOÀN HỆ THỐNG (ROLE: ADMIN)

*Tài khoản: `admin` (Toàn quyền quản trị đa đơn vị CPO và kiểm duyệt)*

### 5.1. Dashboard Quản Trị Hệ Thống

![17_admin_dashboard](./screenshots/17_admin_dashboard.png)
*Hình 17: Dashboard Admin theo dõi phụ tải tổng thể của toàn bộ các nhà vận hành trạm sạc trên toàn quốc.*

### 5.2. Quản Trị Danh Mục Đa Trạm Sạc

![18_admin_stations](./screenshots/18_admin_stations.png)
*Hình 18: Quản trị danh mục trạm sạc với đầy đủ quyền CRUD và can thiệp cấu hình máy biến áp.*

---

## 6. TỔNG KẾT ĐÁNH GIÁ KIỂM THỬ E2E

1. **Tính hoàn chỉnh (Completeness):** 100% các màn hình giao diện (7 trang) và 100% các vai trò người dùng (Admin, Operator, Customer chuẩn, Customer nợ cước) đều được duyệt qua tự động thành công.
2. **Khả năng hiển thị thời gian thực (Realtime Performance):** Kênh WebSocket `/ws/telemetry` duy trì kết nối ổn định, các đồng hồ đo số liệu SoC, Công suất, Nhiệt độ và Chi phí nhảy số mượt mà.
3. **Thực thi chính sách bảo mật (Security Enforcement):**
   + Khóa cổng sạc độc quyền hoạt động chính xác.
   + Cơ chế chặn nợ HTTP 402 tự động ngăn chặn xe cạn ví mở phiên sạc mới.
   + Bộ chuyển vai trò 1-Click Role Switcher hoạt động hoàn hảo, sẵn sàng cho buổi bảo vệ đồ án trước Hội đồng.
