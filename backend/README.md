# CSMS Backend — Dịch vụ Máy chủ Quản trị & Điều hành Trạm sạc

> **Nguồn xác thực chính**: Mã nguồn `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/api/v1/`, `backend/app/models/`, `backend/app/services/`, `backend/seed_data.py`, `backend/pytest.ini`.  
> **Dấu vết tham khảo**: [nguồn tạm: phacthaobandau/plans/Buoc-04-*.md], [nguồn tạm: phacthaobandau/plans/Buoc-05-*.md]

---

## Lệnh khởi chạy (trong backend/)

*(Nguồn: `backend/requirements.txt`, `backend/app/main.py:20`)*

```bash
# 1. Cài đặt thư viện phụ thuộc
pip install -r requirements.txt

# 2. Khởi tạo schema và nạp dữ liệu mẫu
python seed_data.py

# 3. Chạy server phát triển (Development Server)
uvicorn app.main:app --reload --port 8000
```
- Tài liệu API tương tác (Swagger UI): `http://localhost:8000/docs`
- Tài liệu ReDoc: `http://localhost:8000/redoc`
- Endpoint kiểm tra sức khỏe hệ thống: `http://localhost:8000/api/v1/health`

---

## Lưu ý khi migrate trên DB dev đã có dữ liệu cũ

*(Nguồn: `backend/seed_data.py:34-37`, `backend/alembic.ini`, `backend/app/core/database.py:15`)*

- CSDL mặc định sử dụng SQLite tại đường dẫn `sqlite:///./ev_csms.db` với chế độ ghi nhật ký `WAL (Write-Ahead Logging)` và bật cưỡng bức khóa ngoại `PRAGMA foreign_keys = ON;`.
- Khi cập nhật cấu trúc bảng (schema) liên quan đến các ràng buộc `CheckConstraint` mới (ví dụ: hạn mức nợ ví âm `balance >= -500000`), cần chạy lại `python seed_data.py` để thực hiện `drop_all` và `create_all` đồng bộ lại cấu trúc CSDL sạch.

---

## Đăng nhập và khoá tạm

*(Nguồn: `backend/app/core/security.py:15-40`, `backend/app/services/wallet_service.py:90-95`, `backend/app/core/config.py:18-24`, `backend/app/api/v1/endpoints/auth.py:129`)*

1. **Xác thực Đăng nhập & Chặn nợ**:
   - Sử dụng mật khẩu băm trực tiếp qua thư viện `bcrypt` với `rounds = 12` (`settings.BCRYPT_ROUNDS = 12`).
   - Cấp phát Access Token chuẩn JSON Web Token (JWT) mã hóa thuật toán `HS256`, thời hạn hiệu lực `1440 phút (24 giờ)`.
   - **Thông báo khóa tài khoản khi đăng nhập**: Nếu tài khoản bị đánh dấu khóa nợ (`wallet.is_debt_locked == True`), API đăng nhập `POST /api/v1/auth/login` lập tức trả về lỗi `HTTP 403 Forbidden` với thông điệp: `"tài khoản bị khóa vì - quá 300k"`. Màn hình giao diện Login sẽ hiển thị thông báo lỗi màu đỏ này cho người dùng.
2. **Cơ chế Khóa nợ & Giới hạn tràn 200k**:
   - Khi phiên sạc kết thúc và thực hiện trừ tiền cước qua `deduct_charging_fee()`, nếu số dư ví sau khi trừ rơi xuống dưới ngưỡng cho phép `NEGATIVE_BALANCE_LIMIT = -300000` VND, hệ thống tự động đánh dấu cờ `is_debt_locked = True`.
   - **Kiểm soát tràn 200k**: CSDL SQLite áp dụng `CheckConstraint("balance >= -500000")` (`MAX_SAFE_DEBT_LIMIT = -500000`), bảo đảm sau ngưỡng khóa nợ 300k, hệ thống chỉ cho phép phiên sạc xả điện tràn tối đa thêm 200,000 VND trước khi chặn cứng CSDL.
   - Khi tài khoản bị khóa nợ (`is_debt_locked == True`), người dùng bị chặn toàn bộ quyền đăng nhập và cắm sạc mới. Tài khoản chỉ được mở khóa khi nạp tiền đưa số dư về $\ge 0$ VND (qua cổng nạp tiền QR không cần đăng nhập).
3. **Cơ chế Khóa tạm khi sai mật khẩu nhiều lần (Brute-Force Protection)**:
   - Theo dõi số lần nhập sai qua trường `failed_login_attempts` trong bảng `users`.
   - Mỗi lần nhập sai mật khẩu, hệ thống tăng biến đếm và phản hồi HTTP 401 Unauthorized kèm số lần thử còn lại (`MAX_FAILED_LOGIN_ATTEMPTS = 5`).
   - Khi nhập sai liên tiếp 5 lần, hệ thống gán mốc thời gian `locked_until = now + 15 phút` (`LOCKOUT_DURATION_MINUTES = 15`) và trả về `HTTP 403 Forbidden`.
   - Trong suốt thời gian bị khóa tạm, mọi yêu cầu đăng nhập của tài khoản đều bị chặn ngay lập tức tại tầng đầu tiên (tiết kiệm chi phí băm bcrypt).
   - Khi hết thời gian khóa tạm thời, tài khoản tự động được giải tỏa và reset số lần đếm thất bại về `0` khi đăng nhập thành công.

---

## API chính

*(Nguồn: `backend/app/api/v1/__init__.py:10-18`, `backend/app/api/v1/endpoints/`)*

