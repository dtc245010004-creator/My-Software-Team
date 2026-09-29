# CSMS --- UX Redesign Level 3

> **Loại tài liệu**: Đặc tả thiết kế trải nghiệm người dùng (UX/UI Design System Specification)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.5 số 23  
> **Nguồn đối chiếu**: Mã nguồn các components tại `frontend/src/components/`, `frontend/src/pages/` và cấu hình `tailwind.config.js`

---

## Operator Workspace --- Dashboard / Operations Center

Bàn làm việc của Điều hành viên (Operator Workspace) là trung tâm chỉ huy tổng thể của hệ thống EV CSMS, nơi nhân viên vận hành CPO theo dõi sức khỏe mạng lưới trạm sạc, kiểm soát các phiên sạc đang diễn ra và can thiệp kịp thời vào các cảnh báo an toàn.

---

## 1. Mục tiêu
* Cung cấp cái nhìn toàn cảnh tức thời về trạng thái hoạt động của mạng lưới trạm sạc trong vòng dưới 3 giây từ khi mở màn hình.
* Tối ưu hóa tốc độ xử lý sự cố: Giảm thời gian phát hiện và can thiệp vào trụ sạc bị lỗi (Faulted) xuống mức tối thiểu.
* Trực quan hóa phụ tải điện năng và cảnh báo quá nhiệt nhằm bảo vệ an toàn hạ tầng điện lưới.

---

## 2. App Shell & Layout Structure
* **Cấu trúc khung giao diện**: Thiết kế dạng 3 phần cố định:
  * **Sidebar bên trái** (Rộng 250px): Chứa logo CSMS, thông tin vai trò hiện tại, và thanh điều hướng chính (Tổng quan, Trạm sạc, Phiên sạc, Ví tiền, Trợ lý AI).
  * **Topbar trên cùng** (Cao 64px): Hiển thị trạng thái kết nối WebSocket thời gian thực, nút chuyển đổi nhanh ca trực và thông tin hồ sơ cá nhân.
  * **Vùng nội dung trung tâm (Main Workspace)**: Sử dụng lưới Grid 12 cột co giãn linh hoạt theo tỷ lệ màn hình.

---

## 3. Topbar & Header Controls
* Đèn báo trạng thái kết nối máy chủ: Xanh lá (Connected), Vàng (Connecting), Đỏ (Disconnected).
* Bộ đếm sự cố chưa xử lý (Badge số lượng cảnh báo đỏ).
* Nút chuyển vai trò nhanh (Quick Demo Role Switcher) và nút Đăng xuất.

---

## 4. KPI Metrics & Summary Cards
Căn cứ theo API `GET /api/v1/stations/dashboard/metrics` (`backend/app/api/v1/endpoints/stations.py:270`):
* **Tổng số trạm sạc**: Thẻ đếm số lượng trạm đang hoạt động.
* **Tổng số trụ sạc**: Tổng trụ và phân loại tỷ lệ Trụ đang sạc / Trụ rảnh / Trụ bảo trì.
* **Công suất tải tức thời (kW)**: Tổng lượng điện năng đang cấp cho các phương tiện.
* **Doanh thu trong ngày (VND)**: Tổng tiền điện đã quyết toán thành công qua các phiên sạc.

---

## 5. OCPP Status & Connectivity Overview
* Hiển thị danh sách trụ sạc kèm tín hiệu kết nối WebSocket ảo từ bộ mô phỏng `charging_simulator.py`.
* Báo cáo chu kỳ Heartbeat (mặc định mỗi 60 giây) và trạng thái sẵn sàng nhận lệnh từ xa.

---

## 6. Live Map & Station Geography
* **Hiện trạng Giai đoạn 1**: Danh sách thẻ trạm sạc hiển thị địa chỉ thực tế, tọa độ GPS (Kinh độ/Vĩ độ) và khoảng cách tính bằng công thức Haversine từ vị trí người dùng.
* **Quy hoạch Giai đoạn 2**: Nhúng bản đồ tương tác OpenStreetMap/Leaflet với các ghim định vị đổi màu theo tải trạm.

