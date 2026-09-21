# BƯỚC 01: ĐẶC TẢ YÊU CẦU & PHÂN TÍCH NGHIỆP VỤ (REQUIREMENTS ANALYSIS)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-01-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT1/01_SRS_and_UseCases.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) dùng để nộp bài và chấm điểm giai đoạn KT1.

---

## 1. Mục tiêu bước 1
- Thiết lập ranh giới chức năng rõ ràng cho đồ án "Hệ thống quản lý kho có tích hợp AI" (Đề tài 07).
- Phân tích chi tiết 3 Actor: Quản trị viên (Admin), Thủ kho (Warehouse Keeper), Kế toán (Accountant).
- Xây dựng sơ đồ Use Case tổng quan và đặc tả các luồng nghiệp vụ kho chính.
- Xác định phạm vi và bài toán đầu vào/đầu ra cho 3 chức năng AI.

---

## 2. Nội dung công việc chi tiết

### 2.1. Phân tích 3 Actor & Ma trận quyền hạn
1. **Quản trị viên (Admin)**:
   - Quản lý tài khoản người dùng (thêm, sửa, khóa tài khoản, phân vai trò).
   - Cấu hình hệ thống, ngưỡng cảnh báo tồn kho chung.
   - Cấu hình API Key AI (Gemini / OpenAI).
   - Xem toàn bộ báo cáo tổng hợp hệ thống.
2. **Thủ kho (Warehouse Keeper)**:
   - Tạo và duyệt phiếu nhập kho từ nhà cung cấp.
   - Tạo và duyệt phiếu xuất kho (hệ thống kiểm tra tồn kho, cấm xuất âm).
   - Theo dõi tồn kho thực tế, nhận cảnh báo hàng chạm/dưới mức tồn tối thiểu.
   - Tra cứu thẻ kho chi tiết của từng mặt hàng.
   - Xem gợi ý nhập hàng và tóm tắt biến động từ AI.
3. **Kế toán (Accountant)**:
   - Tra cứu lịch sử nhập xuất theo chứng từ, thời gian, nhà cung cấp.
   - Xem báo cáo tổng hợp Nhập - Xuất - Tồn theo kỳ (tháng, quý).
   - Đối chiếu giá trị tồn kho, chi phí nhập, doanh số xuất.
   - Không được phép can thiệp trực tiếp làm thay đổi số lượng tồn kho vật lý.

### 2.2. Đặc tả các luồng nghiệp vụ cốt lõi
- **Luồng Nhập kho**: Lập phiếu $\rightarrow$ Nhập danh sách mặt hàng, số lượng, đơn giá $\rightarrow$ Xác nhận $\rightarrow$ Transaction cập nhật tăng tồn kho $\rightarrow$ Ghi thẻ kho.
- **Luồng Xuất kho**: Lập phiếu $\rightarrow$ Chọn mặt hàng, số lượng xuất $\rightarrow$ Kiểm tra `current_stock >= requested_qty` $\rightarrow$ Nếu thiếu: báo lỗi và dừng $\rightarrow$ Nếu đủ: trừ tồn kho $\rightarrow$ Ghi thẻ kho.
- **Luồng Cảnh báo tồn**: Tự động đánh dấu mặt hàng khi `current_stock <= min_stock`.

### 2.3. Xác định 3 chức năng AI
1. AI sinh báo cáo Nhập - Xuất - Tồn theo tháng từ dữ liệu tổng hợp.
2. AI gợi ý nhập hàng dựa trên tồn kho, tồn tối thiểu và tốc độ xuất.
3. AI tóm tắt biến động bất thường (xuất tăng đột biến $>200\%$ hoặc hàng tồn lâu $>30$ ngày).

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, sản phẩm bàn giao thực tế phải được tạo ra chính xác tại:

```text
he-thong-quan-ly-kho/
└── docs/
    └── SDLC/
        └── KT1/
            └── 01_SRS_and_UseCases.md        # File đặc tả yêu cầu, phân tích 3 actor và sơ đồ Use Case
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Tài liệu đặc tả được viết bằng tiếng Việt rõ ràng, mạch lạc, chuẩn thuật ngữ chuyên ngành.
- [ ] Có sơ đồ Use Case (dạng PlantUML/Mermaid hoặc hình vẽ).
- [ ] Bám sát 100% yêu cầu trong file gốc `de_tai_07.md`.
- [ ] Được lưu trữ chính xác tại `docs/SDLC/KT1/01_SRS_and_UseCases.md`.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 01** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 01 | Đặc tả Yêu cầu & Phân tích Nghiệp vụ | Hoàn thành | `docs/SDLC/KT1/01_SRS_and_UseCases.md` | Đã hoàn thiện tài liệu SRS và sơ đồ Use Case |
```
