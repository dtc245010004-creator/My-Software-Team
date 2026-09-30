# BÁO CÁO KIỂM TOÁN CODEBASE (AUDIT REPORT)
**Dự án**: Nền tảng vận hành trạm sạc xe điện (EV CSMS)  
**Ngày thực hiện**: 30/09/2026  
**Người thực hiện**: Antigravity AI Agent  
**Mục tiêu**: Đối chiếu toàn diện hiện trạng mã nguồn thực tế với 9 nhóm yêu cầu kỹ thuật (Nhóm A đến Nhóm I) theo nguyên tắc đánh giá công dụng thực tế (Evidence-based & Functional Behavior Audit).  

---

## 1. THÔNG TIN PHIÊN BẢN & MÔI TRƯỜNG KIỂM TOÁN

| Chỉ số | Giá trị thực tế | Ghi chú |
| :--- | :--- | :--- |
| **Git Commit Hash (HEAD)** | `2d7f99c1fd12a33be68de0b269ada8187c3403f0` | `fix(map): them lop ban do tong quat ben duoi danh sach tram sac` |
| **Trạng thái Working Tree** | **Có thay đổi chưa commit** (23 files) | 20 modified, 3 untracked (các cải tiến RBAC và Bản đồ trạm) |
| **Môi trường Python** | `Python 3.14.6` (win32, 64-bit) | Thư viện: `fastapi 0.115.11`, `sqlalchemy 2.0.40`, `pydantic 2.11.0` |
| **Môi trường Node.js** | `Node.js v24.18.1`, `npm 11.6.0` | Frontend framework: `React 18.2.0`, `Vite 5.4.21`, `Tailwind CSS 3.4.17` |
| **Kết quả kiểm thử Backend** | **98/98 tests PASSED** (100%) | Chạy lệnh `pytest backend/tests` (thời gian: 65.06s, 1 warning Starlette deprecation) |
| **Kết quả biên dịch Frontend** | **BUILD SUCCESS** (0 lỗi) | Chạy lệnh `npm --prefix frontend run build` (thời gian: 3.13s) |
| **Cơ sở dữ liệu** | SQLite (Dev / Test độc lập) | Schema alembic: `e4b6f9a2c1d3` (`operator_id` nullable) |

---

## 2. BẢNG TỔNG HỢP MỨC ĐỘ HOÀN THÀNH THEO NHÓM

| Nhóm | Tên nhóm tính năng | Số mục | ĐẠT | MỘT PHẦN | CHƯA CÓ | KHÔNG XÁC ĐỊNH | Tỷ lệ Đạt công dụng |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Nhóm A** | [FE] Simulator UI + WebSocket Heartbeat + Đèn trạng thái | 4 | 1 | 2 | 1 | 0 | 50.0% |
| **Nhóm B** | [BE] RBAC & Phân quyền dữ liệu | 7 | 5 | 2 | 0 | 0 | 85.7% |
| **Nhóm C** | [FE] RBAC Route Guard & Ẩn/hiện UI | 7 | 2 | 1 | 3 | 1 | 35.7% |
| **Nhóm D** | [BE] WebSocket Server Core + Spike OCPP 1.6J | 7 | 0 | 2 | 4 | 1 | 14.3% |
| **Nhóm E** | [FE] Form đăng nhập & Token | 9 | 4 | 5 | 0 | 0 | 72.2% |
| **Nhóm F** | Khung ứng dụng chạy trên máy cá nhân | 4 | 4 | 0 | 0 | 0 | 100.0% |
| **Nhóm G** | [BE] Xác thực & Khóa đăng nhập | 7 | 5 | 2 | 0 | 0 | 85.7% |
| **Nhóm H** | [BE] & [FE] Quản lý trạm sạc | 9 | 7 | 2 | 0 | 0 | 88.9% |
| **Nhóm I** | [BE] & [FE] Quản lý trụ sạc & đầu nối | 9 | 6 | 2 | 1 | 0 | 77.8% |
| **TỔNG** | **Toàn bộ hệ thống** | **63** | **34** | **16** | **9** | **2** | **69.8%** |

---

## 3. CHI TIẾT ĐỐI CHIẾU TỪNG MỤC THEO 9 NHÓM TICKET

### NHÓM A: [FE] Simulator UI + WebSocket Heartbeat + Đèn trạng thái

#### A1. [FE] Màn hình Simulator UI
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**: 
  - File `frontend/src/pages/Simulator.jsx` (lines 1-420): Đầy đủ danh sách phiên sạc giả lập đang chạy, các thanh đo telemetry (SoC %, công suất kW, điện áp V, dòng điện A, nhiệt độ °C), thanh trượt điều chỉnh công suất trần `set-power-limit`, nút kích hoạt sự cố khẩn cấp `trigger-event` (quá nhiệt, ngắt khẩn cấp).
  - Kết nối qua API: `GET /api/v1/simulator/sessions`, `POST /api/v1/simulator/sessions/{id}/trigger-event`, `PUT /api/v1/simulator/sessions/{id}/set-power-limit`.
- **Khác biệt so với ticket**: Không có. Giao diện tối màu tông Slate/Emerald đồng bộ với hệ thống.

#### A2. [FE] Client WebSocket Heartbeat ping/pong định kỳ
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - File `frontend/src/services/websocket.js` (lines 1-75): Chỉ triển khai các callback `onopen`, `onmessage`, `onclose`, `onerror`. Hoàn toàn không có hàm `setInterval` hoặc cơ chế gửi tin nhắn `{"action": "ping"}` hay chuỗi `"ping"` định kỳ từ client.
  - Phía backend `backend/app/main.py` (lines 110-113) đã có sẵn bộ đón nhận: `if text_strip.lower() == "ping": await ws_manager.send_personal_message({"event": "PONG"}, websocket)`, nhưng frontend chưa bao giờ gửi bản tin này.
- **Khác biệt so with ticket**: Client chưa phát xung nhịp, dẫn đến kết nối phụ thuộc hoàn toàn vào TCP timeout của hạ tầng mạng.

#### A3. [FE] Chỉ báo online/offline & Reconnect có Exponential Backoff
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Đèn chỉ báo online/offline: `ĐẠT`. Triển khai tại `frontend/src/components/Header.jsx` (lines 35-43), hiển thị chấm xanh `TELEMETRY LIVE` khi kết nối và chấm đỏ `DISCONNECTED` khi mất kết nối.
  - Cơ chế tự kết nối lại: `MỘT PHẦN`. Tại `frontend/src/services/websocket.js` (line 45): `reconnectTimeout = setTimeout(connect, 3000)`. Sử dụng thời gian trễ cố định 3 giây, **hoàn toàn không có Exponential Backoff** (ví dụ: 1s, 2s, 4s, 8s, 16s... tối đa 30s) như yêu cầu chống bão kết nối (reconnect storm).
- **Khác biệt so với ticket**: Reconnect dùng fixed delay 3000ms thay vì exponential backoff.

#### A4. [FE] Quản lý vòng đời kết nối WebSocket (Đổi tab / Rời màn hình)
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Chống trùng lặp kết nối: `ĐẠT`. Sử dụng biến singleton `wsInstance` và kiểm tra `readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING` trong `frontend/src/services/websocket.js` (lines 20-22).
  - Đóng kết nối khi rời màn hình: `CHƯA CÓ`. Kết nối WebSocket được khởi tạo ở cấp toàn cục tại `Header.jsx` (component luôn gắn trên mọi trang), do đó khi người dùng chuyển tab hoặc rời khỏi trang Simulator, kết nối vẫn duy trì liên tục và nhận broadcast thay vì hủy đăng ký kênh mô phỏng để tiết kiệm băng thông.
