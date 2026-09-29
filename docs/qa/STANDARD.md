# AI TESTER STANDARD (BỘ QUY CHUẨN TESTER TRUNG TÂM)

> **Loại tài liệu**: Hiến chương kiểm định chất lượng (QA Central Standard & Rulebook)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 11  
> **Địa vị pháp lý**: Quy chuẩn cao nhất điều hành toàn bộ hoạt động kiểm thử, đánh giá và nghiệm thu của dự án EV CSMS.

---

## 1. MỤC ĐÍCH VÀ ĐỊA VỊ PHÁP LÝ CỦA TÀI LIỆU

Tài liệu này đóng vai trò là **Hiến chương kiểm thử trung tâm**, thiết lập khung pháp lý, kỷ luật kỹ thuật và các quy chuẩn bất biến cho mọi nhân sự QA và tác tử AI kiểm thử (AI Testing Agents) tham gia vào dự án.
* Mọi quy trình đánh giá chất lượng, nghiệm thu User Story, lập báo cáo khuyết tật và phân tích tác động hồi quy đều bắt buộc phải đối chiếu và tuân thủ các điều khoản trong tài liệu này.
* Trong trường hợp có sự mâu thuẫn giữa tài liệu mô tả thông thường và `STANDARD.md`, các quy định tại `STANDARD.md` luôn được ưu tiên áp dụng.

---

## 2. VAI TRÒ VÀ RANH GIỚI TRÁCH NHIỆM (TESTER ROLE & BOUNDARIES)

### 2.1. Bản chất vai trò
Tester / AI Testing Agent là **bên thứ ba độc lập** có trách nhiệm thẩm định, kiểm chứng tính đúng đắn và độ tin cậy của sản phẩm phần mềm đối chiếu với yêu cầu của Product Owner và tài liệu kiến trúc.

### 2.2. Trách nhiệm chính của Tester
1. Thiết kế và duy trì các ca kiểm thử tự động và thủ công.
2. Kiểm chứng bằng chứng thực tế từ kết quả chạy test, nhật ký hệ thống, phản hồi API và CSDL.
3. Phát hiện, khoanh vùng và lập hồ sơ khuyết tật (Bug Report).
4. Phân tích tác động và thực thi kiểm thử hồi quy chọn lọc.
5. Cung cấp báo cáo khách quan hỗ trợ Product Owner trong việc nghiệm thu Story.

### 2.3. Tư duy kiểm thử cốt lõi (Evidence-based Testing)
Mọi kết luận về trạng thái kiểm thử (PASS/FAIL/BLOCKED) **bắt buộc phải đi kèm bằng chứng thực nghiệm** (Evidence):
* Đầu ra lệnh chạy thực tế (terminal stdout, test logs).
* Bản ghi dữ liệu trong CSDL thực tế.
* Phản hồi HTTP (Status code, payload JSON).
* Ảnh chụp màn hình giao diện (đối với kiểm thử client).
* *Tuyệt đối không chấp nhận các kết luận suy diễn, giả định hoặc "coi như đã chạy".*

### 2.4. Ranh giới tuyệt đối giữa Developer và Tester
* **Developer**: Chịu trách nhiệm thiết kế, lập trình và chỉnh sửa mã nguồn ứng dụng (`backend/app/`, `frontend/src/`).
* **Tester**: Chịu trách nhiệm thiết kế ca kiểm thử và báo cáo chất lượng (`docs/qa/`, `backend/tests/`).
* **Ranh giới bất khả xâm phạm**: **Tester tuyệt đối không được tự ý sửa mã nguồn ứng dụng để làm cho test case pass**. Khi phát hiện lỗi trong mã nguồn, Tester có trách nhiệm ghi nhận lỗi vào `BUG_REPORT.md` và chuyển giao cho Developer xử lý.

### 2.5. Bộ 4 Nguyên Tắc An Toàn Cho AI Tester (AI Guardrails)
1. **Không can thiệp mã nghiệp vụ**: Chỉ đọc mã nguồn để hiểu logic; chỉ viết và sửa mã trong thư mục `tests/` hoặc tài liệu `docs/qa/`.
2. **Không làm sai lệch lịch sử kiểm thử**: Không sửa đổi hoặc xóa bỏ các kết quả kiểm thử đã thất bại mà không có lý giải kỹ thuật rõ ràng.
3. **Không tự ý mở rộng phạm vi nghiệm thu**: Tiêu chí chấp nhận (AC) do Product Owner phê duyệt là thước đo duy nhất; Tester không tự ý thêm bớt tiêu chí.
4. **Bảo tồn tính toàn vẹn CSDL**: Các bài kiểm thử phải chạy trên CSDL thử nghiệm cô lập, có cơ chế rollback/teardown để không làm hỏng dữ liệu demo.

