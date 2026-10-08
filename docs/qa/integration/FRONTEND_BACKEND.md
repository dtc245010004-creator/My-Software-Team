# Frontend ↔ Backend Integration Testing

> **Loại tài liệu**: Hồ sơ kiểm thử tích hợp liên phân hệ (Inter-module Integration Test Dossier)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 17  
> **Phân hệ đối chiếu**: `frontend/src/` (React Vite SPA) $\longleftrightarrow$ `backend/app/` (FastAPI REST API & WebSocket)

---

## Scope

Tài liệu này xác nhận tính toàn vẹn và mức độ tương thích giao tiếp dữ liệu giữa tầng Giao diện người dùng (Client SPA) và Máy chủ dịch vụ (Server API) đối với toàn bộ các tính năng cốt lõi của Giai đoạn 1.

Kênh WebSocket OCPP `/ocpp/{charge_point_code}` là giao tiếp riêng giữa trụ sạc và CSMS, không thuộc hợp đồng trình duyệt `/ws/telemetry`; BootNotification được ghi nhận tại [hồ sơ S-08](../stories/S-08.md), ủy quyền `Authorize` bằng `idTag` tại [hồ sơ S-15](../stories/S-15.md), và lệnh Reset do Admin/Operator gửi xuống tại [hồ sơ S-16](../stories/S-16.md).

---

## Test Environment

* **Frontend Client**: Vite Dev Server tại `http://localhost:5173` (hoặc build tĩnh `dist/`).
* **Backend Server**: FastAPI / Uvicorn tại `http://localhost:8000`.
* **Cơ chế Reverse Proxy**: Cấu hình Vite Proxy chuyển hướng toàn bộ request `/api` và `/ws` sang `http://127.0.0.1:8000` (theo `frontend/vite.config.js:9-18`).
* **Cơ sở dữ liệu**: SQLite `backend/ev_csms.db` nạp dữ liệu mẫu từ `seed_data.py`.

---

## TC-FB-01: Đăng nhập & Xác thực JWT Token
* **Luồng tích hợp**: Client gửi `POST /api/v1/auth/login` với `{username, password}` $\longrightarrow$ Server trả về JWT `access_token` và thông tin User.
* **Xác thực Client**: Token được lưu tự động vào `localStorage.getItem('ev_csms_token')` và gắn vào header `Authorization: Bearer <token>` cho mọi cuộc gọi API sau đó (nguồn: `frontend/src/context/AuthContext.jsx:38-45` và `services/api.js`).
* **Kết quả**: **PASS** (Đã kiểm chứng cả qua form đăng nhập và nút bấm chuyển nhanh).

---

## TC-FB-02: Phân quyền theo vai trò (RBAC) trên giao diện
* **Luồng tích hợp**: Sau khi nhận thông tin User, `AuthContext.jsx` trích xuất trường `role` (`ADMIN`, `OPERATOR`, `CUSTOMER`).
* **Xác thực Client**:
  * Tài xế (`CUSTOMER`) chỉ thấy Cổng sạc `DriverPortal.jsx`, không hiển thị menu Quản lý trạm hoặc Điều phối AI.
  * Điều hành viên (`OPERATOR`) thấy đầy đủ Dashboard, Danh sách trạm và Trợ lý AI.
* **Kết quả**: **PASS**.

---

## TC-FB-03: Tải danh sách trạm sạc & Phân trang
* **Luồng tích hợp**: Component `StationsManagement.jsx` gọi `GET /api/v1/stations?skip=0&limit=10`.
* **Xác thực Client**: Hiển thị chính xác số lượng trạm sạc, tên trạm, địa chỉ và số lượng trụ sạc trực thuộc.
* **Kết quả**: **PASS**.

---

