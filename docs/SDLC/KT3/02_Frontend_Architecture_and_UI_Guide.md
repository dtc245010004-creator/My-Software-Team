# TÀI LIỆU THIẾT KẾ KIẾN TRÚC FRONTEND & HƯỚNG DẪN GIAO DIỆN (MỐC KT3)

> **Dự án:** Nền tảng Vận hành Trạm sạc Xe điện Thông minh (EV CSMS)  
> **Mã hồ sơ:** KT3-02  
> **Ngày hoàn thành:** 25/09/2026  
> **Phiên bản:** 1.0.0  
> **Trạng thái:** HOÀN THÀNH — ĐÃ SẴN SÀNG CHO ĐÁNH GIÁ & DEMO HỘI ĐỒNG

---

## 1. TỔNG QUAN KIẾN TRÚC & TRIẾT LÝ THIẾT KẾ CÔNG NGHIỆP

Giao diện người dùng của hệ thống **EV CSMS** được xây dựng nhằm phục vụ công tác điều hành năng lượng chuyên sâu của Đơn vị vận hành trạm sạc (CPO) và tài xế xe điện. Hệ thống từ chối phong cách "SaaS Dashboard dập khuôn" (nền trắng kem, bo góc tròn trịa, bóng mờ đục xám nhạt lặp lại, mũi tên trang trí thừa thãi) để hướng đến một **Bảng điều khiển Trung tâm Điều độ Năng lượng (Industrial Power Console)** trực quan, thực tế và chính xác.

```text
                           [ KIẾN TRÚC FRONTEND EV CSMS ]
                                          
     React 18 (Vite) + Tailwind CSS + Lucide Icons + Recharts (Data Visuals)
                                          │
       ┌──────────────────────────────────┴──────────────────────────────────┐
       ▼                                                                     ▼
[ Tầng Trạng Thái & Dịch Vụ ]                                        [ Giao Diện Vận Hành ]
- AuthContext: Quản lý JWT & Role 1-Click                             - Dashboard: Phụ tải lưới & EVSE Bays
- Axios API: Interceptor Bearer Token                                 - Stations: Hạ tầng Trạm/Trụ/Cổng
- Telemetry WebSocket: Kênh phân luồng session                        - Simulator: Console sạc CC-CV realtime
                                                                      - Wallet: Ví tiền & Hạn mức nợ ACID
                                                                      - Sessions: Hóa đơn điện tử TOU
                                                                      - AI Advisor: Busbar, Heat Strip, 24h TOU
```

### Bảng màu đặc thù miền nghiệp vụ Năng lượng (Industrial Color System)

- **Obsidian Base (`#0B0F17`)**: Nền xám kim loại đậm giảm mỏi mắt cho phiên trực điều độ đêm, độ tương phản cao với các thông số đo lường.
- **Panel Slate (`#151D2A`)**: Bề mặt khối điều khiển phân cách bằng viền hairline mảnh `#222F44`, không dùng drop-shadow mờ ảo.
- **Electric Cyan-Blue (`#0284C7`)**: Dòng năng lượng sạc hoạt động (công suất kW, trạng thái súng đang cấp dòng).
- **Grid Stable Green (`#10B981`)**: Lưới điện an toàn, súng sạc sẵn sàng (`AVAILABLE`), phụ tải dưới 95%.
- **Thermal Caution Amber (`#F59E0B`)**: Cảnh báo nhiệt tiếp điểm tăng cao ($65^\circ\text{C} - 75^\circ\text{C}$), phụ tải tiệm cận đỉnh.
- **Trip & Critical Red (`#EF4444`)**: Quá nhiệt khẩn cấp ($>75^\circ\text{C}$), rơ-le ngắt an toàn, chạm hạn mức nợ ví (-300,000 VND).
- **Typography Kỹ thuật**: `Inter` cho nhãn văn bản; `JetBrains Mono` cùng thuộc tính `tabular-nums` cho số liệu đo đếm giúp các con số $118.4 \rightarrow 119.1\text{ kW}$ biến thiên mượt mà mà không rung giật giao diện.

---

## 2. CHI TIẾT 6 TRANG MÀN HÌNH CHỨC NĂNG

### 2.1. Bảng Điều Khiển Tổng Quan (Dashboard)

- **Đường dẫn**: `/`
- **Chức năng**:
  + **Thanh cái nguồn lưới phụ tải (Grid Busbar Load)**: Trực quan hóa tổng công suất tiêu thụ tức thời của toàn trạm so với ngưỡng an toàn 95% công suất máy biến áp.
  + **4 Khung đo lường chính (Metric Boxes)**: Tổng hạ tầng trạm, Trụ đang cấp nguồn, Trụ sẵn sàng, Cảnh báo lỗi kỹ thuật.
  + **Đồ thị phụ tải lưới 24 giờ**: Biểu đồ miền Recharts thể hiện phụ tải trung bình theo chu kỳ ngày đêm.
  + **Giám sát trực tiếp các trụ sạc (EVSE Bays)**: Danh sách theo dõi rơ-le tức thời của từng mã trụ.