- **Khác biệt so với ticket**: WebSocket duy trì mức toàn cục thay vì gắn/hủy theo vòng đời màn hình Simulator.

---

### NHÓM B: [BE] RBAC & Phân quyền dữ liệu

#### B1. [BE] Chủ trạm chỉ thấy và thao tác trên trạm mình sở hữu
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Model `Station` (`backend/app/models/station.py` line 25): Cột `operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)`.
  - Endpoint `GET /api/v1/stations` (`backend/app/api/v1/endpoints/stations.py` lines 79-80):
    ```python
    if current_user and current_user.role == UserRole.OPERATOR:
        query = query.filter(Station.operator_id == current_user.id)
    ```
  - Test kiểm chứng: `test_station_list_isolation` trong `backend/tests/test_station_ownership_rbac.py` kiểm tra Chủ trạm A chỉ thấy ST-1, ST-2, ST-4; Chủ trạm B chỉ thấy ST-3. Test passed 100%.

#### B2. [BE] Chủ trạm A gọi trạm của B bị từ chối 403 & Ghi nhật ký bảo mật
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Chặn 403 Forbidden: `ĐẠT`. Tại `stations.py` (lines 470-474), `chargers.py` (lines 62-67), `tariffs.py` (lines 142-149): Trả về `HTTPException(status_code=403, detail="Bạn không có quyền quản lý...")`.
  - Ghi nhật ký truy cập trái phép chuyên biệt: `CHƯA CÓ`. Hệ thống chỉ ném ngoại lệ HTTP 403 mà chưa ghi bản ghi cảnh báo an ninh (Audit Log) lưu vào CSDL hoặc file log chuyên biệt gồm (User ID, IP, Resource ID, Timestamp).
- **Khác biệt so với ticket**: Đã chặn truy cập trái phép bằng 403 nhưng thiếu module Audit Log ghi nhận sự kiện vi phạm.

#### B3. [BE] Tài xế gọi API vận hành bị 403
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Sử dụng dependency `require_roles([UserRole.ADMIN, UserRole.OPERATOR])` tại các endpoint tạo/sửa/xóa trạm, trụ, cấu hình công suất, kích hoạt sự cố giả lập.
  - Khi user có role `CUSTOMER` (Tài xế) gọi các endpoint này, hệ thống trả về mã lỗi `403 Forbidden` (`backend/app/api/deps.py` lines 86-90).
  - Test kiểm chứng: `test_customer_cannot_create_or_modify_station` trong `backend/tests/test_station_ownership_rbac.py`.

#### B4. [BE] Nguyên tắc "Từ chối mặc định" (Deny-by-default) & Bảng kê toàn bộ route
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Nguyên tắc "Từ chối mặc định": `MỘT PHẦN`. FastAPI không tự động áp dụng deny-by-default ở cấp core framework nếu lập trình viên không khai báo dependency `Depends(role_checker)`. Tuy nhiên, trong mã nguồn thực tế, toàn bộ 100% các route thao tác dữ liệu nhạy cảm (CUD) đều đã được gắn `role_checker` một cách thủ công.
  - Bảng kê danh mục toàn bộ Route: Đã trích xuất đầy đủ 45 endpoints tại Mục 5 của báo cáo này.

#### B5. [BE] Ma trận kiểm tra rò rỉ chéo dữ liệu giữa Chủ trạm A và B
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Đã kiểm tra cách ly trên 18 endpoint: Stations, Chargers, Tariffs, Sessions, Simulator, Metrics, AI Advisor.
  - Chi tiết đối chiếu thực tế được trình bày tại Mục 4 của báo cáo này. 100% test cách ly sở hữu dữ liệu đều vượt qua.

#### B6. [BE] Nguồn gốc vai trò và định danh người dùng
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `backend/app/api/deps.py` (lines 35-65): Hàm `get_current_user` giải mã JWT token ký bằng thuật toán HS256 (`jwt.decode`), trích xuất định danh `user_id = token_data.sub` và truy vấn trực tiếp bản ghi người dùng từ CSDL `db.query(User).filter(User.id == user_id).first()`.
  - Giá trị role được đọc từ thuộc tính của thực thể `user.role` đã xác thực trong CSDL, không bao giờ tin cậy hoặc nhận role/id từ payload do client tự gửi trong request body/header. Token hết hạn hoặc sai chữ ký trả về `401 Unauthorized`.

#### B7. [BE] Số liệu vận hành & Hạn mức công suất 95% theo chủ trạm
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `backend/app/api/v1/endpoints/stations.py` (lines 201-295): Endpoint `GET /api/v1/stations/metrics/live`.
  - Nếu là Chủ trạm (`OPERATOR`), hệ thống tự động lọc danh sách trạm thuộc sở hữu (`accessible_stations`). Khi tính toán công suất an toàn lưới, hệ thống tính theo công thức:
    `safe_limit_kw = sum(station.max_power_kw * 0.95 for station in accessible_stations)`.
  - Nếu client truyền tham số `station_id`, endpoint kiểm tra quyền sở hữu trạm, nếu không thuộc quyền sẽ trả về `403 Forbidden`. Khách chưa đăng nhập xem được số liệu tổng quan công khai của toàn mạng lưới.
  - Test kiểm chứng: `test_metrics_calculation_isolation` trong `backend/tests/test_station_ownership_rbac.py`.

---

### NHÓM C: [FE] RBAC Route Guard & Ẩn/hiện UI

#### C1. [FE] Lưu phiên đăng nhập, F5 không mất
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `frontend/src/context/AuthContext.jsx` (lines 32-48): Khởi tạo state từ `localStorage.getItem('token')` và `localStorage.getItem('user')`.
  - Khi tải lại trang (F5), `useEffect` tự động đọc token, khôi phục `currentUser` và cấu hình axios interceptor gắn header `Authorization: Bearer <token>`.

#### C2. [FE] Vào thẳng URL không có quyền bị chặn
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - File `frontend/src/App.jsx` (lines 38-48): Các route được định nghĩa thẳng thừng:
    ```jsx
    <Route path="/stations" element={<Stations />} />
    <Route path="/simulator" element={<Simulator />} />
    <Route path="/ai-advisor" element={<AIAdvisor />} />
    ```
  - **Hoàn toàn không có component bọc bảo vệ** (ví dụ `<ProtectedRoute allowedRoles={[...]} />`). Khi một người dùng chưa đăng nhập hoặc có role `CUSTOMER` gõ trực tiếp URL `/stations` trên thanh địa chỉ trình duyệt, ứng dụng vẫn render component bình thường, chỉ phát sinh lỗi khi component gọi API và bị từ chối 401/403.

#### C3. [FE] Ẩn/hiện menu điều hướng và nút thao tác
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Thanh menu điều hướng chính: `ĐẠT`. File `frontend/src/components/Navigation.jsx` (lines 12-32): Sử dụng mảng cấu hình định nghĩa rõ `roles: ['ADMIN', 'OPERATOR']` cho các mục Quản lý trạm, Giả lập, AI Advisor; Tài xế (`CUSTOMER`) không nhìn thấy các menu này.
  - Các nút hành động CUD trong màn hình: `MỘT PHẦN`. Trong `Stations.jsx` và `Sessions.jsx`, việc kiểm tra quyền rải rác trực tiếp bằng biểu thức `currentUser?.role === 'ADMIN' || currentUser?.role === 'OPERATOR'` thay vì dùng helper quyền tập trung.

#### C4. [FE] Màn hình 403 Forbidden chuyên biệt kèm nút về Trang chủ
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - Toàn bộ thư mục `frontend/src/pages` chỉ có các trang: `Dashboard.jsx`, `Stations.jsx`, `Sessions.jsx`, `Simulator.jsx`, `AIAdvisor.jsx`, `Login.jsx`.
  - Hoàn toàn không có trang `Unauthorized.jsx` hay `Forbidden.jsx` (mã 403) để hiển thị thông báo "Bạn không có quyền truy cập trang này" kèm nút quay về Trang chủ.

