# BƯỚC 11: ĐÓNG GÓI, TÀI LIỆU SDLC & KỊCH BẢN DEMO (FINAL POLISH)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-11-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/final/`: Chứa toàn bộ BÁO CÁO KỸ THUẬT, HƯỚNG DẪN SỬ DỤNG, SLIDE THUYẾT TRÌNH dùng để nộp bài và chấm điểm cuối kỳ.
> - `README.md`: Hướng dẫn khởi chạy dự án tại thư mục gốc.

---

## 1. Mục tiêu bước 11
- Hoàn thiện toàn bộ hồ sơ minh chứng học phần theo 4 mốc đánh giá SDLC (KT1, KT2, KT3, Cuối kỳ) trong thư mục `docs/SDLC/`.
- Viết tài liệu `README.md` tại thư mục gốc với hướng dẫn cài đặt và khởi chạy 1-Click.
- Xây dựng Kịch bản Demo 5 phút để sinh viên tự tin thuyết trình và đạt điểm tối đa trước hội đồng chấm thi.

---

## 2. Nội dung công việc chi tiết

### 2.1. Hoàn thiện Tài liệu 4 Giai đoạn SDLC
1. **Thư mục `docs/SDLC/KT1/`**:
   - `01_SRS_and_UseCases.md`: Phân tích quy trình, 3 Actor, Use Case.
   - `02_Database_Design_ERD.md`: Thiết kế 9 bảng, Data Dictionary, sơ đồ Mermaid ERD.
   - `03_AI_Architecture_and_Prompts.md`: Kiến trúc module AI và prompt mẫu.
   - `04_Wireframes.md`: Phác thảo cấu trúc các màn hình giao diện.
2. **Thư mục `docs/SDLC/KT2/`**:
   - `01_API_Specifications.md`: Tài liệu đặc tả RESTful APIs.
   - `02_Transaction_Design_and_Negative_Stock_Prevention.md`: Thiết kế Transaction và chống tồn âm.
   - `03_AI_Assisted_Development_Evidence.md`: Minh chứng dùng AI hỗ trợ viết code.
3. **Thư mục `docs/SDLC/KT3/`**:
   - `01_Prompt_Engineering_and_Evaluation.md`: Báo cáo so sánh các phiên bản Prompt.
   - `02_Test_Plan_and_Results.md`: Kết quả chạy bộ kiểm thử Pytest.
   - `03_AI_Fallback_Architecture.md`: Kiến trúc Fallback Heuristic khi offline.
4. **Thư mục `docs/SDLC/final/`**:
   - `01_Final_Technical_Report.md`: Báo cáo kỹ thuật tổng kết đồ án.
   - `02_User_Guide_and_Demo_Script.md`: Hướng dẫn sử dụng và kịch bản demo chấm thi.
   - `03_Presentation_Slides.md`: Nội dung slide thuyết trình bảo vệ đồ án.

### 2.2. Tài liệu Hướng dẫn Khởi chạy 1-Click (`README.md`)
- Hướng dẫn cài đặt nhanh:
  ```bash
  # 1. Chạy Backend
  cd backend
  pip install -r requirements.txt
  python seed_data.py
  uvicorn app.main:app --reload

  # 2. Chạy Frontend
  cd frontend
  npm install
  npm run dev
  ```
- Danh sách tài khoản đăng nhập mẫu (`admin`, `thukho`, `ketoan`).

### 2.3. Kịch bản Demo 5 Phút Chuẩn Chấm Thi
1. **Phút 1**: Giới thiệu bài toán doanh nghiệp nhỏ và cấu trúc phân quyền 3 vai trò.
2. **Phút 2**: Đăng nhập vai trò Thủ kho $\rightarrow$ Thực hiện Lập phiếu xuất với số lượng vượt tồn kho $\rightarrow$ Cho giảng viên thấy hệ thống chặn đứng tồn kho âm và trả thông báo lỗi.
3. **Phút 3**: Nhập số lượng hợp lệ $\rightarrow$ Xuất thành công $\rightarrow$ Mở Thẻ kho cho thấy số dư được trừ tức thì và lịch sử được ghi nhận chuẩn xác.
4. **Phút 4**: Chuyển sang màn hình Báo cáo $\rightarrow$ Bấm nút "Yêu cầu AI phân tích" $\rightarrow$ Giới thiệu 3 kết quả thông minh: Nhận xét tháng, gợi ý số lượng nhập hàng, phát hiện xuất đột biến và hàng chết.
5. **Phút 5**: Giới thiệu bộ kiểm thử Pytest pass 100% và cơ chế Fallback Heuristic khi mất mạng.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
he-thong-quan-ly-kho/
├── README.md                                  # File hướng dẫn chạy 1-click tại thư mục gốc
├── run.bat                                    # Script chạy tự động trên Windows (1-click)
└── docs/
    └── SDLC/
        ├── KT2/
        │   ├── 01_API_Specifications.md
        │   └── 03_AI_Assisted_Development_Evidence.md
        ├── KT1/
        │   ├── 03_AI_Architecture_and_Prompts.md
        │   └── 04_Wireframes.md
        └── final/
            ├── 01_Final_Technical_Report.md   # Báo cáo kỹ thuật tổng kết đồ án
            ├── 02_User_Guide_and_Demo_Script.md # Hướng dẫn sử dụng & Kịch bản demo 5 phút
            └── 03_Presentation_Slides.md      # Nội dung Slide thuyết trình bảo vệ đồ án
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Tất cả các file tài liệu markdown không bị lỗi định dạng, sơ đồ Mermaid render rõ ràng.
- [ ] Người chưa từng tiếp xúc dự án có thể đọc `README.md` và khởi chạy thành công hệ thống trong 5 phút.
- [ ] Kịch bản demo mạch lạc, chứng minh đầy đủ 100% yêu cầu của `de_tai_07.md`.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 11** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 11 | Đóng gói, Tài liệu SDLC & Kịch bản Demo | Hoàn thành | `README.md`, `docs/SDLC/final/...` | Đã hoàn tất đóng gói toàn bộ dự án, hồ sơ SDLC 4 giai đoạn và kịch bản demo |
```
