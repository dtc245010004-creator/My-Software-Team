# BƯỚC 06: MODULE HÀNG HÓA, NHÓM HÀNG & NHÀ CUNG CẤP (MASTER DATA)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-06-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, endpoints).

---

## 1. Mục tiêu bước 6
- Xây dựng các chức năng CRUD cho dữ liệu nền tảng của kho: Nhóm hàng (Categories), Hàng hóa (Products), Nhà cung cấp (Suppliers).
- Tích hợp logic tìm kiếm, lọc theo danh mục và tự động tính cờ cảnh báo hàng dưới mức tồn tối thiểu (`is_low_stock`).
- Đảm bảo tính toàn vẹn dữ liệu: mã SKU duy nhất, đơn vị tính chuẩn, số lượng $\ge 0$.

---

## 2. Nội dung công việc chi tiết

### 2.1. Models CSDL
- `app/models/category.py`: `id`, `code`, `name`, `description`.
- `app/models/product.py`:
  - `id`, `code` (SKU duy nhất), `name`, `category_id` (FK), `unit`, `min_stock`, `current_stock`, `standard_price`, `status`, `created_at`.
  - Ràng buộc: `CHECK (current_stock >= 0)`.
- `app/models/supplier.py`: `id`, `code`, `name`, `phone`, `email`, `address`, `is_active`.

### 2.2. Schemas Xác thực (Pydantic v2)
- `app/schemas/category.py`: `CategoryCreate`, `CategoryUpdate`, `CategoryResponse`.
- `app/schemas/product.py`: `ProductCreate`, `ProductUpdate`, `ProductResponse` (bổ sung thuộc tính tính toán `is_low_stock: bool`).
- `app/schemas/supplier.py`: `SupplierCreate`, `SupplierUpdate`, `SupplierResponse`.

### 2.3. Endpoints RESTful API
- `app/api/v1/endpoints/categories.py`: CRUD nhóm hàng hóa.
- `app/api/v1/endpoints/products.py`:
  - `GET /api/v1/products`: Hỗ trợ phân trang (`skip`, `limit`), tìm kiếm theo từ khóa tên/SKU, lọc theo `category_id`, lọc `is_low_stock=true`.
  - `POST /api/v1/products`: Thêm mới mặt hàng (chỉ Admin/Thủ kho).
  - `PUT /api/v1/products/{id}`: Cập nhật thông tin hàng hóa.
  - `DELETE /api/v1/products/{id}`: Xóa hoặc chuyển trạng thái sang `DISCONTINUED`.
- `app/api/v1/endpoints/suppliers.py`: CRUD nhà cung cấp.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
backend/
├── app/
│   ├── models/
│   │   ├── category.py                # Model Nhóm hàng
│   │   ├── product.py                 # Model Hàng hóa
│   │   └── supplier.py                # Model Nhà cung cấp
│   ├── schemas/
│   │   ├── category.py                # Schemas Category
│   │   ├── product.py                 # Schemas Product
│   │   └── supplier.py                # Schemas Supplier
│   └── api/
│       └── v1/
│           └── endpoints/
│               ├── categories.py      # Routers danh mục
│               ├── products.py        # Routers hàng hóa & cảnh báo tồn
│               └── suppliers.py       # Routers nhà cung cấp
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Không thể tạo sản phẩm với mã SKU trùng lặp (trả về lỗi 400 rõ ràng).
- [ ] Bộ lọc `is_low_stock=true` trả về chính xác danh sách các mặt hàng có `current_stock <= min_stock`.
- [ ] Pydantic chặn đứng mọi yêu cầu nhập số lượng hoặc giá trị âm.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 06** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 06 | Module Hàng hóa, Nhóm hàng & Nhà cung cấp | Hoàn thành | `backend/app/models/product.py`, `api/v1/endpoints/products.py` | Đã hoàn thiện CRUD Nhóm hàng, Hàng hóa, Nhà cung cấp và API cảnh báo tồn |
```
