# BẢN KIỂM KÊ MODULE & ENDPOINTS HỆ THỐNG (MODULE INVENTORY)

## EV CHARGING STATION MANAGEMENT SYSTEM (EV CSMS)

---

- **Mốc thời gian thực hiện:** 2026-09-25 22:04:00 (UTC+7)
- **Phương pháp thu thập:** Đọc trực tiếp mã nguồn khai báo tại `backend/app/api/v1/endpoints/`, `backend/app/main.py` và `frontend/src/App.jsx`.

---

## 1. Danh Mục Endpoints Backend Thực Tế

### 1.1. Module Xác Thực & Phân Quyền (`/api/v1/auth`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/auth/register` | Public (Mặc định `CUSTOMER`) | Đang hoạt động | Đăng ký tài khoản tài xế mới kèm khởi tạo ví điện tử nguyên tử |
| `POST` | `/api/v1/auth/login` | Public | Đang hoạt động | Đăng nhập nhận JWT Access Token (nhận JSON payload) |
| `GET` | `/api/v1/auth/me` | Authenticated (`Any`) | Đang hoạt động | Lấy thông tin tài khoản hiện tại và số dư ví |
| `GET` | `/api/v1/auth/test-admin-access` | Role: `ADMIN` | Đang hoạt động | Endpoint kiểm thử phân quyền dành riêng cho quản trị viên |

### 1.2. Module Quản Lý Trạm Sạc (`/api/v1/stations`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/stations` | Public (Hỗ trợ lọc Haversine) | Đang hoạt động | Lấy danh sách trạm sạc đang hoạt động kèm thông tin trụ/cổng |
| `POST` | `/api/v1/stations` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Tạo mới trạm sạc kèm cấu hình công suất nguồn lưới |
| `GET` | `/api/v1/stations/{id}` | Public | Đang hoạt động | Lấy chi tiết trạm sạc và tính hệ số quá tải (Oversubscription) |
| `PUT` | `/api/v1/stations/{id}` | Roles: `ADMIN`, `OPERATOR` (IDOR Guard) | Đang hoạt động | Cập nhật thông số trạm sạc (chỉ CPO sở hữu hoặc Admin) |
| `DELETE` | `/api/v1/stations/{id}` | Roles: `ADMIN`, `OPERATOR` (IDOR Guard) | Đang hoạt động | Soft-delete ẩn trạm sạc khỏi người dùng công cộng |
| `POST` | `/api/v1/stations/{id}/reactivate` | Roles: `ADMIN`, `OPERATOR` (IDOR Guard) | Đang hoạt động | Kích hoạt lại trạm sạc đã bị ẩn |