Hệ thống cung cấp 8 phân hệ REST API chuẩn hóa:

| Endpoint Router | Tiền tố đường dẫn | Chức năng nghiệp vụ chính |
| :--- | :--- | :--- |
| **Auth** | `/api/v1/auth` | Đăng ký tài khoản (ép role CUSTOMER), Đăng nhập JWT, Lấy profile (`/me`) |
| **Stations** | `/api/v1/stations` | CRUD thông tin trạm sạc, đo đếm phụ tải điện theo phút, tìm trạm theo Haversine |
| **Chargers** | `/api/v1/chargers` | Quản lý danh mục trụ sạc vật lý và cổng sạc (CCS2, Type 2, CHAdeMO) |
| **Tariffs** | `/api/v1/tariffs` | Cấu hình biểu giá TOU theo trạm, phí chiếm trụ theo phút và thời gian ân hạn; POST/PUT trả HTTP 422 tiếng Việt nếu đơn giá, phí hoặc ân hạn âm |
| **Wallet** | `/api/v1/wallet` | Xem số dư ví, nạp tiền trực tiếp, truy xuất nhật ký giao dịch ACID |
| **Sessions** | `/api/v1/sessions` | Bắt đầu/dừng phiên sạc (chốt cước ACID), xem lịch sử; `GET /{session_id}/invoice` chỉ trả hóa đơn đã chốt, có phân đoạn snapshot, dòng phí chiếm trụ và kiểm tra ownership |
| **Simulator** | `/api/v1/simulator` | Kích hoạt mô phỏng sạc pin CC-CV, tăng tốc thời gian, ngắt sạc an toàn |
| **AI** | `/api/v1/ai` | Điều phối chia sẻ công suất sạc thông minh, Heuristic Fallback khi mất mạng |

### Kết nối trụ sạc OCPP 1.6J

* WebSocket `/ocpp/{charge_point_code}` dành cho mã trụ đã đăng ký và subprotocol `ocpp1.6`.
* Gateway xử lý `BootNotification`, trả `Accepted` hoặc `Rejected` theo `Station.is_active` và giữ riêng khỏi `/ws/telemetry`.
* Handler `Authorize` tra bảng `id_tags`, kiểm tra trạng thái thẻ, thời hạn và trạng thái trạm; phản hồi dùng cấu trúc `idTagInfo` của OCPP 1.6J.
* Admin/Operator gửi `POST /api/v1/chargers/{code}/reset` với `{"type":"Soft"}` hoặc `{"type":"Hard"}` để yêu cầu trụ Reset. Trụ offline trả HTTP 409, không phản hồi trả HTTP 504; timeout mặc định của dispatcher cấu hình bằng `OCPP_CALL_TIMEOUT_SECONDS`.
* Kết quả CALL được lưu trong `OcppMessage` theo cặp mã trụ/message ID; tin nhắn lặp phát lại phản hồi cũ từ CSDL. Scheduler hiện có dọn bản ghi quá 7 ngày mỗi ngày.

---

## Phân quyền và bảo mật request

*(Nguồn: `backend/app/models/user.py:16`, `backend/app/api/v1/endpoints/auth.py`)*

1. **Mô hình RBAC 3 vai trò**:
   - `ADMIN`: Quản trị toàn bộ hạ tầng, cấu hình biểu giá, xem toàn bộ trạm và telemetry.
   - `OPERATOR`: Quản lý các trạm sạc thuộc quyền sở hữu của đơn vị CPO, cấu hình trụ sạc và theo dõi phiên sạc.
   - `CUSTOMER`: Tài xế sử dụng trạm sạc, nạp ví, cắm sạc và theo dõi quá trình sạc xe của chính mình.
2. **Bảo mật Request**:
   - Mọi request yêu cầu xác thực phải gửi kèm Header `Authorization: Bearer <token>`.
   - Ngăn chặn IDOR: Tài xế chỉ được phép dừng phiên sạc hoặc xem lịch sử giao dịch ví của chính tài khoản mình sở hữu.
   - `GET /stations` và `GET /chargers`: Admin thấy toàn hệ thống; Operator chỉ thấy trạm/trụ thuộc `Station.operator_id` của mình; khách chỉ thấy tài nguyên đang hoạt động. Chi tiết ngoài phạm vi trả `404`.

---

## Kiểm thử

*(Nguồn: `backend/pytest.ini`, `backend/tests/`)*

Thực thi backend suite bằng `pytest` trong môi trường ảo backend. Lần chạy ngày 01/10/2026 đạt 163 passed, 1 warning:

```bash
cd backend
pytest -v
```

## Sprint 3 – Backend S-22 / S-23 / S-24 / S-27

Implemented backend scope:
- S-22/T-47: authenticated driver's current charging session API, latest Energy.Active.Import.Register in one SQL query, 204 when none, ownership protection on session detail.
- S-23/T-49: real OCPP RemoteStopTransaction flow, Rejected/Offline/Timeout handling, wait up to 2 minutes for real StopTransaction before completing the session, timeout marks the session for review.
- S-24/T-51: authenticated driver's RemoteStartTransaction, connector availability guard before sending OCPP, virtual driver idTag, 60-second pending request and status tracking, StartTransaction links the request to the created session.
- S-27/T-57: append-only audit_logs, shared ghi_nhat_ky helper, audit records for remote start/stop, normal stop and Reset, audit query with station/user/time filters and pagination, database trigger preventing UPDATE/DELETE of audit rows.

After pulling these changes, run:
```powershell
alembic upgrade head
python -m pytest tests -q
```
