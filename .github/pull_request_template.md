## Mô tả

*(Quy ước do nhóm quyết định ngày 29/09/2026)*

- Tóm tắt việc đã làm:

---

## Việc liên quan

*(Quy ước do nhóm quyết định ngày 29/09/2026)*

- Mã công việc / Module liên quan:

---

## Cách kiểm tra

*(Nguồn: `backend/pytest.ini`, `backend/app/main.py:20`)*

1. Chạy bộ kiểm thử tự động tại thư mục máy chủ:
   ```bash
   cd backend
   pytest -v
   ```
2. Kiểm tra thủ công qua API Swagger UI tại `http://localhost:8000/docs` hoặc kiểm tra giao diện tại `http://localhost:5173`.

---

## Ảnh chụp hoặc kết quả

*(Nguồn: Đo kiểm từ kết quả chạy lệnh `pytest` và giao diện `frontend/`)*

- Đính kèm kết quả output của terminal khi chạy `pytest` (yêu cầu hiển thị rõ số test passed).
- Đính kèm ảnh chụp màn hình nếu có thay đổi liên quan đến giao diện người dùng.

---

## Checklist

*(Nguồn: Ràng buộc kỹ thuật tại `backend/app/models/` và `backend/pytest.ini`)*

- [ ] Mã nguồn đã tuân thủ quy tắc PEP 8 cho Python và ESLint cho React.
- [ ] Toàn bộ bộ test tự động `backend/tests/` (83 test cases) chạy đạt 100% PASS trên máy cá nhân.
- [ ] Không làm thay đổi trái phép hoặc phá vỡ các ràng buộc CSDL `CheckConstraint` trong `backend/app/models/`.
- [ ] Đã kiểm tra tính toàn vẹn của các giao dịch ACID (ví tiền, phiên sạc, khóa bi quan `with_for_update`).
- [ ] *(Quy ước do nhóm quyết định ngày 29/09/2026)*: Đã có tối thiểu 1 người khác tác giả review và duyệt trước khi gộp vào `main`.