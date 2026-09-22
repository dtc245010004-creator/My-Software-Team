# PHÂN TÍCH YÊU CẦU & KẾ HOẠCH TRIỂN KHAI CHI TIẾT
## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

---

## PHẦN 1: TRÍCH XUẤT YÊU CẦU TƯỜNG MINH (EXPLICIT REQUIREMENTS)

Dựa trên đặc tả hệ thống tại `nentang.md` và `Prompt.md`, các yêu cầu chức năng và kỹ thuật bao gồm:

### 1.1. Phân hệ Quản lý & Vận hành mạng lưới trạm sạc
1. **Đăng nhập & Phân quyền RBAC**:
   - Quản trị viên hệ thống (Admin): Quản lý người dùng, đối tác trạm sạc (CPO), cấu hình hệ thống, AI API key.
   - Đơn vị vận hành trạm (Station Operator / CPO): Quản lý trạm, trụ sạc (EVSE), cổng sạc (Connector), cấu hình biểu giá, theo dõi trạng thái trụ sạc và bảo trì.
   - Khách hàng lái xe điện (EV Driver / Customer): Tìm kiếm trạm sạc, quản lý ví tiền, thực hiện phiên sạc và theo dõi tiến độ sạc cá nhân.
2. **Quản lý Hạ tầng trạm sạc**:
   - Trạm sạc (`Station`): Tên trạm, địa chỉ, kinh độ/vĩ độ, tổng công suất nguồn lưới cấp (`total_grid_capacity_kw`), trạng thái hoạt động.
   - Trụ sạc (`ChargingPoint / EVSE`): Mã trụ, hãng sản xuất, model, công suất tối đa (kW), phiên bản firmware, trạng thái kết nối mạng (Online/Offline) và trạng thái hoạt động (`AVAILABLE`, `PREPARING`, `CHARGING`, `FAULTED`, `UNAVAILABLE`).
   - Cổng sạc (`Connector`): Số thứ tự cổng, loại cổng (`CCS2` DC sạc nhanh, `Type 2` AC tiêu chuẩn, `CHAdeMO`), công suất định mức và giới hạn dòng sạc.
3. **Biểu giá linh hoạt theo khung giờ (TOU Tariff)**:
   - Cấu hình giá điện theo giờ cao điểm (Peak), giờ thấp điểm (Off-Peak) và giờ bình thường (Normal).
   - Phụ phí dịch vụ và phí chiếm chỗ sau khi sạc đầy (Idle Fee).
4. **Ví điện tử & Thanh toán**:
   - Mỗi người dùng có một ví tiền cá nhân: nạp tiền, trừ tiền phiên sạc, hoàn tiền.
   - Bắt buộc kiểm tra số dư khả dụng trước khi sạc (tối thiểu 50,000 VND).
5. **Phiên sạc & Giám sát thời gian thực**:
   - Bắt đầu, theo dõi và kết thúc phiên sạc.
   - Cập nhật số liệu đo đếm (SoC %, kW, kWh, V, A, nhiệt độ cổng sạc, chi phí tạm tính).
   - Quyết toán phiên sạc và xuất hóa đơn điện tử.

### 1.2. Phân hệ Giả lập Trạm sạc (Charging Simulator)
- Mô phỏng hành vi phần cứng trụ sạc xe điện chuẩn OCPP-like:
  - Cắm súng sạc, khởi động phiên, sinh đường cong sạc pin (SoC tăng từ 20% lên 100%).
  - Truyền nhận telemetry qua WebSocket định kỳ 2 giây/lần.
  - Tự động dừng sạc an toàn khi: Pin đầy (100%), Hết tiền ví, hoặc Quá nhiệt súng sạc ($> 75^\circ\text{C}$).

