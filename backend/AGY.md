Bạn là kỹ sư backend senior trong repo My-Software-Team (hệ thống quản lý trạm sạc EV - CSMS, OCPP 1.6J).
Stack: FastAPI + SQLAlchemy + Alembic + pytest + ruff, chạy trên Windows PowerShell với .venv.
Thư mục backend: C:\Users\dth09\Downloads\My-Software-Team\backend
Alembic: script_location = alembic, migration nằm ở backend\alembic\versions (KHÔNG dùng backend\migrations\versions, đó là thư mục cũ không dùng).
Không được làm hỏng test đang pass (trước đó: 190 passed, 1 skipped, ruff sạch; số hiện tại có thể khác vì đồng đội merge thêm).

# PHẠM VI (RẤT QUAN TRỌNG)
Repo có khoảng 10 người cùng làm. Tôi chỉ phụ trách 2 Story: S-32 (bộ ca test tính tiền) và S-34 (đổi biểu giá không ảnh hưởng phiên cũ).
S-30 và S-31 là việc của đồng đội. Bạn CHỈ ĐỌC code của chúng để hiểu logic, TUYỆT ĐỐI KHÔNG viết mới, không sửa, không refactor logic tính tiền/chia đoạn của S-30 và S-31.
- Nếu logic S-30/S-31 chưa có trên branch này, hoặc khác mô tả bên dưới: DỪNG và báo tôi.
- Nếu test của tôi phát hiện logic S-30/S-31 tính sai so với đáp án tính tay: KHÔNG tự sửa. Báo tôi kèm ca test cụ thể (ca nào, đoạn nào, chênh bao nhiêu), rồi chờ quyết định.

# QUY TẮC TÍNH TIỀN ĐÃ CHỐT (nguồn: AC của S-30 và S-31, dùng làm căn cứ viết đáp án tính tay)
S-30 - Phiên cắt qua nhiều khung giờ:
- Phiên 21:30-23:30, đổi giá lúc 22:00 -> chia 2 đoạn. kWh mỗi đoạn lấy theo số đo gần ranh giới nhất; nội suy tuyến tính nếu thiếu số đo đúng mốc.
- Phiên nằm trọn 1 khung -> 1 đoạn, tổng = kWh x đơn giá.
- Làm tròn TỪNG ĐOẠN rồi cộng (không làm tròn trên tổng cả phiên). Quy tắc này ghi rõ trên hoá đơn.
S-31 - Phiên qua nửa đêm (dùng chung cơ chế chia đoạn với S-30):
- Phiên 23:00-01:00 -> phần trước 0h theo biểu giá hôm trước, phần sau theo hôm sau, kể cả khi 2 ngày biểu giá khác nhau.
- Phiên dài hơn 24 giờ -> mỗi ngày là 1 nhóm đoạn riêng, hoá đơn nhóm theo ngày.

# BƯỚC 0 - KHẢO SÁT (bắt buộc, chưa viết code)
Chạy git status, git branch --show-current, git log -5. Đọc code rồi báo tôi ngắn gọn:
1. Logic chia đoạn và tính tiền của S-30/S-31 nằm ở đâu (hàm/service, đầu vào/đầu ra). Có trả về breakdown từng đoạn không? Đơn vị tiền (int đồng hay Decimal), cách làm tròn (half-up/half-even/floor), múi giờ đang dùng, cách xử lý đúng mốc 00:00.
2. Cách lấy số đo (MeterValues) và nội suy: chọn "số đo gần ranh giới nhất" hay nội suy giữa 2 số đo bao quanh? Hai cách này cho kết quả khác nhau, hãy nêu code đang làm gì thật sự.
3. Phí chiếm trụ (idle/occupancy fee) đã có chưa? Nếu chưa có trong code, báo tôi, đừng tự làm.
4. Model biểu giá hiện tại (bảng, cột, cách phiên tham chiếu biểu giá, biểu giá theo ngày/khung giờ lưu thế nào).
5. Số hiện tại của pytest và ruff, và alembic heads (phải đúng 1 head).
Sau đó nêu kế hoạch ngắn và DỪNG, chờ tôi xác nhận trước khi viết code.

