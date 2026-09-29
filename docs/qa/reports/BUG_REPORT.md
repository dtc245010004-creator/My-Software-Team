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

---

## 2. Rào cản kỹ thuật & môi trường (Environment Blockers)

1. **Thiếu kịch bản tự động hóa 1-lệnh (Run Script Orchestration)**: Chưa có file `docker-compose.yml` hoặc script PowerShell/Bash ở thư mục gốc để tự động dựng cả backend, frontend và database trong một lệnh duy nhất.
2. **Hạ tầng Staging Cloud chưa thiết lập**: Chưa có cấu hình Infrastructure as Code (`render.yaml`) để tự động đồng bộ mã nguồn lên môi trường chạy thử đám mây.
3. **Phụ thuộc API Key bên ngoài của AI**: Mô hình phân tích Gemini phụ thuộc vào `GEMINI_API_KEY`. (Hệ thống đã có cơ chế Heuristic Fallback tự động khi không có key, nên không gây gián đoạn hệ thống).

---

## 3. Khuyến nghị và kế hoạch khắc phục (Action Plan)

1. **Ưu tiên 1 (DevOps)**: Soạn thảo script `start.bat` / `run.ps1` và bộ cấu hình Docker để giảm thiểu thao tác thủ công khi chạy dự án.
2. **Ưu tiên 2 (Architecture)**: Nghiên cứu phương án triển khai máy chủ OCPP WebSocket độc lập (hoặc tích hợp qua thư viện Python `ocpp`) cho Giai đoạn tiếp theo.
3. **Ưu tiên 3 (QA)**: Tiếp tục duy trì tỷ lệ 100% PASS cho toàn bộ 84 test cases hiện tại trong suốt quá trình tái cấu trúc tài liệu.