---

## 7. Alerts & System Notifications
Hệ thống phân cấp 3 mức cảnh báo:
1. **CRITICAL (Đỏ)**: Trụ sạc quá nhiệt (> 75°C), sụt áp nặng, sập kết nối máy chủ.
2. **WARNING (Vàng)**: Phụ tải điện lưới trạm đạt ngưỡng 85% công suất thiết kế, số dư tài khoản tài xế sắp chạm mốc nợ.
3. **INFO (Xanh)**: Phiên sạc hoàn thành đạt 100% pin, giao dịch nạp tiền thành công.

---

## 8. Realtime Charging Session Stream
* Kênh WebSocket truyền phát gói tin telemetry mỗi 2 giây:
  * ID Phiên sạc, Tên trạm, Mã trụ, Chuẩn đầu nối.
  * Mức pin hiện tại (% SoC) kèm hiệu ứng thanh tiến trình động.
  * Tốc độ sạc hiện tại (kW) và điện áp dòng điện (V, A).
  * Thời gian đã cắm sạc và chi phí điện năng tạm tính tích lũy.

---

## 9. Remote Control & Operator Actions
* Nút can thiệp khẩn cấp dành riêng cho Điều hành viên:
  * **Dừng sạc khẩn cấp (Emergency Remote Stop)**: Ngắt phiên sạc ngay lập tức nếu phát hiện nguy cơ cháy nổ hoặc quá tải.
  * **Mở khóa đầu nối thủ công (Unlock Connector)**: Giải phóng cổng sạc khi cáp bị kẹt cơ học.

---

## 10. Connector Status Grid
Lưới hiển thị trạng thái từng đầu nối theo chuẩn 4 màu:
* **Xanh lá (`AVAILABLE`)**: Đầu nối đang rảnh, sẵn sàng đón xe.
* **Xanh dương (`CHARGING`)**: Đang trong phiên sạc hợp lệ.
* **Đỏ (`FAULTED`)**: Đầu nối gặp sự cố kỹ thuật hoặc lỗi cảm biến.
* **Xám (`UNAVAILABLE` / `OFFLINE`)**: Trụ đang bảo trì hoặc tạm ngắt điện.

---

## 11. Smart Charging & Power Distribution
* Biểu đồ phân bổ phụ tải thông minh dựa trên khuyến nghị từ Heuristic Engine và Gemini AI:
  * Tự động giảm dòng sạc của các trụ sạc thường khi có xe sạc siêu nhanh công suất lớn cắm vào.
  * Điều tiết tổng công suất trạm không vượt quá hợp đồng mua điện với EVN.

---

## 12. Transaction Log & Quick Audit
* Bảng nhật ký giao dịch hiển thị: Mã hóa đơn, Thời điểm bắt đầu/kết thúc, Tổng kWh tiêu thụ, Đơn giá TOU áp dụng, Số tiền khấu trừ ví và số dư ví sau giao dịch.

---

## 13. Revenue & Tariff Widget
* Hiển thị bảng biểu giá điện năng TOU (Time of Use) đang áp dụng:
  * Giờ bình thường: 2.800 VND / kWh.
  * Giờ cao điểm: 4.500 VND / kWh.
  * Giờ thấp điểm: 1.600 VND / kWh.

---

## 14. Error State & Offline Mode
* Khi mất kết nối API hoặc máy chủ không phản hồi: Giao diện hiển thị banner cảnh báo màu cam với nút "Thử kết nối lại" (Retry Connection), đồng thời chuyển sang dữ liệu lưu tạm trong `localStorage`.

---

## 15. Search, Filter & Quick Jump
* Hộp tìm kiếm tức thì (Debounced Search) hỗ trợ tìm theo: Tên trạm, Địa chỉ quận/huyện, Mã trụ sạc, Biển số xe hoặc Mã phiên sạc.

---

