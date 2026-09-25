# Nền tảng vận hành trạm sạc xe điện tích hợp AI — Đặc tả hợp nhất (EV CSMS)

## 1. Vai trò & Bối cảnh kỹ thuật

```text
Bạn là Kỹ sư phần mềm Full-Stack Senior, đồng hành cùng sinh viên phát triển đồ án:
"Nền tảng vận hành trạm sạc xe điện tích hợp AI" (EV Charging Station Management System - EV CSMS).

Ràng buộc & Định hướng phát triển:
- Sản phẩm là một hệ thống Web hoàn chỉnh, trực quan, chạy mượt mà, có module Simulator
  giả lập sạc xe điện (OCPP-like State Machine) để người dùng / hội đồng có thể tương tác trực tiếp từng phiên sạc.
- Không áp dụng rập khuôn các nghiệp vụ quản lý kho của đề tài cũ vào bài này.
- Nghiệp vụ trạm sạc đòi hỏi tính toàn vẹn dữ liệu cực cao:
  + Giao dịch ACID trong thanh toán ví điện tử & trừ tiền phiên sạc (chặn 100% nguy cơ số dư âm, có DB Check Constraint).
  + Ràng buộc độc quyền cổng sạc (1 connector chỉ phục vụ 1 session tại 1 thời điểm).
  + Cơ chế ngắt sạc an toàn tức thời (Hardware Safety Cut-off) khi quá nhiệt (T > 85°C) hoặc hết số dư ví.
- Phân định rõ 2 Vòng lặp (Dual-Loop Architecture) giải quyết rủi ro tốc độ AI:
  + Vòng lặp nhanh (Fast Loop 2-5s): Dùng thuật toán Heuristic toán học nội bộ điều phối tải và kiểm tra ngưỡng tức thời.
  + Vòng lặp chậm (Slow Loop 1-5 phút / sự kiện): Gọi Google Gemini API phân tích chuỗi thời gian (trend) và sinh khuyến nghị.
  + Cơ chế Fallback Heuristic: Tự động kích hoạt khi mất mạng hoặc hết quota AI, đảm bảo web luôn hoạt động 100%.
- Kiến trúc xử lý luồng: Tách Control Plane (REST) và Data Plane (WebSocket Telemetry qua In-Memory State Buffer).
- Cấu trúc tài liệu SDLC trong docs/ được chia thành 4 mốc (KT1 -> KT2 -> KT3 -> Final)
  phục vụ nộp bài tập cá nhân và đánh giá tiến độ môn học.
```

---

## 2. Tổng quan bài toán

Thị trường xe điện (EV) đang phát triển bùng nổ, kéo theo nhu cầu cấp thiết về mạng lưới trạm sạc công cộng và dịch vụ. Các đơn vị vận hành trạm sạc (CPO) đối mặt với các bài toán vận hành phức tạp:

1. **Giám sát thời gian thực**: Theo dõi trạng thái hoạt động thực tế của hàng chục trụ sạc, cổng sạc tại nhiều địa điểm qua kênh WebSocket độ trễ thấp.
2. **Điều phối phụ tải (Smart Charging)**: Nguy cơ quá tải lưới điện cục bộ khi nhiều xe cùng sạc nhanh ở công suất cực đại; cần thuật toán chia tải tự động bảo vệ trạm biến áp.
3. **Biểu giá linh hoạt & Tài chính minh bạch**: Quản lý giá điện theo giờ cao điểm/thấp điểm (TOU), phí chiếm chỗ (Idle fee), nạp ví mô phỏng (Sandbox Top-up) và thanh toán an toàn qua giao dịch CSDL ACID.
4. **Bảo trì dự đoán (Predictive Maintenance)**: Phân tích xu hướng biến thiên nhiệt độ và công suất để phát hiện suy hao tiếp xúc trước khi xảy ra sự cố cháy nổ.

