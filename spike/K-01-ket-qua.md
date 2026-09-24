# K-01: Kết quả Spike (Trụ sạc ảo kết nối WebSocket)

## a. Simulator đã dùng
- **Tên thư viện:** `ocpp` (MobilityHouse) kết hợp với `websockets` của Python.
- **Link mã nguồn thư viện:** [https://github.com/mobilityhouse/ocpp](https://github.com/mobilityhouse/ocpp)
- **Lý do lựa chọn:** Đây là thư viện mã nguồn mở Python phổ biến nhất, chuẩn xác nhất và được cộng đồng bảo trì tốt nhất cho giao thức OCPP 1.6J. Nó siêu nhẹ, hoàn toàn dùng code (không dính giao diện nặng nề như SteVe) nên cho phép chúng ta chủ động script một kịch bản giả lập sạc tự động (chạy 1 mạch từ cắm đến rút súng) chỉ trong 1 file script nhỏ gọn, cực kỳ phù hợp cho mục tiêu Spike/R&D nhanh.
- **Cách chạy (tái hiện nội bộ):**
  1. Tạo virtual environment: `python -m venv venv`
  2. Kích hoạt venv: `.\venv\Scripts\Activate.ps1` (trên Windows)
  3. Cài đặt thư viện: `pip install websockets ocpp`
  4. Mở 2 terminal. Terminal 1 chạy server: `python ws_server_spike.py`
  5. Terminal 2 chạy simulator: `python simulator_spike.py`

## b. Bản ghi chuỗi tin nhắn của 1 phiên sạc hoàn chỉnh
*Dưới đây là log thật (cả Request từ Simulator [2] và Response từ Server [3]) của một phiên sạc hoàn chỉnh từ lúc cắm súng đến lúc rút súng, sinh ra từ đoạn code Spike:*

```json
[2026-09-24 13:09:19.743002] New connection from /CP_1
[2026-09-24 13:09:19.747442] Received: [2,"8333fc69-e15d-4c82-8285-e4f01dbaf831","BootNotification",{"chargePointModel":"SpikeModel1","chargePointVendor":"SpikeVendor","firmwareVersion":"1.0.0"}]
[2026-09-24 13:09:19.747584] Sending: [3, "8333fc69-e15d-4c82-8285-e4f01dbaf831", {"currentTime": "2026-09-24T06:09:19.747541+00:00", "interval": 300, "status": "Accepted"}]

[2026-09-24 13:09:19.751726] Received: [2,"375c2466-5ca5-4a0b-a7f1-54f28b524533","Heartbeat",{}]
[2026-09-24 13:09:19.751821] Sending: [3, "375c2466-5ca5-4a0b-a7f1-54f28b524533", {"currentTime": "2026-09-24T06:09:19.751791+00:00"}]

[2026-09-24 13:09:19.755434] Received: [2,"8c4d7b20-7c2e-4a20-9d23-1f043041a5ca","StatusNotification",{"connectorId":1,"errorCode":"NoError","status":"Available"}]
[2026-09-24 13:09:19.755509] Sending: [3, "8c4d7b20-7c2e-4a20-9d23-1f043041a5ca", {}]

[2026-09-24 13:09:19.759943] Received: [2,"d6ad086e-7ef3-4845-8ffb-bdf5ef5dd37d","Authorize",{"idTag":"DEADBEEF"}]
[2026-09-24 13:09:19.760047] Sending: [3, "d6ad086e-7ef3-4845-8ffb-bdf5ef5dd37d", {"idTagInfo": {"status": "Accepted", "expiryDate": "2026-09-25T06:09:19.760013+00:00"}}]

[2026-09-24 13:09:19.764004] Received: [2,"cfc09fa0-8704-463f-8a69-9041f9040455","StartTransaction",{"connectorId":1,"idTag":"DEADBEEF","meterStart":0,"timestamp":"2026-09-24T06:09:19.762067+00:00"}]
[2026-09-24 13:09:19.764127] Sending: [3, "cfc09fa0-8704-463f-8a69-9041f9040455", {"transactionId": 12345, "idTagInfo": {"status": "Accepted"}}]

[2026-09-24 13:09:19.767092] Received: [2,"1d23ae8f-15da-4fc7-ae49-fe96d0b5169e","StatusNotification",{"connectorId":1,"errorCode":"NoError","status":"Charging"}]
[2026-09-24 13:09:19.767183] Sending: [3, "1d23ae8f-15da-4fc7-ae49-fe96d0b5169e", {}]

[2026-09-24 13:09:19.770007] Received: [2,"44d44127-d154-48d1-ae46-991fada44881","MeterValues",{"connectorId":1,"meterValue":[{"timestamp":"2026-09-24T06:09:19.767902+00:00","sampledValue":[{"value":"1000","measurand":"Energy.Active.Import.Register"}]}],"transactionId":12345}]
[2026-09-24 13:09:19.770105] Sending: [3, "44d44127-d154-48d1-ae46-991fada44881", {}]

[2026-09-24 13:09:19.773298] Received: [2,"4d8ee75f-5be7-4f87-972a-499699c0f44d","StatusNotification",{"connectorId":1,"errorCode":"NoError","status":"Finishing"}]
[2026-09-24 13:09:19.773401] Sending: [3, "4d8ee75f-5be7-4f87-972a-499699c0f44d", {}]

[2026-09-24 13:09:19.776960] Received: [2,"991957ae-f826-40de-9319-7c56604d1d3a","StopTransaction",{"meterStop":1000,"timestamp":"2026-09-24T06:09:19.774769+00:00","transactionId":12345,"reason":"Local","idTag":"DEADBEEF"}]
[2026-09-24 13:09:19.777060] Sending: [3, "991957ae-f826-40de-9319-7c56604d1d3a", {"idTagInfo": {"status": "Accepted"}}]

[2026-09-24 13:09:19.780119] Received: [2,"272ee409-2f1f-406f-9331-e4260d636fab","StatusNotification",{"connectorId":1,"errorCode":"NoError","status":"Available"}]
[2026-09-24 13:09:19.780220] Sending: [3, "272ee409-2f1f-406f-9331-e4260d636fab", {}]
```

## c. Danh sách trường dữ liệu cần lưu vào Database (cho Sprint sau, đừng tưởng bở mà nhìn đống này là sprint 1 nhé)
Từ đặc tả OCPP 1.6J và log thực tế, hệ thống CSMS của chúng ta sẽ cần ánh xạ các tin nhắn này vào CSDL như sau:

1. **BootNotification**: 
   - `chargePointVendor` (Hãng sản xuất)
   - `chargePointModel` (Mẫu trụ sạc)
   - `firmwareVersion` (Phiên bản firmware)
   - *Hành động:* Cập nhật thông tin kỹ thuật của Trụ sạc và ghi nhận thời gian `last_boot_at`.

2. **Heartbeat**:
   - Không có payload (chỉ báo hiệu trụ còn sống).
   - *Hành động:* Cập nhật thời gian `last_heartbeat_at` của Trụ sạc để biết trụ có đang online hay mất kết nối (Offline).

3. **StatusNotification**:
   - `connectorId` (ID của súng sạc, 0 là toàn trụ, >=1 là súng cụ thể)
   - `status` (Available, Preparing, Charging, Finishing, Faulted, v.v.)
   - `errorCode` (NoError, ConnectorLockFailure, v.v.)
   - *Hành động:* Cập nhật trạng thái (`status`, `error_code`) vào bảng `Connector` và có thể ghi log vào bảng `ConnectorStatusHistory`.

4. **Authorize**:
   - `idTag` (Mã RFID / Mã thẻ / UUID của phiên qua App).
   - *Hành động:* Chỉ tra cứu trong bảng `RFIDTag` / `User` để xem mã này có tồn tại và còn hạn không, rồi trả về `idTagInfo` (Accepted / Invalid). Thường không cần sinh bảng mới từ tin nhắn này.

5. **StartTransaction**:
   - `connectorId` (Súng sạc nào đang dùng)
   - `idTag` (Ai đang sạc)
   - `meterStart` (Chỉ số công tơ điện lúc bắt đầu sạc - Wh)
   - `timestamp` (Thời gian bắt đầu sạc)
   - *Hành động:* Tạo một record mới trong bảng `Transaction` (Phiên sạc), chứa các trường trên và sinh ra một `transaction_id` (Primary Key / UUID) trả về cho trụ.

6. **MeterValues**:
   - `transactionId` (Tham chiếu tới phiên sạc hiện tại)
   - `meterValue` (Mảng chứa thời gian `timestamp` và các `sampledValue` (dòng, áp, năng lượng `value`))
   - *Hành động:* Lưu vào bảng `TransactionMeterValue` để vẽ biểu đồ và theo dõi tiến độ sạc (cần lưu `transaction_id`, `timestamp`, `value`, `measurand`...).

7. **StopTransaction**:
   - `transactionId` (Tham chiếu tới phiên sạc cần kết thúc)
   - `meterStop` (Chỉ số công tơ điện lúc kết thúc - Wh)
   - `timestamp` (Thời gian kết thúc)
   - `reason` (Lý do kết thúc: Local, Remote, EVDisconnected...)
   - *Hành động:* Cập nhật record trong bảng `Transaction`: điền `meter_stop`, `stop_timestamp`, tính toán tổng điện năng tiêu thụ = `meter_stop - meter_start`, cập nhật trạng thái phiên sạc thành "Completed".

8. **Reset**:
   - *Lưu ý:* Đây là tin nhắn Server GỬI XUỐNG Trụ (Không phải trụ gửi lên).
   - Payload chứa `type` ("Hard" hoặc "Soft").
   - *Hành động:* Lưu vào bảng `OCPPCommandLog` để theo dõi lịch sử điều khiển trụ sạc từ xa (lưu `charge_point_id`, `command_name`, `payload`, `status`).