### 2.2. Hạ Tầng Trạm Sạc (Stations Infrastructure)

- **Đường dẫn**: `/stations`
- **Chức năng**:
  + Quản lý phân cấp 3 tầng vật lý: **Trạm sạc (Station) $\rightarrow$ Trụ sạc (ChargingPoint) $\rightarrow$ Cổng/Súng sạc (Connector)**.
  + Xem định vị GPS, công suất máy biến áp định mức (`total_grid_capacity_kw`), tính năng chia sẻ tải (Oversubscription / Power Sharing).
  + Hỗ trợ CPO / Admin tạo thêm trạm sạc mới và cập nhật cấu hình thông số kỹ thuật.

### 2.3. Bảng Giả Lập Sạc Pin & Giám Sát Telemetry (Simulator Console) ⭐ Trọng tâm Demo

- **Đường dẫn**: `/simulator`
- **Chức năng tương tác trực tiếp**:
  1. *Khởi động sạc*: Chọn trạm $\rightarrow$ Chọn súng khả dụng $\rightarrow$ Bấm **"KẾT NỐI & BẬT RƠ-LE SẠC"**.
  2. *Truyền phát Telemetry thời gian thực*: Kết nối WebSocket `/ws/telemetry` hiển thị tức thì các thông số:
     - Công suất nạp: `kW` (nhảy số mượt mỗi 2 giây).
     - Dung lượng pin xe: `SoC %` (tăng dần theo dung lượng pin 60 kWh).
     - Nhiệt độ cổng tiếp xúc: `°C` (chuyển màu xanh $\rightarrow$ vàng $\rightarrow$ đỏ khi nhiệt độ tăng).
     - Điện năng đo đếm: `kWh` và chi phí tạm tính: `VND`.
  3. *Đồ thị Recharts CC-CV*: Vẽ trực tiếp đường cong sạc thời gian thực (pha Dòng không đổi CC vs pha Áp không đổi CV).
  4. *Bộ điều khiển sự cố an toàn*:
     - Nút **"DỪNG SẠC & QUYẾT TOÁN VÍ"**: Chốt số điện và trừ tiền ví qua giao dịch ACID.
     - Nút **"GIẢ LẬP SỰ CỐ QUÁ NHIỆT >75°C"**: Kích hoạt ngắt rơ-le an toàn tự động (`OVERHEAT_EMERGENCY`).
     - Ô **"ĐIỀU TIẾT CÔNG SUẤT TRẦN (kW)"**: Can thiệp giảm công suất sạc từ xa.

### 2.4. Ví Cá Nhân & Quản Trị Cước Phí (Driver Wallet)

- **Đường dẫn**: `/wallet`
- **Chức năng**:
  + Hiển thị số dư khả dụng tức thời (VND).
  + Cảnh báo minh bạch khi tài khoản ghi nợ và chính sách tài chính an toàn: Hạn mức nợ tối đa **-300,000 VND**, số dư tối thiểu bắt đầu sạc **50,000 VND**.
  + Form Nạp tiền nhanh với các mệnh giá tiện lợi: +50,000 đ, +100,000 đ, +200,000 đ, +500,000 đ.
  + Bảng lịch sử biến động số dư ghi nhận toàn bộ giao dịch nạp ví và trừ cước phiên sạc.

### 2.5. Nhật Ký Phiên Sạc & Hóa Đơn Điện Tử (Sessions & Invoices)

- **Đường dẫn**: `/sessions`
- **Chức năng**:
  + Bảng lịch sử phiên sạc: Mã phiên, Cổng sạc, Đơn giá TOU áp dụng, Điện năng kWh, Tổng tiền, Trạng thái và Lý do dừng.
  + Bộ lọc trạng thái: Tất cả (`ALL`), Đang sạc (`ACTIVE`), Hoàn thành (`COMPLETED`), Bị ngắt (`INTERRUPTED`).
  + **Hóa đơn điện tử**: Modal xem chi tiết chỉ số đo đầu/cuối, tổng kWh và công thức tính tiền chuẩn xác.

---

## 3. THIẾT KẾ KHÁC BIỆT CHO 3 MÀN HÌNH AI (AI ADVISOR)

Màn hình **AI Advisor** (`/ai-advisor`) được tổ chức thành 4 không gian làm việc chuyên biệt theo đúng bản chất vật lý của dữ liệu:

### 3.1. Tab 1: Điều Phối Tải Lưới Điện (Smart Charging Busbar Allocation)