## TC-FB-04: Tạo mới trạm sạc & Xác thực Form
* **Luồng tích hợp**: CPO điền form tạo trạm $\longrightarrow$ Client gửi `POST /api/v1/stations` kèm tọa độ GPS (kinh độ, vĩ độ).
* **Xác thực Client**: Server gán tự động `operator_id` từ token, lưu CSDL thành công và giao diện tự động cập nhật thêm thẻ trạm mới mà không cần F5.
* **Kết quả**: **PASS**.

---

## TC-FB-05: Thêm trụ sạc & Ràng buộc duy nhất mã trụ
* **Luồng tích hợp**: CPO thêm trụ vào trạm $\longrightarrow$ `POST /api/v1/stations/{station_id}/chargers`.
* **Xác thực Client**:
  * Nếu nhập mã trụ mới: Thêm thành công.
  * Nếu nhập mã trụ đã tồn tại: Server trả lỗi HTTP 400 (`charger_code already exists`), giao diện hiển thị cảnh báo đỏ yêu cầu nhập mã khác.
* **Kết quả**: **PASS** (Khớp với ràng buộc CSDL `UniqueConstraint`).

---

## TC-FB-06: Thêm đầu nối sạc & Hiển thị Badge trạng thái
* **Luồng tích hợp**: `POST /api/v1/chargers/{charger_id}/connectors` với chuẩn cắm (CCS2, Type 2, CHAdeMO) và công suất (kW).
* **Xác thực Client**: Lưới hiển thị `ConnectorBadge` hiển thị đúng màu (Xanh lá `AVAILABLE`, Xanh dương `CHARGING`).
* **Cập nhật 03/10/2026 (chưa commit)**: `Stations.jsx` bổ sung nút `+ ĐẦU NỐI` trên từng thẻ trụ (ADMIN/OPERATOR) mở Modal "Thêm đầu nối" gồm số thứ tự (tự gợi ý số kế tiếp), chuẩn `CCS2`/`TYPE_2`/`CHADEMO` và công suất tối đa. Số thứ tự trùng trên cùng trụ được báo lỗi ngay tại ô nhập (kiểm tra client + thông báo HTTP 400 `"Cổng sạc #n đã tồn tại trên trụ sạc này."` từ backend).
* **Kết quả**: **PASS**. Phần cập nhật 03/10/2026: đã qua `npm --prefix frontend run build`; [THIẾU: chưa kiểm thử tay trên trình duyệt].

---

## TC-FB-07: Khởi động & Dừng phiên sạc từ xa
* **Luồng tích hợp**:
  * Bắt đầu: Client gửi `POST /api/v1/sessions/start` $\longrightarrow$ Đầu nối chuyển sang `CHARGING`, simulator bắt đầu sinh telemetry.
  * Dừng: Client gửi `POST /api/v1/sessions/{id}/stop` $\longrightarrow$ Server quyết toán tiền điện, đổi trạng thái về `AVAILABLE`.
* **Kết quả**: **PASS**.

---

## TC-FB-08: Đồng bộ số dư ví & Cập nhật trừ tiền
* **Luồng tích hợp**:
  * Trước khi sạc: Client kiểm tra số dư ví qua `GET /api/v1/wallet/me`.
  * Sau khi dừng sạc: Gọi lại API ví, số dư trên thanh trạng thái Topbar tự động cập nhật giảm đúng bằng số tiền trên hóa đơn sạc.
* **Kết quả**: **PASS**.

---

## TC-FB-09: Chặn đăng nhập khi tài khoản nợ quá hạn mức
* **Luồng tích hợp**: Đăng nhập bằng tài khoản `driver_debt` (`DriverPass123`) có số dư nợ và `is_debt_locked == True`.
* **Xác thực Client**: Server trả mã lỗi HTTP 403 với nội dung `"tài khoản bị khóa vì - quá 300k"`. Client bắt được lỗi và hiển thị dòng thông báo màu đỏ nổi bật trên trang đăng nhập.
* **Kết quả**: **PASS** (Đã bổ sung và kiểm chứng thành công ngày 29/09/2026).

---

