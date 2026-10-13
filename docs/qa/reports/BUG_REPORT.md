# BÁO CÁO LỖI VÀ RÀO CẢN MÔI TRƯỜNG (BUG REPORT) — CSMS

> **Loại tài liệu**: Nhật ký theo dõi khuyết tật & rào cản kỹ thuật (Defect & Blocker Tracking Log)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 16  
> **Quy tắc tuân thủ**: Ghi nhận trung thực các lỗi kỹ thuật phát sinh, rào cản môi trường và tiến độ xử lý; không che giấu các phần chưa hoàn thiện của Giai đoạn 1.

---

## 1. Danh mục lỗi đã xác nhận (Active Defects)

### BUG-01: Sai lệch hạn mức thấu chi giữa CSDL và Tầng Ứng dụng
* **Mức độ nghiêm trọng**: Severity 2 (Major).
* **Mô tả**: Ban đầu, `backend/app/models/wallet.py` đặt ràng buộc `CheckConstraint("balance >= -1000000")` (cho phép âm tới 1 triệu VND), trong khi `backend/app/core/config.py` đặt `NEGATIVE_BALANCE_LIMIT = -300000` VND (cho phép âm 300k). Mức chênh lệch 700.000 VND là quá lớn và tiềm ẩn rủi ro nợ xấu.
* **Biện pháp xử lý**: Đã điều chỉnh ràng buộc CSDL thành `CheckConstraint("balance >= -500000")` và cập nhật `MAX_SAFE_DEBT_LIMIT = -500000` trong `config.py`. Hệ thống hoạt động theo mô hình 2 tầng: khóa tài khoản ở mốc `-300.000` VND và CSDL chỉ cho phép tràn an toàn tối đa 200.000 VND khi phiên sạc kết thúc đột ngột.
* **Trạng thái**: **RESOLVED / CLOSED** (Đã kiểm chứng qua `test_wallet_acid.py`).

### BUG-02: Thiếu thông báo lỗi khi tài khoản bị khóa nợ đăng nhập vào hệ thống
* **Mức độ nghiêm trọng**: Severity 3 (Moderate).
* **Mô tả**: Khi tài khoản có cờ `is_debt_locked == True` do nợ quá -300.000 VND, hệ thống vẫn cấp token JWT hoặc chỉ trả lỗi chung chung không nêu rõ nguyên nhân bị khóa nợ.
* **Biện pháp xử lý**: 
  - Tại `backend/app/api/v1/endpoints/auth.py`: Bổ sung kiểm tra cờ `wallet.is_debt_locked`, ném ngoại lệ `HTTPException(status_code=403, detail="tài khoản bị khóa vì - quá 300k")`.
  - Tại `frontend/src/pages/Login.jsx`: Hiển thị thông báo lỗi màu đỏ nổi bật trên form đăng nhập khi nhận mã lỗi 403.
  - Đã bổ sung ca kiểm thử `test_login_debt_locked_shows_error` trong `test_auth.py`.
* **Trạng thái**: **RESOLVED / CLOSED** (Đã kiểm chứng qua test tự động và giao diện).

### BUG-03: Trụ sạc chưa hỗ trợ kết nối phần cứng thật qua giao thức WebSocket OCPP 1.6J
* **Mức độ nghiêm trọng**: Severity 2 (Major / Architecture Gap).
* **Mô tả**: Tiêu chí nghiệm thu AC3 của Story S-05 yêu cầu trụ sạc kết nối với CSMS qua giao thức chuẩn OCPP. Hiện tại, hệ thống mới chỉ hỗ trợ bộ mô phỏng phần mềm nội tại (`charging_simulator.py`) mà chưa có máy chủ WebSocket đón nhận gói tin trực tiếp từ trụ sạc phần cứng vật lý ngoài thực địa.
* **Biện pháp xử lý**: Đã thực hiện spike kỹ thuật K-01 và lập báo cáo giải trình gửi Product Owner ([docs/research/S-05-AC3-ghi-nhan-cho-PO.md](../research/S-05-AC3-ghi-nhan-cho-PO.md)) để dời việc ghép nối phần cứng sang giai đoạn tiếp theo.
* **Trạng thái**: **DEFERRED / TRACKED AS SPIKE GAP**.

