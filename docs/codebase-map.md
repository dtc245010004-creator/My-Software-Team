# Bản đồ mã nguồn EV CSMS

Tài liệu này mô tả các khu vực mã nguồn đang dùng; chi tiết cấu trúc vật lý nằm trong [`architecture/PROJECT_STRUCTURE.md`](architecture/PROJECT_STRUCTURE.md).

## Các khu vực chính

| Đường dẫn | Vai trò |
| --- | --- |
| `backend/app/api/v1/endpoints/` | Router REST và điều phối request/response. |
| `backend/app/api/v1/endpoints/payments.py` | Nhận callback thanh toán HMAC; endpoint mô phỏng sandbox chỉ ký tại backend và chỉ cho chủ đơn PENDING dùng khi cấu hình bật. |
| `backend/app/schemas/` | Kiểm tra dữ liệu vào/ra bằng Pydantic. |
| `backend/app/models/` | Model SQLAlchemy cho trạm, đầu nối, phiên sạc, biểu giá, ví và dòng sổ cái. |
| `backend/app/services/` | Nghiệp vụ dùng chung như quản lý phiên sạc, biểu giá, ví, sổ cái và billing. |
| `backend/app/services/billing_segment_service.py` | Chuyển kết quả phân đoạn S-30/S-31 thành snapshot DB khi chốt phiên; không tự commit. |
| `backend/app/services/station_discovery_service.py` | Tính đầu nối rảnh theo trạng thái OCPP/heartbeat và lấy giá TOU hiện hành theo lô cho API tìm trạm công khai S-47. |
| `backend/app/services/scheduler_service.py` | Job định kỳ, gồm đối soát sổ cái ví, gắn cờ phiên OCPP bất thường và hết hạn RemoteStart đang PENDING. |
| `backend/app/ocpp/handlers/` | Xử lý thông điệp OCPP, gồm trạng thái connector và kết thúc phiên. |
| `backend/alembic/versions/` | Migration Alembic; cấu hình tại `backend/alembic.ini`. |
| `backend/tests/` | Kiểm thử backend, bao gồm API, ACID và luồng OCPP. |
| `frontend/src/` | Giao diện React và các dịch vụ gọi API chung cho từng khu vực chức năng. |
| `docs/` | Kiến trúc, vận hành, kế hoạch, QA và hướng dẫn phát triển. |

## Biểu giá và tính tiền phiên sạc

- `backend/app/models/tariff.py` lưu biểu giá gắn theo `station_id`; ràng buộc `uq_tariffs_station_effective` ngăn hai phiên bản giá của cùng trạm có cùng `effective_from`.
- `backend/app/schemas/tariff.py` xác thực đơn giá và phí chiếm trụ không âm, tối đa 8 chữ số nguyên và 2 chữ số thập phân, tương ứng với `Numeric(10,2)` trong DB.
- `backend/app/api/v1/endpoints/tariffs.py` tạo phiên bản mới khi cập nhật, sao chép cả cấu hình phí chiếm trụ/ân hạn; xung đột hiệu lực trả HTTP 409. Migration kiểm tra dữ liệu trùng trước khi thêm unique constraint và dừng có thông báo nếu cần xử lý dữ liệu hiện hữu.
- `frontend/src/services/tariffApi.js` dùng API client chung tại `/api/v1/tariffs`, chọn phiên bản hiệu lực, ánh xạ trường khung giờ của backend và không dùng dữ liệu giả.
- `backend/app/services/billing.py` chứa `calculate_idle_fee` và hàm tổng hợp `calculate_session_total`. Phí chiếm trụ lấy khoảng thời gian connector báo `Finishing` hoặc `SuspendedEV` đến khi báo `Available`, trừ ân hạn, làm tròn số phút lên, làm tròn tiền lẻ đến đồng theo `ROUND_HALF_UP`, và giới hạn số phút chịu phí bởi `IDLE_FEE_MAX_MINUTES` (mặc định 240, đọc từ settings).
- `backend/app/models/station.py` lưu thời điểm đổi trạng thái cùng mốc bắt đầu/kết thúc chiếm trụ; `backend/app/ocpp/handlers/status_notification.py` ghi nhận các mốc từ `StatusNotification`.
- `backend/app/models/session.py` lưu riêng `idle_amount` để hóa đơn có thể đọc lại.
- Bốn điểm kết thúc phiên dùng chung hàm tính tổng: `stop_charging_session`, `reconcile_interrupted_sessions` và `remote_stop_charging_session` trong `backend/app/services/session_service.py`, cùng `handle_stop_transaction` trong `backend/app/ocpp/handlers/stop_transaction.py`.
- Giá điện vẫn dùng `total_kwh × applied_price_per_kwh`; không chia điện năng theo các khung giờ trong thay đổi này.
- Quyết định S-28: lúc billing chỉ tính phí chiếm trụ nếu đã có cả mốc bắt đầu và mốc `Available`. Nếu phiên đã quyết toán khi chưa có `Available`, không tự trừ tiền; hóa đơn và dòng sổ cái hiện có không bị sửa. Khi `Available` tới muộn, handler chỉ lưu mốc kết thúc và để TODO cho bước tính phí bổ sung.
- `[CẦN XÁC NHẬN VỚI MENTOR]` Trước khi triển khai phí bổ sung, cần chốt liệu phí sẽ tạo dòng sổ cái thứ hai hay sẽ hoãn trừ ví. Chưa có cơ chế trừ ví lần hai.

