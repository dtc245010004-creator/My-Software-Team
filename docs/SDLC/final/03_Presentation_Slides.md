# ĐỀ CƯƠNG SLIDE THUYẾT TRÌNH BẢO VỆ ĐỒ ÁN (15 SLIDES)
## NỀN TẢNG VẬN HÀNH TRẠM SẠC XE ĐIỆN TÍCH HỢP TRÍ TUỆ NHÂN TẠO (AI-POWERED EV CSMS)

---

### SLIDE 1: TRANG TIÊU ĐỀ (TITLE SLIDE)
- **Tên Đề Tài**: XÂY DỰNG NỀN TẢNG VẬN HÀNH TRẠM SẠC XE ĐIỆN TÍCH HỢP TRÍ TUỆ NHÂN TẠO (AI-POWERED EV CSMS)
- **Học Phần**: Đồ Án Tốt Nghiệp / Đồ Án Chuyên Ngành Kỹ Thuật Phần Mềm
- **Sinh Viên Thực Hiện**: [Tên Sinh Viên] - MSSV: [Mã Số Sinh Viên]
- **Giảng Viên Hướng Dẫn**: [Học Hàm / Học Vị - Tên Giảng Viên]
- **Thời Gian**: Tháng 09/2026

---

### SLIDE 2: ĐẶT VẤN ĐỀ & BỐI CẢNH THỰC TIỄN
- **Sự bùng nổ của phương tiện giao thông chạy điện (EV)**:
  + Số lượng xe điện tăng trưởng theo cấp số nhân tại các đô thị lớn.
  + Nhu cầu sạc nhanh công suất lớn (DC 60kW - 300kW) gây áp lực khủng khiếp lên lưới điện khu vực.
- **Thách thức của các đơn vị vận hành điểm sạc (CPO)**:
  + Nguy cơ quá tải nhảy Aptomat trạm khi nhiều xe sạc cùng lúc.
  + Thất thoát doanh thu hoặc treo cổng sạc khi phần mềm lỗi hoặc mất kết nối mạng.
  + Thiếu công cụ giám sát đo đếm thời gian thực (Telemetry) và cảnh báo sớm hư hỏng thiết bị.
  + Biểu giá điện thay đổi theo giờ cao điểm/thấp điểm (TOU) đòi hỏi tính cước chuẩn xác.

---

### SLIDE 3: MỤC TIÊU & PHẠM VI GIẢI PHÁP
- **Mục tiêu cốt lõi**:
  + Xây dựng nền tảng web toàn diện phục vụ quản lý mạng lưới trạm sạc xe điện theo chuẩn phân quyền (Admin, CPO, Tài xế).
  + Đảm bảo tính toàn vẹn giao dịch tài chính tuyệt đối (ACID Transaction), tính cước TOU và quản lý nợ ví an toàn.
  + Xây dựng bộ giả lập telemetry thời gian thực qua WebSocket với các đường cong sạc vật lý CC/CV và tự ngắt khẩn cấp.
  + Tích hợp AI hỗ trợ điều phối tải thông minh, dự báo bảo trì và tư vấn biểu giá với cơ chế Fallback độc lập 100%.

---

### SLIDE 4: KIẾN TRÚC HỆ THỐNG TỔNG THỂ & TECH STACK
- **Mô hình kiến trúc đa tầng (Multi-tier Architecture)**:
  + **Tầng Giao diện (Presentation Layer)**: React 18, Vite, Tailwind CSS, Lucide Icons, Recharts (Industrial Dark UI).
  + **Tầng API & Realtime (Transport Layer)**: FastAPI (Python 3.10+), Asynchronous I/O, Native WebSockets Hub.
  + **Tầng Nghiệp vụ Lõi (Domain Service Layer)**: Station Service, Session Service, Wallet ACID Service, Background Simulator.
  + **Tầng Lưu trữ (Persistence Layer)**: SQLAlchemy 2.0 ORM, SQLite/PostgreSQL, Pessimistic Row Locking (`with_for_update`).
  + **Tầng Trí tuệ Nhân tạo (Intelligence Layer)**: Google Gemini API (Slow Loop) + Python Heuristic Engine (Fast Loop).

