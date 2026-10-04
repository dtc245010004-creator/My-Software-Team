# AI TESTER ENTRY POINT & ROUTER

> **Loại tài liệu**: Cổng điều hướng kiểm thử & FAQ nghiệp vụ hệ thống  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.2 số 6  
> **Đối tượng sử dụng**: AI Testing Agents, QA Engineers, Kiểm toán viên kỹ thuật

---

## 1. TỔNG QUAN HỆ THỐNG TÀI LIỆU TESTER (DOCUMENT ARCHITECTURE)

Hệ thống tài liệu dự án EV CSMS được tổ chức theo mô hình **Đóng gói theo vai trò (Role-based Packaging)** nhằm tách bạch rõ ràng quyền sở hữu và công năng tra cứu:
* **Trung tâm điều phối QA (`docs/qa/`)**: Chứa Hiến chương kiểm thử ([`STANDARD.md`](qa/STANDARD.md)), Sổ cái kiểm thử ([`INVENTORY.md`](qa/INVENTORY.md); full backend mới nhất 158 passed, 1 warning), Kế hoạch kiểm thử ([`plans/TEST_PLAN.md`](qa/plans/TEST_PLAN.md)), Các báo cáo thực nghiệm ([`reports/`](qa/reports/)), và Hồ sơ nghiệm thu ([`stories/`](qa/stories/)).
* **Phân khu Vận hành (`docs/devops/`)**: Sổ tay vận hành hệ thống, cổng mạng, biến môi trường ([`OPERATIONS.md`](devops/OPERATIONS.md)).
* **Phân khu Thiết kế & Nghiên cứu (`docs/design/`, `docs/research/`)**: Đặc tả UX/UI, nhật ký sai lệch giao diện và các báo cáo thử nghiệm kỹ thuật (Spikes K-01, S-05 AC3).
* **Phân khu Quản trị & Kiến trúc (`docs/planning/`, `docs/architecture/`)**: Kế hoạch Sprint, Bản đồ cấu trúc và Ma trận truy vết hệ thống.
* **Hướng dẫn lan truyền thay đổi ([`CHANGE_PROPAGATION.md`](CHANGE_PROPAGATION.md))**: Quy chuẩn bắt buộc khi sửa mã nguồn hoặc cấu hình phải cập nhật đồng bộ các tài liệu tương ứng.

---

## 2. 17 CÂU HỎI CỐT LÕI DÀNH CHO AI TESTER (TESTER FAQ)

### Q1: AI Tester là gì?
Tác tử AI độc lập chuyên trách thẩm định, kiểm chứng tính đúng đắn của mã nguồn và báo cáo chất lượng dựa trên chứng cứ thực nghiệm, không thiên vị và không đưa ra giả định.

### Q2: Tester có được sửa code không?
**Tuyệt đối không.** Tester và AI Tester bị nghiêm cấm chỉnh sửa mã nguồn nghiệp vụ trong `backend/app/` và `frontend/src/` để làm test pass. Mọi lỗi phải được ghi nhận vào `BUG_REPORT.md` để lập trình viên xử lý.

### Q3: Bằng chứng thực tế (Evidence) gồm những gì?
Gồm: Đầu ra thực thi lệnh chạy từ terminal (stdout của `pytest`), bản ghi dữ liệu cụ thể trong CSDL SQLite, mã trạng thái và JSON phản hồi từ API, hoặc ảnh chụp giao diện client.

### Q4: Ba trạng thái PASS / FAIL / BLOCKED được phân định như thế nào?
* `PASS`: Toàn bộ assertions khớp với kết quả kỳ vọng.
* `FAIL`: Code chạy nhưng sai khác logic so với kỳ vọng.
* `BLOCKED`: Không thể chạy test do lỗi môi trường, lỗi import hoặc sập hệ thống phụ thuộc.

