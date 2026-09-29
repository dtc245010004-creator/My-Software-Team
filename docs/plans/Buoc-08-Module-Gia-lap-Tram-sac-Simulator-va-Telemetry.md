# BƯỚC 08: MODULE GIẢ LẬP TRẠM SẠC (SIMULATOR & REALTIME TELEMETRY)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-08-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/simulator/` và `backend/app/core/websocket.py`.
> - Sản phẩm bàn giao: `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md`.

---

## 1. Mục tiêu bước 8

- Xây dựng module **Charging Simulator** giả lập phần cứng trụ sạc xe điện chuẩn OCPP-like, phục vụ chạy thử nghiệm và demo trực quan không cần thiết bị vật lý.
- Mô phỏng đường cong sạc pin chân thực (Charging Curve): SoC % tăng dần từ 20% -> 80% (công suất tối đa), từ 80% -> 100% (giảm dần công suất để bảo vệ pin).
- Định kỳ 2 giây/lần phát sóng gói tin đo đếm (Telemetry) qua WebSocket lên Frontend:
  + Tỷ lệ phần trăm pin (`SoC` %)
  + Công suất sạc tức thời (`Power` kW)
  + Điện áp (`Voltage` V) và dòng điện (`Current` A)
  + Nhiệt độ cổng sạc (`Connector Temperature` °C)
  + Điện năng tiêu thụ tích lũy (`Energy` kWh)
  + Chi phí tạm tính (VND)
- Tự động kích hoạt cơ chế ngắt sạc an toàn khi: Pin đạt 100%, hoặc số dư ví không đủ chi trả, hoặc nhiệt độ cổng sạc vượt ngưỡng an toàn ($> 75^\circ\text{C}$).

---

## 2. Nội dung công việc chi tiết

### 2.1. Logic Mô phỏng đường cong sạc pin

- Lớp `ChargingSimulator` (`app/simulator/charging_simulator.py`):
  + Nhận đầu vào: `session_id`, `connector_id`, `battery_capacity_kwh` (ví dụ 60 kWh), `max_power_kw` (ví dụ 60 kW hoặc 120 kW).
  + Trạng thái sạc:
    - Nếu `SoC < 80%`: Công suất = `max_power_kw` * (0.95 - 1.05 ngẫu nhiên).
    - Nếu `SoC >= 80%`: Công suất hạ dần tuyến tính về 10 kW khi đạt 99%.
    - Khi `SoC == 100%`: Tự động gửi tín hiệu `BatteryFull` và gọi `stop_session`.
  + Nhiệt độ cổng sạc: Ban đầu $30^\circ\text{C}$, tăng dần theo công suất và ổn định ở $45 - 55^\circ\text{C}$. Có tùy chọn giả lập sự cố quá nhiệt ($> 75^\circ\text{C}$) để demo kịch bản ngắt khẩn cấp.

### 2.2. Kênh truyền phát WebSocket

- Tích hợp với `ConnectionManager` tại `app/core/websocket.py`.
- Mỗi phiên sạc đang hoạt động sẽ chạy một background task `asyncio.create_task(run_simulation_loop(...))`.
- Broadcast dữ liệu telemetry tới tất cả client đang theo dõi phiên sạc đó.

---

## 3. Cấu trúc file cần sinh

```text
backend/
├── app/
│   ├── simulator/
│   │   ├── __init__.py
│   │   └── charging_simulator.py      # Bộ sinh xung nhịp telemetry & đường cong sạc
│   └── api/v1/endpoints/
│       └── simulator.py               # API kích hoạt/dừng/điều khiển giả lập sự cố
```

---

## 4. Checklist thực hiện & Definition of Done