## Ví điện tử và sổ cái S-41

- `backend/app/models/wallet.py` khai báo `Wallet.is_reconcile_locked` riêng với `is_debt_locked`; `WalletTransaction` có chỉ mục duy nhất `(wallet_id, reference_id, transaction_type)` và trigger CSDL chặn `UPDATE`/`DELETE`.
- `backend/app/services/wallet_service.py::post_ledger_entry` là đường ghi chung cho nạp và trừ: `TOPUP`/`REFUND` ghi amount dương, `CHARGE_FEE` ghi amount âm; `SUM(amount)` đối chiếu với `Wallet.balance`. Hàm khóa hàng ví trên PostgreSQL, lấy quyền ghi trước khi đọc trên SQLite, thêm một dòng và cập nhật số dư trong cùng transaction.
- `backend/app/services/compose_schema_service.py` nâng an toàn SQLite volume cũ lúc Compose khởi động: thêm `is_reconcile_locked`, chỉ mục duy nhất và trigger chặn sửa/xóa ledger còn thiếu; không đặt lại số dư hay xóa dòng cũ. Test hồi quy schema legacy nằm ở `backend/tests/test_compose_schema_service.py`.
- Giao dịch trừ có tham chiếu `session_{id}`; lặp cùng tham chiếu/loại/số tiền trả lại dòng hiện có, tham chiếu trùng với số tiền khác bị từ chối. Mọi đường cập nhật số dư trong mã ứng dụng đã được rà soát; phép gán số dư duy nhất nằm trong `post_ledger_entry`.
- Job `reconcile_wallet_ledger_job` chạy theo `RECONCILE_INTERVAL_MINUTES` (mặc định 15), dùng một truy vấn nhóm, ghi log và audit log khi phát hiện lệch, rồi bật cờ khóa đối soát. Nạp, trừ và bắt đầu phiên mới bị chặn khi ví đang khóa.
- `POST /api/v1/wallet/admin/{wallet_id}/reconciliation/unlock` yêu cầu role `ADMIN` và lý do; chỉ mở khi tổng sổ cái đã khớp số dư. Mỗi lần mở khóa được ghi log và audit log.
- S-56 bổ sung audit cho nạp ví thường, nạp tay Admin, callback nạp thanh toán, phát hiện/khóa ví lệch và mở khóa. Log thành công được flush trong cùng transaction với thay đổi ledger/số dư/cờ khóa; thất bại nạp tay ghi `ADMIN_MANUAL_TOPUP_FAILED` trong session riêng sau rollback. Trường chuẩn gồm actor, driver_id, wallet_id, amount (nếu có), reason, status và ip (nếu có).
- `GET /api/v1/audit-logs` nhận `driver_id` để lọc log ví qua subquery bảng Wallet; vẫn kết hợp được actor `user_id`, khoảng thời gian `from`/`to` và phân trang. Chỉ ADMIN/ACCOUNTANT được xem log ví; OPERATOR chỉ xem loại log trạm/phiên/connector thuộc trạm của họ.
- Migration `backend/alembic/versions/f41a0b7c9d22_wallet_ledger_append_only.py` thêm cờ, chỉ mục duy nhất và trigger append-only. Do `wallet_transactions.wallet_id` và `wallets.user_id` dùng `ON DELETE CASCADE`, trigger cũng làm thao tác xóa ví/người dùng có giao dịch thất bại; giữ lịch sử bằng soft delete. Migration cố REVOKE UPDATE/DELETE cho role kết nối nếu role tồn tại, nhưng quyền của table owner/superuser không thể bị loại bỏ bằng REVOKE; trigger vẫn chặn DML thông thường.
- Ví cũ thiếu dòng sổ sẽ được job phát hiện và khóa. Chưa backfill số dư đầu kỳ; cần phê duyệt riêng trước khi tạo dữ liệu opening-balance.
- `[CẦN XÁC NHẬN]` S-37 cho phép phát sinh số dư âm, trong khi DB hiện chặn dưới `-500000` và tầng ứng dụng đặt ngưỡng khóa nợ `-300000`; chưa thay đổi hai ngưỡng này.