### Q5: Khi nào cần kiểm thử hồi quy (Selective Regression)?
Bất cứ khi nào có thay đổi mã nguồn trong ứng dụng, Tester phải tra cứu ma trận tại `INVENTORY.md` để chạy lại tối thiểu các test suite liên quan trực tiếp; chạy Full Regression nếu sửa cấu hình cốt lõi.

### Q6: Hai luồng phân tích độc lập (Dual-stream) hoạt động ra sao?
Bao gồm: Luồng 1 (Kiểm chứng tiêu chí chấp nhận AC của Story) và Luồng 2 (General Review đánh giá độc lập về kiến trúc, an toàn CSDL, IDOR và khả năng chịu lỗi).

### Q7: Quy tắc bảo toàn Enum được định nghĩa như thế nào?
Bắt buộc sử dụng 100% đúng chính tả và định dạng các giá trị Enum chuẩn đã được ban hành tại Mục 8 của `STANDARD.md`, không tự ý biến đổi.

### Q8: Trách nhiệm phân cấp E → S → T ánh xạ ra sao?
Epic (Mục tiêu hệ thống cấp cao) $\longrightarrow$ Story (Giá trị nghiệp vụ hoàn chỉnh có AC) $\longrightarrow$ Task (Công việc kỹ thuật cụ thể).

### Q9: Bản đồ quan hệ phụ thuộc gồm những loại nào?
Gồm 4 loại: Phụ thuộc giữa các Story, phụ thuộc giữa các Task, phụ thuộc điều kiện tiên quyết của Test, và phụ thuộc giữa các module mã nguồn.

### Q10: Ma trận kiểm kê Test Inventory được cập nhật khi nào?
Cập nhật ngay khi có test case mới được bổ sung, sửa đổi hoặc loại bỏ khỏi bộ test `backend/tests/`.

### Q11: 5 tầng thực thi kiểm thử (5-Layers) là gì?
Mô hình 5 tầng: Tầng 1 (Unit), Tầng 2 (Service/Model ACID), Tầng 3 (API Integration), Tầng 4 (Mock/Resilience), Tầng 5 (Frontend Client Build).

### Q12: General Review đánh giá trên 5 khía cạnh nào?
Đánh giá trên: (1) Kiến trúc, (2) Bảo mật & Phân quyền, (3) Tính toàn vẹn CSDL, (4) Hiệu năng xử lý, (5) Trải nghiệm & Ổn định giao diện.

### Q13: Báo cáo Bug và Blocker được phân loại như thế nào?
Theo mức độ nghiêm trọng từ Severity 0 (Critical) đến Severity 3 (Minor), và theo nguồn gốc (Lỗi code hay Rào cản hạ tầng/phần cứng).

### Q14: Hồ sơ nghiệm thu Story (S-xx.md) chứa những phần nào?
Chứa 5 phần: (1) Yêu cầu & AC, (2) Tasks liên kết, (3) Bằng chứng thực thi kiểm thử, (4) Tóm tắt trạng thái hiện tại, (5) Đánh giá General Review độc lập.

### Q15: Kiểm thử tích hợp Frontend ↔ Backend (FRONTEND_BACKEND.md) xác nhận điều gì?
Xác nhận tính tương thích dữ liệu, đồng bộ trạng thái sạc thời gian thực qua WebSocket và xử lý mã lỗi giao diện khi gọi REST API.

### Q16: Kịch bản thử nghiệm Spike (K-01) có vị trí gì trong hệ thống?
Là tài liệu nghiên cứu chứng minh tính khả thi kỹ thuật (PoC), ghi nhận các giới hạn của giao thức trước khi đưa vào backlog chính thức.

### Q17: Danh mục kiểm tra an toàn cuối cùng (Final Safety Check) gồm những gì?
Checklist kiểm tra: Không sửa mã ứng dụng, 100% test pass, bug được ghi nhận đầy đủ, không gãy liên kết markdown, CSDL kiểm thử sạch sẽ.

