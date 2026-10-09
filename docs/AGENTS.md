# HƯỚNG DẪN DÀNH CHO AI AGENT (AGENTS.md)

## Nguyên tắc hành vi cốt lõi
1. **Think Before Coding**: Nêu rõ các giả định kỹ thuật trước khi làm. Nếu yêu cầu có điểm mơ hồ hoặc có nhiều cách hiểu, phải hỏi lại người dùng để làm rõ, không tự ý chọn một cách hiểu ngầm định.
2. **Simplicity First**: Viết mã nguồn tối thiểu đủ để giải quyết bài toán. Không tự ý thêm tính năng ngoài phạm vi, không tạo trừu tượng hóa cho mã dùng một lần, không thêm cấu hình suy đoán.
3. **Surgical Changes**: Chỉ chạm vào những file và dòng mã thực sự cần thiết. Tự dọn dẹp các biến, hàm hoặc câu lệnh import do chính thay đổi của mình làm thừa; không xóa mã chết cũ không liên quan đến yêu cầu hiện tại.
4. **Goal-Driven Execution**: Chuyển đổi mọi nhiệm vụ thành tiêu chí kiểm chứng được trước khi viết code. Với nhiệm vụ nhiều bước, lập kế hoạch ngắn gồm các bước kèm cách kiểm tra tương ứng.
- **Định hướng làm việc**: Luôn ưu tiên sự cẩn trọng hơn tốc độ (bias toward caution over speed).

## Ngữ cảnh & Phân quyền hệ thống
- **Ngữ cảnh dự án**: Nền tảng vận hành trạm sạc xe điện (EV CSMS) phục vụ quản lý mạng lưới trạm sạc, trụ sạc, cổng sạc, cấu hình biểu giá điện TOU, ví tiền điện tử, phiên sạc thời gian thực, giám sát telemetry qua WebSocket và tích hợp AI điều phối công suất, dự báo bảo trì.
- **Cấu trúc mã nguồn**: Tra cứu danh mục thư mục và vai trò file tại `docs/architecture/PROJECT_STRUCTURE.md`.
- **Thư viện phụ thuộc**: Tra cứu danh mục thư viện thực tế tại `backend/requirements.txt` và `frontend/package.json`. Tuyệt đối không tự ý dùng thư viện ngoài danh mục này khi chưa được duyệt.
- **Phân quyền người dùng (RBAC)**: Tra cứu định nghĩa vai trò người dùng tại model `backend/app/models/user.py` (cột `role`).
- **Quy ước ngôn ngữ**:
  + Giao diện người dùng, tài liệu, chú thích mã nguồn (comment) và thông báo lỗi hiển thị: sử dụng tiếng Việt.
  + Định danh mã nguồn, tên bảng, tên cột CSDL, hàm, biến và tên file: sử dụng tiếng Anh không dấu.
  + Định dạng commit: tuân thủ `CONTRIBUTING.md` mục "Viết commit".

## Ranh giới an toàn & Kỷ luật vận hành

### Ranh giới kiến trúc & mã nguồn
- CRUD cơ bản hiện truy vấn trực tiếp tại `endpoints/`; nghiệp vụ giao dịch lõi ở `services/`. Không tự ý di chuyển giữa hai tầng, chỉ đổi kiến trúc khi người dùng yêu cầu.
- Thư mục `backend/app/simulator/` chứa logic phát xung nhịp giả lập telemetry sạc (SoC %, công suất, kWh, nhiệt độ).
- Trí tuệ nhân tạo (AI) chỉ đóng vai trò cố vấn và phân tích khuyến nghị, không tự ý can thiệp điều khiển đóng ngắt rơ-le vật lý hay trừ tiền ví; bắt buộc duy trì động cơ Heuristic Fallback độc lập để hệ thống vận hành liên tục khi mất mạng hoặc ngoại lệ API.

