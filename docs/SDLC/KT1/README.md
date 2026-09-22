# GIAI ĐOẠN 1: PHÂN TÍCH YÊU CẦU & THIẾT KẾ HỆ THỐNG TRẠM SẠC (BÀI KT1)

## 1. Mục tiêu giai đoạn
- Khảo sát và phân tích bài toán vận hành mạng lưới trạm sạc xe điện (EV CSMS).
- Xác định 3 nhóm người dùng (Actor): Quản trị viên (Admin), Đơn vị vận hành trạm (Station Operator / CPO), Khách hàng lái xe điện (EV Driver).
- Thiết kế sơ đồ Use Case và quy tắc nghiệp vụ: Quản lý hạ tầng sạc, cấu hình biểu giá theo khung giờ (TOU Tariff), ví điện tử khách hàng, và vòng đời phiên sạc.
- Thiết kế cơ sở dữ liệu quan hệ (ERD) và ràng buộc toàn vẹn: Quan hệ Trạm -> Trụ -> Cổng sạc, ràng buộc số dư ví không âm, ràng buộc độc quyền cổng sạc.
- Đề xuất kiến trúc tích hợp AI: Điều phối công suất chống quá tải (Smart Charging), cảnh báo sự cố kỹ thuật (Predictive Maintenance) kèm cơ chế Fallback Heuristic.
- Thiết kế Wireframe giao diện: Dashboard CPO giám sát trạm, Giao diện tài xế sạc xe và Màn hình giả lập (Simulator UI).

## 2. Danh mục tài liệu giai đoạn KT1:
1. `01_SRS_and_UseCases.md`: Tài liệu đặc tả yêu cầu phần mềm và sơ đồ Use Case chi tiết.
2. `02_Database_Design_ERD.md`: Thiết kế CSDL, sơ đồ ERD và Từ điển dữ liệu (Data Dictionary).
3. `03_AI_Architecture_and_Prompts.md`: Kiến trúc tích hợp Gemini API, kỹ thuật prompt và thuật toán Fallback Heuristic.
4. `04_Wireframes.md`: Phác thảo cấu trúc giao diện các màn hình chức năng Web.