## OCPP và toàn vẹn thanh toán

- `backend/app/ocpp/handlers/start_transaction.py` gọi `validate_wallet_balance_for_session` trước khi chấp nhận `StartTransaction`; việc này chặn trụ dùng LocalPreAuthorize/cache thẻ để bỏ qua kiểm tra số dư của `Authorize`.
- `backend/app/ocpp/handlers/stop_transaction.py` tính hóa đơn và gọi `auto_deduct_session_payment` trước cùng lần commit, tạo một dòng `CHARGE_FEE` tham chiếu `session_{id}`. Phiên cần xem xét không bị tự động thu tiền; lặp StopTransaction không trừ lần hai.
- `backend/app/services/payment_service.py::verify_webhook_signature` chỉ chấp nhận HMAC hợp lệ từ `PAYMENT_WEBHOOK_SECRET`; chuỗi giả chữ ký cố định không còn ngoại lệ. `payments.py` giữ SUCCESS ở trạng thái kết thúc khi FAILED/CANCELLED đến muộn.
- `POST /api/v1/payments/sandbox/simulate` tạo HMAC trong backend, chỉ cho phép mô phỏng đơn PENDING của chính tài khoản. Mặc định `ALLOW_PAYMENT_SANDBOX_SIMULATION` tắt trong settings; Compose phát triển bật để các nút sandbox hiện có hoạt động. Khi triển khai môi trường thật phải tắt cờ này.
- `frontend/src/pages/Wallet.jsx` gọi endpoint mô phỏng có kiểm soát thay vì gửi chữ ký cố định; `frontend/src/pages/ChargerDetail.jsx` hiển thị thông báo số dư thiếu và nút sang `/wallet` khi backend trả `WALLET_INSUFFICIENT_BALANCE`.

### Đã thay đổi (10/10/2026, code commit `9ceae53`)

- SCRUM-283/284/288: ghi nạp/trừ qua một hàm append-only, khóa ghi đồng thời, unique reference, trigger PostgreSQL/SQLite và migration mới.
- SCRUM-285/287: job đối soát theo chu kỳ cấu hình, khóa ví lệch và chặn giao dịch mới; log/audit cho phát hiện lệch.
- SCRUM-286/289: endpoint mở khóa chỉ dành cho Admin, yêu cầu lý do và chỉ mở sau khi ledger khớp; ghi log/audit.
- SCRUM-290: thêm `backend/tests/test_wallet_ledger_s41.py` và test nâng schema Compose SQLite cũ. Full backend suite Docker đạt **451 passed, 307 warnings**; migration tiến/lùi/tiến trên PostgreSQL tạm thành công, trigger đã chặn UPDATE/DELETE. Database tạm đã xóa; database dự án không bị migrate.
- Lỗi khởi động Compose ngày 10/10: backend dùng volume SQLite cũ thiếu `wallets.is_reconcile_locked`; `compose_schema_service` đã được bổ sung nâng schema idempotent. Sau khi build lại, backend healthy, `/docs` trả 200 và toàn stack Compose đã được khởi động.

### Đã thay đổi S-56 (13/10/2026)

- S-56 chuẩn hóa dữ liệu audit cho nạp tay, nạp ví thường/callback, reconcile và mở khóa. Thêm `WalletReconciliationLocked` khi ví chuyển từ chưa khóa sang khóa; giữ các action cũ.
- Mở rộng `GET /audit-logs` bằng `driver_id`, chỉ cho ADMIN/OPERATOR/ACCOUNTANT gọi; bộ lọc OPERATOR không trả log ví. Lý do mở khóa rỗng/khoảng trắng bị từ chối; audit thành công cùng transaction nghiệp vụ, audit thất bại nạp tay dùng session riêng sau rollback.
- Không tìm thấy endpoint/service điều chỉnh số dư riêng; không tự tạo chức năng này. Không có migration/config mới.
- `backend/tests/test_wallet_audit_s56.py`: 11 ca; full backend **557 passed, 1 skipped, 320 warnings**, Ruff đạt. Test chạy trên Windows host/Python 3.14.7; không chạy trong Docker ở lượt này.

## Sửa lỗi theo báo cáo EV CSMS (10/10/2026, code commit `0bb5f67`)

