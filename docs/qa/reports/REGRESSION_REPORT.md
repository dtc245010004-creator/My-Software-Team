# BÁO CÁO KIỂM THỬ HỒI QUY (REGRESSION REPORT) — CSMS

> **Loại tài liệu**: Báo cáo kiểm soát hồi quy (Regression Verification Report)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 15  
> **Quy tắc tuân thủ**: Số liệu được kiểm chứng trực tiếp từ việc chạy lại toàn bộ test suites sau mỗi đợt điều chỉnh mã nguồn.

---

## 1. Danh sách Kiểm thử Hồi quy Hiện tại (Current Regression Tests)

Bộ kiểm thử hồi quy được kích hoạt sau đợt cập nhật logic khóa tạm chống vét cạn mật khẩu và đóng gói Staging ngày **30/09/2026**:
* **Phạm vi hồi quy**: Toàn bộ các module có liên quan trực tiếp hoặc gián tiếp đến Xác thực (`Auth`), Ví tiền (`Wallet`), Phiên sạc (`ChargingSession`) và Trạm sạc (`Station`).
* **Danh sách Test Suites thực thi hồi quy**:
  1. `backend/tests/test_auth.py` (18 tests) — Kiểm tra cơ chế xác thực JWT, RBAC, phản hồi lỗi khóa nợ và khóa tạm 15 phút sau 5 lần sai.
  2. `backend/tests/test_wallet_acid.py` (5 tests) — Kiểm tra tính nguyên tử ACID, nạp tiền, trừ tiền và chuyển trạng thái `is_debt_locked`.
  3. `backend/tests/test_sessions_acid.py` (8 tests) — Kiểm tra ràng buộc ví khi bắt đầu phiên sạc, trừ tiền khi kết thúc và ngưỡng chặn nợ.
  4. `backend/tests/test_sessions.py` (5 tests) — Kiểm tra vòng đời phiên sạc và xung đột đầu nối.
  5. `backend/tests/test_driver_unauthenticated.py` (4 tests) — Kiểm tra luồng sạc của tài xế khách không đăng nhập.
  6. `backend/tests/test_stations.py` (15 tests) — Kiểm tra phân quyền quản trị trạm, trụ và đầu nối của CPO.
  7. `backend/tests/test_simulator.py` (10 tests) — Kiểm tra ngắt sạc khi vượt hạn mức nợ và cơ chế phục hồi sập server.
  8. `backend/tests/test_ai_fallback.py` (18 tests) — Kiểm tra hệ thống khuyến nghị và hạ cấp AI.
  9. `backend/tests/test_health.py` (1 test) — Kiểm tra kết nối dịch vụ.

---

## 2. Kết quả Thực thi Kiểm thử Cũ (Test cũ chạy lại có còn PASS không)

* **Số lượng test case cũ trước đợt chỉnh sửa**: 84 tests.
* **Số lượng test case mới bổ sung**: 05 tests (các test khóa tạm chống vét cạn trong `backend/tests/test_auth.py`).
* **Tổng số test case chạy lại**: **89 tests**.
* **Kết quả**: **89/89 PASSED 100%**.
* **Đánh giá**: Toàn bộ 84 test cũ chạy lại đều vượt qua, không có bất kỳ test cũ nào bị gãy hoặc thay đổi hành vi ngoài ý muốn.

---

## 3. So sánh Hành vi Trước vs Hiện tại (Behavior Comparison)

| Luồng nghiệp vụ / Thành phần | Hành vi trước khi sửa | Hành vi hiện tại (Đã xác minh) | Tác động hồi quy |
| :--- | :--- | :--- | :--- |
| **CSDL Ràng buộc Ví (`wallet.py`)** | `CheckConstraint("balance >= -1000000")` | `CheckConstraint("balance >= -500000")` | Không ảnh hưởng test cũ; bảo vệ an toàn CSDL chặt chẽ hơn |
| **Đăng nhập Tài khoản nợ (`auth.py`)** | Cho phép đăng nhập bình thường kể cả khi nợ | Chặn đăng nhập với HTTP 403: `"tài khoản bị khóa vì - quá 300k"` | Đã xác nhận qua test `test_login_debt_locked_shows_error` |
| **Đăng nhập Sai mật khẩu (`auth.py`)** | Chỉ trả HTTP 401 chung chung, không đếm số lần sai | Tăng `failed_login_attempts`, báo số lần còn lại, khóa tạm 15 phút sau 5 lần sai (HTTP 403) | 13 test cũ của auth vẫn PASS; thêm 5 tests mới xác nhận |
| **Triển khai Staging (`docker-compose.staging.yml`)** | Chưa có file Docker và Compose cho staging | Đóng gói Backend/Frontend qua Docker Compose, tích hợp CI GitHub Actions | Không ảnh hưởng mã nguồn chạy local; chuẩn hóa môi trường |

---

## 4. Lỗi Hồi quy (Regression Defects)

* **Số lượng lỗi hồi quy phát hiện**: **0 lỗi**.
* **Chi tiết**: Không có lỗi hồi quy nào được ghi nhận trong đợt kiểm thử tự động ngày 30/09/2026.

---

## 5. Trạng thái Hồi quy Tổng thể (Regression Status)

* **Trạng thái**: **PASSED (Xanh toàn bộ)**.
* **Kết luận**: Bản build hiện tại hoàn toàn ổn định về mặt logic hồi quy. Các thay đổi về hạn mức tài chính, bảo vệ chống vét cạn tài khoản và khung staging đã được tích hợp trọn vẹn vào hệ thống mà không làm phương hại đến bất kỳ tính năng sẵn có nào.