## TC-FB-10: Cập nhật trạng thái thời gian thực qua WebSocket
* **Luồng tích hợp**: Client kết nối `ws://localhost:8000/ws/telemetry`.
* **Xác thực Client**: Giao diện `LiveSessions.jsx` nhận gói tin mỗi 2 giây, thanh tiến trình % SoC nhảy liên tục và công suất kW biến thiên theo đường cong CC/CV mà không gây lag trình duyệt.
* **Kết quả**: **PASS**.

---

## TC-FB-11: Xử lý lỗi API & Mất kết nối
* **Luồng tích hợp**: Khi tắt server backend hoặc gặp lỗi mạng.
* **Xác thực Client**: Axios Interceptor trong `services/api.js` chặn bắt lỗi và hiển thị thông báo lỗi thân thiện, không làm trắng màn hình (không crash React).
* **Kết quả**: **PASS**.

---

## TC-FB-12: Khóa tạm tài khoản khi đăng nhập sai mật khẩu nhiều lần
* **Luồng tích hợp**: Client nhập sai mật khẩu $\longrightarrow$ `POST /api/v1/auth/login`.
* **Xác thực Client**:
  * Nhập sai 1-4 lần: Server phản hồi HTTP 401 Unauthorized kèm thông báo `"Còn lại X lần thử"`, giao diện `Login.jsx` hiển thị cảnh báo đỏ tương ứng.
  * Nhập sai lần thứ 5: Server kích hoạt `locked_until = now + 15 phút` và trả về HTTP 403 Forbidden. Giao diện `Login.jsx` hiển thị rõ thông điệp tài khoản bị khóa tạm 15 phút.
  * Trong thời gian bị khóa, mọi lần đăng nhập tiếp theo đều bị chặn ngay với HTTP 403 Forbidden.
* **Kết quả**: **PASS** (Đồng bộ với schema `User` và endpoint `auth.py`, chưa commit).

---

## TC-FB-13: Thêm trụ sạc vật lý trực tiếp từ màn hình Stations.jsx
* **Luồng tích hợp**: Admin/Operator mở rộng chi tiết trạm $\longrightarrow$ Bấm nút `+ GẮN TRỤ SẠC` $\longrightarrow$ Mở Modal cấu hình $\longrightarrow$ `POST /api/v1/stations/{station_id}/chargers`.
* **Xác thực Client**:
  * Nhập mã trụ, hãng, model, công suất, số súng sạc và chuẩn cổng.
  * Bấm lưu: Gửi request lên backend thành công (HTTP 201), modal tự đóng và danh sách trụ trong trạm tự động nạp lại không cần refresh trang.
  * Nếu mã trụ trùng: Bắt lỗi HTTP 400 và hiển thị banner cảnh báo đỏ trong modal.
  * **Cập nhật 03/10/2026 (chưa commit)**: Lỗi trùng mã trụ được hiển thị trực tiếp dưới ô nhập "Mã trụ" (viền đỏ + thông báo) thay cho banner chung. Client kiểm tra trùng ngay khi gõ dựa trên danh sách trụ đã tải (`GET /api/v1/stations`); nếu backend vẫn trả HTTP 400 có chuỗi `"Mã trụ"` (trường hợp OPERATOR không thấy trạm của chủ khác) thì thông báo của backend cũng được đưa về đúng ô "Mã trụ". Nút gắn trụ hiển thị cho cả `ADMIN` và `OPERATOR`.
* **Kết quả**: **PASS** (chưa commit). Phần cập nhật 03/10/2026: đã qua `npm --prefix frontend run build`; [THIẾU: chưa kiểm thử tay trên trình duyệt].

---

