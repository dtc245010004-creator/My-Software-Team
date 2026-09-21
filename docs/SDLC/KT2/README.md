# GIAI ĐOẠN 2: XÂY DỰNG CHỨC NĂNG QUẢN LÝ (BÀI KT2)

## Mục tiêu giai đoạn
- Xây dựng Data Models và RESTful APIs cho: Hàng hóa, Nhóm hàng, Nhà cung cấp, Phiếu nhập, Phiếu xuất.
- Xây dựng logic cập nhật tồn kho bằng Database Transaction (đảm bảo tính toàn vẹn ACID).
- Triển khai cơ chế kiểm tra và chống tồn kho âm (Rollback khi số lượng xuất > tồn kho).
- Xây dựng Thẻ kho (Stock Ledger / Audit Trail) để ghi nhận chi tiết lịch sử từng biến động tồn kho.
- Lưu lại minh chứng sử dụng AI hỗ trợ trong quá trình sinh mã nguồn, truy vấn và xử lý nghiệp vụ.

## Danh mục tài liệu giai đoạn KT2:
1. `01_API_Specifications.md`: Đặc tả các endpoints và cấu trúc dữ liệu JSON.
2. `02_Transaction_Design_and_Negative_Stock_Prevention.md`: Thiết kế luồng Transaction và kiểm tra chống tồn âm.
3. `03_AI_Assisted_Development_Evidence.md`: Minh chứng sử dụng AI trong việc phát triển nghiệp vụ và viết code.
