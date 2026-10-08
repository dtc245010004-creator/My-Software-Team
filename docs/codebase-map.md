# Bản đồ mã nguồn EV CSMS

Tài liệu này mô tả các khu vực mã nguồn đang dùng; chi tiết cấu trúc vật lý nằm trong [`architecture/PROJECT_STRUCTURE.md`](architecture/PROJECT_STRUCTURE.md).

## Các khu vực chính

| Đường dẫn | Vai trò |
| --- | --- |
| `backend/app/api/v1/endpoints/` | Router REST và điều phối request/response. |
| `backend/app/schemas/` | Kiểm tra dữ liệu vào/ra bằng Pydantic. |
| `backend/app/models/` | Model SQLAlchemy cho trạm, đầu nối, phiên sạc, biểu giá và ví. |
| `backend/app/services/` | Nghiệp vụ dùng chung như quản lý phiên sạc, biểu giá, ví và billing. |
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