- `frontend/src/services/telemetryClient.js` dùng WebSocket singleton từ `frontend/src/services/websocket.js`; ánh xạ tên telemetry backend sang trường mà ActiveSession hiển thị. Frontend có 39 test passed và build thành công; chưa kiểm tra trực quan qua trình duyệt.
- `backend/app/ocpp/handlers/stop_transaction.py` lưu `transactionData` hợp lệ vào `MeterValue` đã có. Nếu Available đến trước StopTransaction, phiên được đánh dấu cần xem xét; StopTransaction hợp lệ đến sau mới chốt. Không tự hoàn tất phiên chỉ dựa vào Available.
- Scheduler chuyển RemoteStart quá hạn từ `PENDING` sang `EXPIRED` mỗi phút. RemoteStop trả HTTP 409 khi trụ offline.
- `ALLOW_REMOTE_START_SIMULATION` mặc định false; khi bật, mô phỏng chỉ dùng được bởi ADMIN ngoài test pytest đang chạy.
- Trước migration S-57, Alembic có head `c316a2b4d6e8`; sau khi thêm migration `cca26ecdf5a8`, `alembic heads` trả đúng một head mới. S-57 upgrade/downgrade/upgrade trên PostgreSQL 16 tạm; database ứng dụng không bị migrate.
- Kiểm chứng Docker ngày 10/10/2026: backend full suite **451 passed, 307 warnings**; PostgreSQL trigger chặn UPDATE/DELETE; backend `/docs` trả 200 và backend/DB/frontend/OCPP simulator đều được Compose khởi động. Lượt backend mới nhất sau S-57 ngày 13/10/2026 chạy trên Windows host/Python 3.14.7: **573 passed, 1 skipped, 320 warnings** (574 tests); Ruff đạt. Chưa kiểm tra UI trực quan trên trình duyệt trong lượt này.

## S-29 — Biểu giá nhiều khung giờ (Backend)

Phạm vi: SCRUM-193, SCRUM-194, SCRUM-195, SCRUM-197.

| Đường dẫn | Vai trò |
| --- | --- |
| `backend/app/models/tariff_period.py` | Bảng `tariff_periods`: giờ dạng `String(5)` HH:MM, giá `Numeric(10,2)` không âm, thứ tự hiển thị và khóa ngoại có chỉ mục tới `tariffs.id`, xóa theo biểu giá. |
| `backend/app/models/tariff.py` | Quan hệ `Tariff.periods`, `cascade="all, delete-orphan"`; giữ nguyên `station_id`, các cột giá/giờ cũ và phí chiếm trụ S-28. |
| `backend/app/schemas/tariff.py` | Schema khung giờ; kiểm tra định dạng, độ chính xác và giá không âm. POST/PUT nhận thêm `periods` tùy chọn; response trả các khung đã lưu. |
| `backend/app/api/v1/endpoints/tariffs.py` | Kiểm tra quyền như luồng cũ; từ chối khung không hợp lệ bằng HTTP 422; lưu/thay toàn bộ danh sách trong cùng giao dịch. |
| `backend/app/services/tariff_validation.py` | Hàm thuần `normalize_periods`, `validate_periods`; hàm chuyển đổi `get_effective_periods` phục vụ biểu giá mới và cũ. |
| `backend/alembic/versions/37ff169ee686_add_tariff_periods.py` | Migration nối sau S-28 (`1660df6b86c6`), chỉ thêm bảng/chỉ mục khung giờ; downgrade bỏ bảng/chỉ mục này, giữ dữ liệu biểu giá cũ. |
| `backend/tests/test_tariff_periods.py` | Kiểm thử tham số hóa các biên giờ, POST/PUT/GET, tương thích cũ, thay thế danh sách, cascade, ràng buộc DB và migration tiến/lùi trên SQLite tạm. |

### Quy ước khung giờ và API

- Chuẩn hóa thành phút trong ngày và dùng khoảng nửa mở `[start, end)`: hai khung chạm nhau tại 10:00 hợp lệ. Giờ `24:00` chỉ được dùng làm mốc kết thúc.
- Khung `22:00-02:00` được lưu/trả nguyên dạng; chỉ tách trong bộ nhớ thành `22:00-24:00` và `00:00-02:00`. `normalize_periods` trả danh sách `NormalizedPeriod(start_minute, end_minute, price_per_kwh, source_index)` theo thứ tự thời gian, giữ giá `Decimal` và chỉ số khung gốc.
- Từ chối mọi khung có giờ bắt đầu bằng giờ kết thúc, kể cả `00:00-00:00`; khai cả ngày bằng `00:00-24:00`.
- `validate_periods` trả danh sách chuỗi lỗi tiếng Việt, nêu cặp khung chồng lấn hoặc từng khoảng trống. API trả danh sách này trong `detail` của HTTP 422. Lỗi định dạng/giá ở schema dùng cấu trúc lỗi Pydantic có vị trí trường.
- Không gửi `periods`, hoặc gửi `null`: POST tạo biểu giá legacy; PUT giữ các khung đang có. Danh sách rỗng `[]` bị từ chối vì không phủ 24 giờ. Gửi danh sách hợp lệ trong PUT thay toàn bộ danh sách cũ; request sai không cập nhật biểu giá.
- Nếu không chỉ định `sort_order`, dùng vị trí trong danh sách gửi lên. Khi đọc, khung được xếp theo `sort_order` rồi `id`. POST vẫn yêu cầu ba trường giá legacy như trước; `periods` là phần bổ sung.

