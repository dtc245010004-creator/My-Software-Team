# BƯỚC 08: MODULE AI TRỢ LÝ & SCHEDULER QUÉT TỒN KHO (AI INTEGRATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-08-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT3/01_Prompt_Engineering_and_Evaluation.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) đánh giá Prompt cho bài KT3.
> - `docs/SDLC/KT3/03_AI_Fallback_Architecture.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) kiến trúc Fallback cho bài KT3.
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (ai, services, endpoints).

---

## 1. Mục tiêu bước 8
- Tích hợp Trợ lý AI (Google Gemini API) để giải quyết 3 bài toán thông minh của Đề tài 07:
  1. AI sinh báo cáo Nhập - Xuất - Tồn theo tháng kèm nhận xét xu hướng.
  2. AI gợi ý nhập hàng tối ưu (dựa trên tồn kho, tồn tối thiểu và tốc độ xuất).
  3. AI tóm tắt biến động bất thường (xuất tăng đột biến $>200\%$ và hàng tồn kho lâu $>30$ ngày).
- Xây dựng Data Pre-processing Pipeline: SQL tính toán trước các chỉ số thống kê, lọc bỏ thông tin giá mua nhạy cảm.
- Xây dựng **Heuristic Fallback Engine**: Tự động sinh báo cáo theo quy tắc nếu không có mạng hoặc chưa có API Key, đảm bảo ứng dụng luôn chạy demo được.
- Xây dựng Scheduler (APScheduler/Cron) tự động quét hàng dưới ngưỡng tồn tối thiểu.

---

## 2. Nội dung công việc chi tiết

### 2.1. Pipeline Tổng hợp Dữ liệu cho AI
- Hàm `get_aggregated_inventory_data(db, month, year)`:
  - Tính tốc độ xuất bình quân ngày (30 ngày qua).
  - Lọc danh sách hàng `current_stock <= min_stock`.
  - Lọc hàng không có phiếu xuất trong 30 ngày gần nhất (hàng chết / tồn lâu).
  - Lọc hàng có lượng xuất tuần này tăng vọt so với bình quân.
  - **Bảo mật**: Loại bỏ hoàn toàn trường giá nhập `unit_price`.

### 2.2. Prompt Engineering & Gemini API Client
- Tách biệt Prompt Template tại `app/ai/prompts/` hoặc trong `ai_service.py`:
  - **System Prompt**: *"Bạn là trợ lý quản lý kho chuyên nghiệp. Chỉ phân tích trên dữ liệu được cung cấp. Tuyệt đối không bịa số liệu."*
  - **User Prompt**: Truyền bảng tổng hợp dữ liệu kho dưới dạng Markdown/JSON.

### 2.3. Heuristic Fallback Engine
- Nếu `GEMINI_API_KEY` trống hoặc gọi API bị lỗi/timeout:
  - Kích hoạt hàm `fallback_analysis(data)`:
    - Tính toán số lượng nhập đề xuất: `suggested_qty = (min_stock * 2) - current_stock`.
    - Gắn cờ các mặt hàng xuất đột biến hoặc tồn lâu.
    - Trả về cấu trúc báo cáo chuẩn xác, không làm crash ứng dụng.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
backend/
├── app/
│   ├── ai/
│   │   ├── __init__.py
│   │   └── prompts/
│   │       ├── inventory_report_prompt.txt   # Template prompt báo cáo tháng
│   │       ├── reorder_suggestion_prompt.txt # Template prompt gợi ý nhập hàng
│   │       └── anomaly_detection_prompt.txt  # Template prompt tóm tắt bất thường
│   ├── schemas/
│   │   └── ai.py                             # Schemas dữ liệu yêu cầu & phản hồi AI
│   ├── services/
│   │   ├── ai_service.py                     # Client gọi Gemini API & Pipeline tổng hợp
│   │   └── fallback_service.py               # Thuật toán Heuristic dự phòng khi offline
│   └── api/
│       └── v1/
│           └── endpoints/
│               └── ai.py                     # Routers /monthly-report, /restock, /anomalies
docs/
└── SDLC/
    └── KT3/
        ├── 01_Prompt_Engineering_and_Evaluation.md  # Báo cáo đánh giá prompt KT3
        └── 03_AI_Fallback_Architecture.md           # Kiến trúc Fallback KT3
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Không gửi giá mua nhạy cảm vào prompt AI.
- [ ] Khi ngắt mạng hoặc xóa API key, hệ thống vẫn trả về báo cáo phân tích thông minh qua bộ Fallback Engine trong $< 500$ms.
- [ ] Prompt AI trả về đúng schema định dạng cấu trúc rõ ràng.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 08** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 08 | Module AI Trợ lý & Scheduler Quét tồn kho | Hoàn thành | `backend/app/services/ai_service.py`, `services/fallback_service.py` | Đã hoàn thiện Module AI (Gemini API + Heuristic Fallback) cho 3 bài toán phân tích kho |
```