---

## 3. PHẠM VI QUYỀN HẠN TÀI NGUYÊN (OWNERSHIP & PERMISSIONS)

### 3.1. Phân vùng quyền thao tác

| Khu vực tài nguyên | Quyền của Tester | Trách nhiệm |
| :--- | :---: | :--- |
| `docs/qa/` (Toàn bộ thư mục con) | **Toàn quyền (R/W)** | Sở hữu và duy trì toàn bộ tài liệu kiểm thử |
| `backend/tests/` | **Toàn quyền (R/W)** | Soạn thảo, bổ sung và tối ưu hóa các ca kiểm thử tự động |
| `docs/planning/`, `docs/architecture/` | **Chỉ đọc (Read-only)** | Tham chiếu làm nguồn sự thật để thiết kế test |
| `backend/app/`, `frontend/src/` | **Chỉ đọc (Read-only)** | Khảo sát luồng mã; **nghiêm cấm sửa đổi** |
| `docker-compose.yml`, cấu hình CI/CD | **Tham vấn (Consulted)** | Đề xuất bổ sung môi trường kiểm thử cho DevOps |

### 3.2. Danh mục 19 điều cấm tuyệt đối (Strictly Forbidden Actions)
1. Cấm sửa mã nguồn ứng dụng để test case chạy qua.
2. Cấm bỏ qua (skip) test case bị fail mà không có sự đồng ý của Tech Lead.
3. Cấm xóa bỏ các assertion quan trọng để che giấu lỗi logic.
4. Cấm hardcode dữ liệu giả mạo trong mã nguồn để vượt qua kiểm thử.
5. Cấm thay đổi giá trị cấu hình bảo mật (SECRET_KEY, hạn mức nợ) mà không được duyệt.
6. Cấm sửa đổi trực tiếp dữ liệu trên môi trường Staging/Production bằng lệnh thủ công.
7. Cấm tự ý sửa đổi tiêu chí nghiệm thu (Acceptance Criteria) của Story.
8. Cấm báo cáo trạng thái PASS mà không có bằng chứng chạy lệnh thực tế.
9. Cấm sao chép dữ liệu từ các dự án bên ngoài không rõ nguồn gốc.
10. Cấm tạo các ca kiểm thử có độ trễ vô hạn hoặc phụ thuộc tài nguyên mạng không ổn định mà không có timeout/mock.
11. Cấm lưu trữ thông tin nhạy cảm, mật khẩu thật hoặc khóa API sản xuất vào test files.
12. Cấm xóa nhật ký kiểm thử hồi quy của các sprint trước.
13. Cấm đổi tên tiêu đề chuẩn đã được quy định trong các tài liệu mẫu.
14. Cấm gộp nhánh (merge PR) khi chưa có sự xác nhận của tối thiểu 1 reviewer khác.
15. Cấm tự động đóng lỗi (Close Bug) khi chưa có ca kiểm thử hồi quy chứng minh lỗi đã hết.
16. Cấm chạy kiểm thử tải (Stress test) trên môi trường phát triển chung mà không báo trước.
17. Cấm sử dụng các công cụ bên ngoài ghi đè cấu trúc CSDL mà không qua migration script.
18. Cấm tự ý đánh giá "Hệ thống hoàn thành 100%" khi các rào cản phần cứng vẫn tồn tại.
19. Cấm tạo các broken link giữa các file tài liệu trong hệ thống.

---

## 4. HỆ THỐNG CÁC NGUỒN SỰ THẬT (SOURCES OF TRUTH)

Khi phát sinh mâu thuẫn thông tin, Tester áp dụng thứ bậc ưu tiên nguồn sự thật:
1. **Mức 1 (Tối cao - Năng lực thực tế)**: Mã nguồn đang chạy (`backend/app/`, `frontend/src/`), ràng buộc CSDL (`models/`), và kết quả thực thi kiểm thử thực tế (`pytest`).
2. **Mức 2 (Thỏa thuận cam kết)**: Kế hoạch Sprint đã duyệt (`docs/planning/`), Hiến chương kiểm thử (`STANDARD.md`).
3. **Mức 3 (Đặc tả thiết kế)**: Hồ sơ thiết kế UX/UI (`docs/design/`), Báo cáo kiến trúc (`docs/architecture/`).
4. **Mức 4 (Tài liệu phác thảo / Tham khảo)**: Các file phác thảo cũ (`phacthaobandau/`, ghi chú cá nhân) — chỉ dùng để gợi ý nơi tìm kiếm, tuyệt đối không coi là sự thật.

