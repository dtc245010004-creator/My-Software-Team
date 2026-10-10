# Kế hoạch chi tiết Sprint 2 (S-06 → S-16) — 20 SP

> **Loại tài liệu**: Kế hoạch hành động chi tiết Sprint (Operational Sprint Execution Plan)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.2 số 10  
> **Nguồn đối chiếu**: `[nguồn tạm: nentangtramsac_bandaydu.md]` ([nentangtramsac_bandaydu.md](../../nentangtramsac_bandaydu.md) — Sheet: Sprints, Backlog, Tasks, Rủi ro, DoD-DoR)

---

## 0. Thực tế về thời gian — đọc trước

* **Độ dài Sprint**: 1 tuần (5 ngày làm việc, tương đương 10 block nửa ngày).
* **Quy mô cam kết**: **20 Story Points** (11 Stories, 24 Tasks kỹ thuật từ T-12 đến T-35) theo Sheet Sprints dòng 23.
* **Ràng buộc tiến độ**: Team có nhiều thành viên mới/thực tập sinh, do đó các Story phải được phân rã thành các Task con không quá nửa ngày làm việc (theo tiêu chuẩn DoR). Mọi người phải đồng bộ mã nguồn mỗi ngày trong phiên Daily Scrum 15 phút để tránh nghẽn merge.

---

## 1. Quy ước kỹ thuật chốt cùng lúc (họp 30 phút sáng 29/9)

1. **Cấu trúc thư mục Handler**: Mỗi bản tin OCPP được xử lý trong một file handler độc lập đặt tại `backend/app/ocpp/handlers/` theo mẫu chuẩn của `T-16` (ví dụ: `boot_notification.py`, `heartbeat.py`, `status_notification.py`).
2. **Khung tin nhắn OCPP 1.6J**: Tuân thủ định dạng mảng JSON:
   * `[2, "<messageId>", "<action>", {<payload>}]` cho CALL.
   * `[3, "<messageId>", {<payload>}]` cho CALLRESULT.
   * `[4, "<messageId>", "<errorCode>", "<errorDescription>", {<errorDetails>}]` cho CALLERROR.
3. **Quy tắc thời gian**: Toàn bộ mốc thời gian trao đổi qua OCPP bắt buộc dùng múi giờ chuẩn UTC và so sánh tại máy chủ cơ sở dữ liệu (`now()`), không dùng giờ của client trụ ảo.
4. **Chống trùng lặp**: Bắt buộc lưu mã tin nhắn vào bảng CSDL `ocpp_messages` để chống xử lý trùng khi rớt mạng, không lưu bằng biến RAM trong bộ nhớ tiến trình (theo `R-03`).

---

## 2. Các làn làm việc (cần khoảng 7–8 người; Phúc là điều phối + demo)

* **Làn 1 (Core WebSocket & Protocol - 2 người)**: Phụ trách endpoint WebSocket, xác thực mã trụ, bộ đóng/đọc khung tin nhắn và cơ chế thay thế kết nối cũ (S-06, S-07, S-13, T-12, T-13, T-14, T-15, T-28, T-29).
* **Làn 2 (Device Lifecycle Handlers - 2 người)**: Phụ trách BootNotification, Heartbeat, StatusNotification, và Job quét trụ ngoại tuyến (S-08, S-09, S-10, S-12, T-16, T-17, T-18, T-19, T-20, T-21, T-22, T-26, T-27).
* **Làn 3 (Deduplication & Authorize - 2 người)**: Phụ trách bảng lưu tin nhắn chống trùng và xác thực thẻ RFID (S-14, S-15, T-30, T-31, T-32, T-33).
* **Làn 4 (Frontend & Remote Commands - 1–2 người)**: Phụ trách màn hình lưới theo dõi 20 trụ thời gian thực và lệnh Reset từ xa (S-11, S-16, T-23, T-24, T-25, T-34, T-35).
* **Điều phối & Demo (Phúc)**: Điều hành Daily Scrum, theo dõi blocker, phụ trách môi trường trụ ảo và kịch bản demo cuối sprint.

---

## 3. Lịch tổng (theo nửa ngày)

* **Ngày 1 (Thứ Hai)**:
  * *Sáng*: Họp chốt quy ước kỹ thuật; khởi tạo nhánh và file dùng chung (L2).
  * *Chiều*: Triển khai T-12 (WebSocket endpoint), T-14 (Khung tin nhắn), T-16 (Boot handler).
* **Ngày 2 (Thứ Ba)**:
  * *Sáng*: T-18 (Heartbeat), T-20 (StatusNotification ánh xạ 9 trạng thái), T-32 (Bảng thẻ id_tags).
  * *Chiều*: T-13 (Từ chối mã lạ), T-28 (Bảng kết nối bộ nhớ), T-30 (Bảng chống trùng ocpp_messages).