# ĐIỂM CẦN TÔI XÁC NHẬN TRƯỚC KHI LÀM VIỆC B
S-31 nói mỗi đoạn dùng biểu giá của NGÀY CỦA ĐOẠN ĐÓ. Nhưng subtask SCRUM-226 ghi "áp dụng biểu giá theo thời điểm phiên kết thúc". Hai cách cho kết quả khác nhau với phiên qua nửa đêm khi biểu giá mới có hiệu lực từ 0h.
Mặc định đề xuất: chọn phiên bản biểu giá THEO NGÀY CỦA TỪNG ĐOẠN (khớp S-31); phiên đã kết thúc và đã chốt tiền thì không bị tính lại; chỉ cho phép tạo biểu giá hiệu lực từ ngày mai trở đi nên quá khứ không thể bị đổi. Hãy phân tích trong Bước 0 xem cách này có khớp code hiện tại không, nêu rủi ro, rồi chờ tôi chốt.

# VIỆC A - S-32: Bộ ca kiểm thử tính tiền có đáp án tính tay
AC:
- Tối thiểu 12 ca (phiên 1 khung, cắt ranh giới, qua nửa đêm, có phí chiếm trụ, số đo thưa), mọi ca khớp đáp án tính tay TỪNG ĐỒNG.
- Ca sai -> thông báo nêu rõ ca nào, đoạn nào, chênh bao nhiêu.
Map subtask: SCRUM-211 (qua nửa đêm), 212 (đáp án tính tay chi tiết), 213 (danh sách >= 12 ca biên), 214 (số đo thưa và nội suy tại ranh giới), 215 (dữ liệu đầu vào từng kịch bản), 216 (cắt qua nhiều khung giờ), 217 (phí chiếm trụ theo thời gian), 218 (xác minh khớp từng đồng), 219 (chuẩn hoá thông báo lỗi).

Danh sách ca gợi ý (bạn chọn số liệu đơn giản, dễ tính nhẩm, và điều chỉnh theo biểu giá thật trong repo):
1. Phiên nằm trọn 1 khung -> 1 đoạn, tổng = kWh x đơn giá.
2. Phiên 21:30-23:30, đổi giá 22:00, có số đo đúng mốc 22:00 -> 2 đoạn.
3. Như ca 2 nhưng KHÔNG có số đo đúng 22:00 -> nội suy tuyến tính tại ranh giới.
4. Phiên bắt đầu đúng mốc đổi giá -> 1 đoạn.
5. Phiên kết thúc đúng mốc đổi giá -> 1 đoạn.
6. Phiên cắt 3 khung giờ trở lên -> nhiều đoạn.
7. Ca làm tròn: chọn số liệu sao cho "làm tròn từng đoạn rồi cộng" lệch ít nhất 1 đồng so với "tính trên cả phiên rồi làm tròn", để chứng minh quy tắc.
8. Qua nửa đêm 23:00-01:00, hai ngày cùng biểu giá.
9. Qua nửa đêm 23:00-01:00, hai ngày KHÁC biểu giá.
10. Mốc đúng 00:00 (vd 22:00-00:00 và 00:00-01:00), kiểm tra biên.
11. Phiên dài hơn 24 giờ -> mỗi ngày một nhóm đoạn, hoá đơn nhóm theo ngày.
12. Số đo thưa: chỉ có số đo đầu và cuối phiên, đi qua nhiều ranh giới.
13. Có phí chiếm trụ (nếu code có), tính theo thời gian chiếm trụ.
14. Phí chiếm trụ kéo qua ranh giới khung giờ hoặc nửa đêm (nếu code có).

Yêu cầu triển khai:
- Dùng pytest.mark.parametrize với id dễ đọc, một bảng ca tập trung theo cấu trúc thư mục test hiện có của repo.
- Mốc thời gian cố định trong test, không dùng now() hay giờ hệ thống.
- Mỗi ca có đáp án HARDCODE kèm breakdown từng đoạn (khoảng thời gian, kWh, đơn giá, thành tiền đoạn, phí chiếm trụ nếu có, tổng) ghi bằng comment hoặc field riêng, để tôi đọc là tự tính lại được. KHÔNG được lấy đáp án bằng cách gọi chính hàm đang test.
- So sánh bằng tuyệt đối, không dùng approx hay sai số.
- Viết helper assert, khi lệch phải in dạng: "Ca <tên ca> | đoạn <n> (<từ> -> <đến>): kỳ vọng X đ, thực tế Y đ, chênh Z đ". Có test riêng chứng minh thông báo đúng định dạng khi cố tình sai (pytest.raises(AssertionError)).
- Nếu hàm hiện tại chỉ trả tổng mà không trả breakdown từng đoạn, hãy tìm hàm nội bộ đã có sẵn để lấy breakdown mà không đổi hành vi; nếu không có, báo tôi phương án, không sửa lặng lẽ code của S-30/S-31.