### Kỷ luật vận hành hệ thống
1. **Lấy số liệu thực tế**: Mọi số liệu (số lượng test, hạn mức nợ, ngưỡng nhiệt độ, số lượng file, endpoint, bảng CSDL) bắt buộc phải lấy từ mã nguồn hoặc lệnh chạy thực tế tại thời điểm kiểm tra, không chép lại từ tài liệu văn bản. Thư mục `phacthaobandau/` chỉ là lưu trữ lịch sử, không phải nguồn sự thật, tuyệt đối không đặt liên kết trỏ tới thư mục này.
2. **Xử lý thiếu thông tin & mâu thuẫn**: Khi thiếu thông tin hoặc phát hiện hai nguồn trong dự án mâu thuẫn nhau, bắt buộc ghi nhận `[THIẾU]` hoặc `[CẦN XÁC NHẬN]` và hỏi người dùng; tuyệt đối không tự ý điền phỏng đoán hay tự ý chọn một bên.
3. **Kỷ luật tài nguyên**: Tuyệt đối không tự ý tạo file, tạo tài liệu mới hoặc thay đổi cấu trúc thư mục khi người dùng chưa phê duyệt trước.
4. **An toàn cơ sở dữ liệu**: Bắt buộc tạo bản sao lưu file `backend/ev_csms.db` (ví dụ: `backend/ev_csms.db.bak`) trước khi chạy `seed_data.py` (vì script này xóa sạch dữ liệu cũ) hoặc trước khi chạy migration `alembic upgrade head`. Không commit file sao lưu vào git.
5. **Lệnh thực thi an toàn**:
   - Tuyệt đối không dùng các lệnh chạy tiến trình vô hạn làm chặn môi trường (như `npm run dev`) để kiểm tra; sử dụng lệnh `npm --prefix frontend run build` để kiểm tra biên dịch giao diện.
   - Lệnh cài đặt thư viện (`pip install`) chỉ được phép thực hiện bên trong môi trường ảo đã kích hoạt.
6. **Báo cáo trung thực**: Loại bỏ mọi câu từ tự đánh giá mang tính tuyệt đối ("100%", "hoàn hảo", "không bao giờ sót"). Chỉ báo cáo kết quả bằng các con số đếm lại được từ lệnh kiểm tra thực tế.

### Quy tắc ngày tháng, commit & khung 4 phần
- **Quy tắc xác định ngày và commit**: Trước khi ghi nhận ngày sửa đổi vào tài liệu, bắt buộc chạy `git status --short`. Nếu file vừa sửa còn nằm trong danh sách thay đổi thì ghi rõ "chưa commit". Chỉ khi đã commit mới được lấy ngày và mã commit từ `git log`.
- **Quy tắc khung 4 phần**: Sau khi sửa mã nguồn hoặc tài liệu, chỉ cập nhật vào phần "Hiện trạng" và phần "Đã thay đổi". Tuyệt đối không tự ý viết hay bổ sung nội dung vào phần "Sắp thay đổi" hoặc "Cần thay đổi" khi người dùng chưa phê duyệt.

### Dẫn chiếu các quy chuẩn kỹ thuật
- **Nghiệp vụ & Bảo toàn dữ liệu**: Tuân thủ nghiêm ngặt các quy định tại `CONTRIBUTING.md` mục "Nguyên tắc chung" (bảo toàn giao dịch tài chính ACID bằng khóa bi quan, không nợ vượt hạn mức, khóa cổng sạc độc quyền chống cắm trùng, ngắt sạc tự động khẩn cấp khi quá nhiệt).
- **Quy chuẩn kiểm thử & Chống test giả**: Tuân thủ các nguyên tắc tại `docs/qa/STANDARD.md` mục "Tư duy kiểm thử cốt lõi (Evidence-based Testing)", mục "Danh mục điều cấm tuyệt đối (Strictly Forbidden Actions)", và mục "Quy tắc phân tích phụ thuộc (Dependency Rules)" (không sửa mã ứng dụng để test pass, không mock chính lớp đang test, mỗi bug fix phải có test tái hiện, test AI phải assert nội dung thật).

## Quy trình làm việc & Bộ 5 câu hỏi trước khi code
Trước khi viết mã nguồn hoặc thực hiện sửa đổi hệ thống, Agent bắt buộc phải trả lời rõ ràng bộ 5 câu hỏi sau:
1. Việc này phụ thuộc vào những gì? Đã đủ điều kiện để bắt đầu chưa?
2. Những file nào sẽ được tạo mới hoặc bị sửa đổi?
3. Có rủi ro kỹ thuật nào cần lưu ý không? (ví dụ: giao dịch ACID ví tiền, xung đột cắm trùng cổng, phụ tải lưới điện...)
4. Tiêu chí hoàn thành (Definition of Done) là gì và làm sao để kiểm chứng?
5. Cần cập nhật những tài liệu nào sau khi sửa xong? (đối chiếu ma trận tại `docs/CHANGE_PROPAGATION.md` mục "Ma trận lan truyền thay đổi chi tiết").

## Kiểm thử & Lan truyền thay đổi
- **Lệnh chạy kiểm thử tự động chuẩn từ thư mục gốc**: `pytest backend/tests`
- **Quy trình lan truyền thay đổi**: Tra cứu bảng phân loại và ma trận công việc tại `docs/CHANGE_PROPAGATION.md` mục "Bảng tóm tắt: Loại thay đổi và tài liệu bắt buộc cập nhật" và mục "Ma trận lan truyền thay đổi chi tiết" để cập nhật chính xác các tài liệu bắt buộc sau mỗi lần sửa đổi mã nguồn.
