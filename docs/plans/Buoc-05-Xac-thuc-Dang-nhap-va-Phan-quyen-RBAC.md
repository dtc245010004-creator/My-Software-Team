# BƯỚC 05: XÁC THỰC, ĐĂNG NHẬP & PHÂN QUYỀN RBAC (AUTHENTICATION & AUTHORIZATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-05-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, routers, dependencies).

---

## 1. Mục tiêu bước 5
- Xây dựng hệ thống xác thực người dùng an toàn bằng JWT (JSON Web Tokens) và mã hóa mật khẩu một chiều với `bcrypt`.
- Triển khai phân quyền theo vai trò (Role-Based Access Control - RBAC) chặt chẽ tại tầng Backend cho 3 nhóm người dùng:
  - `ADMIN` (Quản trị viên)
  - `WAREHOUSE_KEEPER` (Thủ kho)
  - `ACCOUNTANT` (Kế toán)

---

## 2. Nội dung công việc chi tiết

### 2.1. Model & Schemas Người dùng
- Model `User` (`app/models/user.py`):
  - `id`: Integer, Primary Key.
  - `username`: String, Unique, Indexed.
  - `password_hash`: String.
  - `full_name`: String.
  - `role`: Enum/String (`ADMIN`, `WAREHOUSE_KEEPER`, `ACCOUNTANT`).
  - `is_active`: Boolean, default True.
  - `created_at`: DateTime.
- Schemas (`app/schemas/user.py`):
  - `UserLogin`, `UserCreate`, `UserResponse`, `TokenResponse`.

### 2.2. Cơ chế Bảo mật & JWT
- `app/core/security.py`:
  - `verify_password(plain_password, hashed_password) -> bool`
  - `get_password_hash(password) -> str`
  - `create_access_token(data: dict, expires_delta: timedelta) -> str`
  - `decode_access_token(token: str) -> dict`

### 2.3. Endpoints Xác thực & Phân quyền
- Router `app/api/v1/endpoints/auth.py`:
  - `POST /api/v1/auth/login`: Nhận username/password $\rightarrow$ Kiểm tra $\rightarrow$ Cấp JWT Token.
  - `GET /api/v1/auth/me`: Trả về thông tin người dùng đang đăng nhập.
- Dependencies (`app/api/deps.py`):
  - `get_current_user`: Trích xuất token từ header `Authorization: Bearer <token>`, giải mã và tìm user trong DB.
  - `require_roles(["ADMIN", "WAREHOUSE_KEEPER"])`: Kiểm tra `current_user.role`, trả về HTTP 403 Forbidden nếu không đủ quyền.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
backend/
├── app/
│   ├── core/
│   │   └── security.py                # Hash bcrypt & sinh/giải mã JWT token
│   ├── models/
│   │   └── user.py                    # SQLAlchemy Model User
│   ├── schemas/
│   │   └── user.py                    # Pydantic Schemas User & Token
│   ├── api/
│   │   ├── deps.py                    # Dependencies: get_current_user, require_roles
│   │   └── v1/
│   │       └── endpoints/
│   │           ├── __init__.py
│   │           └── auth.py            # Routers /login, /me, /users
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Mật khẩu không bao giờ lưu dưới dạng plain text; 100% mật khẩu được băm qua `bcrypt`.
- [ ] API trả về lỗi HTTP 401 khi token sai hoặc hết hạn; trả về HTTP 403 khi gọi API vượt quyền.
- [ ] Test thành công chức năng đăng nhập và lấy thông tin tài khoản qua Swagger UI.

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 05** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 05 | Xác thực, Đăng nhập & Phân quyền RBAC | Hoàn thành | `backend/app/api/v1/endpoints/auth.py`, `core/security.py` | Đã hoàn thiện xác thực JWT, hash bcrypt và phân quyền RBAC 3 vai trò |
```