---

### SLIDE 5: KIẾN TRÚC AI DUAL-LOOP & NGUYÊN TẮC AN TOÀN
- **Nguyên tắc "AI Advisory Only" (Chỉ Cố Vấn)**:
  + AI không bao giờ can thiệp trực tiếp vào rơ-le vật lý hoặc số dư tài khoản người dùng.
- **Mô hình Vòng Lặp Kép (Dual-Loop Pattern)**:
  + **Fast Loop (Heuristic Engine)**: Phản ứng tức thì dưới 100ms, tự động chia tải Weighted Fair Sharing, tự ngắt sạc khi pin $\ge 75^\circ\text{C}$ hoặc tài khoản cạn hạn mức nợ.
  + **Slow Loop (Gemini LLM)**: Chạy định kỳ 3-5 phút hoặc On-demand, phân tích xu hướng dài hạn, tối ưu hóa biểu giá TOU và hỗ trợ hỏi đáp kỹ thuật.
- **Graceful Degradation (Tự động thoái lui khi offline)**:
  + Khi mất mạng hoặc hết quota Gemini, hệ thống tự động 100% chuyển sang Heuristic Fallback, không gián đoạn dịch vụ.

---

### SLIDE 6: THIẾT KẾ CƠ SỞ DỮ LIỆU & PHÂN QUYỀN (RBAC)
- **Mô hình quan hệ 7 thực thể chuẩn hóa**:
  + `users` $\rightarrow$ `wallets` $\rightarrow$ `wallet_transactions`
  + `stations` $\rightarrow$ `charging_points` (EVSE) $\rightarrow$ `connectors`
  + `tariffs` $\leftrightarrow$ `charging_sessions`
- **Kiểm soát truy cập dựa trên vai trò (RBAC) & Chống IDOR**:
  + `ADMIN`: Quản trị nền tảng, xem toàn bộ trạm sạc và log hệ thống.
  + `OPERATOR (CPO)`: Chỉ xem và quản lý các trạm sạc do chính mình sở hữu (`operator_id`).
  + `CUSTOMER`: Nạp ví, xem phiên sạc của cá nhân, bị cấm tuyệt đối truy cập API quản trị.

---

### SLIDE 7: GIAO DỊCH TÀI CHÍNH ACID & QUẢN LÝ NỢ VÍ
- **Khóa độc quyền cổng sạc (Exclusive Locking)**:
  + Trạng thái cổng sạc cập nhật nguyên tử `AVAILABLE` $\rightarrow$ `CHARGING`. Ngăn chặn xung đột 2 xe cắm chung cổng với mã lỗi `HTTP 409 Conflict`.
- **Chốt biểu giá tại thời điểm cắm (Connect-time TOU Tariff)**:
  + Lưu cố định đơn giá `unit_price` khi bắt đầu phiên, bảo vệ người dùng khỏi sự thay đổi giá giữa chừng.
- **Chính sách quản lý nợ linh hoạt (Overdraft Policy)**:
  + Cho phép số dư ví âm đến hạn mức an toàn (`NEGATIVE_BALANCE_LIMIT = -300,000 VND`).
  + Tự động kích hoạt cờ `is_debt_locked = True` khi vượt hạn mức, chặn mở phiên sạc mới (`HTTP 402`).
  + Tự động giải phóng khóa nợ ngay khi tài xế nạp tiền đưa số dư trở lại $\ge 0$ VND.

---

### SLIDE 8: BỘ GIẢ LẬP ĐO ĐẾM REALTIME (SIMULATOR)
- **Mô phỏng đường cong sạc 2 giai đoạn CC/CV (Constant Current / Constant Voltage)**:
  + $\text{SoC} < 80\%$: Sạc dòng không đổi, công suất đạt đỉnh (Peak Power), nhiệt độ tăng dần.
  + $\text{SoC} \ge 80\%$: Sạc áp không đổi, công suất giảm dần tuyến tính nhằm bảo vệ tế bào pin.
