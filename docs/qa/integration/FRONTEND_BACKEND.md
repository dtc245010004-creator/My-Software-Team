# Frontend ↔ Backend Integration Testing

> **Loại tài liệu**: Hồ sơ kiểm thử tích hợp liên phân hệ (Inter-module Integration Test Dossier)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 17  
> **Phân hệ đối chiếu**: `frontend/src/` (React Vite SPA) $\longleftrightarrow$ `backend/app/` (FastAPI REST API & WebSocket)

---

## Scope

Tài liệu này xác nhận tính toàn vẹn và mức độ tương thích giao tiếp dữ liệu giữa tầng Giao diện người dùng (Client SPA) và Máy chủ dịch vụ (Server API) đối với toàn bộ các tính năng cốt lõi của Giai đoạn 1.

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
* **Kết quả**: **PASS**.

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

## Current Summary

### Đánh giá mức độ tích hợp Frontend ↔ Backend
* **Mức độ tương thích**: **95%** (Đạt chuẩn hoạt động trơn tru cho Giai đoạn 1).
* Toàn bộ 11 ca kiểm thử tích hợp (TC-FB-01 đến TC-FB-11) đều hoạt động ổn định và chính xác trên môi trường tích hợp cục bộ.
* Luồng dữ liệu hai chiều giữa REST API và WebSocket Telemetry được xử lý bất đồng bộ nhịp nhàng, đảm bảo trải nghiệm người dùng liền mạch.

---

## Current Defects

* **0 lỗi phát hiện trong 11 luồng tích hợp cốt lõi**.
* Các vấn đề nhỏ về giao diện (như căn chỉnh lề trên màn hình điện thoại siêu nhỏ) đã được đưa vào danh mục theo dõi của giai đoạn UI polish.

---

## Current Blockers

* Chưa có kiểm thử tự động End-to-End bằng công cụ headless browser (Playwright/Cypress) trong đường ống CI tự động; hiện tại các ca kiểm thử tích hợp được thực hiện bằng kịch bản thủ công và unit/integration test backend.