#### C5. [FE] Tài xế mới vào có màn hình chào / ẩn số liệu vận hành
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - Khi tài xế truy cập vào trang chủ `/`, ứng dụng luôn hiển thị `Dashboard.jsx` với các chỉ số hạ tầng (Tổng trạm, tổng trụ, công suất live, đồ thị phụ tải lưới). Chưa có luồng chuyển hướng tài xế sang màn hình chào, hướng dẫn nạp ví hoặc tìm trạm sạc.

#### C6. [FE] Đánh giá xung đột yêu cầu C2 vs C5
- **Trạng thái**: `KHÔNG XÁC ĐỊNH` (Cần quyết định thiết kế từ Product Owner)
- **Nhận xét**: 
  - Yêu cầu C2 đòi hỏi chặn tài xế vào các URL quản trị và trả về màn hình 403.
  - Yêu cầu C5 muốn tài xế khi vào ứng dụng có một không gian riêng (Dashboard dành cho tài xế: tìm trạm sạc, xem số dư ví, quét mã sạc) thay vì nhìn thấy bảng điều khiển vận hành lưới điện.
  - Hiện tại hệ thống dùng chung 1 URL `/` cho Dashboard của cả Admin, Chủ trạm lẫn Khách/Tài xế. Cần quyết định phân tách `/dashboard` (cho vận hành) và `/driver` (cho khách hàng).

#### C7. [FE] Chuẩn hóa nhãn vai trò "Chủ trạm sạc"
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Đã tạo file cấu hình tập trung `frontend/src/config/roleConfig.js` xuất hằng số `ROLE_LABELS`:
    - `ADMIN`: "Quản trị viên"
    - `OPERATOR`: "Chủ trạm sạc" (viết tắt thanh DEMO: "Chủ trạm")
    - `CUSTOMER`: "Khách hàng"
  - Đã rà soát và thay thế toàn bộ từ khóa "CPO" và "Đơn vị vận hành" trên giao diện người dùng (Header, Navigation, Dashboard, Stations, Simulator, AI Advisor).

---

### NHÓM D: [BE] WebSocket Server Core + Spike OCPP 1.6J

#### D1. [BE] Cổng WebSocket OCPP 1.6J chuyên biệt
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - File `backend/app/main.py` (lines 94-142): Chỉ có một endpoint WebSocket duy nhất là `/ws/telemetry`.
  - Endpoint này là kênh truyền telemetry nội bộ cho Web UI, hoàn toàn không hỗ trợ giao thức con (subprotocol) `ocpp1.6` hoặc cấu trúc frame RPC mảng JSON `[MessageTypeId, "UniqueId", "Action", {Payload}]` theo chuẩn Open Charge Point Protocol 1.6-J.

#### D2. [BE] Xác thực mã trụ sạc khi bắt tay WebSocket
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - Endpoint `/ws/telemetry` không yêu cầu xác thực trụ sạc khi bắt tay (handshake). Mọi client kết nối vào đều được `await ws_manager.connect(websocket)` chấp nhận vô điều kiện.

#### D3. [BE] Đồng bộ Online/Offline trụ sạc vào Redis/DB & Timeout Heartbeat
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - Hệ thống chưa có cơ chế kiểm tra nhịp tim (Heartbeat timeout) của trụ sạc để tự động chuyển trạng thái trụ sang `OFFLINE` trong CSDL khi mất kết nối socket quá 60 giây.

#### D4. [BE] Tài liệu Spike `K-01-ocpp-simulator.md`
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Tệp tài liệu tồn tại tại `docs/spikes/K-01-ocpp-simulator.md` (lines 1-180).
  - Nội dung mô tả tổng quan về giao thức OCPP 1.6J, kiến trúc bộ mô phỏng và ánh xạ trạng thái sang hệ thống EV CSMS. Tuy nhiên, phần luồng thông điệp được mô tả dưới dạng văn xuôi tóm tắt chứ chưa phải là các frame JSON RPC thô thực tế.

#### D5. [BE] Đặc tả 8 loại thông điệp OCPP cốt lõi
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Tài liệu `docs/spikes/K-01-ocpp-simulator.md` đề cập 6 loại bản tin: `BootNotification`, `Authorize`, `StartTransaction`, `MeterValues`, `StopTransaction`, `StatusNotification`.
  - **Thiếu 2 loại bản tin**: `Heartbeat` (duy trì phiên kết nối trụ) và `Reset` (lệnh từ CSMS khởi động lại trụ sạc).

#### D6. [BE] Nhật ký thông điệp mẫu: Log thật vs Viết tay
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - Các ví dụ payload trong tài liệu `docs/spikes/K-01-ocpp-simulator.md` là các đoạn JSON mẫu được soạn thảo thủ công để minh họa, không phải là trích xuất từ luồng log bắt gói tin mạng thực tế (packet capture log) của một phiên sạc OCPP vật lý/giả lập thực tế.

#### D7. Kế hoạch giai đoạn 2 (File Excel/Sheet)
- **Trạng thái**: `KHÔNG XÁC ĐỊNH`
- **Bằng chứng**:
  - Không tìm thấy bất kỳ tệp bảng tính nào (`.xlsx`, `.csv`) trong cây thư mục dự án chứa kế hoạch chi tiết triển khai OCPP Giai đoạn 2.

---

### NHÓM E: [FE] Form đăng nhập & Token

#### E1. [FE] Form đăng nhập Email, Mật khẩu, Responsive
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - File `frontend/src/pages/Login.jsx` (lines 1-150): Giao diện responsive trên mobile/desktop, có input email, password, logo dự án, thanh chọn vai trò demo.
  - **Thiếu**: Nút toggle biểu tượng con mắt (eye icon) để ẩn/hiện mật khẩu đã nhập.

#### E2. [FE] Kiểm tra tính hợp lệ dữ liệu nhập (Client-side Validation)
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Sử dụng thuộc tính chuẩn của thẻ HTML5: `type="email"`, `required` trên các ô input.
  - Chưa có hàm kiểm tra regex tùy biến hoặc hiển thị thông báo lỗi tiếng Việt trực tiếp dưới từng ô input khi người dùng nhập sai định dạng email trước khi submit.

#### E3. [FE] Trạng thái đang tải (Loading state) & Chống bấm gửi nhiều lần
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `frontend/src/pages/Login.jsx` (lines 32, 95-102): Sử dụng state `loading`. Khi bấm đăng nhập, nút chuyển sang trạng thái disabled (`disabled={loading}`), nhãn nút chuyển thành "Đang xử lý đăng nhập..." và hiển thị hiệu ứng xoay spinner.

#### E4. [FE] Kết nối đúng API Backend
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Gọi endpoint `POST /api/v1/auth/login` qua hàm `login(email, password)` trong `frontend/src/services/api.js` (lines 14-20) và `AuthContext.jsx`.

#### E5. [FE] Lưu Token và chuyển hướng sau khi đăng nhập thành công
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Lưu `token` và `user` vào `localStorage`, đồng thời gọi `navigate('/')` để đưa người dùng về trang Bảng điều khiển (`frontend/src/pages/Login.jsx` lines 42-45).
  - *Nhận xét rủi ro*: Lưu token trong `localStorage` tiềm ẩn nguy cơ nếu ứng dụng dính lỗ hổng XSS (khuyến nghị tương lai dùng HttpOnly Cookie).

#### E6. [FE] Hiển thị thông báo lỗi từ API
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `frontend/src/pages/Login.jsx` (lines 48, 80-84): Bắt lỗi `err.response?.data?.detail` và hiển thị trong khung viền đỏ cảnh báo nổi bật ở đầu form.

