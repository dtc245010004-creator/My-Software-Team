# Bản đồ mã nguồn

> **File này bắt buộc cập nhật mỗi khi thêm, xóa hoặc đổi vai trò một file.**
> Xem `CLAUDE.md §11` — trigger "thêm/xóa/đổi vai trò file bất kỳ" → cập nhật ngay lập tức.

**Cập nhật lần cuối:** 2026-09-21

---

## Hiện có

### Gốc dự án

| File | Vai trò |
|---|---|
| `de_tai_07.md` | Đề bài gốc của giảng viên — **KHÔNG SỬA** |
| `Prompt.md` | Đặc tả hợp nhất đầy đủ — nguồn sự thật về nghiệp vụ và kỹ thuật |
| `CLAUDE.md` | Hướng dẫn hành vi agent, quy trình làm việc, quy ước toàn dự án |
| `README.md` | Nhật ký vận hành phiên làm việc — hướng dẫn mở/đóng phiên cho người dùng |

### `docs/`

| File | Vai trò |
|---|---|
| `docs/codebase-map.md` | File này — bản đồ mã nguồn, bắt buộc cập nhật khi có thay đổi file |
| `docs/MASTER-ROADMAP.md` | Bức tranh toàn cảnh 8 giai đoạn — điều hướng sang Buoc-NN.md; xem §11 về nguồn sự thật |
| `docs/implementation_plan.md` | Phân tích yêu cầu chi tiết và kế hoạch triển khai ban đầu |
| `docs/plans/TIEN-DO.md` | Nhật ký tiến độ — **nguồn sự thật về trạng thái** (tick ở đây là chính thức) |
| `docs/plans/Buoc-01-*.md` | Kế hoạch Bước 01: Đặc tả yêu cầu & Phân tích nghiệp vụ |
| `docs/plans/Buoc-02-*.md` | Kế hoạch Bước 02: Thiết kế CSDL & ERD |
| `docs/plans/Buoc-03-*.md` | Kế hoạch Bước 03: Cấu hình môi trường Docker & CSDL |
| `docs/plans/Buoc-04-*.md` | Kế hoạch Bước 04: Cấu trúc Backend & Database Session |
| `docs/plans/Buoc-05-*.md` | Kế hoạch Bước 05: Xác thực, đăng nhập & RBAC |
| `docs/plans/Buoc-06-*.md` | Kế hoạch Bước 06: Module Hàng hóa, Nhóm hàng & NCC |
| `docs/plans/Buoc-07-*.md` | Kế hoạch Bước 07: Module Nhập/Xuất kho & Thẻ kho ACID |
| `docs/plans/Buoc-08-*.md` | Kế hoạch Bước 08: Module AI Trợ lý & Scheduler |
| `docs/plans/Buoc-09-*.md` | Kế hoạch Bước 09: Frontend React + Tailwind |
| `docs/plans/Buoc-10-*.md` | Kế hoạch Bước 10: Bộ Test Pytest & Seed Data |
| `docs/plans/Buoc-11-*.md` | Kế hoạch Bước 11: Đóng gói, tài liệu SDLC & Demo |
| `docs/SDLC/KT1/README.md` | Mục tiêu & danh mục deliverable giai đoạn KT1 (chưa có nội dung) |
| `docs/SDLC/KT2/README.md` | Mục tiêu & danh mục deliverable giai đoạn KT2 (chưa có nội dung) |
| `docs/SDLC/KT3/README.md` | Mục tiêu & danh mục deliverable giai đoạn KT3 (chưa có nội dung) |
| `docs/SDLC/final/README.md` | Mục tiêu & danh mục deliverable giai đoạn Cuối kỳ (chưa có nội dung) |

### `backend/` — scaffold Giai đoạn 0 (chưa có nghiệp vụ)

| File | Vai trò |
|---|---|
| `backend/requirements.txt` | Danh sách Python dependencies (FastAPI, SQLAlchemy, pydantic-settings, jose, passlib, google-generativeai, pytest, httpx) |
| `backend/.env.example` | Mẫu biến môi trường — copy thành `.env` trước khi chạy |
| `backend/app/main.py` | Điểm vào FastAPI: khởi tạo app, CORS middleware, endpoint `/` và `/health` |
| `backend/app/__init__.py` | Package marker |
| `backend/app/core/config.py` | Pydantic Settings — đọc `.env`, export `settings` singleton |
| `backend/app/core/database.py` | SQLAlchemy engine + SessionLocal + `get_db()` dependency |
| `backend/app/api/__init__.py` | Package marker |
| `backend/app/api/v1/__init__.py` | Package marker — router sẽ đăng ký tại đây |
| `backend/app/models/__init__.py` | Package marker — ORM models sẽ import ở đây |
| `backend/app/schemas/__init__.py` | Package marker — Pydantic schemas sẽ import ở đây |
| `backend/app/services/__init__.py` | Package marker — business logic sẽ import ở đây |
| `backend/tests/__init__.py` | Package marker — pytest test files sẽ thêm vào đây |

