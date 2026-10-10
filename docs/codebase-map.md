# Bản đồ mã nguồn EV CSMS

Tài liệu này mô tả các khu vực mã nguồn đang dùng; chi tiết cấu trúc vật lý nằm trong [`architecture/PROJECT_STRUCTURE.md`](architecture/PROJECT_STRUCTURE.md).

## Các khu vực chính

| Đường dẫn | Vai trò |
| --- | --- |
| `backend/app/api/v1/endpoints/` | Router REST và điều phối request/response. |
| `backend/app/schemas/` | Kiểm tra dữ liệu vào/ra bằng Pydantic. |
| `backend/app/models/` | Model SQLAlchemy cho trạm, đầu nối, phiên sạc, biểu giá, ví và dòng sổ cái. |
| `backend/app/services/` | Nghiệp vụ dùng chung như quản lý phiên sạc, biểu giá, ví, sổ cái và billing. |
| `backend/app/services/billing_segment_service.py` | Chuyển kết quả phân đoạn S-30/S-31 thành snapshot DB khi chốt phiên; không tự commit. |
| `backend/app/services/scheduler_service.py` | Job định kỳ, gồm đối soát sổ cái ví, gắn cờ phiên OCPP bất thường và hết hạn RemoteStart đang PENDING. |
| `backend/app/ocpp/handlers/` | Xử lý thông điệp OCPP, gồm trạng thái connector và kết thúc phiên. |
| `backend/alembic/versions/` | Migration Alembic; cấu hình tại `backend/alembic.ini`. |
| `backend/tests/` | Kiểm thử backend, bao gồm API, ACID và luồng OCPP. |
| `frontend/src/` | Giao diện React; không thuộc phạm vi thay đổi của phần billing backend này. |
| `docs/` | Kiến trúc, vận hành, kế hoạch, QA và hướng dẫn phát triển. |

## Biểu giá và tính tiền phiên sạc

- `backend/app/models/tariff.py` lưu biểu giá gắn theo `station_id`; các cột giá TOU và giờ cố định vẫn được giữ.
- `backend/app/schemas/tariff.py` xác thực đơn giá, phí chiếm trụ và thời gian ân hạn không âm trước khi request vào endpoint.
- `backend/app/services/billing.py` chứa `calculate_idle_fee` và hàm tổng hợp `calculate_session_total`. Phí chiếm trụ lấy khoảng thời gian connector báo `Finishing` hoặc `SuspendedEV` đến khi báo `Available`, trừ ân hạn, làm tròn lên theo phút bằng `Decimal` và giới hạn số phút chịu phí bởi `IDLE_FEE_MAX_MINUTES` (mặc định 240, đọc từ settings).
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
- Migration `backend/alembic/versions/f41a0b7c9d22_wallet_ledger_append_only.py` thêm cờ, chỉ mục duy nhất và trigger append-only. Do `wallet_transactions.wallet_id` và `wallets.user_id` dùng `ON DELETE CASCADE`, trigger cũng làm thao tác xóa ví/người dùng có giao dịch thất bại; giữ lịch sử bằng soft delete. Migration cố REVOKE UPDATE/DELETE cho role kết nối nếu role tồn tại, nhưng quyền của table owner/superuser không thể bị loại bỏ bằng REVOKE; trigger vẫn chặn DML thông thường.
- Ví cũ thiếu dòng sổ sẽ được job phát hiện và khóa. Chưa backfill số dư đầu kỳ; cần phê duyệt riêng trước khi tạo dữ liệu opening-balance.
- `[CẦN XÁC NHẬN]` S-37 cho phép phát sinh số dư âm, trong khi DB hiện chặn dưới `-500000` và tầng ứng dụng đặt ngưỡng khóa nợ `-300000`; chưa thay đổi hai ngưỡng này.

### Đã thay đổi (10/10/2026, code commit `9ceae53`)

- SCRUM-283/284/288: ghi nạp/trừ qua một hàm append-only, khóa ghi đồng thời, unique reference, trigger PostgreSQL/SQLite và migration mới.
- SCRUM-285/287: job đối soát theo chu kỳ cấu hình, khóa ví lệch và chặn giao dịch mới; log/audit cho phát hiện lệch.
- SCRUM-286/289: endpoint mở khóa chỉ dành cho Admin, yêu cầu lý do và chỉ mở sau khi ledger khớp; ghi log/audit.
- SCRUM-290: thêm `backend/tests/test_wallet_ledger_s41.py` và test nâng schema Compose SQLite cũ. Full backend suite Docker đạt **451 passed, 307 warnings**; migration tiến/lùi/tiến trên PostgreSQL tạm thành công, trigger đã chặn UPDATE/DELETE. Database tạm đã xóa; database dự án không bị migrate.
- Lỗi khởi động Compose ngày 10/10: backend dùng volume SQLite cũ thiếu `wallets.is_reconcile_locked`; `compose_schema_service` đã được bổ sung nâng schema idempotent. Sau khi build lại, backend healthy, `/docs` trả 200 và toàn stack Compose đã được khởi động.

## Sửa lỗi theo báo cáo EV CSMS (10/10/2026, code commit `0bb5f67`)

- `frontend/src/services/telemetryClient.js` dùng WebSocket singleton từ `frontend/src/services/websocket.js`; ánh xạ tên telemetry backend sang trường mà ActiveSession hiển thị. Frontend có 39 test passed và build thành công; chưa kiểm tra trực quan qua trình duyệt.
- `backend/app/ocpp/handlers/stop_transaction.py` lưu `transactionData` hợp lệ vào `MeterValue` đã có. Nếu Available đến trước StopTransaction, phiên được đánh dấu cần xem xét; StopTransaction hợp lệ đến sau mới chốt. Không tự hoàn tất phiên chỉ dựa vào Available.
- Scheduler chuyển RemoteStart quá hạn từ `PENDING` sang `EXPIRED` mỗi phút. RemoteStop trả HTTP 409 khi trụ offline.
- `ALLOW_REMOTE_START_SIMULATION` mặc định false; khi bật, mô phỏng chỉ dùng được bởi ADMIN ngoài test pytest đang chạy.
- Trước migration S-41, Alembic có head `e72b461d9ac3`; hiện có một head `f41a0b7c9d22`. Toàn bộ migration lên head, rồi migration mới nhất lùi một revision và nâng lại, đã chạy trên PostgreSQL tạm; database tạm được xóa sau kiểm thử và DB dự án không bị migrate.
- Kiểm chứng gần nhất ngày 10/10/2026: backend full suite trong Docker **451 passed, 307 warnings**; PostgreSQL trigger chặn UPDATE/DELETE; backend `/docs` trả 200 và backend/DB/frontend/OCPP simulator đều được Compose khởi động. Chưa kiểm tra UI trực quan trên trình duyệt.

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