### Tương thích và điểm nối cho S-30/S-31

- `get_effective_periods(tariff)` trả các dict gồm `start_time`, `end_time`, `price_per_kwh`, `sort_order`. Có khung mới thì dùng các khung đó; nếu chưa có, dựng đủ 24 giờ từ peak 1, peak 2, offpeak và phần còn lại normal, với thứ tự ưu tiên peak → offpeak → normal. Khung suy ra không được ghi vào DB.
- Hàm tra giá `determine_tou_rate` và hàm `get_or_create_default_tariff` giữ hành vi cũ. Đặc biệt, hàm tra giá legacy vẫn dùng biên đóng tại giờ kết thúc; dữ liệu chuẩn hóa mới dùng biên nửa mở để không chồng lấn. Kiểm thử giữ riêng hành vi tại các mốc 04:00, 11:30 và 20:00.
- S-30/S-31 có thể dùng `normalize_periods(get_effective_periods(tariff))` để tra giá/chia đoạn sau này. S-29 chưa đưa các khung mới vào phép tính tiền phiên và chưa triển khai giao diện SCRUM-196.

### Kiểm chứng S-29 (08/10/2026)

- Toàn bộ backend: **365 passed, 1 skipped**; nhóm `test_tariff_periods.py`: **67 passed** trong Docker, gồm tạo schema bằng chuỗi migration thật, upgrade/downgrade S-29 và kiểm tra dữ liệu/schema cũ giữ nguyên.
- Autogenerate bằng Docker Compose staging, dùng override tạm để gắn mã nguồn hiện tại và SQLite riêng. Đã rà soát, loại khỏi migration các chênh lệch schema lịch sử ngoài S-29. Không migrate DB dự án.
- Alembic chỉ có một head trước (`1660df6b86c6`) và sau (`37ff169ee686`) khi tạo migration. Ruff đạt trên các file Python thay đổi.

## S-30/S-31 và snapshot/hóa đơn S-33

- `backend/app/services/pricing_engine.py` tính các đoạn giá và nhóm kết quả theo ngày trong bộ nhớ, gồm nội suy số đo tại ranh giới, chuyển khung giờ và phiên qua nửa đêm.
- `backend/app/models/session_billing_segment.py` định nghĩa bảng `session_billing_segments`: lưu `segment_date`, thời gian, kWh, đơn giá `Numeric` đã chốt, thành tiền làm tròn và `tariff_id` nullable để truy vết. Khóa duy nhất `(session_id, segment_index)` ngăn lưu trùng; không có quan hệ tính tiền động qua Tariff.
- `persist_session_billing_segments` gọi nguyên `calculate_session_pricing` và lưu `daily_groups[].segments` cùng giao dịch chốt phiên. Hàm được gọi ở `stop_charging_session`, `reconcile_interrupted_sessions`, `remote_stop_charging_session`, `force_close_abnormal_session` và `handle_stop_transaction`; không commit riêng.
- Phiên cần xem xét không lưu đoạn. Phiên đã chốt có rows thì `get_session_invoice_breakdown` đọc snapshot DB, không dựng lại giá. Phiên cũ không có rows không được backfill; hóa đơn dùng tổng đã lưu trên phiên và `is_legacy=true`.
- `GET /api/v1/sessions/{session_id}/invoice` yêu cầu đăng nhập và dùng DTO riêng `backend/app/schemas/invoice.py`; tài xế chỉ đọc phiên của mình, Operator đọc phiên thuộc trạm sở hữu, Admin đọc toàn hệ thống. Không cho tài khoản khách dùng chung truy cập hóa đơn (401 khi chưa đăng nhập); tài xế khác nhận 403. Phiên đang `ACTIVE`/`CHARGING` trả 409; phiên review trả `pending_review` với trường tiền null; phiên cũ không có snapshot đọc tổng đã lưu và gắn `is_legacy=true`.
- Hợp đồng S-33 trả danh sách `segments`, tiền điện, tổng cộng, quy tắc làm tròn từng đoạn rồi cộng và dòng `idle_fee_line` nếu `idle_amount > 0`. Các field `price_segments`, `daily_groups`, `idle_fee` dạng số và thông tin phiên cũ vẫn được giữ để tương thích màn hình hiện tại.
- `ChargingSession` lưu thêm `idle_chargeable_minutes`, `idle_fee_per_minute_applied` và `idle_grace_minutes_applied` cùng `idle_amount` khi billing chốt. Hóa đơn đọc các giá trị này thay vì lấy phí/ân hạn từ biểu giá đã bị sửa. `Available` đến sau billing chỉ ghi mốc connector; không cập nhật hóa đơn hay tự trừ ví lần hai.
- Migration `backend/alembic/versions/5ccaa686da2b_add_session_billing_segments.py` nối revision `37ff169ee686`; chỉ tạo bảng và hai index. Trên PostgreSQL Compose tạm đã xác nhận một head và chu trình upgrade → downgrade → upgrade; không dùng DB dự án.
- Migration `backend/alembic/versions/d8f56c4a911e_add_idle_fee_invoice_snapshot.py` nối revision `5ccaa686da2b`; lưu chi tiết phí đã áp dụng trên ChargingSession. PostgreSQL Compose tạm đã chạy chu trình upgrade → downgrade → upgrade. Sau đó revision `e72b461d9ac3` hợp nhất head này với `5f9249bf58da`; `alembic heads` hiện chỉ ra một head. DB dự án không bị migrate.
- `backend/tests/test_billing_segments.py` có 6 ca về lưu/idempotency/legacy; `backend/tests/test_invoice.py` có 8 ca về response, phí chiếm trụ, giá đóng băng, review, IDOR và phiên chưa chốt. Full backend suite ngày 10/10/2026 đạt **437 passed, 307 warnings** trong Docker Python 3.12; không còn lỗi fixture migration.

