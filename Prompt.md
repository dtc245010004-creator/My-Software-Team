# Nền tảng vận hành trạm sạc xe điện tích hợp AI — Đặc tả hợp nhất (EV CSMS)

## 1. Vai trò & Bối cảnh kỹ thuật

```
Bạn là Kỹ sư phần mềm Full-Stack Senior, đồng hành cùng sinh viên phát triển đồ án:
"Nền tảng vận hành trạm sạc xe điện tích hợp AI" (EV Charging Station Management System - EV CSMS).

Ràng buộc & Định hướng phát triển:
- Sản phẩm là một hệ thống Web hoàn chỉnh, trực quan, chạy mượt mà, có module Simulator
  giả lập sạc xe điện để người dùng / hội đồng có thể tương tác trực tiếp từng phiên sạc.
- Không áp dụng rập khuôn các nghiệp vụ quản lý kho của đề tài cũ vào bài này.
- Nghiệp vụ trạm sạc đòi hỏi tính toàn vẹn dữ liệu cực cao:
  + Giao dịch ACID trong thanh toán ví điện tử & trừ tiền phiên sạc (chặn 100% nguy cơ số dư âm).
  + Ràng buộc độc quyền cổng sạc (1 connector chỉ phục vụ 1 session tại 1 thời điểm).
  + Cơ chế ngắt sạc an toàn khi hết số dư ví hoặc cảnh báo sự cố kỹ thuật.
- Module AI (Google Gemini) cung cấp 3 năng lực cốt lõi:
  1. Smart Charging / Load Balancing: Điều phối công suất chống quá tải nguồn trạm.
  2. Predictive Maintenance: Phát hiện bất thường từ dữ liệu đo đếm sạc để cảnh báo bảo trì.
  3. AI Advisor & Dynamic Pricing: Tư vấn tối ưu biểu giá theo khung giờ và giải đáp dữ liệu vận hành.
- Bắt buộc có cơ chế Fallback Heuristic: Khi mất mạng hoặc hết quota AI, hệ thống vẫn hoạt động trơn tru.
- Cấu trúc tài liệu SDLC trong docs/ được chia thành 4 mốc (KT1 -> KT2 -> KT3 -> Final)
  phục vụ nộp bài tập cá nhân và đánh giá tiến độ môn học.
```

---

## 2. Tổng quan bài toán

Thị trường xe điện (EV) đang phát triển bùng nổ, kéo theo nhu cầu cấp thiết về mạng lưới trạm sạc công cộng và dịch vụ. Các đơn vị vận hành trạm sạc (CPO) đối mặt với các bài toán vận hành phức tạp:
1. Giám sát trạng thái hoạt động thực tế của hàng chục trụ sạc, cổng sạc tại nhiều địa điểm.
2. Nguy cơ quá tải lưới điện cục bộ khi nhiều xe cùng sạc nhanh ở công suất cực đại.
3. Quản lý biểu giá linh hoạt theo giờ cao điểm/thấp điểm (TOU) và thanh toán minh bạch, an toàn qua ví điện tử.
4. Phát hiện kịp thời sự cố hỏng hóc, quá nhiệt súng sạc để bảo trì trước khi xảy ra tai nạn hoặc làm gián đoạn dịch vụ.

Hệ thống **EV CSMS** cung cấp giải pháp toàn diện trên nền tảng Web cho cả đơn vị vận hành (CPO), quản trị viên (Admin) và khách hàng lái xe điện (Driver).

---

## 3. Actor & Phân quyền người dùng (RBAC)

| Actor | Quyền hạn & Chức năng chính |
|---|---|
| **Quản trị viên (Admin)** | - Quản trị hệ thống, quản lý tài khoản CPO và người dùng.<br>- Cấu hình thông số toàn hệ thống, cấu hình API Key AI.<br>- Xem báo cáo tổng hợp toàn mạng lưới trạm sạc. |
| **Đơn vị vận hành trạm (Station Operator / CPO)** | - Quản lý trạm sạc (`Station`), trụ sạc (`ChargingPoint`), cổng sạc (`Connector`).<br>- Thiết lập biểu giá (`Tariff`) theo khung giờ.<br>- Giám sát trạng thái trụ sạc theo thời gian thực (Trống, Đang sạc, Lỗi...).<br>- Nhận cảnh báo bảo trì dự đoán và gợi ý điều phối công suất từ AI. |
| **Khách hàng lái xe điện (EV Driver / Customer)** | - Tra cứu danh sách trạm sạc theo vị trí, loại cổng, công suất.<br>- Quản lý ví cá nhân: Nạp tiền, xem lịch sử giao dịch.<br>- Thực hiện phiên sạc: Bắt đầu, theo dõi tiến độ sạc realtime (SoC %, kW, kWh, tiền tính tạm thời), dừng sạc.<br>- Xem hóa đơn điện tử từng phiên sạc. |

---

## 4. Đặc tả chi tiết các phân hệ nghiệp vụ

### 4.1. Quản lý Hạ tầng trạm sạc (Stations, Chargers & Connectors)
1. **Trạm sạc (`Station`)**:
   - `id`, `name`, `address`, `latitude`, `longitude`, `total_grid_capacity` (kW), `operating_hours`, `status` (`ACTIVE`, `INACTIVE`, `MAINTENANCE`).
2. **Trụ sạc (`ChargingPoint / EVSE`)**:
   - `id`, `station_id`, `charge_point_code`, `vendor`, `model`, `max_power` (kW), `firmware_version`, `status` (`AVAILABLE`, `PREPARING`, `CHARGING`, `FAULTED`, `UNAVAILABLE`).
3. **Cổng sạc (`Connector`)**:
   - `id`, `charging_point_id`, `connector_number` (1, 2...), `connector_type` (`CCS2`, `TYPE_2`, `CHADEMO`), `max_power` (kW), `status`.