#### E7. [FE] Thông báo tài khoản bị khóa hiển thị số phút còn lại
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Backend trả về thông báo chi tiết: `"Tài khoản bị tạm khóa do nhập sai quá 5 lần. Vui lòng thử lại sau X phút."` (`backend/app/api/v1/endpoints/auth.py` line 39). Frontend render trực tiếp chuỗi này lên thông báo lỗi.

#### E8. [FE] Xử lý sự cố mạng & Lỗi máy chủ (500)
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `frontend/src/pages/Login.jsx` (line 49): Fallback về câu thông báo: `"Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin hoặc kết nối máy chủ."` nếu không nhận được response cụ thể từ API.

#### E9. [FE] Phiên làm việc hết hạn (401) tự động chuyển hướng đăng nhập
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - File `frontend/src/services/api.js` (lines 45-52): Bộ đón lỗi axios interceptor khi gặp mã 401 đã thực hiện xóa `localStorage.removeItem('token')` và `localStorage.removeItem('user')`.
  - **Thiếu**: Chưa gọi lệnh cưỡng chế chuyển hướng `window.location.href = '/login'`, khiến ứng dụng có thể giữ nguyên giao diện hiện tại ở trạng thái treo dữ liệu cho đến khi người dùng tự tải lại trang.

---

### NHÓM F: Khung ứng dụng chạy trên máy cá nhân

#### F1. Chạy được trơn tru theo tài liệu README
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Backend khởi chạy thành công bằng lệnh `uvicorn app.main:app` (Python 3.14 / 3.12).
  - Frontend khởi chạy thành công bằng lệnh `npm run dev` hoặc `npm run build` (Vite, React 18, Tailwind CSS).

#### F2. Cấu hình môi trường (.env) và Docker Compose
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Đầy đủ file cấu hình mẫu `backend/.env.example`, `frontend/.env.example`.
  - Tệp `docker-compose.yml` tại thư mục gốc định nghĩa đủ các dịch vụ: `backend` (FastAPI), `frontend` (Nginx/React), `db` (PostgreSQL), `redis` (Cache & PubSub).

#### F3. Kiểm thử tự động (Pytest), Biên dịch (Build) & CI Pipeline
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Backend: `pytest backend/tests` đạt **98/98 passed** (100%).
  - Frontend: `npm --prefix frontend run build` biên dịch thành công 0 lỗi.
  - CI Workflow `.github/workflows/ci-staging.yml` đã được chuẩn hóa biến môi trường `PYTHONPATH: backend`, đảm bảo chạy đồng nhất trên môi trường Ubuntu CI của GitHub.

#### F4. Khởi chạy ứng dụng và hiển thị không lỗi Console nghiêm trọng
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Các trang Dashboard, Stations, Sessions, Simulator, AI Advisor đều nạp component thành công, tài nguyên tĩnh (assets) tải đúng đường dẫn.

---

### NHÓM G: [BE] Xác thực & Khóa đăng nhập

#### G1. Đăng nhập đúng cấp JWT Token & Thông tin User
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `backend/app/api/v1/endpoints/auth.py` (lines 55-68): Trả về JSON gồm `access_token`, `token_type: "bearer"`, và đối tượng `user` (id, email, full_name, role, balance).

#### G2. Nhập sai mật khẩu & Nguy cơ rò rỉ danh tính người dùng (User Enumeration)
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng & Lỗ hổng**:
  - File `backend/app/api/v1/endpoints/auth.py` (lines 33-53):
    - Nếu email không tồn tại trong hệ thống: Trả về thông báo chung `"Email hoặc mật khẩu không chính xác"`.
    - Nếu email có tồn tại nhưng sai mật khẩu: Tăng số lần thử sai và trả về: `"Sai mật khẩu. Bạn còn X lần thử trước khi tài khoản bị khóa 15 phút."`
  - **Đánh giá rủi ro**: Việc trả về câu thông báo khác biệt này tạo thành lỗ hổng **User Enumeration** (Dò quét tài khoản). Kẻ tấn công có thể dựa vào sự xuất hiện của chuỗi "Bạn còn X lần thử" để biết chắc chắn email nào đã đăng ký trong hệ thống.
- **Khác biệt so với ticket**: Cần trả về cùng một thông điệp lỗi mơ hồ để bảo mật danh tính người dùng.

#### G3. Khóa tài khoản sau 5 lần đăng nhập sai liên tiếp
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `backend/app/api/v1/endpoints/auth.py` (lines 43-47): Khi `user.failed_login_attempts >= 5`, cập nhật `user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)`. Mọi yêu cầu đăng nhập tiếp theo đều bị chặn ngay lập tức.
  - Test kiểm chứng: `test_account_lockout_after_failed_attempts` trong `backend/tests/test_auth.py` kiểm tra khóa chuẩn xác sau lần thứ 5 và tự mở lại sau khi hết thời gian khóa.

#### G4. Cơ chế lưu trữ trạng thái khóa tài khoản
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Lưu trữ bền vững trực tiếp vào bảng `users` trong CSDL qua 2 cột: `failed_login_attempts` (Integer) và `locked_until` (DateTime, timezone UTC).
  - Khởi động lại server trạng thái khóa vẫn được bảo toàn. Tự động reset về 0 khi đăng nhập thành công.

#### G5. Email không tồn tại trong hệ thống
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Không làm tăng bộ đếm lỗi của bất kỳ người dùng nào, trả về mã lỗi `401 Unauthorized` (`auth.py` lines 34-36).

#### G6. Token hết hạn hoặc không hợp lệ trả về 401
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `backend/app/api/deps.py` (lines 35-55): Bắt ngoại lệ `jwt.PyJWTError` và trả về `HTTPException(status_code=401, detail="Token không hợp lệ hoặc đã hết hạn", headers={"WWW-Authenticate": "Bearer"})`.
  - Test kiểm chứng: `test_expired_token` và `test_invalid_token` trong `backend/tests/test_auth.py`.

#### G7. Băm mật khẩu bằng Bcrypt & Không ghi log nhạy cảm
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Sử dụng thư viện `passlib.context.CryptContext(schemes=["bcrypt"])` tại `backend/app/core/security.py`.
  - Toàn bộ các câu lệnh logging trong dự án không in mật khẩu thô hoặc chuỗi access token ra console/log file.

---

### NHÓM H: [BE] & [FE] Quản lý trạm sạc

#### H1. Trạng thái trạm khi tạo mới & Gán quyền sở hữu
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Gán quyền sở hữu: `ĐẠT`. Tại `stations.py` (lines 430-435), khi Chủ trạm tạo trạm, hệ thống tự động gán `operator_id = current_user.id`, ngăn chặn tuyệt đối việc gán trạm cho người khác.
  - Trạng thái ban đầu: `MỘT PHẦN`. Schema `StationCreate` đặt mặc định `status: str = "ACTIVE"`. Theo mô tả ticket, trạm mới thêm vào hạ tầng nên ở trạng thái `"INACTIVE"` (Chưa hoạt động) để chờ nghiệm thu kỹ thuật trước khi mở bán điện.
- **Khác biệt so với ticket**: Trạm mới tạo nhận trạng thái `ACTIVE` thay vì `INACTIVE`.

#### H2. Kiểm tra tính hợp lệ của tọa độ GPS (Validation)
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Backend: Schema `StationBase` (`backend/app/schemas/station.py` lines 14-25) sử dụng Pydantic `@field_validator`:
    - Vĩ độ: `8.0 <= latitude <= 24.0` (giới hạn lãnh thổ Việt Nam).
    - Kinh độ: `102.0 <= longitude <= 110.0`.
  - Frontend: Component `StationLocationPicker.jsx` ràng buộc click trên bản đồ và chặn lưu nếu tọa độ nằm ngoài dải hợp lệ.

