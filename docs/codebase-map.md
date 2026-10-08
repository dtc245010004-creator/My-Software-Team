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