## TC-FB-14: Chọn vị trí trạm sạc bằng bản đồ Leaflet OpenStreetMap Dark / Esri Vệ tinh
* **Luồng tích hợp**: Admin/Operator bấm `+ THÊM TRẠM SẠC` hoặc icon `SỬA TRẠM` $\longrightarrow$ Giao diện bản đồ `StationLocationPicker.jsx` hiển thị.
* **Xác thực Client**:
  * Bước 1: Mở form thấy bản đồ OpenStreetMap Dark (áp bộ lọc CSS đảo màu nền tối, không phụ thuộc API key) toàn cảnh Việt Nam (zoom 5), hỗ trợ chuyển đổi lớp ảnh vệ tinh Esri World Imagery (không áp filter). Cấu hình tập trung tại `mapConfig.js`.
  * Bước 2: Chọn tỉnh/thành (63 tỉnh từ `provinces.json`) hoặc nhập địa chỉ $\longrightarrow$ bản đồ tự động bay tới vị trí tương ứng (flyTo) theo phân cấp zoom (9, 12, 14, 17) qua debounced geocoding (>= 500ms).
  * Bước 3: Chấm ghim hoặc kéo ghim trên bản đồ $\longrightarrow$ Ghim SVG neon-cyan cập nhật tọa độ chính xác (6 chữ số thập phân). Hỗ trợ nút định vị GPS hiện tại (`navigator.geolocation`) và reverse geocode tự động điền địa chỉ khi ô trống.
  * Bước 4: Chặn lưu nếu chưa có ghim hoặc tọa độ ngoài lãnh thổ Việt Nam (lat 8-24, lng 102-110). Khi có ghim, lưu thành công vào CSDL (HTTP 201 cho tạo mới, HTTP 200 cho cập nhật).
  * Bước 5: Mở sửa trạm đã có tọa độ $\longrightarrow$ ghim hiển thị đúng vị trí zoom 16; trạm cũ chưa có tọa độ $\longrightarrow$ tự động geocode từ địa chỉ cũ.
* **Kết quả**: **PASS** (chưa commit).

---

## TC-FB-15: Chế độ xem Bản đồ toàn cảnh mạng lưới trạm sạc (Stations Map View)
* **Luồng tích hợp**: Người dùng truy cập trang "Hạ Tầng Trạm Sạc" $\longrightarrow$ bấm chuyển đổi sang chế độ `[BẢN ĐỒ]` hoặc truy cập URL có `?view=map`.
* **Xác thực Client**:
  * Bước 1: Bộ chuyển đổi chế độ xem `[DANH SÁCH] | [BẢN ĐỒ]` hiển thị rõ ràng ở đầu trang, ghi nhớ trạng thái phiên làm việc qua query param `?view=map`.
  * Bước 2: Bản đồ Leaflet phủ trọn chiều ngang nội dung (cao 600px), tự động `fitBounds` bao trọn tất cả các trạm có tọa độ (maxZoom 15); nếu không có trạm nào có tọa độ thì hiển thị toàn cảnh Việt Nam (zoom 5) kèm cảnh báo.
  * Bước 3: Marker hiển thị bằng SVG icon tùy biến phân màu sắc chuẩn xác theo trạng thái vận hành: Xanh lá (`ACTIVE`), Vàng cam (`MAINTENANCE`), Xám (`INACTIVE/OFFLINE`). Có viền vàng cảnh báo cho các trạm có tọa độ nghi ngờ ngoài lãnh thổ hoặc tọa độ mặc định cũ.
  * Bước 4: Nhấp vào marker mở Dark Popup hiển thị tên trạm, mã `ST-x`, badge trạng thái, địa chỉ, giờ hoạt động, công suất lưới kW, GPS, số lượng trụ sạc kèm trạng thái ("x trụ / y đang rảnh"), nút "Xem chi tiết" (chuyển sang Danh sách và mở rộng trạm) và link "Chỉ đường" (mở Google Maps tab mới).
  * Bước 5: Trong chế độ Danh sách, mỗi card trạm có nút icon Bản đồ; bấm vào sẽ chuyển sang Bản đồ, `flyTo` (zoom 16) và tự động mở popup của trạm đó.
  * Bước 6: Thanh chú giải (Legend) ở góc dưới trái hiển thị thống kê tổng số trạm và trạng thái mà không che dòng attribution bản quyền. Hỗ trợ nút "Xem tất cả" để fitBounds lại và nút chuyển đổi giữa lớp Bản đồ tối OSM và Ảnh vệ tinh Esri.