### 1.3. Phân hệ Trí tuệ Nhân tạo (AI Engine)
1. **Smart Charging & Load Balancing**: Phân bổ động công suất sạc giữa các trụ để không vượt quá giới hạn nguồn cấp trạm (`total_grid_capacity_kw`).
2. **Predictive Maintenance**: Phân tích telemetry 30 ngày (nhiệt độ, độ ổn định dòng/áp, tỷ lệ ngắt sạc sớm) để phát hiện trụ sạc xuống cấp và cảnh báo bảo dưỡng.
3. **Dynamic Pricing & AI Advisor**: Gợi ý điều chỉnh biểu giá TOU và trợ lý giải đáp dữ liệu vận hành bằng tiếng Việt tự nhiên.
4. **Heuristic Fallback Engine**: Tự động kích hoạt khi mất mạng hoặc hết quota AI, chia tải theo tỷ lệ công suất chuẩn và cảnh báo ngưỡng cứng.

---

## PHẦN 2: SUY LUẬN YÊU CẦU NGẦM ĐỊNH (IMPLICIT REQUIREMENTS)

Để hệ thống hoạt động **an toàn, ổn định và đạt chuẩn sản phẩm thực tế**, cần giải quyết các bài toán kỹ thuật ngầm định sau:

| Yêu cầu tường minh | Câu hỏi: "Để làm chuẩn xác thì cần gì?" | Yêu cầu ngầm định cần giải quyết |
| :--- | :--- | :--- |
| **1. Trừ tiền ví phiên sạc** | Làm sao đảm bảo không bao giờ bị trừ tiền âm ví hoặc bị gian lận khi có nhiều luồng gọi đồng thời? | - **Database Transaction & Pessimistic Locking**: Sử dụng `with_for_update()` để khóa dòng ví trong transaction khi trừ tiền.<br>- **DB Check Constraint**: `CHECK (balance >= 0)` ở tầng CSDL làm chốt chặn cuối cùng.<br>- **Audit Trail**: Ghi nhận bất biến mọi biến động vào `wallet_transactions`. |
| **2. Bắt đầu phiên sạc** | Nếu 2 tài xế cùng bấm sạc trên cùng một cổng sạc cùng một giây thì sao? | - **Connector Locking**: Kiểm tra và chuyển trạng thái cổng sạc trong transaction nguyên tử (`atomic update`), nếu cổng không ở trạng thái `AVAILABLE` thì báo lỗi HTTP 409 Conflict ngay lập tức. |
| **3. Truyền dữ liệu Telemetry sạc** | Nếu gọi HTTP polling liên tục thì server quá tải, trễ dữ liệu? | - Sử dụng **WebSocket (`/ws/telemetry`)**: Server chủ động đẩy thông số đo đếm mỗi 2 giây xuống Frontend. Tự động dọn dẹp kết nối khi client ngắt kết nối. |
| **4. Ngắt sạc khẩn cấp khi hết tiền** | Khách hàng đang sạc mà tiền ví cạn dần thì xử lý thế nào? | - Background worker trong Simulator định kỳ kiểm tra chi phí lũy kế với số dư ví hiện tại. Nếu số dư $\le 0$, tự động kích hoạt lệnh ngắt sạc khẩn cấp với lý do `InsufficientBalance`. |
| **5. AI phân tích phụ tải & bảo trì** | Dữ liệu telemetry hàng triệu bản ghi, gửi thẳng vào AI có bị tràn token và tốn tiền không? | - **Data Pre-processing / Aggregation**: Backend tổng hợp sẵn số liệu (nhiệt độ max/tb, số phiên sạc, tổng kWh tiêu thụ, độ sụt công suất) thành bảng JSON cô đọng trước khi gửi vào prompt AI.<br>- **Grounding Anti-hallucination**: Ép AI chỉ suy luận trên số liệu đã tổng hợp. |
| **6. Đảm bảo tính liên tục của hệ thống** | Khi mất mạng Internet hoặc Google Gemini API hết quota? | - **Heuristic Fallback Engine**: Tự động chuyển đổi mượt mà sang thuật toán chia tải tỷ lệ chuẩn và bộ quy tắc cảnh báo ngưỡng cứng, đảm bảo giao diện không vỡ. |

