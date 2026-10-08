# CONTRIBUTING — Quy ước làm việc nhóm CSMS

> **Nguồn xác thực chính**: Ràng buộc mã nguồn backend `backend/app/models/`, `backend/app/services/`, cấu hình test `backend/pytest.ini` và kết quả thực thi `pytest`.  
> **Quy ước nhóm**: Các mục §2 đến §5 là quy ước làm việc do nhóm thống nhất quyết định ngày 29/09/2026.  
> **Dấu vết tham khảo**: [nguồn tạm: phacthaobandau/GEMINI.md], [nguồn tạm: phacthaobandau/HUONGDAN.md]

---

## 1. Nguyên tắc chung

Mọi đóng góp mã nguồn vào hệ thống EV CSMS bắt buộc phải tuân thủ các nguyên tắc kỹ thuật cốt lõi đã được mã hóa trong hệ thống:

1. **Bảo toàn giao dịch tài chính ACID (No Uncontrolled Negative Balance)**:
   - *(Nguồn: `backend/app/services/wallet_service.py:35,80`)*: Bắt buộc sử dụng khóa bi quan `with_for_update()` khi thao tác với bảng `wallets`.
   - *(Nguồn: `backend/app/core/config.py:23`)*: Tuyệt đối không cho phép tài khoản tiếp tục phiên sạc mới nếu số dư ví vi phạm hạn mức nợ `NEGATIVE_BALANCE_LIMIT = -300000` VND.
2. **An toàn ngắt sạc tự động khẩn cấp (Auto Cut-off Guardrail)**:
   - *(Nguồn: `backend/app/simulator/charging_simulator.py:120-135`)*: Bộ điều khiển sạc phải tự động kích hoạt dừng khẩn cấp và chuyển trạng thái cổng sang `FAULTED` hoặc `AVAILABLE` khi nhiệt độ vượt quá $75^\circ\text{C}$ hoặc pin xe đạt $100\%$.
3. **Bảo vệ khóa cổng sạc độc quyền (Atomic Port Locking)**:
   - *(Nguồn: `backend/app/services/session_service.py:73`)*: Bắt buộc sử dụng cập nhật nguyên tử trạng thái cổng sạc từ `AVAILABLE` sang `OCCUPIED`. Nếu phát hiện xung đột cắm trùng cổng, hệ thống phải ném lỗi `HTTP 409 Conflict`.
4. **Cơ chế dự phòng Heuristic Fallback khi AI ngoại lệ**:
   - *(Nguồn: `backend/app/services/ai_service.py:126`)*: Khi dịch vụ AI Gemini gặp sự cố mạng, quá tải quota hoặc timeout, bắt buộc kích hoạt thuật toán chuyên gia (Rule-based Heuristic) để không làm gián đoạn vận hành trạm.

---

## 2. Đặt tên nhánh

*(Quy ước do nhóm quyết định ngày 29/09/2026)*

Đặt tên nhánh theo định dạng: `loại/mô-tả-ngắn`

- Các loại nhánh: `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, `chore/`
- Quy chuẩn: viết thường, không dấu.
- Ví dụ: `feat/smart-charging`, `fix/wallet-negative-balance`, `docs/update-readme`

---

## 3. Viết commit

*(Quy ước do nhóm quyết định ngày 29/09/2026)*

- Viết một dòng, dạng: `loại: việc đã làm`
- Có thể viết tiếng Việt. Không cần chuẩn Conventional Commits đầy đủ, chỉ cần dòng đầu nói rõ làm gì.
- Ví dụ: `fix: chặn ví âm quá hạn mức`, `feat: thêm telemetry websocket cho simulator`

---

## 4. Quy trình làm một việc và mở Pull Request

*(Quy ước do nhóm quyết định ngày 29/09/2026)*

1. Cập nhật `main`, tạo nhánh mới.
2. Làm xong thì chạy `pytest backend/tests` tại máy; tra cứu [`docs/CHANGE_PROPAGATION.md`](docs/CHANGE_PROPAGATION.md) để cập nhật đầy đủ các tài liệu liên quan tương ứng với phần mã vừa sửa.
3. Đẩy nhánh, mở PR vào `main`, điền template.
4. Được duyệt rồi mới gộp, gộp xong xóa nhánh.

---

## 5. Ai review và review thế nào

*(Quy ước do nhóm quyết định ngày 29/09/2026)*

- Tối thiểu 1 người khác tác giả xem qua trước khi gộp.
- Nhóm chỉ 2 người thì người còn lại review.
- Người review: bất kỳ thành viên nào khác (hoặc theo phân chia từng module nếu nhóm có phân chia cụ thể).

---

## 6. Việc phải đạt trước khi coi là xong

*(Nguồn: `backend/pytest.ini`, kết quả chạy lệnh `pytest backend/tests`)*

Một đóng góp mã nguồn (Pull Request hoặc Commit) chỉ được coi là hoàn thành (Definition of Done) khi thỏa mãn toàn bộ các điều kiện kỹ thuật sau:

1. **Kiểm thử tự động Pass**: Toàn bộ bộ test tự động tại `backend/tests/` (hiện hữu 84 test cases) phải chạy thành công không có lỗi (`0 failed`).
2. **Không phát sinh lỗi hồi quy (Zero Regression)**: Tính năng mới không được làm hỏng các luồng nghiệp vụ sẵn có (Auth, Trạm sạc, Ví điện tử, Giả lập sạc, AI Fallback).
3. **Bảo toàn ràng buộc CSDL**: Không được làm sai lệch các ràng buộc toàn vẹn `CheckConstraint` và `UniqueConstraint` đã được xác lập trong `backend/app/models/`.
4. **Không có cảnh báo nghiêm trọng (Zero Critical Warnings)**: Không gây crash tiến độ nền của WebSocket Telemetry hoặc background scheduler.