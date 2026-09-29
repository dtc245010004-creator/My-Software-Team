# Thiết kế giao diện (UX Redesign Level 3)

> **Loại tài liệu**: Nhật ký đối chiếu thiết kế và hiện thực (Design Implementation Drift Log)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.5 số 24  
> **Nguồn đối chiếu**: Mã nguồn React tại `frontend/src/` và tài liệu đặc tả [OPERATOR_DASHBOARD_UX.md](OPERATOR_DASHBOARD_UX.md)

---

## Trạng thái triển khai (28/9/2026)

Giao diện người dùng hiện tại được xây dựng trên nền tảng **React 18**, **Vite 5**, kết hợp cùng **TailwindCSS** và bộ icon **Lucide React**. Các phân hệ giao diện chính đã được hiện thực hóa trong `frontend/src/pages/`:
1. **Màn hình Đăng nhập & Xác thực (`Login.jsx`)**: Hỗ trợ đăng nhập bằng tài khoản, đăng ký tài khoản khách hàng mới, hiển thị lỗi tài khoản khóa nợ (`HTTP 403`), và tích hợp hàng nút chuyển nhanh vai trò 1-click cho buổi demo (`Admin`, `Operator`, `Driver Debt`, `Guest`).
2. **Trung tâm Điều hành Vận hành (`Dashboard.jsx`)**: Hiển thị các thẻ chỉ số KPI tổng quan (Tổng trạm, tổng trụ sạc, công suất tức thời, doanh thu trong ngày, biểu đồ phụ tải lưới điện).
3. **Quản lý Mạng lưới Trạm & Trụ (`StationsManagement.jsx`)**: Cho phép CPO tạo trạm mới, cập nhật tọa độ GPS, thêm trụ sạc với mã trụ duy nhất và cấu hình danh mục đầu nối.
4. **Theo dõi Phiên sạc Trực tiếp (`LiveSessions.jsx`)**: Kết nối kênh WebSocket `ws://localhost:8000/ws/telemetry` để cập nhật trạng thái sạc theo thời gian thực (SoC %, công suất kW, nhiệt độ, tiền điện tạm tính).
5. **Cổng Khách hàng / Tài xế sạc (`DriverPortal.jsx`)**: Cho phép tài xế chọn đầu nối, nhập % pin ban đầu, cấu hình dung lượng pin xe (kWh), theo dõi quá trình sạc và dừng sạc.
6. **Trợ lý AI & Khuyến nghị (`AIAdvisor.jsx`)**: Màn hình cố vấn điều hành thông minh, hiển thị cảnh báo bảo trì dự đoán, gợi ý phân bổ phụ tải và khuyến nghị giá bán điện TOU.

---

## Quyết định lệch so với đặc tả (có lý do)

Trong quá trình hiện thực hóa Giai đoạn 1, đội ngũ phát triển đã đưa ra 3 quyết định điều chỉnh có chủ đích so với bản đặc tả lý thuyết ban đầu:

### 1. Cho phép Tài xế sạc tự do không bắt buộc đăng nhập (Guest Driver Mode)
* **Đặc tả ban đầu**: Bắt buộc mọi tài xế phải tạo tài khoản, xác thực số điện thoại và đăng nhập trước khi cắm sạc.
* **Quyết định điều chỉnh**: Triển khai cơ chế Khách vãng lai (`AuthContext.jsx:85-91`). Người dùng có thể cắm sạc ngay mà không cần đăng nhập; hệ thống tự cấp ví tạm thời và cho phép nạp tiền trực tiếp.
* **Lý do**: Giảm thiểu tối đa rào cản thao tác (zero friction UX) khi thử nghiệm và bảo vệ đồ án trước hội đồng.

### 2. Bổ sung các nút bấm đăng nhập nhanh 1-click (Demo Quick-Switch Buttons)
* **Đặc tả ban đầu**: Chỉ có form đăng nhập truyền thống với Username và Password.
* **Quyết định điều chỉnh**: Thêm 3 nút demo trên `Login.jsx` để chuyển đổi tức thì giữa vai trò `Admin`, `Operator VinFast` và `Tài xế nợ (-300k)`.
* **Lý do**: Giúp người đánh giá và hội đồng chấm thi dễ dàng kiểm chứng cơ chế phân quyền RBAC và kịch bản khóa nợ mà không phải gõ tài khoản thủ công nhiều lần.

### 3. Hiển thị danh sách tọa độ Haversine thay cho bản đồ số tích hợp
* **Đặc tả ban đầu**: Nhúng bản đồ tương tác dạng bản đồ nhiệt (Heatmap / Live Map) sử dụng Mapbox GL hoặc Google Maps SDK.
* **Quyết định điều chỉnh**: Giai đoạn 1 sử dụng danh sách trạm sắp xếp theo khoảng cách tính toán bằng công thức Haversine phía backend và thẻ hiển thị tọa độ GPS.
* **Lý do**: Tránh phát sinh chi phí bản quyền API Mapbox/Google Maps và loại bỏ phụ thuộc mạng bên ngoài khi nghiệm thu môi trường offline.

---

## Việc còn lại

Các hạng mục giao diện tạm gác lại sang giai đoạn tiếp theo:
1. **Bản đồ tương tác OpenStreetMap / Leaflet**: Tích hợp bản đồ mã nguồn mở miễn phí để hiển thị vị trí trực quan các trạm sạc trên nền bản đồ Việt Nam.
2. **Giao diện Responsive chuyên biệt cho thiết bị di động**: Tối ưu hóa layout cho màn hình điện thoại của tài xế khi đứng tại trụ sạc.
3. **Bộ lọc nâng cao (Multi-filter & Faceted Search)**: Cho phép lọc trạm sạc đồng thời theo chuẩn đầu nối (CCS2, Type 2, CHAdeMO), công suất sạc (AC/DC) và tình trạng cổng rảnh.

---

## Ảnh chụp giao diện hiện có

Các minh chứng trực quan ghi lại các màn hình đang chạy thực tế của hệ thống:
* Giao diện Đăng nhập & Chuyển vai trò nhanh: `[nguồn tạm: phacthaobandau/screenshots/login_screen.png]`
* Giao diện Bảng điều khiển vận hành trung tâm: `[nguồn tạm: phacthaobandau/screenshots/operator_dashboard.png]`
* Giao diện Theo dõi phiên sạc thời gian thực: `[nguồn tạm: phacthaobandau/screenshots/live_telemetry.png]`
* Giao diện Cổng sạc dành cho tài xế: `[nguồn tạm: phacthaobandau/screenshots/driver_portal.png]`