# VIỆC B - S-34: Đổi biểu giá không ảnh hưởng phiên cũ
AC:
- Tạo biểu giá mới hiệu lực từ ngày mai -> phiên hôm nay vẫn tính theo biểu giá cũ, phiên ngày mai theo biểu giá mới.
- Cố đặt ngày hiệu lực trong quá khứ -> bị chặn.
Map subtask: SCRUM-227 (lưu phiên bản biểu giá theo ngày hiệu lực), 228 (luồng tạo/cập nhật hỗ trợ phiên bản kế tiếp), 226 (logic áp dụng biểu giá, xem mục "Điểm cần xác nhận" ở trên), 229 (chặn ngày hiệu lực quá khứ), 230 (xử lý phiên đang mở khi biểu giá mới hiệu lực từ ngày mai), 231 (kiểm thử).

Yêu cầu triển khai:
- Migration Alembic MỚI trong backend\alembic\versions, có upgrade và downgrade, backfill dữ liệu cũ (biểu giá hiện có = phiên bản đầu tiên, hiệu lực từ mốc cũ nhất). Phải chạy được trên Postgres sạch bằng alembic upgrade head (CI staging chạy bước này), không dính DuplicateColumn hay xung đột migration cũ. Trước khi tạo, chạy alembic heads để chắc chỉ có 1 head và đặt down_revision đúng. Nếu thấy nhiều head thì dừng và báo tôi. Kiểm tra lại alembic heads ở cuối.
- Luồng tạo/cập nhật biểu giá: tạo phiên bản kế tiếp, không ghi đè bản đang dùng.
- Không đổi cách S-30/S-31 chia đoạn; chỉ thay chỗ "lấy biểu giá" thành lấy theo phiên bản có effective_from lớn nhất <= mốc thời gian theo quy ước tôi đã chốt, với đường tương thích ngược cho dữ liệu cũ.
- Chặn effective_from trong quá khứ: trả lỗi 4xx rõ ràng, theo convention lỗi hiện có của repo. Nêu rõ quy ước "quá khứ" (so với ngày hiện tại theo múi giờ nào, nhất quán với code hiện có) và cách xử lý "hôm nay".
- Phiên đang mở khi biểu giá mới hiệu lực từ ngày mai (SCRUM-230): nêu quy tắc đang áp dụng và có test.
- Test (SCRUM-231): (1) phiên hôm nay vẫn giá cũ sau khi tạo biểu giá mới; (2) phiên ngày mai theo giá mới; (3) ngày hiệu lực quá khứ bị chặn; (4) phiên qua nửa đêm đúng ngày chuyển giá; (5) nhiều phiên bản liên tiếp vẫn chọn đúng; (6) tiền của phiên đã chốt không đổi sau khi tạo biểu giá mới. Dùng freezegun hoặc cách đang dùng trong repo / inject clock, không dùng giờ thật.

# LÀM VIỆC NHÓM VÀ RÀNG BUỘC CHUNG
- Chỉ làm trên branch riêng của tôi (kiểm tra bằng git branch --show-current). Tuyệt đối không commit hay push vào main hoặc branch của người khác. Không tự push; chỉ commit local, mỗi việc một commit, message ghi mã S-32 hoặc S-34 và SCRUM liên quan.
- Nếu git status có thay đổi chưa commit không thuộc task này, báo tôi, đừng đụng vào.
- Chỉ sửa file thuộc phạm vi S-32 và S-34 (test, migration mới, code biểu giá). Không sửa file cấu hình chung, CI, hay module của người khác. Nếu bắt buộc phải sửa, hỏi tôi trước.
- Không đổi tên hay xoá hàm, cột mà code khác có thể đang dùng; ưu tiên thêm mới, tương thích ngược.
- Thay đổi tối thiểu, bám convention hiện có. Không refactor ngoài phạm vi.
- Phải chạy được: pytest toàn bộ không giảm so với trước, ruff check sạch (ruff format nếu repo dùng).
- Lệnh chạy trên PowerShell (dùng ; thay cho &&). Lệnh alembic chỉ chạy trên DB local, không chạm DB staging.

# BÀN GIAO
1. Danh sách file thêm/sửa.
2. Bảng các ca test: tên ca - kịch bản - đáp án tính tay (tổng tiền) - kết quả.
3. Output cuối của pytest, ruff, alembic heads, và thử alembic upgrade head -> downgrade -1 -> upgrade head (trên DB local).
4. Các ca phát hiện lệch với S-30/S-31 (nếu có), các giả định đã đặt ra và điểm cần tôi xác nhận (múi giờ, làm tròn, phiên đang mở, phí chiếm trụ).