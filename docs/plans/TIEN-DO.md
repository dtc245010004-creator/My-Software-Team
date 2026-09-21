# NHẬT KÝ TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS TRACKER)
## Đề tài 07: Hệ thống quản lý kho có tích hợp AI

---

### QUY ĐỊNH VỀ RANH GIỚI TÀI LIỆU
- **`docs/plans/` (Kế hoạch & Nhiệm vụ)**: Chứa 11 file kế hoạch độc lập (`Buoc-01-...md` đến `Buoc-11-...md`) và file nhật ký tiến độ này. Đây là tài liệu điều phối quá trình phát triển (Internal Execution Plans).
- **`docs/SDLC/` (Sản phẩm bàn giao thật - Deliverables)**: Chứa toàn bộ hồ sơ kỹ thuật, báo cáo, thiết kế dùng để nộp bài và chấm thi theo 4 mốc của giảng viên (`KT1/`, `KT2/`, `KT3/`, `final/`).

---

### BẢNG THEO DÕI TIẾN ĐỘ CHUẨN (PROGRESS MATRIX)

> **Hướng dẫn cập nhật:**
> - Định dạng ngày: `YYYY-MM-DD`
> - Quy ước trạng thái: `Chưa bắt đầu` | `Đang thực hiện` | `Hoàn thành` | `Cần xem xét`
> - Sau khi thực hiện xong bước nào, cập nhật đúng dòng tương ứng dưới đây, không tự ý thay đổi cấu trúc bảng.

| Ngày cập nhật | Mã bước | Tên bước thực hiện | Trạng thái | Sản phẩm bàn giao (Deliverables) đã sinh | Ghi chú / Đánh giá |
| :---: | :---: | :--- | :---: | :--- | :--- |
| 2026-09-20 | Bước 01 | Đặc tả Yêu cầu & Phân tích Nghiệp vụ | Chưa bắt đầu | `docs/SDLC/KT1/01_SRS_and_UseCases.md` | Khởi tạo tài liệu đặc tả SRS, Use Case |
| 2026-09-20 | Bước 02 | Thiết kế CSDL & Sơ đồ ERD Chuẩn | Chưa bắt đầu | `docs/SDLC/KT1/02_Database_Design_ERD.md` | Thiết kế 9 bảng, quan hệ, ràng buộc |
| 2026-09-20 | Bước 03 | Cấu hình Môi trường, Docker & CSDL | Chưa bắt đầu | `.env.example`, `docker-compose.yml`, `Dockerfile` | SQLite / PostgreSQL, Dockerization |
| 2026-09-20 | Bước 04 | Cấu trúc Backend & Database Session | Chưa bắt đầu | `backend/app/main.py`, `core/database.py`, `core/config.py` | FastAPI phân tầng, middleware, error handlers |
| 2026-09-20 | Bước 05 | Xác thực, Đăng nhập & Phân quyền RBAC | Chưa bắt đầu | `backend/app/api/v1/endpoints/auth.py`, `core/security.py` | JWT, bcrypt, 3 vai trò (Admin, Thủ kho, Kế toán) |
| 2026-09-20 | Bước 06 | Module Hàng hóa, Nhóm hàng & Nhà cung cấp | Chưa bắt đầu | `backend/app/models/product.py`, `api/v1/endpoints/products.py` | CRUD Master data, min_stock, unit |
| 2026-09-20 | Bước 07 | Module Nhập/Xuất kho & Thẻ kho (Transaction) | Chưa bắt đầu | `backend/app/services/inventory_service.py`, `models/stock_ledger.py` | ACID Transaction, chống tồn âm, Stock Ledger |
| 2026-09-20 | Bước 08 | Module AI Trợ lý & Scheduler Quét tồn kho | Chưa bắt đầu | `backend/app/services/ai_service.py`, `services/fallback_service.py` | Gemini API, Heuristic Fallback, 3 bài toán AI |
| 2026-09-20 | Bước 09 | Xây dựng Frontend Web (React + Tailwind) | Chưa bắt đầu | `frontend/src/App.jsx`, `pages/Dashboard.jsx`, `pages/...` | SPA Dashboard, quản lý kho, màn hình AI |
| 2026-09-20 | Bước 10 | Viết Bộ Test Tự động (Pytest) & Seed Data | Chưa bắt đầu | `backend/tests/test_stock_transactions.py`, `backend/seed_data.py` | Unit test tồn âm, transaction, seed data 60 ngày |
| 2026-09-20 | Bước 11 | Đóng gói, Tài liệu SDLC & Kịch bản Demo | Chưa bắt đầu | `README.md`, `docs/SDLC/final/...`, `docs/SDLC/KT2/...` | Hoàn thiện tài liệu 4 mốc KT1-KT3, Cuối kỳ |
