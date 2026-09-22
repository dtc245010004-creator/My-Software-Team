# BƯỚC 08: MODULE GIẢ LẬP TRẠM SẠC (SIMULATOR & REALTIME TELEMETRY)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-08-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/simulator/` và `backend/app/core/websocket.py`.
> - Sản phẩm bàn giao: `docs/SDLC/KT2/03_Simulator_and_Telemetry_Design.md`.

---

## 1. Mục tiêu bước 8
- Xây dựng module **Charging Simulator** giả lập phần cứng trụ sạc xe điện chuẩn OCPP-like, phục vụ chạy thử nghiệm và demo trực quan không cần thiết bị vật lý.
- Mô phỏng đường cong sạc pin chân thực (Charging Curve): SoC % tăng dần từ 20% -> 80% (công suất tối đa), từ 80% -> 100% (giảm dần công suất để bảo vệ pin).
- Định kỳ 2 giây/lần phát sóng gói tin đo đếm (Telemetry) qua WebSocket lên Frontend:
  - Tỷ lệ phần trăm pin (`SoC` %)
  - Công suất sạc tức thời (`Power` kW)
  - Điện áp (`Voltage` V) và dòng điện (`Current` A)
  - Nhiệt độ cổng sạc (`Connector Temperature` °C)
  - Điện năng tiêu thụ tích lũy (`Energy` kWh)
  - Chi phí tạm tính (VND)
- Tự động kích hoạt cơ chế ngắt sạc an toàn khi: Pin đạt 100%, hoặc số dư ví không đủ chi trả, hoặc nhiệt độ cổng sạc vượt ngưỡng an toàn ($> 75^\circ\text{C}$).

---

## 2. Nội dung công việc chi tiết

### 2.1. Logic Mô phỏng đường cong sạc pin
- Lớp `ChargingSimulator` (`app/simulator/charging_simulator.py`):
  - Nhận đầu vào: `session_id`, `connector_id`, `battery_capacity_kwh` (ví dụ 60 kWh), `max_power_kw` (ví dụ 60 kW hoặc 120 kW).
  - Trạng thái sạc:
    - Nếu `SoC < 80%`: Công suất = `max_power_kw` * (0.95 - 1.05 ngẫu nhiên).
    - Nếu `SoC >= 80%`: Công suất hạ dần tuyến tính về 10 kW khi đạt 99%.
    - Khi `SoC == 100%`: Tự động gửi tín hiệu `BatteryFull` và gọi `stop_session`.
  - Nhiệt độ cổng sạc: Ban đầu $30^\circ\text{C}$, tăng dần theo công suất và ổn định ở $45 - 55^\circ\text{C}$. Có tùy chọn giả lập sự cố quá nhiệt ($> 75^\circ\text{C}$) để demo kịch bản ngắt khẩn cấp.

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

## 4. Bảng kiểm tra thực hiện & Trạng thái (Execution Checklist)

> **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét

| Hạng mục kiểm tra | Trạng thái | Đánh giá thực tế & Nguyên nhân trạng thái |
|---|:---:|---|
| **1. Thuật toán sạc pin CC-CV (`charging_simulator.py`)** | ⬜ Chưa bắt đầu | Mô phỏng đường cong sạc pin: SoC tăng 20% -> 80% (công suất max), 80% -> 100% (giảm dòng). |
| **2. Rơ-le bảo vệ phần cứng (Hardware Safety Cut-off)** | ⬜ Chưa bắt đầu | Ngắt khẩn cấp tức thì khi nhiệt độ súng sạc $T > 85^\circ\text{C}$ hoặc sụt áp lưới. |
| **3. In-Memory State Buffer & Telemetry Loop** | ⬜ Chưa bắt đầu | Cập nhật dữ liệu RAM nhịp 2–5s, giảm tải đĩa, phát WebSocket realtime tới UI. |
| **4. Xuất tài liệu nộp mốc KT2 (`03_Simulator_and_Telemetry_Design.md`)** | ⬜ Chưa bắt đầu | Sẽ xuất vào thư mục `docs/SDLC/KT2/`. |
| **5. Cập nhật tiến độ vào `docs/plans/TIEN-DO.md`** | ✅ Hoàn thành | Đã ghi nhận đúng tiến độ (Đạt 0% - Chưa bắt đầu). |