Hệ thống **EV CSMS** cung cấp giải pháp toàn diện trên nền tảng Web cho cả đơn vị vận hành (CPO), quản trị viên (Admin) và khách hàng lái xe điện (Driver).

---

## 3. Actor & Phân quyền người dùng (RBAC & Multi-tenancy)

| Actor | Quyền hạn & Chức năng chính | Ràng buộc bảo mật & Cô lập dữ liệu |
| --- | --- | --- |
| **Quản trị viên (Admin)** | - Quản trị toàn hệ thống, quản lý tài khoản CPO và người dùng.<br>- Cấu hình thông số hệ thống, API Key AI.<br>- Xem báo cáo tổng hợp toàn bộ mạng lưới trạm sạc. | Toàn quyền trên toàn bộ dữ liệu hệ thống (Superuser). |
| **Đơn vị vận hành trạm (Station Operator / CPO)** | - Quản lý trạm sạc (`Station`), trụ sạc (`ChargingPoint`), cổng sạc (`Connector`).<br>- Thiết lập biểu giá (`Tariff`) theo khung giờ.<br>- Giám sát trạng thái trụ sạc theo thời gian thực (Trống, Đang sạc, Lỗi...).<br>- Nhận cảnh báo bảo trì dự đoán và gợi ý điều phối công suất từ AI. | **Ownership Check**: CPO chỉ xem và sửa đổi các trạm sạc thuộc quyền sở hữu của mình (`station.operator_id == current_user.id`). Không được truy cập trạm của CPO khác. |
| **Khách hàng lái xe điện (EV Driver / Customer)** | - Tra cứu danh sách trạm sạc công khai theo vị trí, loại cổng, công suất.<br>- Quản lý ví cá nhân: Nạp tiền (Sandbox Demo), xem lịch sử biến động số dư.<br>- Thực hiện phiên sạc: Bắt đầu, theo dõi tiến độ sạc realtime (SoC %, kW, kWh, chi phí tạm tính), dừng sạc.<br>- Xem hóa đơn điện tử từng phiên sạc. | Chỉ truy cập được thông tin ví cá nhân và các phiên sạc do chính mình thực hiện (`session.user_id == current_user.id`). |

---

## 4. Đặc tả chi tiết các phân hệ nghiệp vụ

### 4.1. Quản lý Hạ tầng trạm sạc (Stations, Chargers & Connectors)

1. **Trạm sạc (`Station`)**:
   - `id`, `operator_id` (CPO sở hữu), `name`, `address`, `latitude`, `longitude`, `total_grid_capacity_kw`, `operating_hours`, `status` (`ACTIVE`, `INACTIVE`, `MAINTENANCE`).
2. **Trụ sạc (`ChargingPoint / EVSE`)**:
   - `id`, `station_id`, `charge_point_code`, `vendor`, `model`, `max_power_kw`, `firmware_version`, `status` (`AVAILABLE`, `PREPARING`, `CHARGING`, `FAULTED`, `UNAVAILABLE`).
3. **Cổng sạc (`Connector`)**:
   - `id`, `charging_point_id`, `connector_number` (1, 2...), `connector_type` (`CCS2`, `TYPE_2`, `CHADEMO`), `max_power_kw`, `status`.
   - **Ràng buộc độc quyền**: Một cổng sạc chỉ được phép gán cho tối đa một phiên sạc đang hoạt động (`active session`). Chặn xung đột đồng thời bằng Atomic Update / Lock.

### 4.2. Quản lý Biểu giá, Ví điện tử & Phí chiếm chỗ (Tariffs, Wallet & Idle Fee)

1. **Biểu giá linh hoạt theo khung giờ (TOU Tariff)**:
   - `id`, `name`, `station_id` (áp dụng riêng cho trạm hoặc chung hệ thống).
   - `price_per_kwh_normal`, `price_per_kwh_peak`, `price_per_kwh_offpeak`.
   - Khung giờ: `peak_hours_start`/`end`, `offpeak_hours_start`/`end`.
   - `idle_fee_per_minute`: Phí phạt chiếm chỗ sau khi pin đầy.
