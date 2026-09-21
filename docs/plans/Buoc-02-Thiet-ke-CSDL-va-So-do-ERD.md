# BƯỚC 02: THIẾT KẾ CƠ SỞ DỮ LIỆU & SƠ ĐỒ ERD (DATABASE DESIGN)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-02-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT1/02_Database_Design_ERD.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) dùng để nộp bài và chấm điểm giai đoạn KT1.

---

## 1. Mục tiêu bước 2
- Thiết kế mô hình dữ liệu chuẩn hóa (3NF) cho toàn bộ hệ thống.
- Xác định đầy đủ 9 bảng dữ liệu cốt lõi, kiểu dữ liệu, khóa chính (PK), khóa ngoại (FK), chỉ mục (Indexes).
- Thiết lập các ràng buộc toàn vẹn dữ liệu: `CHECK (current_stock >= 0)`, `UNIQUE`, `NOT NULL`.
- Xây dựng bảng Thẻ kho (`stock_ledger`) phục vụ kiểm toán và làm dữ liệu đầu vào cho AI.

---

## 2. Nội dung công việc chi tiết

### 2.1. Chi tiết 9 Bảng Dữ liệu Cốt lõi
1. `users`: Quản lý tài khoản (`id`, `username`, `password_hash`, `full_name`, `role`, `is_active`, `created_at`).
2. `categories`: Nhóm hàng hóa (`id`, `code`, `name`, `description`).
3. `products`: Hàng hóa (`id`, `code`, `name`, `category_id`, `unit`, `min_stock`, `current_stock`, `standard_price`, `status`, `created_at`).
4. `suppliers`: Nhà cung cấp (`id`, `code`, `name`, `phone`, `email`, `address`, `is_active`).
5. `import_notes`: Phiếu nhập kho (`id`, `code`, `supplier_id`, `created_by`, `note_date`, `total_amount`, `note`, `status`).
6. `import_note_details`: Dòng chi tiết phiếu nhập (`id`, `import_note_id`, `product_id`, `quantity`, `unit_price`, `subtotal`).
7. `export_notes`: Phiếu xuất kho (`id`, `code`, `recipient_name`, `created_by`, `note_date`, `total_amount`, `note`, `status`).
8. `export_note_details`: Dòng chi tiết phiếu xuất (`id`, `export_note_id`, `product_id`, `quantity`, `unit_price`, `subtotal`).
9. `stock_ledger`: Thẻ kho / Sổ kiểm toán (`id`, `product_id`, `transaction_type`, `reference_code`, `quantity_change`, `balance_after`, `created_by`, `transaction_date`, `note`).

### 2.2. Thiết kế Sơ đồ Mermaid ERD
- Vẽ quan hệ giữa các bảng:
  - `categories (1) -> (N) products`
  - `suppliers (1) -> (N) import_notes`
  - `users (1) -> (N) import_notes`, `users (1) -> (N) export_notes`, `users (1) -> (N) stock_ledger`
  - `import_notes (1) -> (N) import_note_details`, `products (1) -> (N) import_note_details`
  - `export_notes (1) -> (N) export_note_details`, `products (1) -> (N) export_note_details`
  - `products (1) -> (N) stock_ledger`

### 2.3. Ràng buộc toàn vẹn & Chống tồn kho âm
- Ràng buộc CSDL: `ALTER TABLE products ADD CONSTRAINT chk_stock_non_negative CHECK (current_stock >= 0);`
- Quy tắc giá trị: `quantity > 0`, `unit_price >= 0`.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, sản phẩm bàn giao thực tế phải được tạo ra chính xác tại:

```text
he-thong-quan-ly-kho/
└── docs/
    └── SDLC/
        └── KT1/
            └── 02_Database_Design_ERD.md     # File thiết kế CSDL, Data Dictionary và sơ đồ Mermaid ERD
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Bảng mô tả chi tiết từ điển dữ liệu (Data Dictionary) cho tất cả các trường.
- [ ] Sơ đồ Mermaid ERD chuẩn cú pháp, render trực quan, không có lỗi.
- [ ] Lưu trữ chính xác tại `docs/SDLC/KT1/02_Database_Design_ERD.md`.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 02** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 02 | Thiết kế CSDL & Sơ đồ ERD Chuẩn | Hoàn thành | `docs/SDLC/KT1/02_Database_Design_ERD.md` | Đã hoàn thiện thiết kế 9 bảng CSDL và sơ đồ Mermaid ERD |
```