---

## 5. MÔ HÌNH NHIỆM VỤ PHÂN CẤP: E → S → T (HIERARCHY MODEL)

Dự án phân rã công việc theo mô hình 3 cấp:
* **Epic (E-xx)**: Mục tiêu năng lực cấp cao của hệ thống (ví dụ: Quản trị mạng lưới trạm sạc, Thanh toán ví tiền điện tử).
* **Story (S-xx)**: Câu chuyện người dùng hoàn chỉnh mang lại giá trị độc lập, có tiêu chí nghiệm thu rõ ràng (ví dụ: S-02 Đăng nhập và khóa tạm; S-04 Tạo và sửa trạm sạc).
* **Task (T-xx)**: Nhiệm vụ kỹ thuật cụ thể phân bổ cho lập trình viên (ví dụ: Tạo model SQLAlchemy, viết API endpoint, dựng form React).

---

## 6. QUY TẮC PHÂN TÍCH PHỤ THUỘC (DEPENDENCY RULES)

1. **Phụ thuộc xuôi (Forward Dependency)**: Một Story chỉ có thể bắt đầu khi các Story nền tảng đã đạt trạng thái `ACCEPTED`.
2. **Phụ thuộc chéo (Cross-Component Dependency)**: Tính năng phía Frontend chỉ được coi là sẵn sàng kiểm thử tích hợp khi API Backend tương ứng đã vượt qua tầng Unit/Integration test.
3. **Phụ thuộc môi trường (Environment Dependency)**: Mọi kiểm thử liên quan đến bên thứ ba (AI, cổng thanh toán) phải có lớp Mocking độc lập để không làm nghẽn chu trình CI/CD.

---

### 7. MÔ HÌNH TRUY VẾT CHUẨN VÀ HAI LUỒNG PHÂN TÍCH ĐỘC LẬP (CANONICAL TRACEABILITY & DUAL-STREAM MODEL)

Chuỗi truy vết chuẩn mực:
$$\text{Requirement (AC)} \longleftrightarrow \text{Technical Task (T)} \longleftrightarrow \text{Source Code} \longleftrightarrow \text{Test Case (TC)}$$

### Hai luồng phân tích độc lập (Dual-Stream Model):
* **Luồng 1 - Kiểm chứng Nghiệm thu (Verification Stream)**: Đối chiếu từng tiêu chí AC xem mã nguồn và test case đã thỏa mãn đúng và đủ chưa.
* **Luồng 2 - Rà soát Kỹ thuật Độc lập (General Review Stream)**: Đánh giá chất lượng mã nguồn trên 5 khía cạnh độc lập: Độ an toàn CSDL, Khả năng chịu lỗi, Tính nhất quán kiểu dữ liệu, Hiệu năng truy vấn và Trải nghiệm người dùng.

---

## 8. HỆ THỐNG GIÁ TRỊ CHUẨN (CANONICAL ENUMS & QUY TẮC BẢO TOÀN)

Tất cả các tài liệu QA bắt buộc sử dụng đúng danh mục giá trị Enum chuẩn, không tự ý viết hoa/thường tùy tiện hoặc dịch sang từ ngữ khác:

### 8.1. Impact Type: `BREAKING`, `NON_BREAKING`, `NONE`
### 8.2. Task Nature: `NEW_FEATURE`, `BUG_FIX`, `REFACTOR`, `CHORE`, `SPIKE`
### 8.3. Verification Status: `VERIFIED`, `UNVERIFIED`, `FAILED`
### 8.4. Acceptance Status: `ACCEPTED`, `REJECTED`, `IN_PROGRESS`, `BLOCKED`
### 8.5. Regression Status: `PASSED`, `FAILED`, `NOT_RUN`
### 8.6. Review Verdict: `APPROVED`, `REQUEST_CHANGES`, `COMMENTED`
### 8.7. Defect Severity: `CRITICAL` (P0), `MAJOR` (P1), `MODERATE` (P2), `MINOR` (P3)
### 8.8. Blocker Type: `ENVIRONMENT`, `DEPENDENCY`, `HARDWARE_GAP`, `SCOPE_UNCLEAR`
### 8.9. Target Dependency: `STORY_DEPENDENT`, `TASK_DEPENDENT`, `INFRA_DEPENDENT`
### 8.10. Regression Scope: `FULL_REGRESSION`, `SELECTIVE_REGRESSION`, `SMOKE_ONLY`
### 8.11. General Review 5-Dimension Impact: `ARCHITECTURE`, `SECURITY`, `DATABASE_INTEGRITY`, `PERFORMANCE`, `UX_STABILITY`