2. **Ví điện tử (`Wallet`) & Nạp tiền Sandbox (ACID Transaction)**:
   - Mỗi người dùng có một ví tiền: `user_id`, `balance` (VND, ràng buộc `CHECK (balance >= 0)`).
   - **Sandbox Top-up**: Giao diện cung cấp các nút nạp tiền thử nghiệm (100k, 200k, 500k) minh bạch phạm vi đồ án học tập.
   - **Giao dịch ACID**: Mọi biến động số dư phải nằm trong DB Transaction với khóa dòng bi quan (`with_for_update()`).
   - Giữ chỗ số dư tối thiểu (Hold balance: 50.000 VNĐ) trước khi cho phép bắt đầu phiên sạc.
3. **Cơ chế Phí chiếm chỗ (Idle Fee & Grace Period)**:
   - Khi xe sạc đầy pin (SoC = 100%), phiên sạc chuyển sang trạng thái `SuspendedEV`.
   - Hệ thống tự động kích hoạt **thời gian ân hạn 15 phút (Grace Period)**.
   - Nếu sau 15 phút người dùng chưa rút súng sạc, hệ thống bắt đầu tính phí phạt chiếm chỗ (`idle_fee_per_minute` * số phút vượt quá) cho đến khi ngắt kết nối.

### 4.3. Phiên sạc, Simulator & WebSocket Telemetry

1. **Vòng đời phiên sạc lấy cảm hứng từ OCPP (OCPP-like State Machine)**:
   - `Available` $\rightarrow$ `Preparing` (Cắm súng vào xe) $\rightarrow$ `Charging` (Xác nhận số dư $\ge$ 50.000đ, cấp điện) $\rightarrow$ `SuspendedEV` (Pin đầy 100% / Grace period) $\rightarrow$ `Finishing` (Rút súng) $\rightarrow$ `Available`.
2. **Bộ mô phỏng trạm sạc (Charging Simulator)**:
   - Mô phỏng đường cong nạp pin xe điện chuẩn CC-CV:
     + Giai đoạn CC (Dòng không đổi): SoC tăng từ 20% đến 80% với công suất cực đại.
     + Giai đoạn CV (Áp không đổi): SoC từ 80% đến 100%, công suất giảm dần tuyến tính để bảo vệ pin.
   - **Hardware Safety Cut-off**: Rơ-le ảo tự động ngắt sạc khẩn cấp khi nhiệt độ súng sạc vượt ngưỡng nguy hiểm ($T > 85^\circ\text{C}$).
3. **Kênh truyền Telemetry thời gian thực qua WebSocket**:
   - **Bảo mật WebSocket an toàn**: Sử dụng cơ chế **Ticket-based Handshake** (Client lấy vé ngắn hạn 30s qua REST rồi gửi ticket khi bắt tay WS, tránh lộ JWT trên URL).
   - **In-Memory State Buffer**: Trạng thái tức thời (kW, V, A, SoC %, Temp) cập nhật vào RAM mỗi 2-5s và phát sóng tới Client qua WebSocket. Database chỉ ghi nhận số liệu định kỳ (checkpoint 30-60s) hoặc khi kết thúc phiên để triệt tiêu nghẽn I/O.
   - **Internal Event Bus**: Sử dụng hàng đợi sự kiện bất đồng bộ (`asyncio.Queue`) để truyền phát các sự kiện trọng yếu (`EmergencyStop`, `BatteryFull`, `OutOfBalance`).

### 4.4. Phân hệ Trí tuệ Nhân tạo (AI Engine & 2 Vòng lặp)

