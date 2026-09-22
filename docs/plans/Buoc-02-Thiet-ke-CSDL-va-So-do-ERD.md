# BƯỚC 02: THIẾT KẾ CƠ SỞ DỮ LIỆU & SƠ ĐỒ ERD CHUẨN EV CSMS (DATABASE DESIGN)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-02-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT1/02_Database_Design_ERD.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) dùng để nộp bài và chấm điểm giai đoạn KT1.

---

## 1. Mục tiêu bước 2
- Thiết kế mô hình dữ liệu chuẩn hóa (3NF) cho toàn bộ Nền tảng vận hành trạm sạc xe điện (EV CSMS).
- Xác định đầy đủ 9 bảng dữ liệu cốt lõi: Hạ tầng trạm/trụ/cổng, Ví điện tử, Biểu giá TOU, Phiên sạc và Bảo trì sự cố.
- Thiết lập các ràng buộc toàn vẹn dữ liệu: `CHECK (balance >= 0)`, `CHECK (total_kwh >= 0)`, `UNIQUE`, `NOT NULL`, khóa ngoại `FOREIGN KEY`.
- Đảm bảo cấu trúc hỗ trợ lưu trữ dữ liệu telemetry cho module Simulator và AI phân tích.

---

## 2. Nội dung công việc chi tiết

### 2.1. Chi tiết 9 Bảng Dữ liệu Cốt lõi
1. `users`: Quản lý người dùng (`id`, `username`, `email`, `password_hash`, `full_name`, `role` [ADMIN, OPERATOR, CUSTOMER], `is_active`, `created_at`).
2. `wallets`: Ví điện tử khách hàng (`id`, `user_id` UNIQUE FK, `balance`, `currency`, `updated_at`). Ràng buộc: `CHECK (balance >= 0)`.
3. `wallet_transactions`: Lịch sử giao dịch ví (`id`, `wallet_id` FK, `amount`, `transaction_type` [TOPUP, CHARGE_FEE, REFUND], `balance_after`, `reference_id`, `note`, `created_at`).
4. `stations`: Trạm sạc (`id`, `name`, `address`, `latitude`, `longitude`, `total_grid_capacity_kw`, `operating_hours`, `status`, `created_at`).
5. `charging_points`: Trụ sạc EVSE (`id`, `station_id` FK, `code`, `vendor`, `model`, `max_power_kw`, `firmware_version`, `status` [AVAILABLE, PREPARING, CHARGING, FAULTED, UNAVAILABLE], `created_at`).
6. `connectors`: Cổng/Súng sạc (`id`, `charging_point_id` FK, `connector_number`, `connector_type` [CCS2, TYPE_2, CHADEMO], `max_power_kw`, `status`).
7. `tariffs`: Biểu giá theo khung giờ TOU (`id`, `name`, `station_id` FK nullable, `price_normal`, `price_peak`, `price_offpeak`, `peak_start`, `peak_end`, `offpeak_start`, `offpeak_end`, `idle_fee_per_min`, `created_at`).
8. `charging_sessions`: Phiên sạc xe điện (`id`, `user_id` FK, `connector_id` FK, `tariff_id` FK, `start_time`, `end_time`, `meter_start_kwh`, `meter_stop_kwh`, `total_kwh`, `total_amount`, `status` [STARTING, CHARGING, STOPPED, COMPLETED, FAILED], `stop_reason`, `created_at`).
9. `maintenance_logs`: Nhật ký sự cố & bảo trì (`id`, `charging_point_id` FK, `severity` [LOW, MEDIUM, HIGH, CRITICAL], `issue_description`, `status` [REPORTED, INVESTIGATING, RESOLVED], `reported_at`, `resolved_at`).

### 2.2. Thiết kế Sơ đồ Mermaid ERD
- Vẽ quan hệ giữa các bảng:
  - `users (1) -> (1) wallets`
  - `wallets (1) -> (N) wallet_transactions`
  - `stations (1) -> (N) charging_points`
  - `charging_points (1) -> (N) connectors`
  - `charging_points (1) -> (N) maintenance_logs`
  - `connectors (1) -> (N) charging_sessions`
  - `users (1) -> (N) charging_sessions`
  - `tariffs (1) -> (N) charging_sessions`

### 2.3. Ràng buộc toàn vẹn & Bảo toàn dữ liệu
- Ràng buộc CSDL: `CHECK (balance >= 0)` trên bảng `wallets`.
- Ràng buộc cổng sạc: Tại một thời điểm, một `connector` chỉ có tối đa 1 `charging_session` ở trạng thái `STARTING` hoặc `CHARGING`.

---

## 3. Cấu trúc file bàn giao
Sản phẩm bàn giao thực tế:
```text
docs/
└── SDLC/
    └── KT1/
        └── 02_Database_Design_ERD.md     # Sơ đồ Mermaid ERD, Từ điển dữ liệu và định nghĩa DDL
```

---

## 4. Checklist thực hiện
- [ ] Soạn thảo sơ đồ Mermaid ERD chi tiết 9 bảng.
- [ ] Viết Data Dictionary đầy đủ kiểu dữ liệu, ràng buộc, mô tả tiếng Việt.
- [ ] Viết câu lệnh DDL mẫu (SQLite & PostgreSQL compatible).
- [ ] Cập nhật trạng thái Bước 02 trong `docs/plans/TIEN-DO.md`.