#### H3. Cập nhật thông tin trạm phản ánh tức thì & Chặn IDOR
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Endpoint `PUT /api/v1/stations/{station_id}` (`stations.py` lines 460-495): Kiểm tra nghiêm ngặt `if current_user.role == UserRole.OPERATOR and station.operator_id != current_user.id: raise HTTPException(403)`.
  - Dữ liệu trả về cập nhật ngay lập tức vào state của React và hiển thị trên giao diện danh sách / bản đồ.

#### H4. Chống gửi trùng lặp yêu cầu tạo trạm (Idempotency)
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Phía Client: `ĐẠT`. Nút "Lưu trạm sạc" trong modal bị vô hiệu hóa (`disabled={isSubmitting}`) khi đang xử lý request.
  - Phía Server: `MỘT PHẦN`. CSDL chưa có ràng buộc `UNIQUE` trên cặp `(name, operator_id)` và API chưa hỗ trợ header `Idempotency-Key`. Nếu client gọi lặp bằng công cụ như curl/Postman thì vẫn tạo ra 2 trạm trùng tên.
- **Khác biệt so với ticket**: Idempotency chỉ được đảm bảo ở tầng Client, chưa có ràng buộc ở tầng Database.

#### H5. Cột định danh chủ sở hữu trạm sạc
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - CSDL sử dụng duy nhất cột `operator_id` (Integer, ForeignKey("users.id"), nullable=True) trong bảng `stations`.
  - Hoàn toàn không tạo cột trùng lặp `owner_id`. Toàn bộ mã nguồn backend, frontend và migration alembic (`e4b6f9a2c1d3`) đã đồng nhất theo quy chuẩn này.

#### H6 -> H9. Giao diện người dùng Quản lý trạm sạc & Bản đồ Leaflet
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `frontend/src/pages/Stations.jsx` và `frontend/src/components/StationsMapOverview.jsx`:
    - Bộ chuyển chế độ "Danh sách | Bản đồ" ở đầu trang.
    - Bản đồ tổng quát ôm toàn bộ trạm đang có tọa độ (`fitBounds`).
    - Nền bản đồ OpenStreetMap kèm CSS filter tối màu (`osm-dark-tiles`), không sử dụng Carto Dark Matter, loại bỏ hoàn toàn lỗi "API KEY REQUIRED".
    - Marker hiển thị theo trạng thái: Xanh lá (`ACTIVE`), Xám (`INACTIVE`), Đỏ (`MAINTENANCE`).
    - Tìm kiếm địa danh bằng Nominatim OpenStreetMap (Việt Nam) có debounce 500ms.

---

### NHÓM I: [BE] & [FE] Quản lý trụ sạc & đầu nối

#### I1. Mô hình dữ liệu Trụ sạc và Cổng sạc (Quan hệ khóa ngoại)
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Bảng `charging_points` (`backend/app/models/station.py` lines 38-55): `station_id = Column(Integer, ForeignKey("stations.id"))`.
  - Bảng `connectors` (`backend/app/models/station.py` lines 58-75): `charging_point_id = Column(Integer, ForeignKey("charging_points.id"))`.
  - Quan hệ cascade soft-delete: Xóa trạm tự động xóa trụ và cổng trực thuộc.

#### I2. Thêm trụ sạc kèm số lượng đầu nối (1 - 4 cổng)
- **Trạng thái**: `MỘT PHẦN`
- **Bằng chứng**:
  - Thêm trụ sạc: `ĐẠT`. Hỗ trợ thêm trụ và khởi tạo danh sách cổng sạc (`chargers.py` lines 180-220).
  - Trạng thái ban đầu: `MỘT PHẦN`. Cổng sạc khi khởi tạo mặc định nhận trạng thái `AVAILABLE`. Ticket yêu cầu trạng thái ban đầu là `UNKNOWN` (Chưa rõ) cho đến khi nhận được tín hiệu bắt tay từ trụ sạc thật.
- **Khác biệt so với ticket**: Trạng thái khởi tạo cổng là `AVAILABLE` thay vì `UNKNOWN`.

#### I3. Ngăn chặn trùng lặp mã trụ sạc (Charger Code Unique)
- **Trạng thái**: `ĐẠT` (Đạt về công dụng, khác biệt mã HTTP)
- **Bằng chứng**:
  - Model `ChargingPoint.code = Column(String(50), unique=True, index=True)`.
  - Khi thêm trụ có mã đã tồn tại: API bắt lỗi và trả về `HTTP 400 Bad Request` với thông báo `"Mã định danh trụ sạc '...' đã tồn tại trên hệ thống"` (`stations.py` line 520).
- **Khác biệt so với ticket**: Ticket ghi mã lỗi 409 Conflict, hệ thống trả về mã 400 Bad Request kèm mô tả rõ ràng. Công dụng chặn trùng mã được đảm bảo tuyệt đối ở cả tầng CSDL lẫn API.

#### I4. Chặn sửa mã trụ sạc khi đã phát sinh phiên sạc
- **Trạng thái**: `CHƯA CÓ`
- **Bằng chứng**:
  - File `backend/app/api/v1/endpoints/chargers.py` (lines 40-75): Endpoint `PUT /api/v1/chargers/{charger_id}` cho phép sửa trường `code` sau khi kiểm tra quyền sở hữu trạm, nhưng **chưa thực hiện kiểm tra `db.query(ChargingSession).filter(ChargingSession.charging_point_id == charger_id).first()`**.
  - Trụ đã có hàng trăm phiên sạc lịch sử vẫn có thể bị đổi mã `code`, gây sai lệch trong việc đối soát dữ liệu lịch sử theo mã trụ vật lý.

#### I5. Kiểm tra quyền sở hữu khi thao tác trên Trụ sạc (Chặn IDOR)
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Toàn bộ các endpoint `PUT /chargers/{id}`, `PATCH /chargers/{id}/status`, `DELETE /chargers/{id}`, `POST /chargers/{id}/connectors` đều truy vấn trạm cha của trụ sạc và kiểm tra:
    `if current_user.role == UserRole.OPERATOR and charger.station.operator_id != current_user.id: raise HTTPException(403)`.
  - Test kiểm chứng: `test_operator_cannot_modify_other_operator_charger` trong `test_station_ownership_rbac.py` passed 100%.

#### I6. Dữ liệu mẫu (Seed Data) tuân thủ tính duy nhất
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - File `backend/seed_data.py`: Khởi tạo 8 trụ sạc với mã định danh duy nhất (`EVSE-1-01`, `EVSE-1-02`, `EVSE-2-01`, `EVSE-2-02`, `EVSE-3-01`, `EVSE-3-02`, `EVSE-4-01`, `EVSE-4-02`), không có bất kỳ xung đột nào.

#### I7 -> I9. Giao diện người dùng Quản lý Trụ sạc & Đầu nối
- **Trạng thái**: `ĐẠT`
- **Bằng chứng**:
  - Modal chi tiết trạm sạc hiển thị danh sách trụ sạc dạng thẻ (card), kèm biểu tượng loại súng (CCS2, Type 2, CHAdeMO), công suất kW, và trạng thái màu sắc trực quan.
  - Hỗ trợ thêm trụ mới và thêm đầu nối trực tiếp trên giao diện dành cho Admin và Chủ trạm sở hữu.

---

## 4. BẢNG KIỂM THỬ RÒ RỈ CHÉO DỮ LIỆU GIỮA CHỦ TRẠM A VÀ B (ISOLATION MATRIX)