1. **Kiến trúc 2 Vòng lặp (Dual-Loop Architecture)**:
   - **Fast Loop (Heuristic nội bộ: 2–5 giây)**:
     + Thuật toán Proportional Fair Sharing chia công suất tức thời giữa các trụ sao cho $\sum P_i \le P_{\text{grid\_max}}$.
     + Cắt giảm công suất ngay lập tức khi lưới điện sụt áp hoặc rơ-le an toàn kích hoạt.
   - **Slow Loop (Google Gemini API: 1–5 phút hoặc theo sự kiện)**:
     + Phân tích chuỗi dữ liệu lịch sử 10-30 phút để nhận diện xu hướng biến thiên công suất và nhiệt độ.
     + Sinh khuyến nghị chiến lược và báo cáo chẩn đoán bằng ngôn ngữ tự nhiên cho CPO.
2. **Ba bài toán AI cốt lõi**:
   - **Smart Charging**: Phân tích biểu đồ phụ tải theo giờ và đề xuất giới hạn công suất động tối ưu.
   - **Predictive Maintenance**: Phân tích tương quan giữa dòng sạc $I(t)$ và độ tăng nhiệt $\Delta T / \Delta t$ để dự báo nguy cơ hỏng cáp trước khi chạm ngưỡng báo động.
   - **Tariff & AI Advisor**: Gợi ý điều chỉnh biểu giá TOU để dàn đều phụ tải; trợ lý ảo trả lời câu hỏi vận hành của CPO.
3. **Cơ chế Dự phòng (Heuristic Fallback Engine)**:
   - Khi Gemini API gặp lỗi mạng, quá thời gian chờ (timeout) hoặc chạm hạn ngạch (429 Rate Limit), hệ thống tự động fallback 100% sang thuật toán quy tắc heuristic nội bộ. Giao diện người dùng vẫn hiển thị khuyến nghị an toàn dựa trên rule-based.

---

## 5. Lộ trình đánh giá bài tập cá nhân (SDLC Checkpoints)

- **KT1 (Đặc tả & Thiết kế Kiến trúc)**:
  - Tài liệu đặc tả yêu cầu chi tiết: [nentang.md](nentang.md), [Prompt.md](Prompt.md).
  - Sơ đồ kiến trúc tổng thể, 2 vòng lặp, WebSocket flow & máy trạng thái: [sodo.md](sodo.md).
  - Hồ sơ bàn giao: `docs/SDLC/KT1/01_SRS_and_UseCases.md`, `02_Database_Design_ERD.md`, `03_AI_Architecture.md`, `04_Wireframes.md`.
- **KT2 (Hiện thực hóa Core Backend, Simulator & ACID)**:
  - Hoàn thành CSDL và các Models, Schemas, Services chính (Stations, Chargers, Sessions, Wallet).
  - Giao dịch trừ tiền ví và quản lý phiên sạc đạt chuẩn ACID (không âm ví, khóa cổng sạc độc quyền).
  - Xây dựng Simulator phát dữ liệu đo đếm sạc qua WebSocket (In-Memory Buffer + Ticket Handshake).
  - Hồ sơ bàn giao: `docs/SDLC/KT2/`.
- **KT3 (Tích hợp AI & Giao diện Web Frontend)**:
  - Tích hợp Gemini API (Slow Loop) + Heuristic Load Balancer (Fast Loop) + Fallback Engine.
  - Giao diện Web React đầy đủ: Dashboard CPO, Quản lý trạm/trụ, Giao diện sạc realtime cho tài xế và Trang giả lập Simulator.
  - Hồ sơ bàn giao: `docs/SDLC/KT3/`.
- **Final (Kiểm thử, Đóng gói & Báo vệ)**:
  - Bộ test tự động pytest (test transaction ví ACID, test logic ngắt sạc, test fallback AI).
  - Seed data mẫu phong phú (nhiều trạm, nhiều trụ, lịch sử phiên sạc sinh động).
  - Báo cáo tổng kết và kịch bản demo trực quan trước hội đồng.
  - Hồ sơ bàn giao: `docs/SDLC/final/`.
