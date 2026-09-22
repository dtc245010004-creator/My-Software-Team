# GIAI ĐOẠN 2: XÂY DỰNG CORE BACKEND, SIMULATOR & GIAO DỊCH ACID (BÀI KT2)

## 1. Mục tiêu giai đoạn
- Xây dựng Data Models (SQLAlchemy 2.0) và RESTful APIs cho: Trạm sạc (`Station`), Trụ sạc (`ChargingPoint`), Cổng sạc (`Connector`), Biểu giá (`Tariff`), Ví tiền (`Wallet`) và Phiên sạc (`ChargingSession`).
- Hiện thực hóa logic trừ tiền ví và quyết toán phiên sạc bằng **Database Transaction (ACID)**, đảm bảo số dư ví không bao giờ bị âm bất hợp lệ và loại trừ hoàn toàn xung đột ghi đồng thời.
- Ràng buộc trạng thái độc quyền của cổng sạc (không cho phép mở 2 phiên sạc đồng thời trên cùng một connector).
- Xây dựng module **Charging Simulator** giả lập chu trình sạc xe điện (đường cong sạc SoC %, công suất kW, kWh, nhiệt độ súng sạc) và truyền phát telemetry qua **WebSocket** thời gian thực.
- Lưu lại minh chứng sử dụng AI hỗ trợ trong quá trình thiết kế mã nguồn, tối ưu truy vấn CSDL và cấu hình WebSocket.

## 2. Danh mục tài liệu giai đoạn KT2:
1. `01_API_Specifications.md`: Đặc tả các REST API endpoints và kênh WebSocket telemetry.
2. `02_Transaction_Design_and_Wallet_ACID.md`: Thiết kế luồng Transaction trừ tiền ví an toàn và quản lý trạng thái phiên sạc.
3. `03_Simulator_and_Telemetry_Design.md`: Thiết kế bộ giả lập sạc và cơ chế ngắt sạc an toàn.
4. `04_AI_Assisted_Development_Evidence.md`: Minh chứng sử dụng AI trong việc sinh mã nguồn và giải quyết bài toán kỹ thuật.