### `frontend/` — scaffold Giai đoạn 0 (placeholder UI)

| File | Vai trò |
|---|---|
| `frontend/index.html` | Entry HTML cho Vite |
| `frontend/package.json` | Node dependencies: react 18, lucide-react, axios; devDeps: vite, tailwindcss |
| `frontend/vite.config.js` | Vite config (React plugin, proxy `/api` → backend) |
| `frontend/postcss.config.js` | PostCSS config cho Tailwind |
| `frontend/tailwind.config.js` | Tailwind config |
| `frontend/src/main.jsx` | React root — mount `<App />` vào `#root` |
| `frontend/src/index.css` | Tailwind directives + base styles |
| `frontend/src/App.jsx` | Placeholder "Scaffolding Ready" — sẽ thay bằng router + layout ở Giai đoạn 6 |

---

## Chưa có — sẽ thêm theo giai đoạn

| File | Sẽ tạo ở Giai đoạn |
|---|:---:|
| `backend/app/models/*.py`  | 1 |
| `backend/app/schemas/*.py` | 2 |
| `backend/app/core/security.py` | 2 |
| `backend/app/api/v1/endpoints/auth.py` | 2 |
| `backend/app/api/v1/endpoints/products.py` | 2 |
| `backend/app/api/v1/endpoints/suppliers.py` | 2 |
| `backend/app/services/inventory_service.py` | 3 |
| `backend/app/api/v1/endpoints/import_notes.py` | 3 |
| `backend/app/api/v1/endpoints/export_notes.py` | 3 |
| `backend/app/api/v1/endpoints/reports.py` | 3 |
| `backend/app/services/ai_service.py` | 4 |
| `backend/app/services/fallback_service.py` | 4 |
| `backend/app/api/v1/endpoints/ai.py` | 4 |
| `backend/tests/conftest.py` | 5 |
| `backend/tests/test_stock_transactions.py` | 5 |
| `backend/tests/test_ai.py` | 5 |
| `backend/seed_data.py` | 5 |
| `frontend/src/context/AuthContext.jsx` | 6 |
| `frontend/src/services/api.js` | 6 |
| `frontend/src/pages/Login.jsx` | 6 |
| `frontend/src/pages/Dashboard.jsx` | 6 |
| `frontend/src/pages/Products.jsx` | 6 |
| `frontend/src/pages/Suppliers.jsx` | 6 |
| `frontend/src/pages/Imports.jsx` | 6 |
| `frontend/src/pages/Exports.jsx` | 6 |
| `frontend/src/pages/Reports.jsx` | 6 |
| `frontend/src/pages/AIAssistant.jsx` | 6 |
| `docs/SDLC/KT1/01_SRS_and_UseCases.md` | 1 |
| `docs/SDLC/KT1/02_Database_Design_ERD.md` | 1 |
| `docs/SDLC/KT1/03_AI_Architecture_and_Prompts.md` | 1 |
| `docs/SDLC/KT1/04_Wireframes.md` | 1 |
| `docs/SDLC/KT2/01_API_Specifications.md` | 2 |
| `docs/SDLC/KT2/02_Transaction_Design_and_Negative_Stock_Prevention.md` | 3 |
| `docs/SDLC/KT2/03_AI_Assisted_Development_Evidence.md` | 3 |
| `docs/SDLC/KT3/01_Prompt_Engineering_and_Evaluation.md` | 4 |
| `docs/SDLC/KT3/02_Test_Plan_and_Results.md` | 5 |
| `docs/SDLC/KT3/03_AI_Integration_Architecture.md` | 4 |
| `docs/SDLC/final/01_Final_Technical_Report.md` | 7 |
| `docs/SDLC/final/02_User_Guide_and_Demo_Script.md` | 7 |
| `docs/SDLC/final/03_Presentation_Slides.md` | 7 |
| `README.md` *(sẽ thay thành hướng dẫn cài đặt thật)* | 7 |