## S-44 — Chia lại công suất khi xe rời hoặc tạm ngưng

- `backend/app/services/smart_charging.py` giữ nguyên thuật toán `calculate_fair_share_targets`; `rebalance_station_power` loại phiên `is_abnormal` và connector `SuspendedEV` khỏi số xe chia tải. Xe SuspendedEV giữ nguyên profile hiện tại và cache giới hạn để khi trở lại Charging được chia lại.
- `trigger_rebalance_background` gom sự kiện theo trạm, dùng `REBALANCE_MIN_INTERVAL_SECONDS` từ `app/core/config.py` (mặc định 5 giây, khai báo thêm trong `.env.example` và được truyền qua `docker-compose.yml`). Mỗi trạm có tối đa một task chạy và một lượt chờ; lượt trailing đọc lại DB sau khi hết khoảng chờ, không giữ station lock trong khi đợi. Đồng hồ và hàm đợi có thể thay trong test.
- `backend/app/ocpp/gateway.py` kích hoạt sau CALLRESULT và commit khi StopTransaction thực sự đổi phiên; tin OCPP trùng được trả từ kho idempotency trước hook nên không tạo lượt chia lại thứ hai. StatusNotification chỉ kích hoạt khi connector đổi vào/ra `SuspendedEV`, gồm lúc quay lại Charging.
- `backend/app/services/scheduler_service.py` sau khi commit cờ `is_abnormal` gọi cùng cơ chế theo từng trạm; giữ nguyên trạng thái phiên CHARGING theo hợp đồng scheduler đang có. Gateway disconnect hiện chỉ dọn registry kết nối, không tự đóng phiên; phiên mất kết nối được scheduler phát hiện theo chu kỳ cấu hình.
- Không cần migration dữ liệu cho S-44. Chưa đổi luật water-filling hay lưu bền `applied_session_limits`; cache này vẫn ở RAM và sẽ mất khi backend khởi động lại.
- Kiểm tra S-44 trong Docker: `ruff check .` đạt; nhóm S-42/S-43/S-44 và scheduler đạt **33 passed**. Toàn bộ backend `pytest tests -q` đạt **525 passed, 318 warnings** (Python 3.12); không có test thất bại.


## S-47 — Tìm trạm gần và đầu nối đang rảnh (Backend)

