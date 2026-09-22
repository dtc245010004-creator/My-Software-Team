# My-Software-Team
Vận hành trạm xe điện
Đơn vị vận hành mạng lưới trạm sạc nắm được mọi phiên sạc theo thời gian thực qua giao thức OCPP, tính đúng tiền theo biểu giá nhiều khung, không để trạm vượt công suất, và đối soát được doanh thu khớp với số kWh đã cấp
Quy ước làm việc
Áp dụng cho cả nhóm từ Sprint 1. Muốn đổi quy ước: nêu trong Daily hoặc Retrospective, rồi cập nhật mục này bằng một Pull Request.

1. Nguyên tắc chung
Nhánh main luôn chạy được. Không push trực tiếp vào main, mọi thay đổi đều đi qua Pull Request (PR).
Một việc trên Jira = một nhánh = một PR. Việc lớn thì tách nhỏ, PR nhỏ thì review nhanh.
Luôn ghi mã Jira (ví dụ GYM-19) vào tên nhánh, commit và tiêu đề PR để truy vết được.
Không commit bí mật: mật khẩu, khoá API, chuỗi kết nối cơ sở dữ liệu, file .env. Đọc từ biến môi trường và chỉ commit file mẫu .env.example.
2. Đặt tên nhánh
Cú pháp: <loại>/<MÃ-JIRA>-<mô-tả-ngắn>

Loại	Dùng khi
feature	Thêm hoặc mở rộng chức năng
fix	Sửa lỗi
docs	Sửa tài liệu, README
test	Thêm hoặc sửa test
chore	Cấu hình, dọn dẹp, việc không đổi hành vi
Quy tắc: chữ thường, không dấu tiếng Việt, nối các từ bằng dấu gạch ngang, mô tả tối đa khoảng 5 từ, mã Jira giữ chữ hoa.

Ví dụ đúng:

feature/GYM-19-form-tao-tram
fix/GYM-25-loi-khoa-dang-nhap
docs/GYM-13-quy-uoc-lam-viec
Ví dụ sai: test1, nhanh-cua-an, feature/them chuc nang, feature/tao-tram (thiếu mã Jira).

3. Viết commit
Cú pháp: <type>(<phạm vi>): <mô tả ngắn> [MÃ-JIRA]

Type	Ý nghĩa
feat	Thêm chức năng
fix	Sửa lỗi
docs	Thay đổi tài liệu
refactor	Viết lại code, không đổi hành vi
test	Thêm hoặc sửa test
chore	Cấu hình, thư viện, việc lặt vặt
Phạm vi là tuỳ chọn, ví dụ: auth, station, charge-point, db, ui, readme.

Quy tắc:

Mô tả viết tiếng Việt, bắt đầu bằng động từ (thêm, sửa, xoá, đổi), tối đa 72 ký tự, không có dấu chấm cuối.
Một commit là một thay đổi có ý nghĩa. Commit thường xuyên, không dồn cả ngày làm việc vào một commit.
Ví dụ đúng:

feat(station): thêm form tạo trạm sạc [GYM-19]
fix(auth): sửa lỗi không khoá đăng nhập sau 5 lần sai [GYM-16]
docs(readme): thêm quy ước làm việc [GYM-13]
Ví dụ sai: update, fix bug, done, abc, sửa nhiều thứ.

4. Quy trình làm một việc và mở Pull Request
Trên Jira, kéo thẻ sang In Progress và gán tên mình.

Cập nhật main rồi tạo nhánh mới:

git checkout main
git pull origin main
git checkout -b feature/GYM-19-form-tao-tram
Làm việc và commit theo quy ước ở mục 3.

Trước khi mở PR, lấy code mới nhất của main về nhánh của mình, tự xử lý xung đột nếu có, chạy thử ứng dụng trên máy và tự xem lại phần thay đổi:

git fetch origin
git merge origin/main
Đẩy nhánh và mở PR vào main trên GitHub:

git push -u origin feature/GYM-19-form-tao-tram
Tiêu đề PR: [GYM-19] Thêm form tạo trạm sạc. Điền đầy đủ mẫu PR và chọn reviewer (mục 5).

Sửa theo góp ý của reviewer, đẩy commit mới lên cùng nhánh.

Khi đã có approve: tác giả bấm Squash and merge, xoá nhánh, rồi chuyển thẻ Jira sang Done.

5. Ai review và review thế nào
Mỗi PR cần ít nhất 1 approve từ một thành viên khác (không phải tác giả), theo Definition of Done.
Tác giả chọn reviewer, xoay vòng giữa các thành viên, ưu tiên người hiểu phần việc đó. PR đụng tới cấu trúc cơ sở dữ liệu (migration) hoặc phân quyền thì thêm trưởng dev làm reviewer.
Reviewer phản hồi trong ngày làm việc. Ai đang chờ review của ai thì nêu trong Daily, Scrum Master theo dõi.
Reviewer kiểm tra: code chạy đúng tiêu chí chấp nhận (AC) của việc trên Jira, không có bí mật, tên nhánh và commit đúng quy ước, code dễ đọc.
Góp ý tập trung vào code, không nhắm vào người viết. Nêu rõ, mang tính xây dựng, và phân biệt "cần sửa" với "gợi ý".
Không tự merge khi chưa có approve. Xung đột merge do tác giả tự xử lý, cần giúp thì hỏi trên nhóm chat.
6. Việc phải đạt trước khi coi là xong
Trích từ Definition of Done của dự án, phần liên quan tới code:

Đã được ít nhất 1 thành viên khác review và approve.
Có unit test cho logic mới. Khung test và CI sẽ bổ sung từ Sprint 2.
Không có bí mật trong mã nguồn.
README được cập nhật nếu đổi cách chạy hoặc thêm biến môi trường.
