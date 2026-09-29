# BƯỚC 11: BỘ TEST TỰ ĐỘNG, SEED DATA & ĐÓNG GÓI TÀI LIỆU SDLC (TESTING & PACKAGING)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-11-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/tests/`, `backend/seed_data.py`.
> - Sản phẩm bàn giao: `docs/SDLC/KT3/03_Test_Plan_and_Results.md`, `docs/SDLC/final/...`.

---

## 1. Mục tiêu bước 11

- Xây dựng bộ kiểm thử tự động toàn diện bằng `pytest` cho Backend:
  + Kiểm thử giao dịch ACID trừ tiền ví: Kiểm tra số dư không thể bị âm khi gặp tranh chấp đồng thời hoặc số dư không đủ.
  + Kiểm thử trạng thái độc quyền cổng sạc: Chặn tuyệt đối việc tạo 2 phiên sạc đồng thời trên cùng một cổng.
  + Kiểm thử thuật toán chia tải và cơ chế Fallback Heuristic khi Gemini API offline.
- Xây dựng script `backend/seed_data.py` nạp dữ liệu mẫu sinh động:
  + 3 trạm sạc thực tế (Hà Nội, Đà Nẵng, TP.HCM) kèm tọa độ GPS.
  + 8 trụ sạc công suất từ 22kW AC đến 150kW DC, trạng thái đa dạng.
  + 15 khách hàng lái xe điện kèm ví tiền có sẵn số dư.
  + Lịch sử hơn 50 phiên sạc trong 30 ngày qua với thông số đo đếm thực tế để demo biểu đồ.
- Đóng gói tài liệu bàn giao mốc Cuối kỳ (`docs/SDLC/final/`): Báo cáo kỹ thuật tổng kết, Hướng dẫn chạy 1 nút nhấn và Kịch bản demo thuyết trình bảo vệ trước hội đồng.

---

## 2. Nội dung công việc chi tiết

### 2.1. Bộ Kiểm thử Tự động (Pytest)

- `backend/tests/conftest.py`: Cấu hình SQLite in-memory, override `get_db` fixture, tạo tài khoản test (Admin, Operator, Customer).
- `backend/tests/test_wallet_acid.py`:
  + Test nạp tiền thành công.
  + Test trừ tiền với số dư đủ.
  + Test trừ tiền khi số dư thiếu $\rightarrow$ Bắt buộc ném `HTTP 400 InsufficientBalance` và rollback hoàn toàn, số dư nguyên vẹn.
  + Test mô phỏng giao dịch đồng thời (Concurrent deduction).
- `backend/tests/test_sessions.py`:
  + Test bắt đầu sạc khi cổng `AVAILABLE`.
  + Test chặn bắt đầu sạc khi cổng đang `CHARGING`.
  + Test tự động ngắt sạc khi ví hết tiền.
- `backend/tests/test_ai_fallback.py`:
  + Mock ngắt kết nối Gemini API $\rightarrow$ Xác nhận `fallback_service` tự động tiếp quản, chia tải chính xác theo tỷ lệ công suất định mức.

### 2.2. Script Seed Data Chân thực

- `backend/seed_data.py`:
  + Tạo tài khoản mẫu:
    - Admin: `admin` / `admin123`
    - CPO: `operator` / `operator123`
    - Driver: `driver` / `driver123` (ví có sẵn 200,000 VND)
  + Tạo 3 trạm sạc:
    - Trạm Sạc Vincom Center (Hà Nội) - Công suất nguồn 250 kW
    - Trạm Sạc Cầu Rồng (Đà Nẵng) - Công suất nguồn 180 kW
    - Trạm Sạc Landmark 81 (TP.HCM) - Công suất nguồn 300 kW
  + Tạo các trụ sạc AC 22kW, DC Fast 60kW, DC Ultra-Fast 150kW.
  + Tạo biểu giá TOU chuẩn và nạp lịch sử phiên sạc 30 ngày.

### 2.3. Đóng gói Tài liệu SDLC & Kịch bản Demo

- `docs/SDLC/final/01_Final_Technical_Report.md`: Báo cáo tổng thể đồ án.
- `docs/SDLC/final/02_User_Guide_and_Demo_Script.md`: Kịch bản từng bước demo trực quan:
  1. Đăng nhập tài xế -> Tra cứu trạm -> Xem số dư ví.
  2. Mở màn hình Simulator -> Cắm súng sạc -> Bắt đầu sạc.
  3. Quan sát đồ thị Recharts nhảy thông số SoC %, công suất kW và tiền nhảy realtime qua WebSocket.
  4. Bấm dừng sạc -> Hóa đơn điện tử xuất hiện -> Ví trừ tiền chính xác.
  5. Đăng nhập CPO -> Xem Dashboard cập nhật doanh thu -> Mở AI Advisor xem gợi ý điều phối tải và cảnh báo bảo trì.
- `docs/SDLC/final/03_Presentation_Slides.md`: Dàn ý slide bảo vệ.

---

## 3. Cấu trúc file cần sinh

```text
backend/
├── tests/
│   ├── conftest.py
│   ├── test_wallet_acid.py
│   ├── test_sessions.py
│   └── test_ai_fallback.py
├── seed_data.py
docs/SDLC/final/
├── 01_Final_Technical_Report.md
├── 02_User_Guide_and_Demo_Script.md
└── 03_Presentation_Slides.md
```

---

## 4. Checklist thực hiện

- [x] Viết bộ test `tests/test_wallet_acid.py`, `tests/test_sessions.py`, `tests/test_ai_fallback.py`.
- [x] Chạy `pytest` xác nhận toàn bộ test cases màu xanh (74/74 passed 100%).
- [x] Viết `seed_data.py` và kiểm tra nạp dữ liệu thành công vào CSDL (3 trạm, 9 trụ, 18 cổng, 62 phiên).
- [x] Hoàn thiện các tài liệu mốc Cuối kỳ trong `docs/SDLC/final/` (01 Report, 02 Demo Script, 03 Slides).
- [x] Cập nhật trạng thái Bước 11 trong `docs/plans/TIEN-DO.md`.