* **Ngày 3 (Thứ Tư)**:
  * *Sáng*: T-26 (Job nền quét ngoại tuyến), T-34 (Hàm gửi CALL xuống trụ), T-23 (Truy vấn cây trạm-trụ).
  * *Chiều*: T-24 (Màn hình lưới theo dõi trụ), T-33 (Handler Authorize).
* **Ngày 4 (Thứ Năm)**:
  * *Sáng*: T-25 (Kênh Server-Sent Events / WebSocket đẩy trạng thái), T-35 (Nút Reset từ xa trên UI).
  * *Chiều*: Ghép nối toàn bộ luồng; chạy thử với 20 trụ ảo; khắc phục lỗi tích hợp.
* **Ngày 5 (Thứ Sáu)**:
  * *Sáng*: Chạy bộ test hồi quy; kiểm tra 10 tiêu chí DoD; chốt danh sách lỗi.
  * *Chiều*: Demo Sprint 2 trước Product Owner và Hội đồng đánh giá; Retrospective.

---

## 4. Chi tiết từng story

### 4.0 Nền dùng chung (L2, làm trước, không tính SP riêng)
* Khởi tạo bảng `ocpp_messages`, cấu hình tham số `HEARTBEAT_INTERVAL` trong `config.py`, và hàm tiện ích gửi/nhận JSON frame.

### S-06 (2 SP)
* **Tiêu đề**: Trụ đã đăng ký kết nối được qua WebSocket, trụ lạ bị từ chối.
* **Tasks**: `T-12` (Endpoint WebSocket tra mã trụ), `T-13` (Đóng kết nối mã lạ, log IP).
* **AC**: Nối trụ ảo có mã hợp lệ thì kết nối mở ổn định; mã lạ bị đóng ngay trong 1 giây.

### S-07 (2 SP)
* **Tiêu đề**: Hệ thống đọc và ghi đúng ba loại khung tin nhắn OCPP.
* **Tasks**: `T-14` (Hàm đọc/ghi CALL, CALLRESULT, CALLERROR), `T-15` (Bộ test khung sai định dạng).
* **AC**: Xử lý đúng mọi khung trong bản ghi K-01; sai định dạng trả CALLERROR đúng mã lỗi đặc tả.

### S-08 (2 SP)
* **Tiêu đề**: Trụ khởi động được chấp nhận qua BootNotification.
* **Tasks**: `T-16` (Handler BootNotification lưu vendor, model, firmware), `T-17` (Trả Accepted/Rejected kèm interval).
* **AC**: Trụ ảo gửi BootNotification được chuyển trực tuyến; trạm bị khóa thì trả về Rejected.

### S-09 (2 SP)
* **Tiêu đề**: Trụ báo nhịp tim và thời điểm liên lạc cuối được cập nhật.
* **Tasks**: `T-18` (Handler Heartbeat update cột last_seen_at), `T-19` (Test trụ ảo đặt sai giờ hệ thống).
* **AC**: Cập nhật đúng `last_seen_at` theo giờ máy chủ CSDL dù đồng hồ trụ lệch.

### S-10 (2 SP)
* **Tiêu đề**: Trụ báo trạng thái từng đầu nối qua StatusNotification.
* **Tasks**: `T-20` (Ánh xạ 9 trạng thái OCPP sang 4 trạng thái nội bộ), `T-21` (Bảng connector_errors), `T-22` (Bỏ qua đầu nối lạ).
* **AC**: Đầu nối đổi sang bận/rảnh/lỗi trong 1 giây; ghi nhận mã lỗi phần cứng.

### S-11 (3 SP)
* **Tiêu đề**: Vận hành viên xem trạng thái mọi trụ trên một màn hình tự cập nhật.
* **Tasks**: `T-23` (Truy vấn cây trạm-trụ-đầu nối), `T-24` (Màn hình lưới nhãn chữ kèm màu), `T-25` (Kênh đẩy sự kiện thời gian thực).
* **AC**: Tải đủ 20 trụ dưới 2 giây; đầu nối đổi trạng thái thì màn hình cập nhật trong 1 giây không cần F5.

### S-12 (2 SP)
* **Tiêu đề**: Trụ quá hạn nhịp tim bị đánh dấu ngoại tuyến.
* **Tasks**: `T-26` (Job nền quét last_seen_at quá 2 chu kỳ), `T-27` (Test dừng trụ rồi bật lại).
* **AC**: Trụ mất liên lạc tự chuyển ngoại tuyến; có liên lạc lại thì tự phục hồi trực tuyến.

