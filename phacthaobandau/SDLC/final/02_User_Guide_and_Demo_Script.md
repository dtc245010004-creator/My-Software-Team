# SỔ TAY HƯỚNG DẪN VẬN HÀNH & KỊCH BẢN DEMO BẢO VỆ ĐỒ ÁN

## EV CHARGING STATION MANAGEMENT SYSTEM (EV CSMS)

---

### MỤC LỤC

1. [Hướng Dẫn Cài Đặt & Khởi Chạy 1-Click](#1-hướng-dẫn-cài-đặt--khởi-chạy-1-click)
2. [Danh Mục Tài Khoản Demo Phân Quyền (RBAC)](#2-danh-mục-tài-khoản-demo-phân-quyền-rbac)
3. [Sổ Tay Hướng Dẫn Sử Dụng Các Tính Năng](#3-sổ-tay-hướng-dẫn-sử-dụng-các-tính-năng)
4. [Kịch Bản Demo 15 Phút Thuyết Trình Trước Hội Đồng](#4-kịch-bản-demo-15-phút-thuyết-trình-trước-hội-đồng)
5. [Các Câu Hỏi Phản Biện Tiềm Năng & Hướng Trả Lời](#5-các-câu-hỏi-phản-biện-tiềm-năng--hướng-trả-lời)

---

## 1. Hướng Dẫn Cài Đặt & Khởi Chạy 1-Click

### 1.1. Yêu Cầu Môi Trường

- **Python**: Phiên bản 3.10 trở lên (khuyên dùng Python 3.11 - 3.14).
- **Node.js**: Phiên bản 18 trở lên (khuyên dùng Node.js 20 - 24).
- **Trình duyệt**: Google Chrome, Microsoft Edge, hoặc Mozilla Firefox.

### 1.2. Khởi Tạo CSDL & Dữ Liệu Mẫu (Seed Data)

Mở một cửa sổ Terminal (PowerShell hoặc Command Prompt) tại thư mục dự án và thực hiện:

```bash
cd backend
python seed_data.py
```

> **Kết quả kỳ vọng**: Hệ thống tự động làm sạch CSDL cũ, tạo cấu trúc bảng mới nhất và nạp thành công 3 trạm sạc lớn (Hà Nội, Đà Nẵng, TP.HCM), 9 trụ EVSE, 18 cổng sạc, 60+ phiên sạc lịch sử chân thực và các tài khoản demo.

### 1.3. Khởi Chạy Backend Server (FastAPI + WebSocket)

Tại thư mục `backend`, chạy lệnh:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Địa chỉ API Swagger/Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Kiểm tra trạng thái kết nối**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

### 1.4. Khởi Chạy Frontend Web Application (React + Vite)

Mở một cửa sổ Terminal thứ hai tại thư mục `frontend`, chạy lệnh:

```bash
cd frontend
npm run dev
```

- **Địa chỉ giao diện Web**: [http://localhost:5173](http://localhost:5173)

---

## 2. Danh Mục Tài Khoản Demo Phân Quyền (RBAC)

Hệ thống đã tích hợp sẵn tính năng **1-Click Quick Login** ngay tại màn hình đăng nhập hoặc thanh điều hướng để chuyển đổi vai trò tức thì mà không cần gõ bàn phím:

| STT | Tên Tài Khoản | Mật Khẩu | Vai Trò (Role) | Số Dư Ban Đầu | Mục Đích Trình Diễn / Nghiệm Thu |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | `admin` | `AdminPass123` | **ADMIN** | Không áp dụng | Quản trị toàn hệ thống, toàn quyền xem và sửa mọi trạm sạc, xem log AI |
| **2** | `operator_a` | `OpPass123` | **OPERATOR (CPO)** | Không áp dụng | Đơn vị vận hành Trạm sạc Tân Bình & Cầu Giấy, quản lý trụ sạc, chạy AI Advisor |
| **3** | `customer_user` | `CusPass123` | **CUSTOMER** | `250,000 đ` | Khách hàng chuẩn, cắm sạc bình thường, theo dõi đồ thị sạc và nạp ví |
| **4** | `driver_vip` | `DriverPass123` | **CUSTOMER** | `1,500,000 đ` | Khách hàng VIP số dư dồi dào, sạc công suất cực đại không lo đứt quãng |
| **5** | `driver_debt` | `DriverPass123` | **CUSTOMER** | `-120,000 đ` *(Đang nợ)* | Khách hàng bị âm tiền, dùng để demo tính năng chặn bắt đầu phiên (HTTP 402) |

---

## 3. Sổ Tay Hướng Dẫn Sử Dụng Các Tính Năng

### 3.1. Dashboard Vận Hành (Trang Tổng Quan)

- **Thẻ chỉ số kỹ thuật**: Hiển thị tổng công suất lưới hiện tại, tổng phiên sạc đang hoạt động, điện năng tiêu thụ trong ngày và doanh thu ước tính.
- **Biểu đồ phụ tải 24h**: Trực quan hóa công suất tiêu thụ theo khung giờ (Thấp điểm, Bình thường, Cao điểm).
- **Trạng thái cổng sạc mạng lưới**: Giám sát nhanh 18 cổng sạc theo mã màu (Xanh lá = Sẵn sàng, Xanh dương = Đang sạc, Đỏ = Lỗi, Xám = Offline).

### 3.2. Quản Lý Trạm Sạc & Trụ Sạc (Trang Stations)

- Xem danh sách trạm sạc với định vị GPS, công suất máy biến áp định mức (kVA/kW) và hệ số quá tải (Oversubscription Ratio).
- Quản lý trụ sạc EVSE và cấu hình thông số kỹ thuật (AC 22kW, DC 60kW, DC 150kW, DC 300kW).
- Khóa bảo vệ phân quyền IDOR: Đơn vị CPO chỉ được sửa trạm do mình sở hữu; Admin có toàn quyền can thiệp.

### 3.3. Giả Lập Phiên Sạc Thời Gian Thực (Trang Simulator)

- **Bắt đầu sạc**: Chọn trạm $\rightarrow$ Chọn cổng sạc khả dụng $\rightarrow$ Bấm "Bắt đầu sạc".
- **Bảng đồng hồ đo đếm (Telemetry Gauges)**:
  + Đồng hồ đo mức pin (SoC %) từ 0% đến 100%.
  + Đồng hồ công suất tức thời (kW) phản ánh đường cong CC/CV.
  + Cảm biến nhiệt độ đầu cắm (°C) với cảnh báo đổi màu theo ngưỡng an toàn.
  + Chi phí sạc tích lũy (VND) và điện năng tiêu thụ (kWh) nhảy số liên tục qua WebSocket.
- **Dừng sạc an toàn**: Bấm "Dừng sạc" $\rightarrow$ Hệ thống tự động chốt chỉ số công tơ, trừ tiền ví ACID và giải phóng cổng sạc.

### 3.4. Cố Vấn Trí Tuệ Nhân Tạo (Trang AI Advisor)

- **Smart Charging**: Bấm "Phân tích điều phối tải" để xem thuật toán chia tải Weighted Fair Sharing phân bổ lại công suất các trụ, bảo đảm không vượt 95% công suất lưới.
- **Predictive Maintenance**: Quét các bất thường phần cứng (quá nhiệt, sụt áp tiếp điểm).
- **Dynamic Pricing**: Nhận đề xuất tối ưu hóa biểu giá TOU nhằm kéo giãn phụ tải sang giờ thấp điểm.
- **Trợ lý kỹ thuật AI Ask**: Đặt câu hỏi tự nhiên bằng tiếng Việt (Ví dụ: *"Trạm này có cổng nào đang bị quá nhiệt không?"*).

### 3.5. Ví Điện Tử & Lịch Sử Phiên Sạc (Trang Wallet & Sessions)

- Xem số dư ví hiện tại và trạng thái khóa nợ `is_debt_locked`.
- Nạp tiền nhanh (100k, 200k, 500k, 1 triệu) với cơ chế Database Transaction an toàn.
- Xem bảng kê sao kê biến động số dư và lịch sử toàn bộ các phiên sạc chi tiết.

---

## 4. Kịch Bản Demo 15 Phút Thuyết Trình Trước Hội Đồng

Đây là quy trình thao tác chuẩn xác, tạo ấn tượng mạnh mẽ nhất khi báo cáo trước Hội đồng chấm thi:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    KỊCH BẢN THUYẾT TRÌNH & DEMO TRỰC TIẾP                     │
└──────────────────────────────────────────────────────────────────────────────┘
   [00:00 - 02:00]  GIỚI THIỆU TỔNG QUAN & DASHBOARD VẬN HÀNH
   [02:00 - 06:00]  DEMO SIMULATOR REALTIME TELEMETRY & ĐỒ THỊ CC/CV
   [06:00 - 09:00]  DEMO CÁC TÌNH HUỐNG BIÊN: KHÓA TRÙNG CỔNG & KHÓA NỢ VÍ
   [09:00 - 12:00]  DEMO AI DUAL-LOOP: CÂN BẰNG TẢI & FALLBACK KHI MẤT MẠNG
   [12:00 - 14:00]  DEMO VÍ TIỀN ACID & GIẢI PHÓNG KHÓA NỢ
   [14:00 - 15:00]  CHẠY BỘ TEST SUITE 74 PYTEST & KẾT THÚC
```

### Bước 1: Mở Đầu & Giới Thiệu Dashboard Mạng Lưới (Phút 0 - 2)

1. Mở trình duyệt tại [http://localhost:5173](http://localhost:5173).
2. Tại màn hình Login, bấm nút **"Đăng nhập nhanh với vai trò CPO (operator_a)"**.
3. Giới thiệu màn hình **Dashboard**:
   + Chỉ ra tổng công suất phụ tải đang hoạt động của mạng lưới trạm.
   + Giới thiệu biểu đồ phân bố phụ tải 24h và trạng thái trực quan của 18 cổng sạc.
   + Nhấn mạnh: Dữ liệu này được tổng hợp từ CSDL quan hệ với 60+ phiên sạc thực tế.

### Bước 2: Giả Lập Phiên Sạc Thực Tế Qua WebSocket (Phút 2 - 6)

1. Điều hướng sang tab **Simulator**.
2. Chọn **Trạm Sạc Tân Bình** $\rightarrow$ Chọn trụ **ABB Terra 60kW** $\rightarrow$ Cổng **CCS2 #1** (Đang AVAILABLE).
3. Bấm **"Bắt đầu phiên sạc"**.
4. **Điểm nhấn thuyết trình**:
   + Trỏ vào đồng hồ đo: Nhịp WebSocket 2 giây gửi telemetry liên tục: Dung lượng pin SoC nhảy dần, Công suất giữ ở mức đỉnh 60 kW (Giai đoạn sạc dòng không đổi CC).
   + Chỉ ra dòng điện tích lũy kWh và chi phí tích lũy (VND) nhảy số mượt mà theo đúng biểu giá TOU đã chốt lúc cắm sạc.
   + Mở thêm 1 tab trình duyệt ẩn danh khác xem màn hình **Stations**: Cổng sạc vừa chọn đã chuyển sang màu xanh dương `CHARGING` ngay lập tức!

### Bước 3: Chứng Minh Tính An Toàn Tuyệt Đối Của Hệ Thống (Phút 6 - 9)

1. **Thử nghiệm 1: Khóa cổng sạc độc quyền (Exclusive Lock)**:
   + Trên tab thứ 2, dùng tài khoản khác cố gắng chọn đúng Cổng CCS2 #1 vừa sạc và bấm "Bắt đầu sạc".
   + **Kết quả**: Hệ thống chặn ngay lập tức và thông báo lỗi: *"Cổng sạc đang được sử dụng hoặc không khả dụng (HTTP 409 Conflict)"*. Chứng minh không thể xảy ra race-condition.
2. **Thử nghiệm 2: Chặn tài khoản nợ tiền (Debt Lockout)**:
   + Bấm chuyển sang tài khoản **Khách nợ tiền (driver_debt)** (Số dư đang âm -120,000 VND).
   + Chọn một cổng trống và bấm "Bắt đầu sạc".
   + **Kết quả**: Hệ thống từ chối ngay với mã lỗi *"HTTP 402: Tài khoản đang nợ tiền, vui lòng nạp tiền để tiếp tục sạc"*.

### Bước 4: Trình Diễn AI Dual-Loop & Cơ Chế Heuristic Fallback (Phút 9 - 12)

1. Chuyển về tài khoản CPO, vào trang **AI Advisor**.
2. **Smart Charging**:
   + Chọn Trạm Tân Bình, bấm **"Phân tích điều phối tải"**.
   + Giải thích cho Hội đồng: Thuật toán Weighted Fair Sharing theo SoC đã tự động phân bổ lại công suất các xe, đảm bảo tổng phụ tải luôn $\le 95\%$ công suất lưới trạm.
3. **Predictive Maintenance**:
   + Trình diễn bảng phát hiện cảnh báo sớm: Giám sát nhiệt độ đầu nối và độ sụt áp tiếp điểm.
4. **Trợ lý AI Hỏi Đáp (NLP Grounding)**:
   + Gõ câu hỏi: *"Trạm của tôi hiện tại có an toàn về nhiệt độ không?"* $\rightarrow$ AI đọc dữ liệu telemetry thực và trả lời chính xác, mạch lạc.
5. **ĐIỂM NHẤN CAO TRÀO: Thử nghiệm Graceful Fallback**:
   + Tắt kết nối internet hoặc nhập API key giả mạo trong backend.
   + Bấm phân tích lại AI Advisor.
   + **Kết quả**: Giao diện hiển thị nhãn `[HEURISTIC_FALLBACK]` màu vàng cam, thuật toán Heuristic toán học lập tức thế chỗ xử lý trơn tru, **hoàn toàn không có màn hình trắng hay lỗi sập server 500**!

### Bước 5: Kiểm Tra Giao Dịch Ví Tiền ACID & Lịch Sử (Phút 12 - 14)

1. Trở lại trang **Simulator**, bấm **"Dừng sạc"** phiên sạc đang chạy ở Bước 2.
2. Cổng sạc giải phóng trở lại trạng thái `AVAILABLE`.
3. Điều hướng sang trang **Wallet**:
   + Số dư ví của tài xế đã bị trừ chính xác số tiền sạc.
   + Bảng lịch sử giao dịch hiển thị bản ghi `CHARGE_FEE` với mã tham chiếu `session_xxx`.
4. Bấm **"Nạp tiền 200,000 đ"** $\rightarrow$ Số dư cập nhật tức thời, sinh bản ghi `TOPUP`.

### Bước 6: Minh Chứng Bằng Kiểm Thử Tự Động (Phút 14 - 15)

1. Mở cửa sổ Terminal tại `backend`, gõ lệnh:

   ```bash
   pytest -v
   ```

2. Cho Hội đồng xem trực tiếp toàn bộ **74 test cases** chạy qua và đạt **100% xanh lá (PASSED)** trong hơn 1 phút, khẳng định sự nghiêm túc và chất lượng kỹ thuật cao của đồ án.

---

## 5. Các Câu Hỏi Phản Biện Tiềm Năng & Hướng Trả Lời

### Câu hỏi 1: Tại sao hệ thống lại cho phép số dư ví âm (nợ tiền)? Lỡ tài xế quỵt nợ thì sao?
>
> **Trả lời thuyết phục**: Khác với mua sắm hàng hóa có thể hủy giỏ hàng, trong nạp sạc xe điện, dòng điện khi đã xả vào pin hóa học của xe thì không thể rút ngược lại. Nếu hệ thống ngắt sạc cứng ngắc ngay khi số dư vừa chạm 0đ, xe có thể bị dừng sạc giữa đường cao tốc ban đêm, gây nguy hiểm cho tính mạng người dùng. Do đó, hệ thống áp dụng cơ chế thấu chi có kiểm soát (`NEGATIVE_BALANCE_LIMIT = -300,000 VND`), đủ cho 1 phiên sạc đầy khẩn cấp. Khi đã âm vượt hạn mức, tài khoản sẽ bị kích hoạt `is_debt_locked = True` và bị chặn toàn bộ hệ thống cho đến khi nạp tiền hoàn trả.

### Câu hỏi 2: Nếu máy chủ sập (crash) giữa lúc các xe đang sạc dở thì dữ liệu có bị mất không?
>
> **Trả lời thuyết phục**: Nhóm đã thiết kế cơ chế bảo vệ 2 tầng:
>
> 1. *Checkpointing định kỳ*: Mỗi 60 giây, bộ simulator tự động ghi snapshot số kWh và SoC xuống CSDL vật lý.
> 2. *Reconciliation on Startup*: Khi server khởi động lại, hàm đối soát quét toàn bộ các phiên sạc `ACTIVE` trong CSDL mà không có tiến trình simulator tương ứng, tự động đánh dấu `INTERRUPTED`, quyết toán trừ tiền theo checkpoint gần nhất và giải phóng rơ-le cổng sạc về `AVAILABLE`. Cổng sạc không bao giờ bị treo cứng.

### Câu hỏi 3: AI trong đề tài này có tự ý ngắt điện hay sửa số dư ví không?
>
> **Trả lời thuyết phục**: Tuyệt đối không. Hệ thống tuân thủ nghiêm ngặt nguyên tắc **"AI Advisory Only" (Chỉ Cố Vấn)**. Mọi thao tác tài chính (trừ ví, nạp tiền) và an toàn vật lý (ngắt sạc khi quá nhiệt $\ge 75^\circ\text{C}$) đều được thực thi độc quyền bởi tầng dịch vụ lõi Deterministic (Python/SQLAlchemy). AI chỉ đóng vai trò phân tích xu hướng và đề xuất phương án tối ưu.
