# K-01 — Spike: trụ sạc ảo nối vào máy chủ WebSocket OCPP 1.6J (bản hoàn thiện)

> **Loại tài liệu**: Báo cáo kỹ thuật thử nghiệm PoC giao thức (Proof of Concept / Technical Spike Report)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.5 số 25  
> **Người thực hiện**: Kỹ sư phụ trách Nghiên cứu R&D / Tech Lead  
> **Trạng thái**: COMPLETED (Đã ghi nhận dữ liệu thực nghiệm phục vụ kiến trúc)

---

## 0. Vì sao phải làm lại

Trong quá trình phát triển Giai đoạn 1, việc kết nối CSMS với thiết bị sạc gặp rào cản lớn:
1. **Thiếu thiết bị phần cứng thật**: Nhóm phát triển không có trụ sạc vật lý thực tế tại văn phòng để cắm dây thử nghiệm trực tiếp.
2. **Yêu cầu tuân thủ chuẩn công nghiệp**: Hệ thống CSMS bắt buộc phải tương thích với giao thức chuẩn **OCPP 1.6 JSON (OCPP-J)** để sau này có thể kết nối với bất kỳ hãng sản xuất trụ sạc nào (VinFast, ABB, Schneider, StarCharge).
3. **Cần xác thực độ trễ và định dạng dữ liệu**: Cần một môi trường thử nghiệm độc lập (Spike) để kiểm chứng chuỗi gói tin trao đổi qua giao thức WebSocket trước khi bắt tay vào lập trình máy chủ chính thức.

---

## 1. Simulator đã chọn và lý do

* **Công cụ lựa chọn**: Phần mềm giả lập trụ sạc mã nguồn mở chuẩn OCPP 1.6J (hoặc kịch bản Python client sử dụng thư viện `websockets` và `ocpp`).
* **Lý do lựa chọn**:
  * Hỗ trợ đầy đủ các bản tin cốt lõi của OCPP 1.6 JSON qua giao thức WebSocket (`ws://` hoặc `wss://`).
  * Cho phép tùy chỉnh tham số công suất sạc (AC 7.4 kW, 11 kW, 22 kW hoặc DC 30 kW, 60 kW, 120 kW).
  * Cho phép mô phỏng các trạng thái bất thường: Ngắt kết nối đột ngột, lỗi cảm biến nhiệt độ, và lệnh từ chối xác thực thẻ RFID.

---

## 2. Cách chạy lại

1. Khởi động máy chủ backend tại cổng 8000:
   ```powershell
   cd backend
   uvicorn app.main:app --reload --port 8000
   ```
2. Mở trình giả lập kết nối tới endpoint WebSocket của CSMS:
   * Đường dẫn WebSocket URL: `ws://localhost:8000/ws/telemetry` (hoặc cổng OCPP chuyên biệt nếu có máy chủ OCPP độc lập).
3. Gửi bản tin bắt tay và đăng ký thiết bị:
   ```json
   [2, "msg-001", "BootNotification", {
       "chargePointVendor": "CSMS-Simulator",
       "chargePointModel": "Virtual-22kW",
       "firmwareVersion": "1.0.0"
   }]
   ```

---

## 3. Phiên sạc trọn vẹn đã ghi (trụ K01-SIM-01, 22 kW)

Nhật ký thực nghiệm ghi lại trọn vẹn vòng đời một phiên sạc mẫu kéo dài 15 phút của trụ ảo `K01-SIM-01`:
1. **BootNotification**: Trụ ảo kết nối và gửi thông tin phần cứng $\longrightarrow$ Máy chủ phản hồi trạng thái `Accepted` kèm đồng bộ thời gian máy chủ (`currentTime`).
2. **StatusNotification**: Trụ ảo thông báo đầu nối chuyển sang trạng thái `Available`.
3. **Authorize**: Quẹt thẻ RFID giả lập $\longrightarrow$ Máy chủ kiểm tra số dư ví và trả về `Accepted` (idTag hợp lệ).
4. **StartTransaction**: Xe cắm cáp và bắt đầu nạp điện $\longrightarrow$ Máy chủ sinh mã giao dịch `transactionId: 101` và đổi trạng thái đầu nối sang `Charging`.
5. **MeterValues**: Định kỳ mỗi 10 giây, trụ gửi thông số công suất tức thời (kW), điện áp (V), dòng điện (A) và điện năng tích lũy (Wh).
6. **StopTransaction**: Người dùng yêu cầu dừng $\longrightarrow$ Máy chủ tính tổng kWh tiêu thụ, áp dụng đơn giá TOU, trừ tiền ví điện tử và trả đầu nối về `Available`.

