# BƯỚC 04: CẤU TRÚC BACKEND, CẤU HÌNH & DATABASE SESSION (BACKEND FOUNDATION)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-04-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/`.

---

## 1. Mục tiêu bước 4
- Thiết lập nền tảng FastAPI theo mô hình kiến trúc phân tầng (Layered Architecture): `Routers -> Services -> Models -> Schemas`.
- Cấu hình quản lý phiên kết nối CSDL (SQLAlchemy Engine, SessionLocal, Dependency `get_db`).
- Thiết lập hệ thống Middleware (CORS) và bộ xử lý lỗi tập trung (Global Exception Handlers).
- Tự động khởi tạo cấu trúc bảng CSDL khi ứng dụng khởi chạy.

---

## 2. Nội dung công việc chi tiết

### 2.1. Cấu hình SQLAlchemy & Phiên làm việc CSDL
- `app/core/database.py`:
  - Tạo `engine` với cấu hình phù hợp (`check_same_thread=False` cho SQLite, connection pool cho PostgreSQL).
  - Khai báo `Base = declarative_base()`.
  - Hàm `get_db()` yield session và đảm bảo `db.close()` sau mỗi request.

### 2.2. Khởi tạo FastAPI App & Middleware
- `app/main.py`:
  - Khởi tạo `app = FastAPI(title=..., version=..., docs_url="/docs")`.
  - Cấu hình `CORSMiddleware` cho phép kết nối an toàn từ frontend React (`http://localhost:5173`).
  - Đăng ký Router chính `/api/v1`.

### 2.3. Bộ xử lý lỗi tập trung (Global Exception Handler)
- Bắt các lỗi phổ biến (`HTTPException`, `RequestValidationError`, `SQLAlchemyError`) và trả về định dạng JSON chuẩn:
  ```json
  {
    "success": false,
    "detail": "Thông báo lỗi tiếng Việt dễ hiểu",
    "error_code": "RESOURCE_NOT_FOUND"
  }
  ```

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                        # Điểm khởi chạy FastAPI, đăng ký middleware & routers
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py                  # Pydantic Settings đọc biến môi trường
│   │   └── database.py                # Engine, SessionLocal, get_db()
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       └── api.py                 # Gom các sub-routers vào API router v1
│   └── models/
│       └── __init__.py                # Import Base và các models để khởi tạo bảng
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Khởi động backend thành công bằng lệnh: `uvicorn app.main:app --reload`.
- [ ] Truy cập được trang Swagger UI tại `http://localhost:8000/docs` và thấy endpoint `/health` trả về `{"status": "healthy"}`.
- [ ] Session database mở và đóng tự động, không bị rò rỉ kết nối (connection leak).

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/h%E1%BB%87%20th%E1%BB%91ng%20qu%E1%BA%A3n%20l%C3%BD%20kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 04** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 04 | Cấu trúc Backend & Database Session | Hoàn thành | `backend/app/main.py`, `core/database.py`, `core/config.py` | Đã hoàn thiện cấu trúc FastAPI phân tầng, database session và global error handlers |
```
