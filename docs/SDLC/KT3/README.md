# GIAI ĐOẠN 3: TÍCH HỢP AI, FRONTEND WEB & KIỂM THỬ TỰ ĐỘNG (BÀI KT3)

## 1. Mục tiêu giai đoạn
- Tích hợp **Google Gemini API** giải quyết 3 bài toán AI thực tế:
  1. **Smart Charging & Load Balancing**: Phân bổ động công suất sạc nhằm chống quá tải nguồn trạm.
  2. **Predictive Maintenance**: Phân tích dữ liệu telemetry phát hiện trụ sạc quá nhiệt, sụt áp và khuyến nghị bảo dưỡng.
  3. **Dynamic Pricing & AI Advisor**: Gợi ý điều chỉnh biểu giá TOU và trợ lý giải đáp số liệu vận hành.
- Xây dựng **Fallback Heuristic Engine**: Tự động kích hoạt khi mất mạng hoặc hết quota AI, chia tải theo tỷ lệ công suất chuẩn và cảnh báo ngưỡng cứng, đảm bảo hệ thống không bao giờ bị vỡ.
- Hoàn thiện giao diện **Frontend Web (React 19 + Tailwind CSS)**:
  - CPO Dashboard: Giám sát toàn mạng lưới trạm, doanh thu và biểu đồ phụ tải.
  - Driver Portal: Quản lý ví cá nhân, nạp tiền và theo dõi tiến trình sạc.
  - Simulator UI: Màn hình mô phỏng cắm sạc, hiển thị đồng hồ đo công suất và đồ thị sạc pin thời gian thực.
- Xây dựng bộ kiểm thử tự động (Pytest) bao phủ:
  - Test trừ tiền ví an toàn (không âm ví).
  - Test khóa cổng sạc độc quyền.
  - Test thuật toán phân bổ tải và cơ chế Fallback Heuristic.

## 2. Danh mục tài liệu giai đoạn KT3:
1. `01_AI_Integration_and_Prompt_Evaluation.md`: Báo cáo tích hợp Gemini API, kỹ thuật prompt chống ảo giác và đánh giá chất lượng phản hồi.
2. `02_Frontend_Architecture_and_UI_Guide.md`: Tài liệu kiến trúc Frontend React, phân chia component và hướng dẫn giao diện.
3. `03_Test_Plan_and_Results.md`: Kế hoạch và kết quả kiểm thử tự động bằng Pytest.