> **Kịch bản kiểm thử**:
> - **Chủ trạm A** (`operator_a@evcsms.vn`, ID: 2) sở hữu các trạm: **ST-1**, **ST-2**, **ST-4**.
> - **Chủ trạm B** (`operator_b@evcsms.vn`, ID: 3) sở hữu trạm: **ST-3**.

| Endpoint kiểm tra | Hành động của Chủ trạm A | Kết quả thực tế | Trạng thái bảo mật | Bằng chứng kiểm chứng |
| :--- | :--- | :---: | :---: | :--- |
| `GET /api/v1/stations` | Xem danh sách trạm sạc | Chỉ trả về ST-1, ST-2, ST-4 | **CÁCH LY AN TOÀN** | `stations.py:79-80`, test `test_station_list_isolation` |
| `GET /api/v1/stations/3` | Xem chi tiết trạm ST-3 của B | Xem được (Dữ liệu công khai) | **HỢP LỆ (PUBLIC)** | Thông tin trạm mở để tài xế tìm kiếm |
| `PUT /api/v1/stations/3` | Sửa tên/địa chỉ trạm ST-3 của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `stations.py:472`, test `test_operator_cannot_modify_other_operator_station` |
| `DELETE /api/v1/stations/3` | Xóa trạm ST-3 của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `stations.py:560`, test `test_operator_cannot_delete_other_operator_station` |
| `POST /api/v1/stations/3/chargers` | Thêm trụ sạc vào trạm ST-3 của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `stations.py:512`, test `test_operator_cannot_add_charger_to_other_station` |
| `PUT /api/v1/chargers/5` | Sửa trụ sạc EVSE-3-01 của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `chargers.py:65`, test `test_operator_cannot_modify_other_operator_charger` |
| `PATCH /api/v1/chargers/5/status` | Đổi trạng thái trụ của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `chargers.py:108`, test `test_station_ownership_rbac.py` |
| `DELETE /api/v1/chargers/5` | Xóa trụ sạc của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `chargers.py:140`, test `test_station_ownership_rbac.py` |
| `POST /api/v1/tariffs` (chung) | Tạo biểu giá chung (toàn quốc) | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `tariffs.py:108`, chỉ Admin được tạo biểu giá chung |
| `POST /api/v1/tariffs` (ST-3) | Tạo biểu giá gán vào trạm ST-3 của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `tariffs.py:117`, test `test_operator_cannot_create_tariff_for_other_station` |
| `PUT /api/v1/tariffs/{id}` | Sửa biểu giá riêng của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `tariffs.py:155`, test `test_operator_cannot_modify_other_station_tariff` |
| `DELETE /api/v1/tariffs/{id}` | Xóa biểu giá riêng của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `tariffs.py:202`, test `test_operator_cannot_delete_other_station_tariff` |
| `GET /api/v1/sessions` | Xem nhật ký phiên sạc | Chỉ trả về phiên tại ST-1, 2, 4 | **CÁCH LY AN TOÀN** | `sessions.py:72-76`, test `test_session_list_isolation` |
| `GET /api/v1/simulator/sessions` | Xem giả lập phiên sạc đang chạy | Chỉ trả về phiên tại ST-1, 2, 4 | **CÁCH LY AN TOÀN** | `simulator.py:48-52`, test `test_simulator_list_isolation` |
| `PUT /api/v1/simulator/sessions/{id}/set-power-limit` | Chỉnh công suất phiên sạc của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `simulator.py:138`, test `test_operator_cannot_control_other_operator_simulator` |
| `POST /api/v1/simulator/sessions/{id}/trigger-event` | Kích hoạt quá nhiệt phiên của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `simulator.py:98`, test `test_operator_cannot_control_other_operator_simulator` |
| `GET /api/v1/stations/metrics/live` | Xem chỉ số tổng quan | Hạn mức 95% tính riêng ST-1,2,4 | **CÁCH LY AN TOÀN** | `stations.py:220-250`, test `test_metrics_calculation_isolation` |
| `GET /api/v1/stations/metrics/live?station_id=3` | Xem chỉ số trạm ST-3 của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `stations.py:212`, test `test_metrics_calculation_isolation` |
| `POST /api/v1/ai/smart-charging/3` | Điều phối tải AI trạm của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `ai.py:45`, kiểm tra quyền sở hữu trước khi điều phối |
| `POST /api/v1/ai/pricing-advice/3` | Phân tích giá AI trạm của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `ai.py:125`, kiểm tra quyền sở hữu trước khi phân tích |
| `POST /api/v1/ai/predictive-maintenance/5` | Dự báo bảo trì trụ của B | **HTTP 403 Forbidden** | **CHẶN THÀNH CÔNG** | `ai.py:85`, kiểm tra quyền sở hữu trước khi dự báo |

---

## 5. BẢNG DANH MỤC TOÀN BỘ 45 ROUTE API (ROUTE INVENTORY)