- **Xung nhịp Telemetry 2 giây qua WebSocket**:
  + Truyền nhận đồng thời: Điện áp (V), Dòng điện (A), Công suất (kW), Nhiệt độ (°C), Dung lượng pin (SoC %), Điện năng tiêu thụ (kWh), Chi phí tích lũy (VND).
- **Cơ chế ngắt tự động (Auto-Cutoff)**:
  + Tự ngắt khi pin chạm 100%, khi cảm biến quá nhiệt $\ge 75^\circ\text{C}$ hoặc khi tài khoản cạn hạn mức nợ.

---

### SLIDE 9: CHECKPOINTING & TỰ ĐỘNG PHỤC HỒI KHI SỰ CỐ
- **Thách thức thực tế**: Máy chủ server bị crash hoặc bị deploy lại giữa lúc hàng chục xe đang cắm sạc.
- **Giải pháp xử lý triệt để của đề tài**:
  + **Periodic Checkpoint**: Cứ mỗi 60 giây, simulator tự động chụp ảnh snapshot chỉ số kWh và SoC ghi xuống CSDL.
  + **Startup Reconciliation**: Khi server khởi động lại, hàm đối soát tự động quét toàn bộ phiên `ACTIVE` mồ côi, chuyển trạng thái `INTERRUPTED`, quyết toán tiền theo checkpoint gần nhất và giải phóng rơ-le cổng sạc về `AVAILABLE`.
  + **Kết quả**: Không rò rỉ cổng sạc và không thất thoát doanh thu của chủ trạm.

---

### SLIDE 10: AI SMART CHARGING - ĐIỀU PHỐI PHỤ TẢI THEO SOC
- **Thuật toán chia tải Weighted Fair Sharing**:
  + Giới hạn an toàn thanh cái: $P_{\text{limit}} = P_{\text{grid\_max}} \times 0.95$.
  + Trọng số phân bổ theo mức pin:
    * $\text{SoC} < 50\% \rightarrow w_i = 1.2$ (Xe cạn pin ưu tiên cấp công suất lớn).
    * $50\% \le \text{SoC} \le 80\% \rightarrow w_i = 1.0$ (Sạc tiêu chuẩn).
    * $\text{SoC} > 80\% \rightarrow w_i = 0.6$ (Giảm tải giai đoạn CV).
  + Công thức phân bổ: $P_{\text{alloc}}[i] = \min(P_{\text{req}}[i], P_{\text{limit}} \times \frac{w_i \cdot P_{\text{req}}[i]}{\sum w_j \cdot P_{\text{req}}[j]})$.
- **Hiệu quả**: Loại bỏ 100% nguy cơ sập Aptomat trạm khi số lượng xe sạc vượt quá công suất biến áp.

---

### SLIDE 11: PREDICTIVE MAINTENANCE & DYNAMIC PRICING
- **Dự báo bảo trì thiết bị (Predictive Maintenance)**:
  + Phát hiện quá nhiệt tức thời ($\ge 55^\circ\text{C}$ cảnh báo, $\ge 70^\circ\text{C}$ nguy cấp).
  + Giám sát tốc độ gia nhiệt bất thường: $\Delta T / \Delta t > 5^\circ\text{C}/\text{phút}$.
  + Phát hiện sụt áp tiếp điểm: $\Delta V > 10\text{V}$ (báo hiệu tiếp điểm đầu sạc mòn hoặc oxy hóa rơ-le).
- **Tư vấn biểu giá động TOU (Dynamic Pricing Advisor)**:
  + Phân tích biểu đồ phụ tải giờ cao điểm.
  + Đưa ra khuyến nghị điều chỉnh biên độ giá nhằm dịch chuyển thói quen sạc của tài xế sang giờ thấp điểm.
- **Trợ lý kỹ thuật AI Ask**:
  + Tương tác bằng tiếng Việt, được grounding trực tiếp với dữ liệu cảm biến trạm, không bịa đặt (No Hallucination).

---