- [x] Cài đặt `backend/app/simulator/charging_simulator.py` với đường cong sạc pin CC-CV chân thực, tích phân công suất theo thời gian $kWh = \int P(t) dt$.
- [x] SoC ban đầu tự sinh ngẫu nhiên an toàn trong khoảng 20% - 40%, không tin tưởng client gửi lên.
- [x] Nâng cấp `ConnectionManager` tại `app/core/websocket.py` hỗ trợ phân luồng theo session room (`broadcast_to_session`), chống rò rỉ dữ liệu cá nhân giữa các tài xế.
- [x] Tự động ngắt sạc an toàn (Auto Cut-off) trong 3 trường hợp:
  + Pin đầy ($SoC \ge 100\%$): `BATTERY_FULL`
  + Quá nhiệt cổng sạc ($T > 75^\circ\text{C}$): `OVERHEAT_EMERGENCY`
  + Chạm hạn mức nợ ví ($balance - cost < -300,000\text{ VND}$): `DEBT_LIMIT_REACHED`
- [x] Checkpoint định kỳ ghi snapshot `total_kwh`, `current_soc`, `last_checkpoint_at` xuống CSDL sau mỗi 30s.
- [x] Cơ chế phục hồi khi server crash (`reconcile_interrupted_sessions` trong `lifespan` startup): Tự động chốt các session ACTIVE mồ côi thành `INTERRUPTED`, tính cước theo checkpoint gần nhất và giải phóng cổng sạc về `AVAILABLE`.
- [x] Cài đặt API điều khiển giả lập `backend/app/api/v1/endpoints/simulator.py` với phân quyền nghiêm ngặt: chỉ `ADMIN` và `OPERATOR` sở hữu trạm mới được phép gọi `trigger-event` và `set-power-limit`; `CUSTOMER` bị chặn `HTTP 403 Forbidden`.
- [x] Giải quyết triệt để 2 Nợ kỹ thuật từ Bước 07: Chỉ số `meter_stop_kwh` tự động lấy từ Simulator; Giám sát ngắt sạc thời gian thực đã hoạt động.
- [x] Bộ kiểm thử `backend/tests/test_simulator.py` với 9 test cases (sử dụng Time Acceleration) đạt 100% (9/9 passed).
- [x] Toàn bộ test suite Backend 43/43 tests pass 100%.
- [x] Soạn tài liệu bàn giao `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md`.
- [x] Cập nhật trạng thái Bước 08 trong `docs/plans/TIEN-DO.md`, `codebase-map.md`, `MASTER-ROADMAP.md`.

---

## 5. Ghi nhận thực tế triển khai & Quyết định kỹ thuật

1. **Đơn giản hóa mô hình vật lý:**
   + Thay vì tính vi tích phân nhiệt $I^2 R$ quá phức tạp, hệ thống áp dụng mô hình tuyến tính đơn giản: CC duy trì $P_{\max}$ ($SoC < 80\%$), CV giảm dần về $10\text{ kW}$ tại $100\%$. Nhiệt độ cổng sạc bình thường $45-55^\circ\text{C}$, nhảy lên $82.5^\circ\text{C}$ khi Admin/Tester cố tình kích hoạt lỗi `OVERHEAT`.
2. **Cơ chế Checkpoint & Server Crash Reconciliation:**
   + CSDL được bổ sung 2 cột `current_soc` và `last_checkpoint_at` qua migration `f99adeda980d_add_checkpoint_and_soc_to_sessions.py`.
   + Khi server khởi động lại, hàm `reconcile_interrupted_sessions` tự động quét các session còn `ACTIVE`, chuyển sang `INTERRUPTED`, trừ ví theo kWh checkpoint và mở khóa connector về `AVAILABLE`, không để rò rỉ cổng sạc và tiền bạc.
3. **Time Acceleration trong kiểm thử:**
   + Hàm `sim.step(dt_seconds=...)` cho phép giả lập bước thời gian bất kỳ (ví dụ 10s, 60s) mà không cần dùng `sleep(2)` thật, giúp suite test 9 ca kiểm thử chạy xong chỉ trong 6 giây.
4. **Bảo mật phân quyền & Room WebSocket:**
   + Driver tuyệt đối bị cấm 403 khi cố tình trigger sự cố hoặc can thiệp công suất trần.
   + Dữ liệu telemetry chỉ phát cho client đã đăng ký đúng `session_id`, loại bỏ hoàn toàn nguy cơ rò rỉ thông tin cá nhân.
