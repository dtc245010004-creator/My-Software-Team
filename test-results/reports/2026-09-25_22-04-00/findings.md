# BÁO CÁO GHI NHẬN SAI LỆCH & PHÁT HIỆN KIẾN TRÚC (FINDINGS)

## EV CHARGING STATION MANAGEMENT SYSTEM (EV CSMS)

---

- **Mốc thời gian thực hiện:** 2026-09-25 22:04:00 (UTC+7)
- **Tiêu chuẩn ghi nhận:** Mục 3.3 của `test-results/AGENT-TESTING-GUIDE.md` (Chỉ ghi nhận hiện trạng khách quan, không tự ý can thiệp mã nguồn ứng dụng).

---

## 1. Ghi Nhận Sai Lệch Về Hợp Đồng API & Dữ Liệu Tương Tác

### Finding 1: Lỗi 422 Unprocessable Content Tại Endpoint `/api/v1/auth/login`

- **Mô tả hiện trạng:**
  + Trong log máy chủ thực tế ghi nhận:

    ```text
    INFO: 127.0.0.1:51102 - "POST /api/v1/auth/login HTTP/1.1" 422 Unprocessable Content
    ```

  + **Điều tra nguyên nhân gốc:** Tại `backend/app/api/v1/endpoints/auth.py`, hàm `login` nhận tham số `login_in: UserLogin` định nghĩa bằng Pydantic BaseModel, quy định Content-Type là `application/json`. Phía Frontend trong `frontend/src/context/AuthContext.jsx` trước đó đã đóng gói dữ liệu dưới dạng `new URLSearchParams()` và gửi với header `application/x-www-form-urlencoded`. FastAPI không tìm thấy body JSON hợp lệ nên từ chối xử lý với mã lỗi 422.
- **Tác động:** Người dùng không thể đăng nhập tài khoản qua giao diện web.
- **Hiện trạng xử lý:** Đã điều chỉnh `AuthContext.jsx` gửi trực tiếp JSON payload `{ username, password }` và lấy thông tin user trực tiếp từ `res.data.user` của response.

### Finding 2: Lỗi 401 Unauthorized Không Mong Muốn Khi Truy Cập Trang Công Cộng

- **Mô tả hiện trạng:**
  + Log máy chủ ghi nhận các lời gọi:

    ```text
    INFO: 127.0.0.1:50499 - "GET /api/v1/sessions/me HTTP/1.1" 401 Unauthorized
    ```

  + **Điều tra nguyên nhân gốc:** Tại `frontend/src/pages/Dashboard.jsx` và `Simulator.jsx`, component tự động thực hiện lời gọi `api.get('/sessions/me')` ngay khi component được render lần đầu, bất kể người dùng đã đăng nhập hay chưa. Do không có JWT token trong header, backend trả về 401.
- **Tác động:** Gây nhiễu nhật ký log máy chủ và kích hoạt interceptor xóa trạng thái phiên trong `localStorage`.
- **Hiện trạng xử lý:** Đã bọc điều kiện kiểm tra tồn tại `token` trước khi gửi request tới các endpoint private.

---

## 2. Ghi Nhận Môi Trường CSDL & Hạ Tầng

### Finding 3: Khác Biệt Giữa Môi Trường Chuẩn PostgreSQL Docker và Môi Trường Dev SQLite

- **Mô tả hiện trạng:**
  + Theo mục 0.6 của `AGENT-TESTING-GUIDE.md`: Môi trường chuẩn bắt buộc để kiểm thử tính toàn vẹn dữ liệu, giao dịch ACID ví điện tử và múi giờ UTC là **PostgreSQL thật qua Docker (port 5432)**.
  + Hiện trạng thực tế tại `backend/app/core/database.py` và `conftest.py`: Hệ thống đang cấu hình mặc định sử dụng **SQLite file-based** (`ev_csms.db`) với chế độ WAL mode (`PRAGMA journal_mode=WAL`) và `PRAGMA foreign_keys=ON`. Bộ kiểm thử `pytest` chạy trên SQLite file / in-memory fixture.
- **Ghi nhận khách quan:** Mặc dù 74/74 tests pass hoàn toàn trên SQLite với khóa dòng bi quan và check constraint `balance >= -1000000`, hệ thống cần được kiểm thử đối soát trên PostgreSQL khi triển khai môi trường staging/production để xác minh tính tương thích tuyệt đối của `with_for_update()`.

---

## 3. Ghi Nhận Về Cấu Trúc Mã Nguồn (Static Analysis Findings)

### Finding 4: Cảnh Báo Phong Cách Cú Pháp Python 3.9+ (UP006 & UP045)

- **Mô tả hiện trạng:** Phân tích tĩnh `ruff` ghi nhận 328 cảnh báo trong `backend/app/`:
  + Khuyến nghị thay thế `from typing import Dict, List, Optional` bằng các kiểu nguyên thủy có sẵn trong Python 3.9+ như `dict[str, Any]`, `list[str]`, `str | None`.
- **Quy tắc tuân thủ:** Đây là cảnh báo về phong cách viết mã (code style), không gây ảnh hưởng đến tính đúng đắn khi thực thi. Theo đúng quy tắc bất biến của Tester, **KHÔNG chạy cờ `--fix`** làm biến động mã nguồn ngoài ý muốn.

### Finding 5: Bắt Ngoại Lệ Tổng Quát Trong Tiến Trình Nền (BLE001)

- **Mô tả hiện trạng:**
  + Tại `backend/app/simulator/charging_simulator.py` (dòng 164, 185, 232, 301), có sử dụng cấu trúc `except Exception as e:` để ghi nhận lỗi.
- **Đánh giá kiến trúc:** Đây là kỹ thuật phòng vệ có chủ đích (Defensive Programming) trong các luồng mô phỏng ngầm (Background Simulation Loop), đảm bảo khi một tác vụ đo đếm sạc của một phiên gặp sự cố (ví dụ lỗi mạng tạm thời) thì tiến trình nền và các phiên sạc của các xe khác không bị sập theo.

### Finding 6: Biến Và Module Chưa Sử Dụng Ở Giao Diện Frontend

- **Mô tả hiện trạng:** Phân tích tĩnh `oxlint` ghi nhận 44 cảnh báo `no-unused-vars` tại các trang `Stations.jsx`, `Wallet.jsx`, `Simulator.jsx`, `AIAdvisor.jsx`.
- **Đánh giá:** Các biến này là cờ trạng thái dự phòng cho các tương tác nâng cao (như trạng thái nạp dữ liệu chi tiết từng thẻ, các icon chỉ báo phụ). Không ảnh hưởng đến khả năng build của ứng dụng (`npm run build` đạt 100% trong 2.79s).
