# BƯỚC 09: XÂY DỰNG FRONTEND WEB REACT & TAILWIND (FRONTEND APPLICATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-09-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `frontend/src/` (components, pages, context, api client).

---

## 1. Mục tiêu bước 9
- Xây dựng giao diện Web Dashboard hoàn chỉnh, hiện đại bằng React 18 + Vite + Tailwind CSS + Lucide Icons.
- Kết nối toàn bộ RESTful APIs từ Backend: Đăng nhập, Hàng hóa, Nhà cung cấp, Phiếu nhập, Phiếu xuất, Thẻ kho, Báo cáo và Trợ lý AI.
- Tích hợp bộ chuyển đổi vai trò (Role Switcher) nhanh trên thanh tiêu đề để thuận tiện demo cho giảng viên xem quyền hạn của Admin, Thủ kho, Kế toán.

---

## 2. Nội dung công việc chi tiết

### 2.1. Khung Giao diện & Điều hướng (Layout & Navigation)
- `Sidebar`: Menu điều hướng (Tổng quan, Hàng hóa, Nhà cung cấp, Nhập kho, Xuất kho, Thẻ kho, Báo cáo & AI).
- `Header`: Thông tin tài khoản, nút Chuyển đổi vai trò demo, nút Đăng xuất.
- `AuthContext`: Quản lý JWT Token, lưu thông tin phiên đăng nhập vào `localStorage`.

### 2.2. Các Trang Chức năng Chính (Pages)
1. **Trang Dashboard (`pages/Dashboard.jsx`)**:
   - Thẻ thống kê KPI: Tổng mặt hàng, Hàng sắp hết, Giá trị tồn kho, Phiếu trong tháng.
   - Bảng cảnh báo hàng dưới mức tồn tối thiểu (Badge đỏ/vàng).
2. **Trang Hàng hóa (`pages/Products.jsx`)**:
   - Bảng danh sách hàng hóa có ô tìm kiếm tức thời, lọc nhóm hàng, cờ cảnh báo `is_low_stock`.
   - Modal Thêm / Sửa mặt hàng; Nút xem nhanh Thẻ kho của mặt hàng đó.
3. **Trang Lập Phiếu Nhập (`pages/ImportNotes.jsx`)**:
   - Chọn nhà cung cấp, ngày nhập, bảng chọn sản phẩm và nhập số lượng + giá nhập.
   - Tự động tính tổng tiền.
4. **Trang Lập Phiếu Xuất (`pages/ExportNotes.jsx`)**:
   - Chọn người nhận, bảng chọn sản phẩm.
   - **Cảnh báo tức thời**: Hiển thị số tồn hiện tại, đổi màu đỏ nếu nhập số lượng xuất vượt tồn kho.
5. **Trang Báo cáo & Trợ lý AI (`pages/AIAssistant.jsx`)**:
   - Báo cáo Nhập - Xuất - Tồn theo kỳ.
   - Nút bấm **"🤖 Yêu cầu AI Phân tích"**: Hiển thị báo cáo nhận xét, danh sách gợi ý nhập hàng và cảnh báo bất thường với định dạng trực quan.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
frontend/
├── src/
│   ├── api/
│   │   └── client.js                  # Axios client cấu hình baseURL & JWT interceptor
│   ├── context/
│   │   └── AuthContext.jsx            # Context quản lý đăng nhập & vai trò
│   ├── components/
│   │   ├── Layout.jsx                 # Sidebar + Header layout chung
│   │   ├── Badge.jsx                  # Component nhãn trạng thái/cảnh báo
│   │   └── Modal.jsx                  # Component hộp thoại pop-up
│   └── pages/
│       ├── Login.jsx                  # Trang đăng nhập
│       ├── Dashboard.jsx              # Trang tổng quan & cảnh báo
│       ├── Products.jsx               # Trang quản lý hàng hóa
│       ├── Suppliers.jsx              # Trang quản lý nhà cung cấp
│       ├── ImportNotes.jsx            # Trang lập & xem phiếu nhập
│       ├── ExportNotes.jsx            # Trang lập & xem phiếu xuất
│       ├── StockLedger.jsx            # Trang tra cứu thẻ kho
│       └── AIAssistant.jsx            # Trang báo cáo & Trợ lý AI
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Giao diện phản hồi tức thời (Single Page Application), không bị load lại trang khi thao tác.
- [ ] Form xuất kho chặn người dùng bấm gửi nếu nhập số lượng xuất lớn hơn tồn kho hiện có.
- [ ] Nút "Yêu cầu AI phân tích" hiển thị trạng thái loading đẹp mắt trong lúc chờ phản hồi.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 09** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 09 | Xây dựng Frontend Web (React + Tailwind) | Hoàn thành | `frontend/src/App.jsx`, `pages/Dashboard.jsx`, `pages/...` | Đã hoàn thiện giao diện React + Tailwind CSS cho toàn bộ 7 phân hệ |
```