### BUG-04: Cổng thanh toán trực tuyến ngân hàng chưa tích hợp Webhook IPN thật
* **Mức độ nghiêm trọng**: Severity 3 (Moderate / Deferred Scope).
* **Mô tả**: Chức năng nạp tiền ví điện tử hiện tại hoạt động dựa trên API nội bộ mô phỏng giao dịch thành công ngay lập tức (`/api/v1/wallet/topup`), chưa kết nối cổng thanh toán thật (VNPay/Momo/ZaloPay) với cơ chế chữ ký số bảo mật và IPN Webhook bất đồng bộ.
* **Biện pháp xử lý**: Ghi nhận phạm vi Giai đoạn 1 chấp nhận mock nạp tiền để kiểm thử tính nguyên tử ACID của số dư ví.
* **Trạng thái**: **DEFERRED / PLANNED FOR FUTURE PHASE**.

### BUG-05: Nguy cơ rò rỉ dữ liệu vận hành giữa các CPO (Multi-tenancy IDOR Gap)
* **Mức độ nghiêm trọng**: Severity 3 (Moderate).
* **Mô tả**: `GET /api/v1/stations/{station_id}` và `GET /api/v1/chargers/{charger_id}` truy vấn chi tiết trước rồi chỉ tự kiểm tra quyền nếu vai trò là `OPERATOR`; khách chưa đăng nhập và `CUSTOMER` có thể truy cập trực tiếp chi tiết tài nguyên đã ngừng hoạt động. Logic owner của từng route cũng bị lặp riêng.
* **Biện pháp xử lý (07/10/2026 - chưa commit)**: Dùng chung `filter_station_access()` cho danh sách/chi tiết trạm và trụ. Operator chỉ truy cập dữ liệu có `Station.operator_id == user.id`; Admin không bị lọc chủ sở hữu; khách chỉ đọc tài nguyên hoạt động. ID ngoài phạm vi trả `404`. Kết quả truy vấn GPS giữ trạm chưa có tọa độ khi không đặt bán kính; giá trị `Type 2` cũ chỉ được chuẩn hóa trong DTO. 34 test liên quan passed trên SQLite tạm; Ruff sạch.
* **Trạng thái**: **RESOLVED / CLOSED** (đã kiểm chứng test chọn lọc; chưa chạy toàn bộ suite hoặc kiểm thử trình duyệt).

### BUG-06: Nút Admin Demo 1-Click dùng mật khẩu không khớp dữ liệu seed
* **Mức độ nghiêm trọng**: Severity 3 (Moderate).
* **Mô tả**: `AuthContext.quickSwitch()` gửi mật khẩu `AdminPass123`, trong khi tài khoản `admin` trong cấu hình seed đang dùng `12345678a`, khiến nút Admin báo tài khoản demo chưa khởi tạo.
* **Biện pháp xử lý**: Đồng bộ `DEMO_USERS.ADMIN.password` với mật khẩu seed và để `quickSwitch()` đọc username/mật khẩu từ cấu hình này. Sau 5 lần thử sai, tài khoản demo bị khóa tạm; đã xóa bộ đếm và thời điểm khóa cho tài khoản `admin`. Thông báo frontend nay hiển thị chi tiết lỗi API.
* **Trạng thái**: **FIXED IN SOURCE / FRONTEND DOCKER REBUILT / LOGIN API VERIFIED (200, ADMIN)**.

### BUG-07: Migration lịch sử tạo trùng cột `charging_points.last_seen_at` khi nâng cấp DB trống
* **Mức độ nghiêm trọng**: Severity 2 (Major / Migration Blocker).
* **Mô tả**: Lượt chạy ngày 05/10/2026 từng thất bại ở revision `5ba0e05433d7` do trùng `last_seen_at` với `c0062f725df9`.
* **Trạng thái hiện tại (10/10/2026)**: **SOURCE FIX PRESENT / FRESH-DATABASE UPGRADE NOT VERIFIED**. `c0062f725df9` là migration thêm cột; `5ba0e05433d7` hiện là no-op để giữ lịch sử revision mà không thêm cột lần nữa. `alembic heads` trả một head `e72b461d9ac3`. Chưa chạy chuỗi nâng cấp từ DB trống trong lượt này, nên chưa khẳng định runtime.

### Đối chiếu báo cáo EV CSMS — các lỗi đã sửa trong mã nguồn (10/10/2026, code commit `0bb5f67`)