### 4.2. Quản lý Biểu giá & Tài chính ví điện tử (Tariffs & Wallet)
1. **Biểu giá linh hoạt (`Tariff`)**:
   - `id`, `name`, `station_id` (nếu áp dụng riêng) hoặc chung hệ thống.
   - `price_per_kwh_normal`, `price_per_kwh_peak`, `price_per_kwh_offpeak`.
   - `peak_hours_start`, `peak_hours_end`, `offpeak_hours_start`, `offpeak_hours_end`.
   - `idle_fee_per_minute` (phí chiếm chỗ sau khi pin đầy quá 15 phút).
2. **Ví điện tử (`Wallet`) & Lịch sử giao dịch (`WalletTransaction`)**:
   - Mỗi người dùng có một ví tiền liên kết: `user_id`, `balance` (VND, `balance >= 0`).
   - Giao dịch: `TOPUP` (Nạp tiền), `CHARGE_FEE` (Thanh toán phiên sạc), `REFUND` (Hoàn tiền).
   - **Transaction ACID**: Bắt buộc khóa dòng (`with_for_update`) khi trừ tiền, cam kết không xảy ra tình trạng trừ âm ví hoặc xung đột đồng thời.

### 4.3. Phiên sạc & Giám sát thời gian thực (Charging Sessions & Realtime Telemetry)
1. **Vòng đời phiên sạc (`ChargingSession`)**:
   - `STARTING`: Kiểm tra số dư ví tối thiểu (ví dụ: >= 50,000 VND), khóa cổng sạc sang trạng thái `PREPARING` -> `CHARGING`.
   - `CHARGING`: Nhận telemetry đo đếm từ Simulator (công suất, kWh, nhiệt độ, SoC %). Tính toán chi phí tạm tính.
   - `STOPPING`: Dừng sạc khi người dùng bấm Stop, pin đầy 100%, hoặc số dư ví chạm ngưỡng 0 VND.
   - `COMPLETED`: Tính tổng kWh, nhân đơn giá TOU, trừ tiền trong ví (ACID), xuất hóa đơn, mở khóa cổng sạc về `AVAILABLE`.
2. **Module Giả lập trạm sạc (Charging Simulator)**:
   - Bộ sinh dữ liệu telemetry chân thực: mô phỏng đường cong sạc pin xe điện (sạc nhanh từ 20% đến 80%, giảm dần công suất từ 80% đến 100% để bảo vệ pin).
   - Hỗ trợ WebSocket phát dữ liệu realtime lên Frontend (mỗi 2 giây/lần).

### 4.4. Phân hệ Trí tuệ Nhân tạo (AI Engine)
1. **Smart Charging & Load Balancing**:
   - Nhận đầu vào: Danh sách xe đang sạc tại trạm, công suất hiện tại, giới hạn lưới `total_grid_capacity`.
   - Đầu ra: Bảng khuyến nghị công suất tối đa cho từng trụ sạc nhằm tối ưu tốc độ sạc toàn trạm mà không sụt áp/nhảy aptomat.
2. **Predictive Maintenance (Bảo trì dự đoán)**:
   - Nhận đầu vào: Lịch sử nhiệt độ súng sạc, độ biến thiên điện áp, số lần ngắt sạc bất thường của các trụ trong 30 ngày.
   - Đầu ra: Báo cáo nhận diện nguy cơ hỏng hóc, xếp hạng mức độ rủi ro (Low/Medium/High/Critical) và hành động kỹ thuật cần làm.
3. **AI Advisor & Dynamic Pricing**:
   - Nhận diện các khung giờ vắng khách để đề xuất giảm giá khuyến mãi (Off-peak discount) nhằm dàn đều phụ tải.
   - Hỗ trợ CPO hỏi đáp về hiệu quả vận hành bằng tiếng Việt tự nhiên.
4. **Fallback Heuristic**:
   - Tự động hoạt động khi mất mạng/lỗi API: Thuật toán Heuristic chia tải tỷ lệ chuẩn (Proportional Fair Sharing) và phân tích cảnh báo dựa trên ngưỡng cứng (Threshold-based Alerting).

---

## 5. Lộ trình đánh giá bài tập cá nhân (SDLC Checkpoints)

- **KT1 (Đặc tả & Thiết kế)**:
  - Đặc tả yêu cầu chi tiết (nentang.md, Prompt.md).
  - Thiết kế sơ đồ quan hệ thực thể (ERD) và sơ đồ kiến trúc hệ thống.
  - Thiết kế API Contracts (OpenAPI/Swagger) cho toàn bộ các endpoints.
- **KT2 (Hiện thực hóa Core Backend & Simulator)**:
  - Hoàn thành CSDL và các Models, Schemas, Services chính (Stations, Chargers, Sessions, Wallet).
  - Giao dịch trừ tiền ví và quản lý phiên sạc đạt chuẩn ACID.
  - Xây dựng Simulator phát dữ liệu đo đếm sạc qua WebSocket.
- **KT3 (Tích hợp AI & Giao diện Web Frontend)**:
  - Tích hợp Gemini API cho Smart Charging & Predictive Maintenance + Fallback Heuristic.
  - Giao diện Web React đầy đủ: Dashboard CPO, Quản lý trạm/trụ, Giao diện sạc realtime cho tài xế và Trang giả lập Simulator.
- **Final (Kiểm thử, Đóng gói & Báo vệ)**:
  - Bộ test tự động pytest (test transaction ví, test logic ngắt sạc, test fallback AI).
  - Seed data mẫu phong phú (nhiều trạm, nhiều trụ, lịch sử phiên sạc sinh động).
  - Báo cáo tổng kết và kịch bản demo trực quan trước hội đồng.
