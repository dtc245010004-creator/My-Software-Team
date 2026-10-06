# BÁO CÁO LỖI VÀ RÀO CẢN MÔI TRƯỜNG (BUG REPORT) — CSMS

> **Loại tài liệu**: Nhật ký theo dõi khuyết tật & rào cản kỹ thuật (Defect & Blocker Tracking Log)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 16  
> **Quy tắc tuân thủ**: Ghi nhận trung thực các lỗi kỹ thuật phát sinh, rào cản môi trường và tiến độ xử lý; không che giấu các phần chưa hoàn thiện của Giai đoạn 1.

---

## 1. Danh mục lỗi đã xác nhận (Active Defects)

### BUG-01: Sai lệch hạn mức thấu chi giữa CSDL và Tầng Ứng dụng
* **Mức độ nghiêm trọng**: Severity 2 (Major).
* **Mô tả**: Ban đầu, `backend/app/models/wallet.py` đặt ràng buộc `CheckConstraint("balance >= -1000000")` (cho phép âm tới 1 triệu VND), trong khi `backend/app/core/config.py` đặt `NEGATIVE_BALANCE_LIMIT = -300000` VND (cho phép âm 300k). Mức chênh lệch 700.000 VND là quá lớn và tiềm ẩn rủi ro nợ xấu.
* **Biện pháp xử lý**: Đã điều chỉnh ràng buộc CSDL thành `CheckConstraint("balance >= -500000")` và cập nhật `MAX_SAFE_DEBT_LIMIT = -500000` trong `config.py`. Hệ thống hoạt động theo mô hình 2 tầng: khóa tài khoản ở mốc `-300.000` VND và CSDL chỉ cho phép tràn an toàn tối đa 200.000 VND khi phiên sạc kết thúc đột ngột.
* **Trạng thái**: **RESOLVED / CLOSED** (Đã kiểm chứng qua `test_wallet_acid.py`).

### BUG-02: Thiếu thông báo lỗi khi tài khoản bị khóa nợ đăng nhập vào hệ thống
* **Mức độ nghiêm trọng**: Severity 3 (Moderate).
* **Mô tả**: Khi tài khoản có cờ `is_debt_locked == True` do nợ quá -300.000 VND, hệ thống vẫn cấp token JWT hoặc chỉ trả lỗi chung chung không nêu rõ nguyên nhân bị khóa nợ.
* **Biện pháp xử lý**: 
  - Tại `backend/app/api/v1/endpoints/auth.py`: Bổ sung kiểm tra cờ `wallet.is_debt_locked`, ném ngoại lệ `HTTPException(status_code=403, detail="tài khoản bị khóa vì - quá 300k")`.
  - Tại `frontend/src/pages/Login.jsx`: Hiển thị thông báo lỗi màu đỏ nổi bật trên form đăng nhập khi nhận mã lỗi 403.
  - Đã bổ sung ca kiểm thử `test_login_debt_locked_shows_error` trong `test_auth.py`.
* **Trạng thái**: **RESOLVED / CLOSED** (Đã kiểm chứng qua test tự động và giao diện).

### BUG-03: Trụ sạc chưa hỗ trợ kết nối phần cứng thật qua giao thức WebSocket OCPP 1.6J
* **Mức độ nghiêm trọng**: Severity 2 (Major / Architecture Gap).
* **Mô tả**: Tiêu chí nghiệm thu AC3 của Story S-05 yêu cầu trụ sạc kết nối với CSMS qua giao thức chuẩn OCPP. Hiện tại, hệ thống mới chỉ hỗ trợ bộ mô phỏng phần mềm nội tại (`charging_simulator.py`) mà chưa có máy chủ WebSocket đón nhận gói tin trực tiếp từ trụ sạc phần cứng vật lý ngoài thực địa.
* **Biện pháp xử lý**: Đã thực hiện spike kỹ thuật K-01 và lập báo cáo giải trình gửi Product Owner ([docs/research/S-05-AC3-ghi-nhan-cho-PO.md](../research/S-05-AC3-ghi-nhan-cho-PO.md)) để dời việc ghép nối phần cứng sang giai đoạn tiếp theo.
* **Trạng thái**: **DEFERRED / TRACKED AS SPIKE GAP**.

### BUG-04: Cổng thanh toán trực tuyến ngân hàng chưa tích hợp Webhook IPN thật
* **Mức độ nghiêm trọng**: Severity 3 (Moderate / Deferred Scope).
* **Mô tả**: Chức năng nạp tiền ví điện tử hiện tại hoạt động dựa trên API nội bộ mô phỏng giao dịch thành công ngay lập tức (`/api/v1/wallet/topup`), chưa kết nối cổng thanh toán thật (VNPay/Momo/ZaloPay) với cơ chế chữ ký số bảo mật và IPN Webhook bất đồng bộ.
* **Biện pháp xử lý**: Ghi nhận phạm vi Giai đoạn 1 chấp nhận mock nạp tiền để kiểm thử tính nguyên tử ACID của số dư ví.
* **Trạng thái**: **DEFERRED / PLANNED FOR FUTURE PHASE**.