| STT | Phương thức | Đường dẫn (Path) | Quyền yêu cầu (Role RBAC) | Kiểm tra quyền sở hữu tài nguyên (IDOR Check) | Ghi chú & Đánh giá công dụng |
| :---: | :---: | :--- | :--- | :--- | :--- |
| 1 | `GET` | `/` | Công khai (Public) | Không | Thông tin tổng quan dịch vụ API |
| 2 | `GET` | `/api/v1/health` | Công khai (Public) | Không | Kiểm tra trạng thái API và kết nối CSDL |
| 3 | `POST` | `/api/v1/auth/register` | Công khai (Public) | Không | Đăng ký tài khoản khách hàng mới |
| 4 | `POST` | `/api/v1/auth/login` | Công khai (Public) | Không | Đăng nhập nhận JWT (có khóa 5 lần sai) |
| 5 | `GET` | `/api/v1/auth/me` | Đã đăng nhập (`Authenticated`) | Người dùng hiện tại (`current_user.id`) | Lấy thông tin cá nhân và số dư ví |
| 6 | `GET` | `/api/v1/auth/test-admin-access`| `ADMIN` | Không | Route kiểm tra phân quyền quản trị |
| 7 | `GET` | `/api/v1/stations` | Công khai / Người dùng | Lọc theo `operator_id` nếu là Chủ trạm | Danh sách trạm sạc có phân trang & Haversine |
| 8 | `GET` | `/api/v1/stations/owners` | `ADMIN` | Không | Lấy danh sách Chủ trạm để Admin gán trạm |
| 9 | `GET` | `/api/v1/stations/metrics/live` | Công khai / Người dùng | Kiểm tra `station_id` thuộc quyền nếu là Chủ | Chỉ số trực tiếp, an toàn lưới 95% |
| 10 | `GET` | `/api/v1/stations/metrics/load-profile` | Công khai / Người dùng | Lọc theo trạm thuộc quyền nếu là Chủ | Đồ thị phụ tải điện 24 giờ |
| 11 | `GET` | `/api/v1/stations/metrics/load-profile-timeline` | Công khai / Người dùng | Lọc theo trạm thuộc quyền nếu là Chủ | Phụ tải lưới chi tiết 1440 phút (24h) |
| 12 | `GET` | `/api/v1/stations/{station_id}`| Công khai / Người dùng | Không (Xem công khai) | Xem thông tin chi tiết trạm và các trụ |
| 13 | `POST` | `/api/v1/stations` | `ADMIN`, `OPERATOR` | Tự động gán `operator_id` nếu là Chủ trạm | Tạo trạm sạc mới |
| 14 | `PUT` | `/api/v1/stations/{station_id}`| `ADMIN`, `OPERATOR` | **Bắt buộc: `operator_id == user.id`** | Sửa trạm (Chặn IDOR, trả về 403) |
| 15 | `DELETE`| `/api/v1/stations/{station_id}`| `ADMIN`, `OPERATOR` | **Bắt buộc: `operator_id == user.id`** | Xóa mềm trạm và cascade trụ/cổng |
| 16 | `POST` | `/api/v1/stations/{id}/reactivate` | `ADMIN`, `OPERATOR` | **Bắt buộc: `operator_id == user.id`** | Phục hồi trạm đã xóa mềm |
| 17 | `POST` | `/api/v1/stations/{id}/chargers` | `ADMIN`, `OPERATOR` | **Bắt buộc: `station.operator_id == user.id`**| Thêm trụ sạc mới vào trạm |
| 18 | `GET` | `/api/v1/chargers/{charger_id}`| Công khai / Người dùng | Không (Xem công khai) | Xem chi tiết trụ sạc và các cổng sạc |
| 19 | `PUT` | `/api/v1/chargers/{charger_id}`| `ADMIN`, `OPERATOR` | **Bắt buộc: Trạm cha thuộc quyền** | Sửa cấu hình trụ sạc |
| 20 | `PATCH`| `/api/v1/chargers/{id}/status` | `ADMIN`, `OPERATOR` | **Bắt buộc: Trạm cha thuộc quyền** | Cập nhật trạng thái trụ & phát sóng WS |
| 21 | `DELETE`| `/api/v1/chargers/{charger_id}`| `ADMIN`, `OPERATOR` | **Bắt buộc: Trạm cha thuộc quyền** | Xóa mềm trụ sạc |
| 22 | `POST` | `/api/v1/chargers/{id}/reactivate`| `ADMIN`, `OPERATOR`| **Bắt buộc: Trạm cha thuộc quyền** | Khôi phục trụ đã xóa mềm |
| 23 | `POST` | `/api/v1/chargers/{id}/connectors`| `ADMIN`, `OPERATOR`| **Bắt buộc: Trạm cha thuộc quyền** | Thêm cổng sạc mới vào trụ |
| 24 | `GET` | `/api/v1/tariffs` | Công khai (Public) | Không | Xem danh sách biểu giá điện TOU |
| 25 | `GET` | `/api/v1/tariffs/{tariff_id}` | Công khai (Public) | Không | Xem chi tiết biểu giá điện |
| 26 | `POST` | `/api/v1/tariffs` | `ADMIN`, `OPERATOR` | **Chủ trạm chỉ được gán vào trạm mình**| Biểu giá chung chỉ Admin được tạo (403) |
| 27 | `PUT` | `/api/v1/tariffs/{tariff_id}` | `ADMIN`, `OPERATOR` | **Chủ trạm chỉ sửa được biểu giá trạm mình**| Sửa biểu giá chung hoặc của người khác -> 403 |
| 28 | `DELETE`| `/api/v1/tariffs/{tariff_id}` | `ADMIN`, `OPERATOR` | **Chủ trạm chỉ xóa được biểu giá trạm mình**| Xóa biểu giá chung hoặc của người khác -> 403 |
| 29 | `GET` | `/api/v1/wallet/me` | Tài xế / Khách (`Driver/Guest`) | Theo `current_user.id` (hoặc demo guest 1) | Xem số dư ví của tôi |
| 30 | `GET` | `/api/v1/wallet/transactions` | Tài xế / Khách (`Driver/Guest`) | Theo `current_user.id` | Lịch sử biến động số dư ví |
| 31 | `POST` | `/api/v1/wallet/topup` | Tài xế / Khách (`Driver/Guest`) | Theo `current_user.id` | Nạp tiền vào ví điện tử (Giao dịch ACID) |
| 32 | `GET` | `/api/v1/sessions` | Người dùng đã xác thực | **Chủ trạm chỉ thấy phiên trạm mình** | Phân quyền danh sách phiên sạc |
| 33 | `GET` | `/api/v1/sessions/me` | Tài xế / Khách (`Driver/Guest`) | Lọc `user_id == current_user.id` | Xem lịch sử các phiên sạc của tôi |
| 34 | `POST` | `/api/v1/sessions/start` | Tài xế / Khách (`Driver/Guest`) | Kiểm tra ví và khóa cổng độc quyền | Bắt đầu sạc xe |
| 35 | `POST` | `/api/v1/sessions/{id}/stop` | Tài xế / Khách (`Driver/Guest`) | Kiểm tra chủ phiên sạc | Kết thúc phiên sạc, trừ tiền ví ACID |
| 36 | `GET` | `/api/v1/sessions/{session_id}`| Tài xế / Khách (`Driver/Guest`) | Kiểm tra quyền xem hóa đơn phiên sạc | Chi tiết hóa đơn tính tiền |
| 37 | `GET` | `/api/v1/simulator/sessions` | `ADMIN`, `OPERATOR` | **Chủ trạm chỉ thấy phiên trạm mình** | Danh sách phiên giả lập đang chạy |
| 38 | `GET` | `/api/v1/simulator/sessions/{id}`| Người dùng / Khách | Không (Xem telemetry phiên) | Lấy thông số telemetry RAM |
| 39 | `POST` | `/api/v1/simulator/sessions/{id}/trigger-event` | `ADMIN`, `OPERATOR` | **Bắt buộc: Phiên thuộc trạm của mình** | Kích hoạt quá nhiệt / dừng khẩn cấp (403) |
| 40 | `PUT` | `/api/v1/simulator/sessions/{id}/set-power-limit` | `ADMIN`, `OPERATOR` | **Bắt buộc: Phiên thuộc trạm của mình** | Điều chỉnh công suất trần P_max (403) |
| 41 | `POST` | `/api/v1/ai/smart-charging/{station_id}` | `ADMIN`, `OPERATOR` | **Bắt buộc: Trạm thuộc quyền sở hữu** | AI điều phối công suất thông minh (403) |
| 42 | `POST` | `/api/v1/ai/predictive-maintenance/{charger_id}`| `ADMIN`, `OPERATOR` | **Bắt buộc: Trụ thuộc quyền sở hữu** | AI dự báo bảo trì kỹ thuật (403) |
| 43 | `POST` | `/api/v1/ai/pricing-advice/{station_id}` | `ADMIN`, `OPERATOR` | **Bắt buộc: Trạm thuộc quyền sở hữu** | AI tư vấn tối ưu biểu giá doanh thu (403) |
| 44 | `POST` | `/api/v1/ai/ask` | `ADMIN`, `OPERATOR` | Dữ liệu ngữ cảnh lọc theo trạm sở hữu | Trợ lý hỏi đáp thông minh LLM |
| 45 | `WS` | `/ws/telemetry` | Công khai (WebSocket) | Nhận bản tin broadcast telemetry | Kênh socket truyền thông số thời gian thực |

---

## 6. PHÂN TÍCH LỖ HỔNG BẢO MẬT & RỦI RO KIẾN TRÚC

### 6.1. Mức độ Cao (High Severity)
1. **Thiếu Route Guard phía Frontend (`App.jsx`)**:
   - *Mô tả*: Ứng dụng không sử dụng component bọc bảo vệ đường dẫn (`<ProtectedRoute />`). Một người dùng bất kỳ (hoặc tài xế chưa đăng nhập) chỉ cần gõ URL `/stations`, `/simulator`, `/ai-advisor` là có thể tải toàn bộ giao diện quản trị. Mặc dù các lệnh gọi API bên dưới đã có kiểm tra 401/403, việc để lộ cấu trúc màn hình quản trị gây rủi ro an ninh thông tin và trải nghiệm xấu.
2. **Lỗ hổng dò quét tài khoản (User Enumeration)**:
   - *Mô tả*: Tại `backend/app/api/v1/endpoints/auth.py` (lines 46-52), khi đăng nhập sai mật khẩu của email có thật, hệ thống báo `"Sai mật khẩu. Bạn còn X lần thử..."`; trong khi email không tồn tại báo `"Email hoặc mật khẩu không chính xác"`. Kẻ tấn công có thể lợi dụng sự khác biệt này để xác định danh sách các email quản trị viên/chủ trạm trong hệ thống.
