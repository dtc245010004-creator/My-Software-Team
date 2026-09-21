# GIAI ĐOẠN 3: TÍCH HỢP AI, TỐI ƯU PROMPT & KIỂM THỬ (BÀI KT3)

## Mục tiêu giai đoạn
- Thiết kế Prompt chống ảo giác (Grounding / Anti-hallucination): chỉ phân tích trên số liệu thực tế được cung cấp.
- Xây dựng Data Pre-processing / Aggregation Pipeline để tổng hợp dữ liệu kho trước khi gửi tới AI Model.
- Bảo mật thông tin: Tự động loại bỏ giá mua nhạy cảm khỏi context AI.
- Triển khai bộ kiểm thử tự động (Unit Test / Integration Test):
  - Test case dữ liệu rỗng.
  - Test case xuất kho vượt tồn kho (bắt buộc chặn thành công).
  - Test case xuất tăng đột biến hoặc hàng tồn lâu ngày.
  - Test case đánh giá kết quả trả về từ AI.
- Thử nghiệm và so sánh các phiên bản Prompt khác nhau để tối ưu độ chính xác và tính súc tích.

## Danh mục tài liệu giai đoạn KT3:
1. `01_Prompt_Engineering_and_Evaluation.md`: Báo cáo so sánh các phiên bản Prompt.
2. `02_Test_Plan_and_Results.md`: Báo cáo kết quả kiểm thử tự động (Pytest test suite).
3. `03_AI_Integration_Architecture.md`: Kiến trúc kết nối AI Engine và cơ chế Fallback Heuristic.
