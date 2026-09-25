# BƯỚC 05: XÁC THỰC, ĐĂNG NHẬP & PHÂN QUYỀN RBAC (AUTHENTICATION & AUTHORIZATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-05-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, routers, dependencies).

---

## 1. Mục tiêu bước 5

- Xây dựng hệ thống xác thực người dùng an toàn bằng JWT (JSON Web Tokens) và mã hóa mật khẩu một chiều với `bcrypt`.
- Tự động tạo ví điện tử (`Wallet`) số dư 0 VND cho người dùng mới khi đăng ký.
- Triển khai phân quyền theo vai trò (Role-Based Access Control - RBAC) chặt chẽ tại tầng Backend cho 3 nhóm người dùng:
  + `ADMIN` (Quản trị viên toàn hệ thống)
  + `OPERATOR` (Đơn vị vận hành trạm sạc / CPO)
  + `CUSTOMER` (Khách hàng lái xe điện)

---

## 2. Nội dung công việc chi tiết

### 2.1. Model & Schemas Người dùng

- Model `User` (`app/models/user.py`):
  + `id`: Integer, Primary Key.
  + `username`: String, Unique, Indexed.
  + `email`: String, Unique, Indexed.
  + `password_hash`: String.
  + `full_name`: String.
  + `role`: Enum/String (`ADMIN`, `OPERATOR`, `CUSTOMER`).
  + `is_active`: Boolean, default True.
  + `created_at`: DateTime.
  + Relationship với `Wallet`.
- Schemas (`app/schemas/user.py`):
  + `UserLogin`, `UserRegister`, `UserResponse`, `TokenResponse`.

### 2.2. Cơ chế Bảo mật & JWT

- `app/core/security.py`:
  + `verify_password(plain_password, hashed_password) -> bool`
  + `get_password_hash(password) -> str`
  + `create_access_token(data: dict, expires_delta: timedelta) -> str`
  + `decode_access_token(token: str) -> dict`

### 2.3. Endpoints Xác thực & Phân quyền

- Router `app/api/v1/endpoints/auth.py`:
  + `POST /api/v1/auth/register`: Đăng ký tài khoản (tự động tạo Wallet đi kèm).
  + `POST /api/v1/auth/login`: Nhận username/password $\rightarrow$ Cấp JWT Token.
  + `GET /api/v1/auth/me`: Trả về thông tin người dùng và số dư ví.
- Dependencies (`app/api/deps.py`):
  + `get_current_user`: Trích xuất và giải mã JWT token.
  + `require_roles(["ADMIN", "OPERATOR"])`: Kiểm tra quyền hạn, trả về HTTP 403 Forbidden nếu không đủ quyền.

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

## 4. Checklist thực hiện

- [x] Cài đặt `security.py` trực tiếp bằng `bcrypt` (work factor rounds=12) và JWT, loại bỏ hoàn toàn `passlib` cũ.
- [x] Cài đặt Model `User`, `Wallet`, Schema `UserRegister` (chính sách mật khẩu 8-72 bytes, chặn privilege escalation).
- [x] Bọc toàn bộ thao tác Đăng ký User + Tạo Wallet trong 1 Database Transaction nguyên tử (Atomic), rollback sạch sẽ khi lỗi.
- [x] Triển khai Dependencies RBAC (`get_current_user`, `require_roles`) kiểm tra vai trò tức thì từ CSDL.
- [x] Xây dựng bộ kiểm thử `backend/tests/test_auth.py` gồm 12 test cases function-scoped (SQLite in-memory) đạt 100% pass.
- [x] Cập nhật trạng thái Bước 05 trong `docs/plans/TIEN-DO.md`, `docs/codebase-map.md` và `docs/MASTER-ROADMAP.md`.

---

## 5. 📝 Cập nhật thực tế so với kế hoạch ban đầu (2026-09-25)

Trong quá trình thực thi, hệ thống đã điều chỉnh và bổ sung 7 điểm cấu trúc quan trọng nhằm khắc phục các rủi ro bảo mật và tương thích môi trường:

| # | Hạng mục thay đổi | So với mô tả ban đầu | Lý do kỹ thuật / Quyết định kiến trúc |
| :---: | --- | --- | --- |
| **1** | **Tạo sớm Model `Wallet`** | Ban đầu dự kiến để ở Bước 07 | Đảm bảo tính toán vẹn nguyên tử (Atomicity): Người dùng đăng ký bắt buộc phải có Ví số dư 0 VND ngay từ đầu bằng 1 Database Transaction duy nhất, tránh tình trạng User mồ côi ví hoặc code chắp vá. |
| **2** | **Dùng trực tiếp `bcrypt` thay vì `passlib`** | Ban đầu dùng `passlib[bcrypt]` | Môi trường Python 3.14.6 + `bcrypt >= 4.1.2` khiến `passlib` (đã ngừng bảo trì) ném ngoại lệ `AttributeError: module 'bcrypt' has no attribute '__about__'`. Chuyển sang gọi trực tiếp `bcrypt.hashpw` / `bcrypt.checkpw` vừa nhanh vừa loại bỏ deprecation warning. |
| **3** | **Cấu hình `BCRYPT_ROUNDS = 12`** | Ban đầu không có cấu hình work factor | Tránh hardcode magic number trong mã nguồn; đưa vào `app/core/config.py` để dễ dàng tinh chỉnh giữa môi trường dev (nhanh) và production (bảo mật cao). |
| **4** | **Chính sách mật khẩu 8-72 bytes** | Ban đầu chỉ kiểm tra tồn tại chuỗi | Thuật toán `bcrypt` có giới hạn cứng 72 bytes (dài hơn sẽ bị cắt âm thầm hoặc ném lỗi). Bổ sung Pydantic validator kiểm tra byte length $\le 72$ và regex yêu cầu tối thiểu cả chữ cái và chữ số. |
| **5** | **Chặn Privilege Escalation (Mass Assignment)** | Ban đầu chưa có cơ chế kiểm soát field `role` ở request body | Loại bỏ hoàn toàn trường `role` khỏi schema `UserRegister`, cấu hình `extra = "ignore"`, và gán cứng `role = "CUSTOMER"` tại tầng service. Quyền `ADMIN`/`OPERATOR` chỉ được cấp qua seed data nội bộ. |
| **6** | **Chống trễ quyền RBAC (Role Staleness)** | Ban đầu chỉ giải mã role tĩnh từ JWT claim | Dependency `get_current_user` giải mã token nhưng nạp trực tiếp bản ghi `User` từ CSDL theo PK `id`. Giúp triệt tiêu rủi ro trễ quyền 60 phút khi Admin đổi quyền hoặc khóa tài khoản `is_active = False`. |
| **7** | **Bộ Test tự động sớm (13 tests)** | Ban đầu toàn bộ test dồn về Bước 11 | Tuân thủ nguyên tắc *Goal-Driven Execution* (`GEMINI.md §4`): Dựng ngay `conftest.py` với SQLite in-memory (`StaticPool`), reset DB dạng `scope="function"` và viết đủ 12 test cases bảo mật cho Auth + 1 test cho Health check. |