---

## 9. QUY CHUẨN ĐÁNH GIÁ TỔNG QUÁT (GENERAL REVIEW STANDARD & OPERATING RULES)

Khi thực hiện đánh giá độc lập (General Review) trên một Story hoặc module:
1. Đánh giá tính chịu lỗi khi CSDL bị ngắt kết nối đột ngột.
2. Kiểm tra tính toàn vẹn khóa ngoại và ràng buộc duy nhất trong CSDL.
3. Rà soát nguy cơ tấn công leo quyền ngang (IDOR) trên mọi tham số ID truyền từ client.
4. Đánh giá tính đầy đủ của thông báo lỗi trả về cho client (có thông điệp rõ ràng, không để lộ stack trace nội bộ).

---

## 10. QUY TẮC THIẾT KẾ VÀ THỰC THI KIỂM THỬ (TEST EXECUTION 5-LAYERS)

Mọi bộ test bổ sung phải được phân loại rõ ràng vào đúng tầng:
* **Tầng 1 (Unit)**: Kiểm thử logic nội bộ hàm, thuật toán toán học.
* **Tầng 2 (Service/Model)**: Kiểm thử nghiệp vụ và ràng buộc CSDL.
* **Tầng 3 (API/Integration)**: Kiểm thử gọi qua TestClient, kiểm tra HTTP status code và JSON schema.
* **Tầng 4 (Mock/Resilience)**: Kiểm thử cơ chế dự phòng khi dịch vụ ngoài gặp sự cố.
* **Tầng 5 (Frontend/E2E)**: Kiểm thử trải nghiệm giao diện người dùng.

---

## 11. QUY TẮC BẰNG CHỨNG THỰC TẾ (EVIDENCE RULES)

* Bằng chứng kiểm thử tự động phải ghi rõ: Thời điểm chạy, phiên bản môi trường, số lượng test passed, mã test case cụ thể.
* Bằng chứng lỗi phải ghi rõ: Đường dẫn file, dòng code gây lỗi, các bước tái hiện, kỳ vọng thực tế và log ngoại lệ.

---

## 12. QUY TẮC PHÂN TÍCH TÁC ĐỘNG VÀ HỒI QUY CHỌN LỌC (SELECTIVE REGRESSION)

Khi một module bị sửa đổi:
1. Xác định phạm vi ảnh hưởng trực tiếp (Direct Impact) và gián tiếp (Indirect Impact).
2. Tra cứu [Bản đồ ma trận hồi quy trong INVENTORY.md](INVENTORY.md#8-regression-reference).
3. Thực thi tối thiểu toàn bộ các test suites liên quan trực tiếp.
4. Nếu sửa đổi thuộc tầng cấu hình lõi (`config.py`, `database.py`), bắt buộc kích hoạt `FULL_REGRESSION` (chạy toàn bộ 84 tests).

---

## 13. QUY CHUẨN ĐỊNH DẠNG TÀI LIỆU ĐẦU RA (OUTPUT DOCUMENT SCHEMAS)

Mọi tài liệu báo cáo QA sinh ra phải có phần Metadata ở đầu trang:
```markdown
> **Loại tài liệu**: [Tên loại]
> **Tham chiếu chuẩn mực**: [File chuẩn tương ứng]
> **Thời điểm thẩm định**: [YYYY-MM-DD]
> **Trạng thái**: [ACTIVE / DRAFT / IN_REVIEW]
```

---

## 14. DANH MỤC KIỂM TRA AN TOÀN TRƯỚC KHI KẾT THÚC (FINAL SAFETY CHECK)

Trước khi đóng phiên làm việc kiểm thử hoặc phát hành báo cáo:
- [ ] Không có file mã nguồn ứng dụng nào bị sửa đổi trái thẩm quyền.
- [ ] Lệnh `pytest` chạy lại toàn bộ và đạt tỷ lệ 100% PASS.
- [ ] Các khuyết tật mới phát hiện đã được ghi nhận đầy đủ vào `BUG_REPORT.md`.
- [ ] Không có liên kết hỏng (broken markdown link) trong các tài liệu mới tạo.
- [ ] Dữ liệu CSDL kiểm thử được dọn dẹp sạch sẽ.