---

## PHẦN 3: KIẾN TRÚC & CÔNG NGHỆ LỰA CHỌN

```
┌───────────────────────────────────────────────────────────┐
│                     FRONTEND (React 18)                   │
│  - CPO Dashboard: Giám sát toàn mạng lưới trạm & doanh thu│
│  - Simulator UI: Giả lập cắm sạc & đồ thị Recharts        │
│  - Driver Portal: Quản lý ví cá nhân & phiên sạc          │
│  - AI Advisor: Khuyến nghị điều phối tải & bảo trì        │
└─────────────────────────────▲─────────────────────────────┘
                              │ REST API + WebSocket
┌─────────────────────────────▼─────────────────────────────┐
│                    BACKEND (FastAPI)                      │
│  ├── API Routers: stations, chargers, sessions, wallet, ai│
│  ├── WebSocket: /ws/telemetry (Realtime Telemetry)        │
│  ├── Services: station_service, session_service, wallet   │
│  │   (Đảm bảo giao dịch ACID, không thể âm số dư ví)      │
│  ├── Simulator Service: Phát xung nhịp đường cong sạc pin │
│  └── AI Service: Gemini API + Fallback Heuristic          │
└─────────────────────────────▲─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│               DATABASE (SQLite / PostgreSQL)              │
│  users, stations, charging_points, connectors,            │
│  charging_sessions, tariffs, wallets, wallet_transactions │
└───────────────────────────────────────────────────────────┘
```

---

## PHẦN 4: LỘ TRÌNH 4 MỐC ĐÁNH GIÁ SDLC (BÀI TẬP CÁ NHÂN)

- **Mốc KT1 (Đặc tả & Thiết kế)**:
  - `01_SRS_and_UseCases.md`: Phân tích 3 Actor, Use Case và ma trận quyền hạn.
  - `02_Database_Design_ERD.md`: Thiết kế 9 bảng CSDL, quan hệ và ràng buộc ACID.
  - `03_AI_Architecture.md`: Thiết kế kiến trúc AI và thuật toán Fallback.
  - `04_Wireframes.md`: Phác thảo giao diện các màn hình chính.
- **Mốc KT2 (Core Backend, Simulator & Giao dịch ACID)**:
  - `01_API_Specifications.md`: Đặc tả endpoints và kênh WebSocket.
  - `02_Transaction_Design_and_Wallet_ACID.md`: Thiết kế giao dịch trừ ví an toàn và quản lý phiên sạc.
  - `03_Simulator_and_Telemetry_Design.md`: Thiết kế module giả lập sạc và đường cong pin.
  - `04_AI_Assisted_Development_Evidence.md`: Minh chứng áp dụng AI hỗ trợ sinh mã nguồn.
- **Mốc KT3 (Tích hợp AI, Frontend Web & Kiểm thử)**:
  - `01_AI_Integration_and_Prompt_Evaluation.md`: Báo cáo tích hợp Gemini API và đánh giá prompt.
  - `02_Frontend_Architecture_and_UI_Guide.md`: Kiến trúc Frontend React và hướng dẫn sử dụng UI.
  - `03_Test_Plan_and_Results.md`: Kế hoạch và kết quả kiểm thử tự động bằng Pytest.
- **Mốc Cuối kỳ (Hoàn thiện & Báo cáo)**:
  - `01_Final_Technical_Report.md`: Báo cáo kỹ thuật tổng kết toàn diện đồ án.
  - `02_User_Guide_and_Demo_Script.md`: Hướng dẫn cài đặt và kịch bản demo sạc xe trực quan.
  - `03_Presentation_Slides.md`: Đề cương slide thuyết trình bảo vệ đồ án.