- `GET /api/v1/stations/nearby` trong `backend/app/api/v1/endpoints/stations.py` là endpoint công khai riêng; endpoint `GET /api/v1/stations` hiện có được giữ nguyên. Response dùng `NearbyStationResponse`, không serialize schema `StationResponse` hay trường nội bộ của chủ trạm/lưới điện.
- GPS phải có đủ vĩ độ/kinh độ; nếu không có GPS phải có `q` không rỗng. Kết quả chỉ gồm trạm `is_active=true` và `status=ACTIVE`, dùng khoảng cách Haversine, radius tùy chọn, `limit` tối đa 50 và `offset`. Trạm thiếu tọa độ tìm được bằng từ khóa, khoảng cách null và xếp cuối khi truy vấn GPS không radius.
- `is_connector_available` trong `backend/app/services/station_discovery_service.py` là quy tắc duy nhất: connector/trụ hoạt động, heartbeat trụ không quá hạn theo `HEARTBEAT_INTERVAL_SECONDS`, `ocpp_status == "Available"` và internal `status == "AVAILABLE"`. Connector tắt không vào tổng; connector của trụ offline có trong tổng nhưng không rảnh.
- Giá tại thời điểm request dùng bộ chọn phiên bản `get_effective_tariffs_for_stations` (cùng quy tắc với `get_or_create_default_tariff`) và `resolve_tariff_for_date`/`get_tariff_rate_at_time`; truy vấn tariff/period theo lô, tiền trả dạng Decimal. Không tạo biểu giá mặc định từ endpoint đọc.
- `HEARTBEAT_INTERVAL_SECONDS=300` và giới hạn trang `STATION_NEARBY_DEFAULT_LIMIT=20` / `STATION_NEARBY_MAX_LIMIT=50` được đọc từ `app/core/config.py`, khai báo trong `.env.example` và truyền qua backend Compose. S-47 không cần migration.
- `backend/tests/test_station_nearby_s47.py`: **8 passed**. Full backend suite ngày 13/10/2026: **546 passed, 1 skipped, 320 warnings** trên Python 3.14.7; pytest dùng thư mục `tmp_path` trong workspace do Windows chặn thư mục tạm mặc định. `ruff check .` đạt. Docker daemon không hoạt động nên chưa chạy kiểm thử trong container.
- Đề xuất: hỗ trợ tìm không dấu tiếng Việt, thêm chỉ mục không gian nếu dữ liệu lớn và cân nhắc cache giá hiện hành. Chưa làm bản đồ, chỉ đường hoặc đặt chỗ.

## S-57 — Yêu cầu ẩn danh hóa dữ liệu tài xế (Backend)

- API `backend/app/api/v1/endpoints/data_erasure.py`: tài xế `CUSTOMER` chỉ tạo/xem yêu cầu của mình; Admin lọc, duyệt hoặc từ chối (lý do từ chối bắt buộc). Các request trùng đang chờ trả 409.
- `backend/app/models/data_erasure_request.py` / `backend/app/schemas/data_erasure.py`: trạng thái yêu cầu, partial unique index cho một `PENDING` mỗi user, DTO riêng cho request/review. `User.data_erased_at` là dấu bền vững để ngăn đăng nhập và tái kích hoạt tài khoản đã ẩn danh.
- `backend/app/services/data_erasure_service.py`: kiểm tra số dư dương/âm, reconcile lock, phiên CHARGING/ACTIVE/ABNORMAL/NEEDS_REVIEW/flag review và TopupOrder PENDING; khóa user/wallet, làm sạch định danh trong một transaction, audit cùng transaction. Lỗi rollback ghi audit FAILED bằng session riêng. Tiền, kWh, thời gian, hóa đơn/đoạn giá, ví và sổ cái append-only không đổi.
- `backend/app/services/identity_guard_service.py`: tuần tự hóa tạo phiên OCPP/API, RemoteStart và nạp tiền với quy trình ẩn danh; SQLite dùng khóa ghi không đổi giá trị, PostgreSQL dùng `SELECT FOR UPDATE`. Prefix token/email ẩn danh cấu hình qua `DATA_ERASURE_IDENTIFIER_PREFIX` trong `backend/app/core/config.py` và `.env.example`.
- Migration `backend/alembic/versions/cca26ecdf5a8_add_driver_data_erasure_requests.py` thêm bảng request, chỉ mục, ràng buộc trạng thái và `users.data_erased_at`. Sau `git pull origin main`, `alembic heads` là một head `cca26ecdf5a8`; PostgreSQL 16 tạm đã qua upgrade → downgrade → upgrade, không migrate DB dự án.
- Test `backend/tests/test_data_erasure_s57.py`: 16 ca về quyền, yêu cầu lặp, phê duyệt/ẩn danh và giữ nguyên số liệu, blockers, từ chối, rollback, audit và idempotency. Kết quả full suite/ruff sau lần chạy hoàn chỉnh cuối cùng được ghi trong nhật ký tiến độ.
- Giới hạn: phạm vi dữ liệu cần mentor xác nhận. Audit/sổ cái append-only cũ có thể còn ID/IP/nội dung định danh; lựa chọn chặn số dư âm bảo thủ; cần chốt thời hạn xử lý, hoàn tiền, vị trí lịch sử và tương thích whitelist S-55 (chưa có trong repo). Không có kết luận pháp lý trong code/docs; không làm giao diện.

## S-48/S-49 Frontend (SCRUM-372) — Thông báo xung đột đặt chỗ & Gợi ý trụ thay thế

