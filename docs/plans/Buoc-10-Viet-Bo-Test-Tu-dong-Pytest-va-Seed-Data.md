# BƯỚC 10: XÂY DỰNG FRONTEND WEB (REACT 18 + TAILWIND CSS + RECHARTS)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-10-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `frontend/src/`.
> - Sản phẩm bàn giao: `docs/SDLC/KT3/02_Frontend_Architecture_and_UI_Guide.md`.

---

## 1. Mục tiêu bước 10
- Xây dựng giao diện Web hoàn chỉnh, hiện đại, trực quan, hỗ trợ đầy đủ 3 nhóm chức năng:
  1. **CPO Dashboard**: Quản lý trạm sạc, trụ sạc, giám sát trạng thái thời gian thực, quản lý biểu giá và xem doanh thu.
  2. **Simulator UI**: Màn hình mô phỏng cắm sạc, biểu đồ sạc realtime bằng Recharts (SoC %, công suất kW, nhiệt độ °C), cho phép bấm thử nghiệm cắm/rút sạc và kích hoạt lỗi.
  3. **Driver Portal**: Tra cứu trạm sạc, quản lý ví cá nhân (nạp tiền, xem biến động số dư) và xem tiến độ phiên sạc của tôi.
  4. **AI Advisor UI**: Giao diện hiển thị biểu đồ phân bổ tải thông minh (Smart Charging) và thẻ cảnh báo bảo trì dự đoán.

---

## 2. Nội dung công việc chi tiết

### 2.1. Cấu trúc Routing & State Management
- `src/context/AuthContext.jsx`: Quản lý trạng thái đăng nhập, lưu JWT token trong `localStorage`, phân quyền hiển thị theo Role (`ADMIN`, `OPERATOR`, `CUSTOMER`).
- `src/services/api.js`: Axios client với interceptor tự động gắn `Authorization: Bearer <token>`.
- `src/services/websocket.js`: Client kết nối WebSocket `/ws/telemetry` để nhận thông số sạc realtime.

### 2.2. Danh sách các trang chức năng (Pages)
- `Dashboard.jsx`:
  - Thống kê tổng: Tổng trạm, tổng trụ sạc, số trụ đang sạc/trống/lỗi, tổng doanh thu trong ngày/tháng.
  - Biểu đồ phụ tải trạm sạc theo thời gian thực (kW).
- `Stations.jsx`:
  - Danh sách trạm sạc dạng thẻ (Card) hoặc bảng (Table).
  - Chi tiết từng trụ sạc, tình trạng kết nối, công suất định mức và cổng sạc.
- `Simulator.jsx`:
  - Bộ điều khiển sạc: Chọn trạm -> Chọn trụ -> Chọn loại súng (CCS2 120kW / Type 2 22kW) -> Bấm "Bắt đầu sạc".
  - Hiển thị đồng hồ đo công suất tức thời, phần trăm pin xe (SoC %), điện áp, nhiệt độ súng sạc.
  - Đồ thị đường cong sạc Recharts cập nhật động mỗi 2 giây.
  - Nút bấm: "Dừng sạc", "Rút súng sạc", "Giả lập quá nhiệt khẩn cấp".
- `Wallet.jsx`:
  - Hiển thị số dư ví hiện tại, form nạp tiền nhanh (50k, 100k, 200k, 500k).
  - Lịch sử biến động số dư (nạp tiền, trừ tiền sạc, hoàn tiền).
- `AIAdvisor.jsx`:
  - Khuyến nghị phân bổ công suất sạc thông minh (Smart Charging).
  - Danh sách cảnh báo bảo trì trụ sạc có nguy cơ hỏng hóc.

---

## 3. Cấu trúc file cần sinh
```text
frontend/src/
├── components/
│   ├── Navbar.jsx
│   ├── Sidebar.jsx
│   ├── StatCard.jsx
│   ├── ChargingGauge.jsx              # Đồng hồ đo công suất & % pin
│   └── TelemetryChart.jsx             # Biểu đồ đường cong sạc Recharts
├── context/
│   └── AuthContext.jsx
├── services/
│   ├── api.js
│   └── websocket.js
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx
    ├── Stations.jsx
    ├── Simulator.jsx
    ├── Wallet.jsx
    ├── Sessions.jsx
    └── AIAdvisor.jsx
```

---

## 4. Checklist thực hiện
- [ ] Hoàn thiện `AuthContext.jsx` và cấu hình Routing trong `App.jsx`.
- [ ] Xây dựng `Dashboard.jsx`, `Stations.jsx`, `Wallet.jsx`.
- [ ] Xây dựng `Simulator.jsx` tích hợp đồ thị Recharts và kết nối WebSocket realtime.
- [ ] Xây dựng `AIAdvisor.jsx` hiển thị kết quả phân tích tải và bảo trì.
- [ ] Soạn tài liệu bàn giao `docs/SDLC/KT3/02_Frontend_Architecture_and_UI_Guide.md`.
- [ ] Cập nhật trạng thái Bước 10 trong `docs/plans/TIEN-DO.md`.