* **Kết quả**: **PASS** (chưa commit).

---

## TC-FB-16: Phạm vi truy cập danh sách và chi tiết trạm/trụ
* **Hợp đồng API**: `GET /api/v1/stations` và `GET /api/v1/chargers` lọc tài nguyên của Operator theo `Station.operator_id`; Admin không bị giới hạn theo chủ sở hữu. Khách chỉ đọc trạm/trụ đang hoạt động. Truy cập chi tiết ngoài phạm vi trả `404`.
* **Hiển thị trạm**: Khi có tọa độ tìm kiếm nhưng không đặt bán kính, trạm chưa khai báo GPS vẫn nằm trong kết quả với `distance_km: null`. Connector lưu kiểu cũ như `Type 2` được chuẩn hóa thành `TYPE_2` ở DTO, không ghi lại dữ liệu.
* **Bằng chứng kiểm thử backend (07/10/2026, chưa commit)**: `test_station_ownership_rbac.py`, `test_stations.py`, `test_chargers_grid.py` đạt **35 passed, 4 warnings** trên SQLite tạm; bao gồm list, detail, tree và grid. Ruff các file đổi sạch. Chưa chạy kiểm thử trình duyệt cho ca này.

---

## TC-FB-17: Lưu biểu giá kWh và phí chiếm trụ
* **Hợp đồng API**: `POST /api/v1/tariffs` và `PUT /api/v1/tariffs/{tariff_id}` nhận `idle_fee_per_minute` và `idle_grace_minutes`; phản hồi biểu giá trả lại cả hai trường. Nếu đơn giá kWh, phí chiếm trụ hoặc ân hạn âm, schema Pydantic trả HTTP 422 và thông báo tiếng Việt nêu tên trường.
* **Tính tiền**: Backend giữ nguyên tiền điện `total_kwh × applied_price_per_kwh`; phí chiếm trụ chỉ áp dụng từ `Finishing`/`SuspendedEV` đến `Available`, sau ân hạn, làm tròn lên theo phút và chịu trần `IDLE_FEE_MAX_MINUTES` (mặc định 240). Nếu `Available` đến sau billing, mốc được lưu nhưng hóa đơn/sổ cái không đổi và ví không tự bị trừ lần hai.
* **Bằng chứng kiểm thử backend (08/10/2026, chưa commit)**: `backend/tests/test_billing_idle_fee.py` đạt **20 passed** trong full suite; toàn backend đạt 298 passed, 1 skipped, 302 warnings (299 ca thu thập). Bao gồm giới hạn cấu hình và kiểm tra `Available` muộn không gây quyết toán bổ sung.

---

## Current Summary

### Đánh giá mức độ tích hợp Frontend ↔ Backend
* **Mức độ tương thích**: Hoạt động trơn tru trên môi trường tích hợp cục bộ.
* Toàn bộ 15 ca kiểm thử tích hợp (TC-FB-01 đến TC-FB-15) đều được xác minh đồng bộ.
* Luồng dữ liệu hai chiều giữa REST API và WebSocket Telemetry được xử lý bất đồng bộ nhịp nhàng, đảm bảo trải nghiệm người dùng liền mạch.

---

## Current Defects

* **0 lỗi phát hiện trong 15 luồng tích hợp cốt lõi**.
* Các vấn đề nhỏ về giao diện (như căn chỉnh lề trên màn hình điện thoại siêu nhỏ) đã được đưa vào danh mục theo dõi của giai đoạn UI polish.

---

## Current Blockers

* Chưa có kiểm thử tự động End-to-End bằng công cụ headless browser (Playwright/Cypress) trong đường ống CI tự động; hiện tại các ca kiểm thử tích hợp được thực hiện bằng kịch bản thủ công và unit/integration test backend.
