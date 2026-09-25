# BƯỚC 01: ĐẶC TẢ YÊU CẦU & PHÂN TÍCH NGHIỆP VỤ TRẠM SẠC XE ĐIỆN (REQUIREMENTS ANALYSIS)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-01-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT1/01_SRS_and_UseCases.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) dùng để nộp bài và chấm điểm giai đoạn KT1.

---

## 1. Mục tiêu bước 1

- Thiết lập ranh giới chức năng rõ ràng cho đồ án "Nền tảng vận hành trạm sạc xe điện tích hợp AI" (EV CSMS).
- Phân tích chi tiết 3 Actor: Quản trị viên (Admin), Đơn vị vận hành trạm (Station Operator / CPO), Khách hàng lái xe điện (EV Driver).
- Xây dựng sơ đồ Use Case tổng quan và đặc tả các luồng nghiệp vụ sạc xe, quản lý trạm, ví tiền và thanh toán.
- Xác định phạm vi và bài toán đầu vào/đầu ra cho 3 chức năng AI (Smart Charging, Predictive Maintenance, Dynamic Pricing) và cơ chế Fallback Heuristic.

---

## 2. Nội dung công việc chi tiết

### 2.1. Phân tích 3 Actor & Ma trận quyền hạn

1. **Quản trị viên (Admin)**:
   + Quản lý tài khoản người dùng và đơn vị vận hành (thêm, sửa, khóa tài khoản, phân vai trò).
   + Cấu hình hệ thống, tham số vận hành chung.
   + Cấu hình API Key AI (Google Gemini).
   + Xem toàn bộ báo cáo tổng hợp doanh thu và sản lượng điện toàn mạng lưới trạm sạc.
2. **Đơn vị vận hành trạm (Station Operator / CPO)**:
   + Quản lý danh mục trạm sạc, trụ sạc (EVSE), cổng sạc (Connector).
   + Thiết lập biểu giá sạc theo khung giờ (Time of Use - TOU Tariff) và phụ phí.
   + Giám sát trạng thái hoạt động thực tế của từng trụ sạc (Available, Charging, Faulted, Offline).
   + Xem báo cáo điều phối công suất (Smart Charging) và cảnh báo bảo trì dự đoán từ AI.
3. **Khách hàng lái xe điện (EV Driver / Customer)**:
   + Tra cứu danh sách trạm sạc, kiểm tra số lượng cổng sạc còn trống và biểu giá hiện hành.
   + Quản lý ví điện tử cá nhân: nạp tiền, xem lịch sử giao dịch.
   + Bắt đầu và dừng phiên sạc; theo dõi tiến trình sạc thời gian thực (SoC %, kW, kWh, chi phí).
   + Nhận hóa đơn điện tử sau mỗi phiên sạc.

### 2.2. Đặc tả các luồng nghiệp vụ cốt lõi

- **Luồng Khởi động sạc**: Người dùng chọn cổng sạc $\rightarrow$ Hệ thống kiểm tra số dư ví tối thiểu ($\ge 50,000$ VND) $\rightarrow$ Khóa cổng sạc sang trạng thái `PREPARING` / `CHARGING` $\rightarrow$ Kích hoạt truyền nhận telemetry.
- **Luồng Giám sát & Đo đếm realtime**: Module Simulator phát sóng telemetry (SoC %, công suất kW, kWh, nhiệt độ) qua WebSocket $\rightarrow$ Cập nhật tức thì trên giao diện người dùng $\rightarrow$ Tự động tính chi phí lũy kế.
- **Luồng Kết thúc & Quyết toán**: Người dùng bấm dừng / pin đầy 100% / ví hết tiền $\rightarrow$ Ngắt sạc an toàn $\rightarrow$ Database Transaction trừ tiền trong ví (ACID) $\rightarrow$ Mở khóa cổng sạc về `AVAILABLE` $\rightarrow$ Xuất hóa đơn.
- **Luồng Cảnh báo sự cố**: Nếu nhiệt độ súng sạc vượt ngưỡng an toàn ($> 75^\circ\text{C}$) hoặc sụt áp $\rightarrow$ Tự động ngắt khẩn cấp và ghi nhận sự cố bảo trì.

### 2.3. Xác định 3 chức năng AI

1. **Smart Charging & Load Balancing**: Phân bổ động công suất sạc nhằm chống quá tải nguồn trạm.
2. **Predictive Maintenance**: Phân tích telemetry phát hiện nguy cơ quá nhiệt, suy hao công suất để cảnh báo bảo trì.
3. **Dynamic Pricing & AI Advisor**: Phân tích quy luật sử dụng để gợi ý biểu giá tối ưu theo khung giờ và giải đáp số liệu vận hành.
4. **Fallback Heuristic**: Thuật toán chia tải theo tỷ lệ công suất và cảnh báo ngưỡng cứng khi không có kết nối AI.

---

## 3. Cấu trúc file bàn giao

Sản phẩm bàn giao thực tế giai đoạn KT1:

```text
docs/
└── SDLC/
    └── KT1/
        └── 01_SRS_and_UseCases.md        # Tài liệu đặc tả SRS, 3 Actor và sơ đồ Use Case chi tiết
```

---

## 4. Checklist thực hiện

- [ ] Soạn thảo tài liệu SRS hoàn chỉnh vào `docs/SDLC/KT1/01_SRS_and_UseCases.md`.
- [ ] Mô tả chi tiết 3 Actor và ma trận quyền hạn (CRUD Matrix).
- [ ] Vẽ sơ đồ Use Case tổng thể và Use Case chi tiết cho luồng sạc và thanh toán ví.
- [ ] Cập nhật trạng thái Bước 01 trong `docs/plans/TIEN-DO.md`.