3. **Nguy cơ tấn công từ chối dịch vụ tài khoản (Account Lockout DoS)**:
   - *Mô tả*: Khóa tài khoản sau 5 lần đăng nhập sai mà không đi kèm mã xác thực Captcha hoặc giới hạn tần suất yêu cầu (Rate Limiting) theo địa chỉ IP. Kẻ xấu có thể cố tình gửi 5 request sai mật khẩu của một tài khoản Admin để khiến Admin bị khóa liên tục 15 phút.
4. **Cho phép đổi mã trụ sạc đã phát sinh phiên sạc (`PUT /chargers/{id}`)**:
   - *Mô tả*: API cho phép cập nhật trường `code` của trụ sạc mà không kiểm tra xem trụ đã có lịch sử phiên sạc (`ChargingSession`) hay chưa. Việc đổi mã trụ có thể làm đứt gãy tính liên kết dữ liệu kiểm toán khi đối soát hóa đơn theo mã trụ.

### 6.2. Mức độ Trung bình (Medium Severity)
1. **Lưu JWT Token trong `localStorage`**:
   - *Mô tả*: Dễ bị đánh cắp token nếu ứng dụng gặp lỗ hổng Cross-Site Scripting (XSS).
2. **WebSocket Telemetry thiếu xác thực bắt tay & không có Exponential Backoff**:
   - *Mô tả*: Endpoint `/ws/telemetry` cho phép mọi client kết nối tự do mà không xác thực token. Phía client reconnect cố định mỗi 3 giây, dễ gây nghẽn mạng (reconnect storm) khi máy chủ vừa khởi động lại.
3. **Thiếu cơ chế ghi nhật ký an ninh chuyên biệt (Audit Logging)**:
   - *Mô tả*: Khi một Chủ trạm cố tình thực hiện tấn công IDOR (sửa trạm của người khác, ném mã lỗi 403), hệ thống chỉ trả lỗi ra HTTP mà không ghi lại log an ninh tập trung để đội ngũ bảo mật phát hiện và xử lý.
4. **Interceptor 401 không tự động chuyển hướng về trang Login**:
   - *Mô tả*: Khi token hết hạn, client xóa `localStorage` nhưng không gọi lệnh điều hướng trang, khiến giao diện người dùng rơi vào trạng thái không nhất quán.
5. **Trạng thái trạm và cổng sạc mới tạo mặc định hoạt động ngay**:
   - *Mô tả*: Mặc định nhận trạng thái `ACTIVE` / `AVAILABLE` thay vì `INACTIVE` / `UNKNOWN`, tiềm ẩn rủi ro khách hàng cắm sạc vào các trụ chưa được kỹ thuật viên kiểm định an toàn tại thực địa.

### 6.3. Mức độ Thấp (Low Severity)
1. **Mã HTTP không chuẩn REST khi trùng mã trụ**: Trả về `400 Bad Request` thay vì `409 Conflict`.
2. **Thiếu nút ẩn/hiện mật khẩu (Eye Toggle)** trên form đăng nhập.
3. **Chưa có trang thông báo lỗi 403 chuyên biệt** trên giao diện React.

---

## 7. DANH MỤC CÔNG VIỆC CẦN HOÀN THIỆN (BACKLOG & ƯỚC LƯỢNG)

| Mã | Hạng mục công việc | Mô tả kỹ thuật | Ưu tiên | Ước lượng (Size) |
| :---: | :--- | :--- | :---: | :---: |
| **SEC-01** | Khắc phục User Enumeration | Đồng nhất thông báo lỗi đăng nhập: `"Email hoặc mật khẩu không chính xác"` cho cả 2 trường hợp | **P0** | **S** (< 0.5 ngày) |
| **SEC-02** | Thêm FE Route Guard & Trang 403 | Tạo component `<ProtectedRoute />` và trang `Forbidden403.jsx` trong `App.jsx` | **P0** | **M** (1 ngày) |
| **SEC-03** | Khóa đổi mã trụ khi có session | Thêm kiểm tra `ChargingSession` trong `PUT /chargers/{id}`, trả về 400 nếu đã có phiên sạc | **P0** | **S** (< 0.5 ngày) |
| **SEC-04** | Rate Limiting chống Brute-force/DoS | Tích hợp `slowapi` hoặc rate limiter theo IP cho endpoint `/api/v1/auth/login` | **P1** | **M** (1 ngày) |
| **NET-01** | WebSocket Exponential Backoff & Ping | Bổ sung hàm ping định kỳ 30s và thuật toán backoff (1s, 2s, 4s... 30s) trong `websocket.js` | **P1** | **M** (1 ngày) |
| **UX-01** | Chuyển hướng 401 & Toggle Password | Thêm `window.location.href = '/login'` khi bắt lỗi 401 và nút eye icon trên form đăng nhập | **P1** | **S** (< 0.5 ngày) |
| **SEC-05** | Module Security Audit Log | Ghi nhận sự kiện 403 (IDOR attempt) vào bảng `audit_logs` hoặc file log bảo mật riêng | **P1** | **M** (1 ngày) |
| **DATA-01**| Trạng thái mặc định Trạm/Trụ mới | Đổi trạng thái mặc định của trạm mới thành `INACTIVE`, cổng sạc mới thành `UNKNOWN` | **P2** | **S** (< 0.5 ngày) |
| **OCPP-01**| OCPP 1.6-J WebSocket Server Core | Xây dựng endpoint `/ocpp/ws/{charger_code}` hỗ trợ subprotocol `ocpp1.6` và 8 bản tin core | **P2** | **L** (3 - 5 ngày) |
| **UX-02** | Màn hình riêng cho Khách hàng/Tài xế | Thiết kế giao diện Dashboard riêng cho vai trò `CUSTOMER` (tìm trạm, quét mã, ví tiền) | **P2** | **L** (2 - 3 ngày) |

---

## 8. ĐIỂM KHÔNG CHẮC CHẮN & CẦN QUYẾT ĐỊNH (CẦN XÁC NHẬN)

1. **Định hướng UX cho vai trò Tài xế (`CUSTOMER`)**:
   - Hiện tại người dùng đăng nhập với vai trò Tài xế khi truy cập trang chủ `/` vẫn nhìn thấy Bảng điều khiển vận hành lưới điện (Dashboard).
   - **Cần quyết định**: Có nên tách luồng điều hướng: Quản trị viên/Chủ trạm mặc định vào `/dashboard`, còn Tài xế mặc định chuyển hướng sang `/stations` (Bản đồ trạm sạc) hoặc trang `/wallet` (Ví cá nhân) hay không?
2. **Kế hoạch triển khai OCPP 1.6-J (Giai đoạn 2)**:
   - Tài liệu `docs/spikes/K-01-ocpp-simulator.md` hiện mới ở mức khảo sát kiến trúc lý thuyết.
   - **Cần quyết định**: Có cần bổ sung thêm máy chủ OCPP WebSocket Server vật lý độc lập hỗ trợ cổng sạc thật ngay trong giai đoạn này, hay tiếp tục duy trì bộ giả lập telemetry thời gian thực qua kênh `/ws/telemetry` hiện tại?
3. **Xác nhận về tài liệu Kế hoạch dạng tệp Bảng tính (Excel)**:
   - Trong kho mã nguồn hiện tại không có tệp `.xlsx` nào. Cần xác nhận từ Product Owner xem tệp này được lưu trữ trên hệ thống tài liệu nội bộ khác (Google Sheets / Jira) hay cần tạo mới trong repository.

---
*Báo cáo kiểm toán được lập tự động dựa trên bằng chứng kiểm thử mã nguồn và dữ liệu thực thi thực tế.*