* **DEFECT-11 — Telemetry màn hình phiên đang sạc**: `frontend/src/services/telemetryClient.js` dùng singleton WebSocket dùng chung thay vì tự mở một socket riêng, nhận sự kiện `TELEMETRY` và ánh xạ `energy_kwh`, `cost_estimate`, `soc`, `temp_c` sang các trường UI đang đọc. **Đã sửa; 39 test frontend passed, build thành công, runtime WebSocket smoke trả `CONNECTED/SUBSCRIBED/PONG`; chưa kiểm tra UI trực quan trên trình duyệt.**
* **StopTransaction và transactionData**: `backend/app/ocpp/handlers/stop_transaction.py` lưu các mẫu `transactionData` hợp lệ vào bảng `meter_values` hiện có, bỏ qua dữ liệu lặp, và khi StopTransaction hợp lệ đến sau cảnh báo `Available` không có StopTransaction thì xóa đúng cờ review liên quan rồi chốt phiên. Không thêm bảng/migration. **Đã sửa; có kiểm thử hồi quy và toàn bộ backend suite đạt 437 passed.**
* **Available không có StopTransaction**: `status_notification.py` đánh dấu phiên đang mở cần xem xét thay vì tự chốt hoặc tự lập hóa đơn; job heartbeat giữ nguyên lý do review này. Một StopTransaction hợp lệ đến muộn mới hoàn tất phiên. **Đã sửa; kiểm thử StatusNotification/StopTransaction và full backend suite đạt.**
* **RemoteStart hết hạn và RemoteStop offline**: scheduler cập nhật request `PENDING` quá hạn thành `EXPIRED` mỗi phút; lỗi đầu nối offline ở RemoteStop trả HTTP 409. **Đã sửa; test chọn lọc và full backend suite đạt.**
* **Bảo vệ mô phỏng RemoteStart/RemoteStop**: mặc định tắt bằng `ALLOW_REMOTE_START_SIMULATION=false`; khi bật, chỉ ADMIN được dùng ngoài một test đang chạy. `TESTING` không tự nó mở quyền mô phỏng. **Đã sửa; có kiểm thử role/cấu hình và default Compose vẫn tắt mô phỏng.**
* **Hành vi phụ trợ**: StartTransaction đóng phiên cũ bị phát hiện là `ABNORMAL` với lý do trung tính `Other`; màn hình phiên trống của tài xế có đường dẫn sang bản đồ; Docker Compose gắn tag cho image simulator. **Đã sửa; backend/frontend tests và build, Compose health smoke đều đạt.**
* **Không áp dụng đề xuất tạo phiên giả cho idTag không hợp lệ**: handler hiện từ chối giao dịch không hợp lệ; tạo transaction/session giả sẽ làm sai dữ liệu phiên và tài chính. Chưa có yêu cầu giao thức được xác minh để đổi hành vi này.
* **Audit log append-only**: migration có sẵn trigger cho PostgreSQL và SQLite; không tạo migration trùng. Chưa kiểm tra trạng thái migration của DB đang chạy.
* **Kiểm chứng tổng thể**: Full backend suite trong Docker đạt **437 passed, 307 warnings**; frontend đạt **39 passed**, build thành công (cảnh báo bundle >500 kB); Compose health/frontend HTTP 200 và WebSocket smoke thành công. Ruff báo `All checks passed` nhưng gặp cảnh báo quyền khi quét một số thư mục pytest tạm cũ.

---

## 2. Rào cản kỹ thuật & môi trường (Environment Blockers)

1. **Kịch bản khởi chạy 1-lệnh**: **ĐÃ KHẮC PHỤC VÀ KIỂM TRA**. `docker-compose.yml` và `run.py` chạy stack phát triển Sprint 1–4; `docker compose config --quiet`, build và khởi động stack thành công ngày 10/10/2026.
2. **Hạ tầng Staging Cloud chưa thiết lập**: Chưa có cấu hình Infrastructure as Code (`render.yaml`) để tự động đồng bộ mã nguồn lên môi trường chạy thử đám mây.
3. **Phụ thuộc API Key bên ngoài của AI**: Mô hình phân tích Gemini phụ thuộc vào `GEMINI_API_KEY`. (Hệ thống đã có cơ chế Heuristic Fallback tự động khi không có key, nên không gây gián đoạn hệ thống).

---

## 3. Khuyến nghị và kế hoạch khắc phục (Action Plan)

1. **Ưu tiên 1 (DevOps)**: Soạn thảo script `start.bat` / `run.ps1` và bộ cấu hình Docker để giảm thiểu thao tác thủ công khi chạy dự án.
2. **Ưu tiên 2 (Architecture)**: Nghiên cứu phương án triển khai máy chủ OCPP WebSocket độc lập (hoặc tích hợp qua thư viện Python `ocpp`) cho Giai đoạn tiếp theo.
3. **Ưu tiên 3 (QA)**: Duy trì kiểm thử dựa trên bằng chứng; tổng lịch sử 84/89/90 ca còn mâu thuẫn `[CẦN XÁC NHẬN]`. Full backend suite hiện đạt 158 passed, 1 warning ngày 01/10/2026.
