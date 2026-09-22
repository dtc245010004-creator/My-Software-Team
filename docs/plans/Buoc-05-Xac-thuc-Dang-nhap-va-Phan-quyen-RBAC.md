# BƯỚC 05: XÁC THỰC, ĐĂNG NHẬP & PHÂN QUYỀN RBAC (AUTHENTICATION & AUTHORIZATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-05-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, routers, dependencies).

---

## 1. Mục tiêu bước 5
- Xây dựng hệ thống xác thực người dùng an toàn bằng JWT (JSON Web Tokens) và mã hóa mật khẩu một chiều với `bcrypt`.
- Tự động tạo ví điện tử (`Wallet`) số dư 0 VND cho người dùng mới khi đăng ký.
- Triển khai phân quyền theo vai trò (Role-Based Access Control - RBAC) chặt chẽ tại tầng Backend cho 3 nhóm người dùng:
  - `ADMIN` (Quản trị viên toàn hệ thống)
  - `OPERATOR` (Đơn vị vận hành trạm sạc / CPO)
  - `CUSTOMER` (Khách hàng lái xe điện)

---

## 2. Nội dung công việc chi tiết

### 2.1. Model & Schemas Người dùng
- Model `User` (`app/models/user.py`):
  - `id`: Integer, Primary Key.
  - `username`: String, Unique, Indexed.
  - `email`: String, Unique, Indexed.
  - `password_hash`: String.
  - `full_name`: String.
  - `role`: Enum/String (`ADMIN`, `OPERATOR`, `CUSTOMER`).
  - `is_active`: Boolean, default True.
  - `created_at`: DateTime.
  - Relationship với `Wallet`.
- Schemas (`app/schemas/user.py`):
  - `UserLogin`, `UserRegister`, `UserResponse`, `TokenResponse`.

### 2.2. Cơ chế Bảo mật & JWT
- `app/core/security.py`:
  - `verify_password(plain_password, hashed_password) -> bool`
  - `get_password_hash(password) -> str`
  - `create_access_token(data: dict, expires_delta: timedelta) -> str`
  - `decode_access_token(token: str) -> dict`

### 2.3. Endpoints Xác thực & Phân quyền
- Router `app/api/v1/endpoints/auth.py`:
  - `POST /api/v1/auth/register`: Đăng ký tài khoản (tự động tạo Wallet đi kèm).
  - `POST /api/v1/auth/login`: Nhận username/password $\rightarrow$ Cấp JWT Token.
  - `GET /api/v1/auth/me`: Trả về thông tin người dùng và số dư ví.
- Dependencies (`app/api/deps.py`):
  - `get_current_user`: Trích xuất và giải mã JWT token.
  - `require_roles(["ADMIN", "OPERATOR"])`: Kiểm tra quyền hạn, trả về HTTP 403 Forbidden nếu không đủ quyền.

---

## 3. Cấu trúc file cần sinh
```text
backend/
├── app/
│   ├── core/
│   │   └── security.py                # Hash bcrypt & sinh/giải mã JWT
│   ├── models/
│   │   └── user.py                    # SQLAlchemy Model User
│   ├── schemas/
│   │   └── user.py                    # Schemas User & Token
│   ├── api/
│   │   ├── deps.py                    # Dependencies: get_current_user, require_roles
│   │   └── v1/endpoints/
│   │       └── auth.py                # API login, register, me
```

---

## 4. Bảng kiểm tra thực hiện & Trạng thái (Execution Checklist)

> **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét

| Hạng mục kiểm tra | Trạng thái | Đánh giá thực tế & Nguyên nhân trạng thái |
|---|:---:|---|
| **1. Mã hóa mật khẩu & JWT (`core/security.py`)** | ⬜ Chưa bắt đầu | Chuẩn bị cài đặt bcrypt và sinh/giải mã JWT Bearer Token. |
| **2. Model User & RBAC 3 vai trò** | ⬜ Chưa bắt đầu | Chuẩn bị tạo bảng `users` với role `admin`, `operator`, `customer`. |
| **3. Endpoints Auth (`/api/v1/auth`)** | ⬜ Chưa bắt đầu | Chuẩn bị viết API đăng ký, đăng nhập, lấy thông tin cá nhân `/me`. |
| **4. Cơ chế CPO Ownership Check (Dependency)** | ⬜ Chưa bắt đầu | Bắt buộc kiểm tra quyền sở hữu đa CPO theo yêu cầu bảo mật kiến trúc. |
| **5. Cập nhật tiến độ vào `docs/plans/TIEN-DO.md`** | ✅ Hoàn thành | Đã ghi nhận đúng tiến độ (Đạt 0% - Chưa bắt đầu). |