- `frontend/src/components/reservation/ReservationConflictModal.jsx`: Modal thông báo "Trụ này vừa được người khác đặt" khi nhận mã lỗi 409 Conflict (RESERVATION_CONFLICT). Hiển thị danh sách gợi ý trụ khả dụng cùng trạm, hỗ trợ phím Esc, focus trap, anti-double-click, responsive mobile và dark mode.
- `frontend/src/services/reservationApi.js`: API service kết nối endpoint `POST /api/v1/reservations` với đầy đủ hợp đồng API đặt chỗ, danh sách đặt chỗ của tôi `GET /api/v1/reservations/my` và hủy đặt chỗ `POST /api/v1/reservations/{id}/cancel`.
- `frontend/src/utils/reservationConflictUtils.js`: Hàm thuần `mapReservationError` (chuẩn hóa lỗi 409 Conflict, 401, 403, 404/501 "Chức năng chưa sẵn sàng", 504, network error), `normalizeSuggestions` (hỗ trợ cả schema `suggestions` và `suggested_connectors`), `createSingleFlightHandler` (chống bấm đôi) và `formatSuggestionAvailableTime`.
- `frontend/src/utils/reservationConflictUtils.test.js`: Bộ kiểm thử đơn vị Vitest gồm 15 ca kiểm thử bao phủ toàn bộ các trường hợp lỗi xung đột, danh sách gợi ý rỗng/hợp lệ và chống gửi trùng request.

## S-55 Frontend (SCRUM-408) — Chốt và Mở lại Kỳ đối soát, Hộp thoại xác nhận & Chặn chốt do phiên bất thường

- `frontend/src/pages/Settlement.jsx`: Màn hình Quản lý Kỳ đối soát (`/settlement`) dành cho vai trò `ACCOUNTANT` và `ADMIN`. Thể hiện đầy đủ 4 trạng thái giao diện: Đang tải (`Skeleton`), Rỗng (`EmptyState`), Lỗi (thông báo + nút "Thử lại"), Thành công (danh sách kỳ với Badge Mở/Đã chốt có icon ổ khóa, thông tin "Đã chốt bởi <closed_by_name> lúc <closed_at>").
- `frontend/src/components/settlement/ClosePeriodConfirmModal.jsx`: Hộp thoại xác nhận chốt kỳ cho `ACCOUNTANT` và `ADMIN`. Thể hiện rõ ràng cảnh báo: "Sau khi chốt, phiên/hoá đơn/sổ cái trong kỳ chỉ đọc". Hỗ trợ phím Esc, focus trap, loading state và chống bấm đôi.
- `frontend/src/components/settlement/ReopenPeriodModal.jsx`: Hộp thoại mở lại kỳ chỉ dành riêng cho `ADMIN`. Bắt buộc nhập lý do mở lại với độ dài tối thiểu 10 ký tự, hiển thị lỗi inline ngay trong ô, cảnh báo "Thao tác này được ghi nhật ký kiểm toán". Nếu lý do không hợp lệ thì chặn không gửi request API.
- `frontend/src/components/settlement/BlockedSessionsModal.jsx`: Hộp thoại cảnh báo khi backend trả về lỗi HTTP 409 `BLOCKED_BY_ABNORMAL_SESSIONS`. Hiển thị "Không thể chốt kỳ: còn phiên bất thường chưa xử lý", danh sách các phiên chặn (mã phiên có link sang `/session/:id`, mã trụ, thời điểm bắt đầu, lý do chặn) và nút điều hướng sang `/abnormal-sessions`. Kỳ đối soát vẫn giữ trạng thái MỞ.
- `frontend/src/services/settlementApi.js`: Module giao tiếp API tách biệt gọi `GET /api/v1/settlement/periods`, `POST /api/v1/settlement/periods/{id}/close`, `POST /api/v1/settlement/periods/{id}/reopen` kèm hợp đồng API chi tiết ở đầu file.
- `frontend/src/config/settlementConfig.js`: Định nghĩa các hằng số phân quyền và độ dài tối thiểu/tối đa của lý do mở lại kỳ (`REOPEN_REASON_MIN_LENGTH = 10`, `REOPEN_REASON_MAX_LENGTH = 500`).
- `frontend/src/utils/settlement.js`: Các hàm thuần kiểm tra quyền `canClose`, `canReopen`, xác thực lý do `validateReopenReason`, ánh xạ lỗi tiếng Việt `mapSettlementError`, chuẩn hóa phiên chặn `describeBlockingSession`, định dạng khoảng ngày `formatPeriodRange`.
- `frontend/src/utils/settlement.test.js` & `frontend/src/services/settlementApi.test.js`: 28 bài test tự động Vitest (22 test utils + 6 test API service) bao phủ 100% logic nghiệp vụ thuần và service API.