### Q18: Khi bộ test tự động của Developer bị FAIL thì Tester xử lý thế nào?
Ghi lại log lỗi chính xác, phân loại nguyên nhân vào `BUG_REPORT.md`, giữ nguyên trạng thái FAIL và gửi thông báo phản hồi cho Developer; tuyệt đối không tự sửa code để test pass.

---

## 3. ĐIỀU HƯỚNG THEO LỆNH KIỂM THỬ (ROUTING LOGIC)

### 3.1. Routing khi nhận nhiệm vụ cấp Epic (E-xx)
1. Đọc mô tả Epic trong `docs/architecture/` và `docs/planning/`.
2. Xác định danh sách các Story con thuộc Epic.
3. Rà soát trạng thái nghiệm thu của từng Story trong `docs/qa/stories/`.
4. Tổng hợp báo cáo mức độ hoàn thành và các rào cản còn tồn đọng.

### 3.2. Routing khi nhận nhiệm vụ cấp Story (S-xx)
1. Mở file hồ sơ nghiệm thu tương ứng tại `docs/qa/stories/S-xx.md`.
2. Kiểm tra từng tiêu chí Acceptance Criteria (AC).
3. Chạy các ca kiểm thử liên kết trong `backend/tests/`.
4. Ghi nhận nhật ký bằng chứng vào Mục 3 của file Story.

### 3.3. Routing khi nhận nhiệm vụ cấp Task (T-xx)
1. Xác định mã nguồn liên quan trực tiếp đến Task.
2. Thiết kế hoặc thực thi test case tương ứng trong `backend/tests/`.
3. Kiểm tra tính hồi quy trên các module phụ thuộc.

### 3.4. Routing cho các lệnh chuyên biệt khác
* **Kiểm thử tích hợp**: Điều hướng đến [`docs/qa/integration/FRONTEND_BACKEND.md`](qa/integration/FRONTEND_BACKEND.md).
* **Kiểm tra vận hành**: Điều hướng đến [`docs/devops/OPERATIONS.md`](devops/OPERATIONS.md).

### 3.5. Routing khi nhận nhiệm vụ General Review / Code Review
1. Thực hiện rà soát độc lập trên 5 khía cạnh kỹ thuật theo chuẩn Mục 9 của `STANDARD.md`.
2. Ghi nhận phát hiện vào Mục 5 của file Story hoặc mở mục đánh giá riêng.

---

## 4. BẢNG TRA CỨU ĐIỀU HƯỚNG NHANH (QUICK NAVIGATION MATRIX)

| Vai trò / Nhu cầu | Tài liệu đích khuyến nghị |
| :--- | :--- |
| **Bắt đầu ca kiểm thử của AI Tester** | [`docs/qa/STANDARD.md`](qa/STANDARD.md) & [`docs/qa/INVENTORY.md`](qa/INVENTORY.md) |
| **Xem hiện trạng kiểm thử mới nhất** | [`docs/qa/reports/TEST_REPORT.md`](qa/reports/TEST_REPORT.md) |
| **Kiểm tra danh mục lỗi và rào cản** | [`docs/qa/reports/BUG_REPORT.md`](qa/reports/BUG_REPORT.md) |
| **Khởi động dịch vụ và tra cứu tài khoản** | [`docs/devops/OPERATIONS.md`](devops/OPERATIONS.md) |
| **Nghiệm thu chức năng theo Story** | [`docs/qa/stories/`](qa/stories/) |
| **Hồ sơ lớp khung OCPP S-07** | [`docs/qa/stories/S-07.md`](qa/stories/S-07.md) |
| **Hồ sơ gateway BootNotification S-08** | [`docs/qa/stories/S-08.md`](qa/stories/S-08.md) |
| **Hồ sơ ủy quyền Authorize/idTag S-15** | [`docs/qa/stories/S-15.md`](qa/stories/S-15.md) |
| **Hồ sơ dispatcher và lệnh Reset OCPP S-16** | [`docs/qa/stories/S-16.md`](qa/stories/S-16.md) |