### S-13 (2 SP)
* **Tiêu đề**: Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng.
* **Tasks**: `T-28` (Bảng kết nối bộ nhớ nguyên tử), `T-29` (Test tích hợp mở 2 trụ cùng mã).
* **AC**: Kết nối cũ nhận khung đóng chuẩn; kết nối mới hoạt động bình thường, không xử lý lặp.

### S-14 (1 SP)
* **Tiêu đề**: Tin nhắn trùng mã nhận lại đúng câu trả lời cũ, không xử lý hai lần.
* **Tasks**: `T-30` (Bảng ocpp_messages tra trước khi gọi handler), `T-31` (Job dọn bản ghi quá 7 ngày).
* **AC**: Gửi lại cùng tin nhắn 5 lần chỉ xử lý 1 lần và trả về đúng câu trả lời cũ.

### S-15 (1 SP)
* **Tiêu đề**: Trụ xác thực thẻ tài xế qua Authorize.
* **Tasks**: `T-32` (Bảng id_tags gắn thẻ với tài xế), `T-33` (Handler Authorize trả 4 trạng thái chuẩn).
* **AC**: Thẻ hợp lệ trả `Accepted`, thẻ khóa/hết hạn trả `Blocked`/`Expired`, thẻ lạ trả `Invalid`.

### S-16 (1 SP)
* **Tiêu đề**: Vận hành viên khởi động lại trụ từ xa bằng Reset.
* **Tasks**: `T-34` (Gửi CALL từ server xuống trụ và khớp CALLRESULT), `T-35` (Nút khởi động lại trên giao diện).
* **AC**: Bấm Reset mềm trên UI thì trụ ảo khởi động lại trong 5 giây; trụ ngoại tuyến báo lỗi ngay.

---

## 5. Mốc kiểm tra và thứ tự cắt (PO đã chọn 20 SP; đây là cơ chế cảnh báo sớm)

* **Mốc kiểm tra 1 (Hết Thứ Ba - 8 SP)**: Nếu chưa thông được S-06, S-07 và S-08 thì kích hoạt cảnh báo nguy cơ trễ hạn.
* **Mốc kiểm tra 2 (Hết Thứ Năm - 16 SP)**: Toàn bộ handler cơ bản và màn hình S-11 phải sẵn sàng tích hợp.
* **Thứ tự cắt giảm phạm vi khi bị nghẽn (Cơ chế cảnh báo sớm)**:
  1. *Cắt giảm 1*: Hoãn `S-16` (Reset từ xa - 1 SP) sang Sprint 3.
  2. *Cắt giảm 2*: Hoãn `S-14` (Chống trùng tin nhắn - 1 SP) sang Sprint 3.
  3. *Cắt giảm 3*: Hoãn `S-13` (Đóng kết nối trùng mã - 1 SP) sang Sprint 3.
  *Tổng cộng có thể cắt giảm tới 3 SP mà vẫn giữ nguyên được luồng hiển thị trạng thái chính của Sprint 2.*

---

## 6. Câu hỏi cần trả lời ngay (chặn việc nếu không có đáp án)

1. **Khoảng nhịp tim mặc định**: Thống nhất đặt `HEARTBEAT_INTERVAL = 60` giây cho môi trường staging và `5` giây cho môi trường kiểm thử CI?
2. **Kênh đẩy sự kiện xuống trình duyệt**: Sử dụng Server-Sent Events (SSE) hay tái sử dụng kênh WebSocket Telemetry sẵn có tại `/ws/telemetry`? *(Đề xuất: Tái sử dụng WebSocket `/ws/telemetry` để đồng bộ với kiến trúc hiện có)*.
3. **Mã lỗi phần cứng**: Có lưu mã lỗi riêng của từng hãng sản xuất (`vendorErrorCode`) vào bảng CSDL không? *(Đề xuất: Có lưu vào bảng `connector_errors` theo `T-21`)*.

---

## 7. Kiểm tra Definition of Done cuối sprint (mỗi story)

Cuối sprint, mỗi Story trong 11 Story trên chỉ được chuyển sang `DONE` khi:
- [ ] Code review đã duyệt bởi ít nhất một thành viên khác.
- [ ] Unit test cho handler tương ứng đã viết và pass; tỷ lệ pass tổng không giảm.
- [ ] Kịch bản chạy thử với trụ ảo trên môi trường thực nghiệm thành công.
- [ ] Không có secret hoặc mật khẩu lộ trong mã nguồn hoặc log.
- [ ] Cập nhật tài liệu kỹ thuật và sơ đồ trạng thái nếu có thay đổi.