### BUG-05: Nguy cơ rò rỉ dữ liệu vận hành giữa các CPO (Multi-tenancy IDOR Gap)
* **Mức độ nghiêm trọng**: Severity 3 (Moderate).
* **Mô tả**: Một số API tra cứu trạm sạc công khai trả về toàn bộ thông tin trạm mà chưa phân nhóm chặt chẽ theo từng đơn vị vận hành CPO độc lập. Mặc dù các API cập nhật/xóa đã có kiểm tra quyền sở hữu IDOR (`test_idor_station_level_forbidden`), nhưng tầng dữ liệu cần được cách ly triệt để hơn.
* **Biện pháp xử lý**: Đã kiểm tra chặn IDOR ở các endpoint nhạy cảm (CPO A không thể sửa trạm của CPO B); tiếp tục theo dõi và siết chặt ở Giai đoạn 2.
* **Trạng thái**: **MONITORING / MITIGATED VIA RBAC TESTS**.

### BUG-06: Nút Admin Demo 1-Click dùng mật khẩu không khớp dữ liệu seed
* **Mức độ nghiêm trọng**: Severity 3 (Moderate).
* **Mô tả**: `AuthContext.quickSwitch()` gửi mật khẩu `AdminPass123`, trong khi tài khoản `admin` trong cấu hình seed đang dùng `12345678a`, khiến nút Admin báo tài khoản demo chưa khởi tạo.
* **Biện pháp xử lý**: Đồng bộ `DEMO_USERS.ADMIN.password` với mật khẩu seed và để `quickSwitch()` đọc username/mật khẩu từ cấu hình này. Sau 5 lần thử sai, tài khoản demo bị khóa tạm; đã xóa bộ đếm và thời điểm khóa cho tài khoản `admin`. Thông báo frontend nay hiển thị chi tiết lỗi API.
* **Trạng thái**: **FIXED IN SOURCE / FRONTEND DOCKER REBUILT / LOGIN API VERIFIED (200, ADMIN)**.

### BUG-07: Migration lịch sử tạo trùng cột `charging_points.last_seen_at` khi nâng cấp DB trống
* **Mức độ nghiêm trọng**: Severity 2 (Major / Migration Blocker).
* **Mô tả**: Chạy Alembic upgrade toàn chuỗi trên SQLite DB trống thất bại ở revision `5ba0e05433d7` với `sqlite3.OperationalError: duplicate column name: last_seen_at`; cột đã được thêm trước đó trong chuỗi migration. Do đó chưa thể xác nhận nâng cấp mới từ DB trống bằng đường chạy chuẩn.
* **Bằng chứng / phạm vi**: Tái hiện trên DB tạm ngày 05/10/2026; không chạy trên DB dự án. Migration MeterValues `4a0a1107f87d` đã xác nhận upgrade/downgrade trên DB tạm được stamp tại head hiện tại.
* **Trạng thái**: **OPEN / REPRODUCED**.

---

## 2. Rào cản kỹ thuật & môi trường (Environment Blockers)

1. **Thiếu kịch bản tự động hóa 1-lệnh (Run Script Orchestration)**: Chưa có file `docker-compose.yml` hoặc script PowerShell/Bash ở thư mục gốc để tự động dựng cả backend, frontend và database trong một lệnh duy nhất.
2. **Hạ tầng Staging Cloud chưa thiết lập**: Chưa có cấu hình Infrastructure as Code (`render.yaml`) để tự động đồng bộ mã nguồn lên môi trường chạy thử đám mây.
3. **Phụ thuộc API Key bên ngoài của AI**: Mô hình phân tích Gemini phụ thuộc vào `GEMINI_API_KEY`. (Hệ thống đã có cơ chế Heuristic Fallback tự động khi không có key, nên không gây gián đoạn hệ thống).

---

## 3. Khuyến nghị và kế hoạch khắc phục (Action Plan)

1. **Ưu tiên 1 (DevOps)**: Soạn thảo script `start.bat` / `run.ps1` và bộ cấu hình Docker để giảm thiểu thao tác thủ công khi chạy dự án.
2. **Ưu tiên 2 (Architecture)**: Nghiên cứu phương án triển khai máy chủ OCPP WebSocket độc lập (hoặc tích hợp qua thư viện Python `ocpp`) cho Giai đoạn tiếp theo.
3. **Ưu tiên 3 (QA)**: Duy trì kiểm thử dựa trên bằng chứng; tổng lịch sử 84/89/90 ca còn mâu thuẫn `[CẦN XÁC NHẬN]`. Full backend suite hiện đạt 158 passed, 1 warning ngày 01/10/2026.