### 1.3. Module Trụ Sạc & Cổng Sạc (`/api/v1`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/stations/{station_id}/chargers` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Thêm trụ sạc EVSE mới vào trạm sạc |
| `GET` | `/api/v1/stations/{station_id}/chargers` | Public | Đang hoạt động | Lấy danh sách các trụ sạc thuộc trạm |
| `GET` | `/api/v1/chargers/{id}` | Public | Đang hoạt động | Lấy chi tiết cấu hình trụ sạc |
| `PUT` | `/api/v1/chargers/{id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Cập nhật thông tin trụ sạc |
| `DELETE` | `/api/v1/chargers/{id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Xóa hoặc vô hiệu hóa trụ sạc |
| `POST` | `/api/v1/chargers/{charger_id}/connectors` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Thêm cổng sạc vật lý (CCS2, Type 2) vào trụ |
| `DELETE` | `/api/v1/connectors/{id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Xóa cổng sạc |
| `PATCH` | `/api/v1/connectors/{id}/status` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Cập nhật trạng thái cổng (`AVAILABLE`, `FAULTED`, v.v.) |

### 1.4. Module Biểu Giá TOU (`/api/v1/tariffs`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/tariffs/stations/{station_id}` | Public | Đang hoạt động | Lấy biểu giá TOU đang áp dụng cho trạm sạc |
| `POST` | `/api/v1/tariffs/stations/{station_id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Cấu hình biểu giá TOU 3 khung giờ mới |
| `PUT` | `/api/v1/tariffs/{id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Cập nhật mức giá các khung giờ |
| `DELETE` | `/api/v1/tariffs/{id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Vô hiệu hóa biểu giá cũ |

### 1.5. Module Ví Điện Tử (`/api/v1/wallet`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/wallet/topup` | Authenticated (`Any`) | Đang hoạt động | Nạp tiền vào ví điện tử có khóa bi quan và giải phóng cờ nợ |
| `GET` | `/api/v1/wallet/me` | Authenticated (`Any`) | Đang hoạt động | Xem số dư ví, trạng thái khóa nợ và lịch sử biến động số dư |

### 1.6. Module Phiên Sạc (`/api/v1/sessions`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/sessions/start` | Authenticated (`Any`) | Đang hoạt động | Bắt đầu sạc, khóa cổng 409, chốt giá TOU, chặn nợ 402 |
| `POST` | `/api/v1/sessions/{id}/stop` | Authenticated (`Any` - IDOR Guard) | Đang hoạt động | Dừng sạc, chốt kWh, quyết toán trừ cước ACID, mở cổng |
| `GET` | `/api/v1/sessions/me` | Authenticated (`Any`) | Đang hoạt động | Lịch sử các phiên sạc của tài xế hiện tại |

### 1.7. Module Trí Tuệ Nhân Tạo AI (`/api/v1/ai`)

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/ai/smart-charging/{station_id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Điều phối phụ tải trạm theo Weighted Fair Sharing SoC |
| `POST` | `/api/v1/ai/predictive-maintenance/{station_id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Dự báo bảo trì phát hiện sụt áp, quá nhiệt và tốc độ tăng nhiệt |
| `POST` | `/api/v1/ai/pricing-advice/{station_id}` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Tư vấn tối ưu biểu giá TOU kéo giãn phụ tải |
| `POST` | `/api/v1/ai/ask` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Trợ lý kỹ thuật hỏi đáp tiếng Việt có grounding dữ liệu trạm |

### 1.8. Module Bộ Giả Lập Sạc (`/api/v1/simulator`) & WebSocket

| Phương thức | Đường dẫn API | Quyền Yêu Cầu (RBAC) | Trạng Thái Hoạt Động | Chức Năng |
| :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/simulator/trigger-event` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Kích hoạt sự cố giả lập (OVERHEAT, GRID_LIMIT, v.v.) |
| `POST` | `/api/v1/simulator/set-power-limit` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Giới hạn công suất sạc tức thì của cổng |
| `GET` | `/api/v1/simulator/sessions/{session_id}/telemetry` | Roles: `ADMIN`, `OPERATOR` | Đang hoạt động | Đọc trực tiếp telemetry tức thời từ RAM Simulator |
| `WS` | `/ws/telemetry` | Public | Đang hoạt động | Kênh phát sóng telemetry đo đếm thời gian thực nhịp 2s |

---

## 2. Danh Mục Các Màn Hình Giao Diện Frontend (React Routes)

| Đường dẫn Web | Component File | Vai Trò & Chức Năng Chính | Trạng Thái |
| :--- | :--- | :--- | :---: |
| `/` | `frontend/src/pages/Dashboard.jsx` | Bảng điều khiển phụ tải biến áp, trạng thái 18 cổng sạc và biểu đồ phụ tải 24h | Hoạt động |
| `/stations` | `frontend/src/pages/Stations.jsx` | Quản lý danh mục 3 trạm sạc, 9 trụ EVSE và 18 cổng sạc vật lý | Hoạt động |
| `/simulator` | `frontend/src/pages/Simulator.jsx` | Bộ mô phỏng sạc pin CC/CV thời gian thực qua WebSocket, đồng hồ đo số liệu | Hoạt động |
| `/wallet` | `frontend/src/pages/Wallet.jsx` | Quản lý ví cá nhân, nạp tiền nhanh (+100k đến +1M), trạng thái nợ và sao kê ACID | Hoạt động |
| `/sessions` | `frontend/src/pages/Sessions.jsx` | Lịch sử chi tiết các phiên sạc và hóa đơn điện tử TOU | Hoạt động |
| `/ai-advisor` | `frontend/src/pages/AIAdvisor.jsx` | Trung tâm điều khiển AI: Smart Charging, Thermal Strip, Dynamic Pricing & NLP Chat | Hoạt động |
| `/login` | `frontend/src/pages/Login.jsx` | Đăng nhập/Đăng ký tài khoản kèm bộ 1-Click Demo Role Switcher | Hoạt động |

---

## 3. Rà Soát Mã Chết & Nhân Bản Kiến Trúc

### 3.1. Rà soát mã chết (Dead Code Detection)

- **File / Endpoint không có lời gọi từ UI:**
  + `GET /api/v1/auth/test-admin-access`: Endpoint này được viết ở Bước 05 nhằm kiểm thử phân quyền RBAC cho ADMIN trong `test_auth.py`, hiện không có component nào trong giao diện web gọi đến.
- **Frontend Unused Imports/Variables:**
  + Phân tích tĩnh Oxlint phát hiện 44 định danh (icons, biến trạng thái `loading`, `isDebtLocked`, hook `useRef`) được import nhưng chưa tham chiếu trực tiếp trong thân JSX của các trang `Stations.jsx`, `Wallet.jsx`, `Simulator.jsx`, `AIAdvisor.jsx`.

### 3.2. Rà soát mã nhân bản kiến trúc (Duplicate Logic Detection)

- Logic kiểm tra quyền sở hữu trạm (IDOR Prevention) được cài đặt độc lập tại cả `StationService` và tầng Router Dependencies để bảo vệ 2 lớp (Defense in Depth). Đây là thiết kế bảo mật có chủ đích, không phải duplicate dư thừa.
- Hàm tính khoảng cách địa lý (Haversine formula) chỉ nằm duy nhất tại `StationService.list_stations_haversine()`.