- **Trực quan hóa**: Thay vì bảng số khô cứng, hệ thống sử dụng **Sơ đồ phân bổ thanh cái (Grid Busbar Allocation)**.
- Một thanh ngang lớn đại diện cho công suất lưới an toàn của trạm ($P_{\text{limit}} = P_{\text{grid}} \times 0.95$). Các cổng sạc đang cắm xe được chia thành các dải màu riêng biệt với độ rộng tỉ lệ chính xác theo công suất được phân bổ (ưu tiên xe pin thấp theo thuật toán Weighted Fair Sharing).
- Hiển thị rõ cờ metadata: `source` (`"GEMINI_AI"` hoặc `"HEURISTIC_FALLBACK"`) và cảnh báo khi Fallback kích hoạt.

### 3.2. Tab 2: Bảo Trì Dự Đoán (Thermal Heat Strip & Health Matrix)

- **Trực quan hóa**: **Thước đo dải nhiệt độ cổng sạc (Thermal Heat Strip)** phân tầng 4 vùng nhiệt vật lý:
  + Vùng mát ($<45^\circ\text{C}$): Xanh lam.
  + Vùng bình thường ($45^\circ\text{C} - 65^\circ\text{C}$): Xanh lá.
  + Vùng cảnh báo ấm ($65^\circ\text{C} - 75^\circ\text{C}$): Vàng hổ phách.
  + Vùng nguy hiểm ngắt khẩn cấp ($>75^\circ\text{C}$): Đỏ rực.
- Kim chỉ thị di chuyển mượt mà tới nhiệt độ đỉnh.
- Khung hiển thị `health_score` (0–100) và Vector xu hướng nhiệt độ (`increasing` với biểu tượng mũi tên nghiêng đỏ, `decreasing`, `stable`).

### 3.3. Tab 3: Tối Ưu Biểu Giá TOU (24-Hour Occupancy Profile)

- **Trực quan hóa**: **Biểu đồ cột phụ tải 24 giờ (Load Profile Histogram)** phân định rõ 3 dải giờ: Cao điểm (Vàng cam), Bình thường (Xám thép), Thấp điểm (Xanh lá).
- Minh chứng trực quan lý do đề xuất: Giờ cao điểm đang quá tải ($>80\%$) trong khi ban đêm còn trống ($<30\%$) $\rightarrow$ Khuyến nghị tăng giá cao điểm $+15\%$ và giảm giá thấp điểm $-10\%$ để dịch chuyển phụ tải sang ban đêm.

### 3.4. Tab 4: Trợ Lý Vận Hành AI (Grounding Q&A)

- Khung hội thoại NLP cho phép người vận hành hỏi đáp tự do.
- Dữ liệu trả lời được **Grounding trực tiếp từ cơ sở dữ liệu thật**: Doanh thu 7 ngày, tổng số phiên sạc, tỉ lệ lấp đầy bình quân, số cảnh báo trụ sạc cần bảo dưỡng.

---

## 4. HƯỚNG DẪN VẬN HÀNH & KỊCH BẢN DEMO HỘI ĐỒNG

### 4.1. Khởi động hệ thống

1. **Khởi động Backend (FastAPI)**:

   ```bash
   cd backend
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. **Khởi động Frontend (Vite)**:

   ```bash
   cd frontend
   npm run dev
   ```

   Truy cập trình duyệt tại: `http://localhost:5173`

### 4.2. Kịch bản Demo 1-Click (Không cần gõ mật khẩu)

Tại thanh Header góc trên bên phải, hệ thống tích hợp bộ chuyển vai trò nhanh (**Demo Role Switcher**):

- Bấm **"Admin"**: Tự động chuyển quyền Quản trị viên hệ thống (xem toàn bộ trạm, điều phối AI).
- Bấm **"CPO"**: Tự động chuyển quyền Đơn vị vận hành trạm sạc (quản lý trạm/trụ, tối ưu biểu giá, theo dõi bảo trì).
- Bấm **"Tài xế"**: Tự động chuyển quyền Khách hàng lái xe (giao diện ví tiền, lịch sử sạc cá nhân).

### 4.3. Kịch bản Demo mô phỏng sạc trực quan

1. Vào tab **"Bảng Giả Lập Sạc (Console)"** (`/simulator`).
2. Chọn Trạm sạc $\rightarrow$ Chọn Cổng sạc số 1 $\rightarrow$ Bấm **"KẾT NỐI & BẬT RƠ-LE SẠC"**.
3. Quan sát các con số công suất (kW), pin SoC (%) và đồ thị Recharts nhảy số mượt mà theo nhịp phát WebSocket 2 giây/lần.
4. Bấm **"GIẢ LẬP SỰ CỐ QUÁ NHIỆT >75°C"** để hội đồng chứng kiến hệ thống kích hoạt rơ-le tự động ngắt sạc khẩn cấp bảo vệ an toàn cháy nổ.
5. Vào tab **"Ví Cá Nhân"** (`/wallet`) để kiểm tra số tiền điện đã được khấu trừ chính xác theo chuẩn ACID.