### SLIDE 12: THIẾT KẾ GIAO DIỆN CÔNG NGHIỆP HIỆN ĐẠI
- **Ngôn ngữ thiết kế Industrial Dark Theme**:
  + Bảng màu Obsidian `#0B0F17` và Panel Slate `#151D2A`, đường nét sắc sảo, chống mỏi mắt cho nhân viên trực ca 24/7.
  + Toàn bộ số liệu hiển thị dùng font monospace `tabular-nums`, không rung lắc layout khi nhận dữ liệu realtime.
- **Bộ tính năng giao diện hoàn chỉnh**:
  + *Dashboard*: Biểu đồ phụ tải 24h và sơ đồ 18 cổng sạc trực quan.
  + *Stations*: Quản lý chi tiết trạm và thông số trụ sạc.
  + *Simulator*: Bảng đồng hồ Telemetry đo mức pin, công suất, nhiệt độ và chi phí nhảy số liên tục.
  + *AI Advisor*: Điều khiển điều phối tải, xem ma trận rủi ro và trợ lý hỏi đáp.
  + *Wallet & Sessions*: Quản lý ví tiền, nạp tiền và tra cứu lịch sử sạc.

---

### SLIDE 13: KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (PYTEST)
- **Phương châm kiểm thử nghiêm ngặt**:
  + Không dùng test giả (Zero Mocking cho lớp đang test).
  + Assert nội dung dữ liệu thật, kiểm tra cả mã lỗi HTTP và nội dung message.
- **Kết quả đo lường thực tế**:
  + **74/74 Test Cases Đạt 100% (Passed)** trong 67.56 giây.
  + Bao phủ đầy đủ: Auth RBAC (12 tests), Quản lý Trạm & IDOR (12 tests), Vòng đời Phiên sạc (5 tests), ACID Transaction (9 tests), Quản lý Ví tiền & Nợ (5 tests), Telemetry Simulator & Crash Reconcile (9 tests), AI Engine & Graceful Fallback (21 tests), Health Check (1 test).

---

### SLIDE 14: RỦI RO, NỢ KỸ THUẬT & HƯỚNG PHÁT TRIỂN
- **Đánh giá khách quan về nợ kỹ thuật hiện tại**:
  + Nguồn dữ liệu đo đếm hiện do module Simulator phát sinh (chưa có kết nối cổng vật lý RS485/Modbus).
  + Biểu giá TOU chốt một lần lúc bắt đầu cắm sạc (chưa chia nhỏ theo từng mẩu thời gian giao thoa giữa các khung giờ).
- **Lộ trình nâng cấp sản phẩm thương mại**:
  + Tích hợp thư viện Open Charge Point Protocol (OCPP 1.6J / OCPP 2.0.1).
  + Hỗ trợ giao thức ISO 15118 (Plug & Charge - Nhận diện xe tự động qua cáp sạc).
  + Tích hợp công nghệ xe điện hoàn trả điện cho lưới điện (Vehicle-to-Grid - V2G).

---

### SLIDE 15: TỔNG KẾT & CHUYỂN GIAO SANG PHẦN DEMO
- **Kết luận**:
  + Đề tài đã xây dựng thành công một nền tảng EV CSMS hoàn chỉnh, trực quan, bảo mật và tin cậy cao.
  + Ứng dụng thành công mô hình Dual-Loop AI Architecture giải quyết trọn vẹn bài toán cân bằng tải và an toàn lưới điện.
- **Kính mời Quý Thầy Cô trong Hội đồng theo dõi phần Trình Diễn Hệ Thống Trực Tiếp (Live Demo)**:
  + *Trình diễn 1*: Đăng nhập phân quyền & Giám sát tổng thể mạng lưới trạm sạc.
  + *Trình diễn 2*: Khởi động phiên sạc, quan sát Telemetry thời gian thực qua WebSocket.
  + *Trình diễn 3*: Kiểm tra các cơ chế an toàn: Khóa cổng độc quyền & Khóa nợ tài khoản.
  + *Trình diễn 4*: Kích hoạt AI Điều phối tải và thử nghiệm Fallback khi mất mạng.
  + *Trình diễn 5*: Chạy trực tiếp bộ kiểm thử 74 Pytest trên Terminal.
- **Xin chân thành cảm ơn Quý Thầy Cô đã lắng nghe!**