## 16. Multi-station Switching
* Menu thả xuống (Dropdown) ở góc trên cho phép CPO chuyển đổi nhanh không gian làm việc giữa các trạm sạc thuộc quyền quản lý của mình mà không cần tải lại toàn bộ trang.

---

## 17. User Profile & Operator Shift Handover
* Thông tin định danh nhân sự trực ca: Họ tên, Mã nhân viên, Vai trò hệ thống (`OPERATOR`), và Thời gian bắt đầu phiên làm việc.

---

## 18. Driver & Vehicle Information
* Xem thông tin phương tiện đang sạc: Dòng xe (VF5, VF8, VF9, e34), Dung lượng gói pin thiết kế (kWh), Tỷ lệ sạc khuyến nghị (thường ngắt ở 80% hoặc 100%).

---

## 19. Desktop / Mobile
* Màn hình điều hành tối ưu hóa tốt nhất trên độ phân giải màn hình Desktop từ **1366x768** đến **1920x1080**.
* Chế độ xem thu gọn hỗ trợ Tablet cho nhân viên đi kiểm tra trạm tại hiện trường.

---

## 20. Visual Direction
* **Phong cách chủ đạo**: Industrial Cyber-Clean / Obsidian Dark Mode.
* Nền tối giúp giảm mỏi mắt cho nhân viên trực ca đêm tại phòng điều hành trung tâm.
* Các chỉ số đo đạc sử dụng font chữ Mono không chân với độ tương phản cao (High Contrast).

---

## 21. Design Tokens
Căn cứ theo cấu hình `frontend/tailwind.config.js`:
* **Màu nền**: `obsidian` (`#0B0F17`), `panel` (`#111827`), `hairline` (`#1F2937`).
* **Màu nhấn trạng thái**:
  * Success / Active: `#10B981` (Emerald-500)
  * Warning: `#F59E0B` (Amber-500)
  * Critical / Error: `#EF4444` (Red-500)
  * Telemetry Stream: `#3B82F6` (Blue-500)
* **Font chữ**: Font sans-serif hiện đại cho tiêu đề và font Monospace cho dữ liệu số đo đạc.

---

## 22. Frontend Architecture
* **State Management**: Sử dụng React Context API (`AuthContext.jsx`) để quản lý phiên đăng nhập và quyền truy cập toàn cục.
* **Component Layer**: Phân rã theo Atomic Design (Atoms: Badge, Button, Input; Molecules: ConnectorCard, KPIStat; Organisms: LiveSessionsTable, StationGrid).
* **Service Layer**: Module hóa các cuộc gọi axios tại `frontend/src/services/api.js`.

---

## 23. Implementation Priority
* **Ưu tiên 1 (Đã hoàn thành trong Giai đoạn 1)**: Đăng nhập RBAC, Quản lý danh sách trạm, Điều khiển phiên sạc mô phỏng, Luồng sạc không cần login của tài xế.
* **Ưu tiên 2 (Giai đoạn tiếp theo)**: Bản đồ Leaflet tương tác, Giao diện mobile-first, Quản lý nâng cao biểu giá động.

---

## 24. Không làm ở bước đầu
* Chưa hỗ trợ tùy biến giao diện theo thương hiệu riêng (White-label theming).
* Chưa có chế độ cấu hình nhiều màn hình phụ (Multi-monitor Video Wall layout).

---

## 25. Definition of Done
Một màn hình hoặc component được coi là hoàn tất khi:
- [x] Hiển thị đúng dữ liệu trả về từ API backend hoặc kênh WebSocket.
- [x] Có xử lý các trạng thái: Đang tải (Loading Skeleton), Trống dữ liệu (Empty State), và Báo lỗi mạng (Error Boundary).
- [x] Lệnh `npm run build` chạy thành công không có cảnh báo lỗi cú pháp.

---

## 26. Visual Baseline đã duyệt
* Bản mẫu giao diện Dashboard điều hành và Cổng tài xế đã được nghiệm thu và lưu giữ tại `[nguồn tạm: phacthaobandau/screenshots/]`.