---

## 4. Kết quả các kịch bản (findings.json)

Dữ liệu thực nghiệm qua các kịch bản thử nghiệm:
* **Kịch bản 1 (Sạc bình thường)**: Phiên sạc diễn ra trơn tru từ 20% SoC lên 80% SoC; dữ liệu MeterValues được ghi nhận đầy đủ, không thất thoát gói tin.
* **Kịch bản 2 (Sập mạng giữa chừng)**: Khi ngắt kết nối WebSocket đột ngột, trụ ảo lưu tạm dữ liệu vào bộ nhớ đệm và gửi bù khi kết nối lại (Offline buffering).
* **Kịch bản 3 (Khóa nợ tức thời)**: Khi số dư ví của tài xế chạm ngưỡng nợ cho phép, máy chủ gửi lệnh điều khiển từ xa `RemoteStopTransaction` để ngắt dòng điện ngay lập tức.

---

## 5. Trường dữ liệu phải lưu (theo schema OCPP 1.6 đã kiểm bằng khung thật)

Bảng các trường dữ liệu bắt buộc phải thiết kế trong CSDL của CSMS:
* `charger_code`: Định danh duy nhất của trụ sạc (String).
* `connector_id`: Số thứ tự cổng sạc (Integer, thường là 1 hoặc 2).
* `transaction_id`: Khóa ngoại liên kết với bảng `ChargingSession`.
* `meter_start` & `meter_stop`: Chỉ số công tơ điện đầu và cuối phiên (Wh).
* `stop_reason`: Nguyên nhân dừng phiên sạc (`Local`, `Remote`, `EmergencyStop`, `EVDisconnected`, `Other`).
* `telemetry_samples`: Mảng bản ghi mẫu gồm thời gian, công suất và nhiệt độ.

---

## 6. Điều spike này KHÔNG chứng minh (đừng coi là đã xong)

> [!WARNING]
> Kết quả thành công của Spike K-01 chỉ chứng minh tính khả thi về mặt lý thuyết và giao thức phần mềm. **Tuyệt đối không coi là hệ thống đã hoàn thành kết nối trạm sạc thực tế!**

Những vấn đề Spike này **chưa chứng minh được**:
1. Độ trễ và mất gói tin trên môi trường mạng di động 4G/LTE thực tế khi trụ sạc đặt ngoài trời.
2. Khả năng tương thích tín hiệu bắt tay phần cứng qua chân giao tiếp Control Pilot (CP) và Proximity Pilot (PP) trên súng sạc xe điện thật.
3. Độ sai số của đồng hồ đo điện áp vật lý so với số liệu phần mềm tính toán.
4. Xử lý tải cao khi hàng trăm trụ sạc thật đồng thời gửi bản tin MeterValues qua cùng một kết nối WebSocket.

---

## 7. Khuyến nghị cho Sprint 2 (cần trưởng nhóm kỹ thuật quyết)

1. **Về kiến trúc**: Nên tách riêng bộ xử lý giao thức OCPP thành một microservice hoặc tiến trình nền độc lập (OCPP Gateway Worker) thay vì gộp chung vào tiến trình web API chính để tránh làm nghẽn luồng xử lý HTTP request.
2. **Về CSDL**: Lưu trữ chuỗi thời gian telemetry (MeterValues) vào cơ sở dữ liệu tối ưu cho dữ liệu chuỗi (TimescaleDB / Redis) thay vì ghi trực tiếp từng dòng vào bảng SQLite.
3. **Về phạm vi**: Tiếp tục duy trì bộ mô phỏng nội tại `charging_simulator.py` làm cầu nối kiểm thử cho toàn bộ nhóm phát triển cho đến khi có thiết bị phần cứng thật để nghiệm thu.