# SỔ TAY HƯỚNG DẪN LÀM VIỆC VỚI AI AGENT (TEAM AGENT GUIDE)

## 1. Mục đích và đối tượng
Sổ tay hướng dẫn này dành cho toàn bộ thành viên trong nhóm phát triển dự án EV CSMS, thiết lập quy chuẩn và phương pháp giao việc, kiểm soát và phối hợp an toàn với các AI Agent (như Claude, Gemini, Antigravity) trong quá trình xây dựng mã nguồn và tài liệu. Tài liệu giúp nhóm khai thác tối đa năng lực hỗ trợ của AI nhưng vẫn đảm bảo tuyệt đối tính toàn vẹn kiến trúc, chất lượng kiểm thử và kỷ luật vận hành của dự án.

---

## 2. Giới thiệu thư mục và file trong `docs/`

Tra cứu cấu trúc tổng thể và bản đồ điều hướng kiểm thử tại `docs/README.md`. Tra cứu bản đồ cây thư mục mã nguồn và ma trận truy vết hệ thống tại `docs/architecture/PROJECT_STRUCTURE.md`. Dưới đây là danh mục chi tiết các thư mục và file tài liệu hiện có trong `docs/`:

### Cây thư mục tài liệu `docs/`
- `docs/`: Thư mục tài liệu kỹ thuật trung tâm của dự án.
  + `docs/README.md`: Nguồn tra cứu chính và cổng điều hướng kiểm thử, FAQ nghiệp vụ hệ thống. Đọc khi bắt đầu tìm hiểu dự án hoặc tra cứu liên kết. Thuộc loại: Quy tắc & Cổng điều hướng.
  + `docs/CHANGE_PROPAGATION.md`: Hướng dẫn lan truyền thay đổi và ma trận cập nhật tài liệu bắt buộc sau mỗi lần sửa mã nguồn hoặc cấu trúc. Đọc khi chuẩn bị cập nhật tài liệu hoặc đóng phiên làm việc. Thuộc loại: Quy tắc.
  + `docs/TEAM_AGENT_GUIDE.md`: Sổ tay hướng dẫn thành viên nhóm giao việc và phối hợp an toàn với AI Agent (file này). Đọc khi mở phiên làm việc cùng Agent. Thuộc loại: Quy tắc.
- `docs/architecture/`: Thư mục hồ sơ kiến trúc hệ thống và kiểm toán cấu trúc.
  + `docs/architecture/PROJECT_STRUCTURE.md`: Nguồn tra cứu chính về bản đồ cấu trúc cây thư mục và ma trận truy vết hệ thống. Tra cứu khi cần xác định vị trí, vai trò từng file mã nguồn và test. Cập nhật khi thêm, xóa, đổi tên file. Thuộc loại: Hiện trạng & Tra cứu chính.
  + `docs/architecture/ANALYSIS_SUMMARY.md`: Báo cáo phân tích toàn diện cấu trúc tài liệu và hạ tầng kỹ thuật CSMS. Đọc khi cần nắm bức tranh tổng thể kiểm toán kiến trúc và hạ tầng. Thuộc loại: Báo cáo.
- `docs/design/`: Thư mục hồ sơ thiết kế trải nghiệm người dùng và giao diện.
  + `docs/design/README.md`: Nhật ký đối chiếu thiết kế và hiện thực giao diện (Design Implementation Drift Log). Đọc và cập nhật khi có sai lệch giữa giao diện thực tế và bản thiết kế. Thuộc loại: Báo cáo / Nhật ký.
  + `docs/design/OPERATOR_DASHBOARD_UX.md`: Đặc tả thiết kế trải nghiệm người dùng (UX/UI Design System Specification). Đọc khi phát triển hoặc thẩm định giao diện bảng điều khiển vận hành CPO. Thuộc loại: Hồ sơ / Quy chuẩn.
- `docs/devops/`: Thư mục hướng dẫn vận hành hạ tầng và môi trường.
  + `docs/devops/OPERATIONS.md`: Sổ tay kỹ thuật vận hành hệ thống (DevOps & Infrastructure Runbook). Đọc khi cần khởi động, build, dừng, seed data hoặc cấu hình môi trường staging. Thuộc loại: Quy tắc / Vận hành.
- `docs/planning/`: Thư mục quản trị kế hoạch và tiến độ sprint.
  + `docs/planning/SPRINT_STATUS.md`: Bảng điều khiển tiến độ quản trị (Project Health & Sprint Status Dashboard). Đọc và cập nhật khi theo dõi tiến độ story, rủi ro và mốc hoàn thành. Thuộc loại: Hiện trạng.
  + `docs/planning/SPRINT_PLAN.md`: Kế hoạch hành động chi tiết Sprint (Operational Sprint Execution Plan). Đọc khi lập kế hoạch hoặc nhận nhiệm vụ User Story trong sprint. Thuộc loại: Kế hoạch.
- `docs/qa/`: Thư mục điều phối chất lượng và hiến chương kiểm thử.
  + `docs/qa/README.md`: Trung tâm điều phối kiểm định chất lượng và hướng dẫn quy trình QA. Đọc khi cần nắm luồng làm việc kiểm thử. Thuộc loại: Quy tắc.
  + `docs/qa/STANDARD.md`: Hiến chương kiểm định chất lượng (QA Central Standard & Rulebook). Đọc khi thiết kế test case hoặc rà soát các điều cấm kiểm thử. Thuộc loại: Quy tắc.
  + `docs/qa/INVENTORY.md`: Sổ cái kiểm kê tài sản kiểm thử (Test Asset Master Register). Đọc và cập nhật khi bổ sung test case mới hoặc tra cứu ma trận hồi quy. Thuộc loại: Hồ sơ / Hiện trạng.
- `docs/qa/integration/`: Thư mục hồ sơ kiểm thử tích hợp.
  + `docs/qa/integration/FRONTEND_BACKEND.md`: Hồ sơ kiểm thử tích hợp liên phân hệ giữa Frontend và Backend. Đọc khi kiểm tra tích hợp API, WebSocket và E2E. Thuộc loại: Hồ sơ.
- `docs/qa/plans/`: Thư mục kế hoạch chiến lược kiểm thử.
  + `docs/qa/plans/TEST_PLAN.md`: Kế hoạch kiểm thử chiến lược (Master Test Strategy & Plan). Đọc khi định hình phạm vi và chiến lược kiểm thử. Thuộc loại: Kế hoạch.
- `docs/qa/reports/`: Thư mục báo cáo và nhật ký khuyết tật.
  + `docs/qa/reports/BUG_REPORT.md`: Báo cáo lỗi và rào cản môi trường (Defect & Blocker Tracking Log). Cập nhật khi phát hiện khuyết tật mới hoặc ghi nhận tiến độ sửa lỗi. Thuộc loại: Báo cáo.
  + `docs/qa/reports/REGRESSION_REPORT.md`: Báo cáo kiểm soát hồi quy (Regression Verification Report). Đọc và cập nhật khi thẩm định kiểm thử hồi quy sau các lần sửa code. Thuộc loại: Báo cáo.
  + `docs/qa/reports/TEST_REPORT.md`: Báo cáo tổng hợp kết quả kiểm thử hiện tại (Test Execution Summary Report). Cập nhật sau các đợt chạy kiểm thử tự động lớn. Thuộc loại: Báo cáo.
- `docs/qa/stories/`: Thư mục hồ sơ nghiệm thu User Stories.
  + `docs/qa/stories/README.md`: Danh mục và hướng dẫn hồ sơ nghiệm thu User Stories. Đọc khi tra cứu danh sách story đã có hồ sơ kiểm chứng. Thuộc loại: Hiện trạng.
  + `docs/qa/stories/S-01.md`: Hồ sơ nghiệm thu & kiểm chứng Story S-01 (Khung ứng dụng chạy được trên máy cá nhân). Thuộc loại: Hồ sơ.
  + `docs/qa/stories/S-02.md`: Hồ sơ nghiệm thu & kiểm chứng Story S-02 (Đăng nhập bằng email và mật khẩu, khoá tạm khi sai nhiều lần). Thuộc loại: Hồ sơ.
  + `docs/qa/stories/S-03.md`: Hồ sơ nghiệm thu & kiểm chứng Story S-03 (Phân quyền RBAC theo vai trò). Thuộc loại: Hồ sơ.
  + `docs/qa/stories/S-04.md`: Hồ sơ nghiệm thu & kiểm chứng Story S-04 (Chủ trạm tạo và sửa thông tin trạm sạc). Thuộc loại: Hồ sơ.
  + `docs/qa/stories/S-05.md`: Hồ sơ nghiệm thu & kiểm chứng Story S-05 (Chủ trạm thêm trụ và đầu nối vào trạm, mã trụ là duy nhất). Thuộc loại: Hồ sơ.
- `docs/research/`: Thư mục báo cáo nghiên cứu và thử nghiệm công nghệ (Spike).
  + `docs/research/K-01-ocpp-simulator.md`: Báo cáo kỹ thuật thử nghiệm PoC kết nối trụ sạc ảo vào máy chủ WebSocket OCPP 1.6J. Thuộc loại: Báo cáo.
  + `docs/research/S-05-AC3-ghi-nhan-cho-PO.md`: Biên bản tham vấn kỹ thuật cho Product Owner về tiêu chí S-05 AC3 chưa đạt được. Thuộc loại: Báo cáo.

*Lưu ý bắt buộc*: Khi thêm, di chuyển hoặc đổi tên bất kỳ file nào trong `docs/`, người thực hiện hoặc Agent bắt buộc phải cập nhật lại mục này.

---

## 3. Ba quy tắc khi giao việc cho agent
1. **Luôn yêu cầu Agent đọc `AGENTS.md` trước tiên**: Mọi chỉ thị giao việc phải nhắc Agent nạp và tuân thủ các nguyên tắc hành vi, ranh giới an toàn và kỷ luật vận hành trong `AGENTS.md`.
2. **Bắt buộc Agent trả lời Bộ 5 câu hỏi và chờ duyệt kế hoạch**: Agent tuyệt đối không được tự ý viết mã nguồn ngay. Phải yêu cầu Agent trình bày kế hoạch kỹ thuật, các file sẽ tác động, rủi ro tiềm ẩn, tiêu chí hoàn thành và danh sách tài liệu cần cập nhật; chỉ bắt đầu code khi bạn đã duyệt kế hoạch.
3. **Phân định rõ phạm vi được sửa và phạm vi cấm đụng chạm**: Trong từng câu lệnh giao việc, phải nêu cụ thể file/thư mục được phép can thiệp và cảnh báo rõ các khu vực cấm (như `phacthaobandau/`, nhánh `main`, các ràng buộc CSDL cốt lõi).

---

## 4. Lộ trình đọc tài liệu cho người

| Vai trò thành viên | File cần đọc | Mục đích | Thứ tự đọc |
| :--- | :--- | :--- | :---: |
| **Thành viên mới (Onboarding)** | `docs/README.md`<br>`CONTRIBUTING.md`<br>`docs/TEAM_AGENT_GUIDE.md`<br>`docs/architecture/PROJECT_STRUCTURE.md`<br>`docs/devops/OPERATIONS.md` | Nắm bức tranh tổng quan dự án, quy ước làm việc nhóm, cách điều phối Agent, sơ đồ thư mục và cách khởi chạy môi trường dev. | 1 → 2 → 3 → 4 → 5 |
| **Lập trình viên Backend** | `CONTRIBUTING.md`<br>`docs/architecture/PROJECT_STRUCTURE.md`<br>`docs/CHANGE_PROPAGATION.md`<br>`docs/devops/OPERATIONS.md` | Nắm luật bảo toàn nghiệp vụ (ACID ví, khóa cổng, ngắt sạc), kiến trúc phân tầng endpoints/services, ma trận lan truyền tài liệu và vận hành API/CSDL. | 1 → 2 → 3 → 4 |
| **Lập trình viên Frontend** | `docs/design/OPERATOR_DASHBOARD_UX.md`<br>`docs/design/README.md`<br>`docs/qa/integration/FRONTEND_BACKEND.md`<br>`docs/CHANGE_PROPAGATION.md` | Nắm hệ thống thiết kế và bảng màu công nghiệp, nhật ký sai lệch UI Drift, đặc tả kết nối API/WebSocket và quy trình cập nhật khi sửa giao diện. | 1 → 2 → 3 → 4 |
| **Kiểm thử viên (QA)** | `docs/qa/STANDARD.md`<br>`docs/qa/INVENTORY.md`<br>`docs/qa/plans/TEST_PLAN.md`<br>`docs/qa/reports/BUG_REPORT.md` | Nắm hiến chương kiểm thử evidence-based và danh mục điều cấm, sổ cái tài sản test, chiến lược kiểm thử và nhật ký theo dõi lỗi. | 1 → 2 → 3 → 4 |
| **Người phụ trách tài liệu / Quản trị** | `docs/CHANGE_PROPAGATION.md`<br>`docs/planning/SPRINT_STATUS.md`<br>`docs/planning/SPRINT_PLAN.md`<br>`docs/architecture/ANALYSIS_SUMMARY.md` | Nắm toàn bộ ma trận đồng bộ tài liệu, quy tắc khung 4 phần, theo dõi tiến độ và báo cáo kiểm toán kiến trúc. | 1 → 2 → 3 → 4 |

---

## 5. Bảng "Loại việc → agent phải đọc → được sửa → không được động"

| Loại việc | Agent phải đọc | Được sửa | Không được động |
| :--- | :--- | :--- | :--- |
| **1. Cấu hình / Biến môi trường** | `backend/app/core/config.py`<br>`CONTRIBUTING.md` mục "Nguyên tắc chung"<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 1" | `backend/app/core/config.py`<br>`.env.example`<br>`backend/.env.example` | Cấm đổi hạn mức nợ hoặc cấu hình bảo mật khi chưa được duyệt (`docs/qa/STANDARD.md` mục "Danh mục điều cấm tuyệt đối"); không động `backend/ev_csms.db`, không động `phacthaobandau/`. |
| **2. CSDL / Model / Migration** | `backend/app/models/`<br>`backend/alembic/`<br>`CONTRIBUTING.md` mục "Nguyên tắc chung"<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 2" | `backend/app/models/*.py`<br>`backend/alembic/versions/*.py` | Cấm chạy `alembic upgrade head` hoặc `seed_data.py` khi chưa tạo file sao lưu `backend/ev_csms.db.bak` (`AGENTS.md` mục "Kỷ luật vận hành hệ thống"); cấm xóa ràng buộc `CheckConstraint`/`UniqueConstraint`; không động `phacthaobandau/`. |
| **3. Test Case** | `docs/qa/STANDARD.md`<br>`docs/qa/INVENTORY.md`<br>`backend/tests/`<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 3" | `backend/tests/test_*.py`<br>`backend/tests/conftest.py` | Cấm sửa mã ứng dụng để test pass; cấm xóa assertion để che lỗi; cấm mock chính lớp đang test (`docs/qa/STANDARD.md` mục "Danh mục điều cấm tuyệt đối"); không động `phacthaobandau/`. |
| **4. Logic API / Endpoint** | `backend/app/api/v1/endpoints/`<br>`backend/app/services/`<br>`CONTRIBUTING.md` mục "Nguyên tắc chung"<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 4" | `backend/app/api/v1/endpoints/*.py`<br>`backend/app/schemas/*.py`<br>`backend/app/services/*.py` | Cấm tự ý di chuyển logic giữa tầng endpoints và services khi chưa có yêu cầu (`AGENTS.md` mục "Ranh giới kiến trúc & mã nguồn"); cấm vi phạm khóa bi quan ví hoặc khóa cổng độc quyền; không động `phacthaobandau/`. |
| **5. Giao diện / UI Drift** | `docs/design/OPERATOR_DASHBOARD_UX.md`<br>`docs/design/README.md`<br>`frontend/src/`<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 5" | `frontend/src/pages/*.jsx`<br>`frontend/src/components/*.jsx`<br>`frontend/src/index.css` | Cấm thay đổi bảng màu công nghiệp đã duyệt; cấm dùng lệnh chạy vô hạn `npm run dev` để kiểm tra (`AGENTS.md` mục "Kỷ luật vận hành hệ thống"); không động `phacthaobandau/`. |
| **6. Tính năng / Story mới** | `docs/planning/SPRINT_PLAN.md`<br>`docs/qa/stories/`<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 6" | File mã nguồn theo phạm vi Story trong `backend/app/`, `frontend/src/`; file hồ sơ `docs/qa/stories/S-xx.md` | Cấm tự ý mở rộng tiêu chí nghiệm thu (AC); cấm đẩy thẳng lên `main`; không động `phacthaobandau/`. |
| **7. Sửa lỗi (Fix Bug)** | `docs/qa/reports/BUG_REPORT.md`<br>`docs/qa/STANDARD.md`<br>File code gây lỗi<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 7" | Đúng file và dòng mã gây lỗi; thêm test tái hiện lỗi trong `backend/tests/test_*.py` | Cấm sửa lan man sang mã không liên quan (*Surgical Changes*); cấm đóng bug khi chưa có ca test chứng minh hết lỗi (`docs/qa/STANDARD.md` mục "Danh mục điều cấm tuyệt đối"); không động `phacthaobandau/`. |
| **8. Dependency / Thư viện** | `backend/requirements.txt`<br>`frontend/package.json`<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 8" | `backend/requirements.txt`<br>`frontend/package.json` | Cấm cài thư viện ngoài danh mục khi chưa được duyệt; cấm chạy `pip install` ngoài môi trường ảo (`AGENTS.md` mục "Kỷ luật vận hành hệ thống"); không động `phacthaobandau/`. |
| **9. Tài liệu Markdown** | `docs/architecture/PROJECT_STRUCTURE.md`<br>`docs/README.md`<br>`docs/CHANGE_PROPAGATION.md` mục "Khối 9" | Các file tài liệu được chỉ định trong `docs/` | Cấm tự ý tạo file mới hoặc đổi cấu trúc thư mục khi chưa được duyệt trước (`AGENTS.md` mục "Kỷ luật vận hành hệ thống"); không động `phacthaobandau/`. |

---

## 6. Bộ prompt mẫu tái sử dụng

### 6.1. Mẫu chung: Mở phiên làm việc
```text
Đọc AGENTS.md để nắm nguyên tắc hành vi, ranh giới an toàn và kỷ luật vận hành.
Đọc docs/README.md và docs/planning/SPRINT_STATUS.md để nắm hiện trạng hệ thống.
Hôm nay chúng ta sẽ làm việc trên nhánh <tên-nhánh>.
Trước khi thực hiện bất kỳ việc gì, hãy xác nhận bạn đã đọc xong các tài liệu trên và sẵn sàng nhận yêu cầu cụ thể.
```

### 6.2. Mẫu chung: Đóng phiên và kiểm tra cuối
```text
Chuẩn bị đóng phiên làm việc:
1. Chạy lệnh kiểm thử: pytest backend/tests và npm --prefix frontend run build. Báo cáo kết quả số test passed và trạng thái build.
2. Kiểm tra danh sách file đã thay đổi bằng lệnh: git status --short
3. Đối chiếu ma trận docs/CHANGE_PROPAGATION.md mục "Ma trận lan truyền thay đổi chi tiết", liệt kê các tài liệu đã cập nhật và kiểm tra khung 4 phần (chỉ sửa Hiện trạng và Đã thay đổi; ngày/commit đúng quy tắc).
4. Quét kiểm tra nhãn [THIẾU] hoặc [CẦN XÁC NHẬN] xem còn mục nào chưa giải quyết không.
Chỉ báo cáo kết quả, không tự ý commit hoặc push code.
```

### 6.3. Mẫu 9 loại việc cụ thể

#### Mẫu 1: Thay đổi Tham số / Cấu hình
```text
Nhiệm vụ: Cấu hình tham số <tên-tham-số> thành <giá-trị-mới>.
Tài liệu bắt buộc đọc: AGENTS.md, backend/app/core/config.py, CONTRIBUTING.md mục "Nguyên tắc chung", docs/CHANGE_PROPAGATION.md mục "Khối 1".
Phạm vi được sửa: backend/app/core/config.py, .env.example, backend/.env.example.
Phạm vi không được động: backend/ev_csms.db, không đổi các hạn mức an toàn/bảo mật khác, không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch trước khi sửa code.
2. Sau khi sửa, chạy pytest backend/tests để kiểm tra.
3. Cập nhật tài liệu liên quan theo docs/CHANGE_PROPAGATION.md mục "Khối 1".
4. Báo cáo: danh sách file đã sửa, lệnh đã chạy và kết quả, các mục [THIẾU] nếu có.
```

#### Mẫu 2: Thay đổi CSDL / Model / Migration
```text
Nhiệm vụ: Cập nhật model CSDL cho <tên-bảng/thực-thể>.
Tài liệu bắt buộc đọc: AGENTS.md, backend/app/models/, backend/alembic/, CONTRIBUTING.md mục "Nguyên tắc chung", docs/CHANGE_PROPAGATION.md mục "Khối 2".
Phạm vi được sửa: backend/app/models/<tên-model>.py, migration mới trong backend/alembic/versions/.
Phạm vi không được động: Cấm chạy alembic upgrade head hoặc seed_data.py khi chưa sao lưu backend/ev_csms.db.bak; cấm xóa CheckConstraint/UniqueConstraint; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Tạo file sao lưu DB trước khi chạy migration thử nghiệm.
3. Cập nhật tài liệu liên quan theo docs/CHANGE_PROPAGATION.md mục "Khối 2".
4. Báo cáo: danh sách file đã sửa, lệnh đã chạy và kết quả, các mục [THIẾU] nếu có.
```

#### Mẫu 3: Thêm / Sửa / Xóa Test Case
```text
Nhiệm vụ: Viết bộ kiểm thử tự động cho <tên-chức-năng/module>.
Tài liệu bắt buộc đọc: AGENTS.md, docs/qa/STANDARD.md, docs/qa/INVENTORY.md, docs/CHANGE_PROPAGATION.md mục "Khối 3".
Phạm vi được sửa: backend/tests/test_<tên-test>.py, backend/tests/conftest.py (nếu cần fixture).
Phạm vi không được động: Cấm sửa mã nguồn ứng dụng (backend/app/) để test pass; cấm xóa assertion; cấm mock chính lớp đang test; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Chạy lệnh kiểm thử: pytest backend/tests/<tên-test>.py -v và ghi nhận kết quả.
3. Cập nhật docs/qa/INVENTORY.md và tài liệu liên quan theo docs/CHANGE_PROPAGATION.md mục "Khối 3".
4. Báo cáo: danh sách ca test mới, kết quả chạy lệnh, các mục [THIẾU] nếu có.
```

#### Mẫu 4: Thay đổi Logic API / Endpoint Backend
```text
Nhiệm vụ: Cập nhật API endpoint <phương-thức-và-đường-dẫn-API>.
Tài liệu bắt buộc đọc: AGENTS.md, backend/app/api/v1/endpoints/, backend/app/services/, CONTRIBUTING.md mục "Nguyên tắc chung", docs/CHANGE_PROPAGATION.md mục "Khối 4".
Phạm vi được sửa: backend/app/api/v1/endpoints/<tên-endpoint>.py, backend/app/schemas/<tên-schema>.py, backend/app/services/<tên-service>.py.
Phạm vi không được động: Duy trì ranh giới kiến trúc hiện tại (CRUD cơ bản tại endpoints, nghiệp vụ giao dịch lõi tại services, không tự ý chuyển đổi tầng); cấm vi phạm khóa bi quan ví hoặc khóa cổng độc quyền; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Kiểm tra API bằng kiểm thử tự động: pytest backend/tests.
3. Cập nhật tài liệu liên quan theo docs/CHANGE_PROPAGATION.md mục "Khối 4".
4. Báo cáo: danh sách file đã sửa, lệnh đã chạy và kết quả, các mục [THIẾU] nếu có.
```

#### Mẫu 5: Điều chỉnh Giao diện / UI Drift
```text
Nhiệm vụ: Điều chỉnh giao diện màn hình <tên-màn-hình-hoặc-component>.
Tài liệu bắt buộc đọc: AGENTS.md, docs/design/OPERATOR_DASHBOARD_UX.md, docs/design/README.md, docs/CHANGE_PROPAGATION.md mục "Khối 5".
Phạm vi được sửa: frontend/src/pages/<tên-trang>.jsx, frontend/src/components/<tên-component>.jsx, frontend/src/index.css.
Phạm vi không được động: Giữ đúng bảng màu công nghiệp đã duyệt; tuyệt đối không dùng lệnh npm run dev để kiểm tra; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Kiểm tra biên dịch giao diện bằng lệnh: npm --prefix frontend run build
3. Cập nhật nhật ký UI Drift tại docs/design/README.md theo docs/CHANGE_PROPAGATION.md mục "Khối 5".
4. Báo cáo: danh sách file đã sửa, kết quả lệnh build, các mục [THIẾU] nếu có.
```

#### Mẫu 6: Thêm tính năng / Story mới
```text
Nhiệm vụ: Triển khai User Story <mã-story: ví dụ S-xx> - <tên-story>.
Tài liệu bắt buộc đọc: AGENTS.md, docs/planning/SPRINT_PLAN.md, docs/qa/stories/, docs/CHANGE_PROPAGATION.md mục "Khối 6".
Phạm vi được sửa: Các file code trong backend/app/ và frontend/src/ thuộc phạm vi story; tạo file hồ sơ docs/qa/stories/<mã-story>.md.
Phạm vi không được động: Cấm tự ý mở rộng tiêu chí chấp nhận (AC); cấm đẩy code lên nhánh main; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Viết test và chạy kiểm thử chứng minh các tiêu chí AC đều đạt.
3. Cập nhật tài liệu theo docs/CHANGE_PROPAGATION.md mục "Khối 6".
4. Báo cáo: danh sách file đã sửa, lệnh kiểm thử đã chạy và kết quả, các mục [THIẾU] nếu có.
```

#### Mẫu 7: Sửa lỗi (Fix Bug)
```text
Nhiệm vụ: Sửa lỗi <mô-tả-lỗi-hoặc-mã-bug> tại <vị-trí-lỗi>.
Tài liệu bắt buộc đọc: AGENTS.md, docs/qa/reports/BUG_REPORT.md, docs/qa/STANDARD.md, docs/CHANGE_PROPAGATION.md mục "Khối 7".
Phạm vi được sửa: Đúng file và dòng mã gây ra lỗi; thêm ca kiểm thử tái hiện bug vào backend/tests/test_<tên-test>.py.
Phạm vi không được động: Không sửa lan man sang mã không liên quan (Surgical Changes); cấm đóng lỗi khi chưa có ca test chứng minh lỗi đã hết; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Tạo ca test tái hiện (chạy fail trước khi sửa, pass sau khi sửa).
3. Cập nhật docs/qa/reports/BUG_REPORT.md theo docs/CHANGE_PROPAGATION.md mục "Khối 7".
4. Báo cáo: nguyên nhân gốc rễ, file đã sửa, kết quả test tái hiện, các mục [THIẾU] nếu có.
```

#### Mẫu 8: Đổi Dependency / Thư viện phụ thuộc
```text
Nhiệm vụ: Thêm/cập nhật thư viện <tên-thư-viện> cho <backend/frontend>.
Tài liệu bắt buộc đọc: AGENTS.md, backend/requirements.txt, frontend/package.json, docs/CHANGE_PROPAGATION.md mục "Khối 8".
Phạm vi được sửa: backend/requirements.txt hoặc frontend/package.json.
Phạm vi không được động: Cấm cài thư viện khi chưa được phê duyệt; cấm chạy pip install ngoài môi trường ảo; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Chạy lệnh cài đặt và kiểm tra đóng gói: pip install (trong venv) hoặc npm --prefix frontend run build.
3. Cập nhật tài liệu liên quan theo docs/CHANGE_PROPAGATION.md mục "Khối 8".
4. Báo cáo: thư viện đã thêm, kết quả lệnh kiểm tra, các mục [THIẾU] nếu có.
```

#### Mẫu 9: Thêm / Di chuyển / Đổi tên tài liệu
```text
Nhiệm vụ: <Tạo mới/Di chuyển/Đổi tên> tài liệu <đường-dẫn-tài-liệu>.
Tài liệu bắt buộc đọc: AGENTS.md, docs/architecture/PROJECT_STRUCTURE.md, docs/README.md, docs/CHANGE_PROPAGATION.md mục "Khối 9".
Phạm vi được sửa: File tài liệu được chỉ định trong docs/.
Phạm vi không được động: Tuyệt đối không tự ý tạo thêm file ngoài danh mục được duyệt; không đổi cấu trúc thư mục dự án; không động phacthaobandau/.
Yêu cầu:
1. Trả lời Bộ 5 câu hỏi trong AGENTS.md và chờ tôi duyệt kế hoạch.
2. Kiểm tra liên kết markdown không bị gãy (broken links).
3. Cập nhật toàn bộ các file chỉ mục theo docs/CHANGE_PROPAGATION.md mục "Khối 9" và mục "Giới thiệu thư mục và file trong docs/" của docs/TEAM_AGENT_GUIDE.md.
4. Báo cáo: danh sách tài liệu đã cập nhật, các mục [THIẾU] nếu có.
```

### 6.4. Mẫu hỗ trợ Git

#### Mẫu a: Chuẩn bị commit
```text
Chạy lệnh git status --short và git diff để kiểm tra toàn bộ thay đổi vừa thực hiện trên nhánh hiện tại.
Đề xuất cho tôi:
1. Danh sách cụ thể các file cần đưa vào staging (git add <file>).
2. Thông điệp commit đề xuất theo đúng quy ước trong CONTRIBUTING.md mục "Viết commit" (dạng <loại>: <việc đã làm>, tiếng Việt).
Tuyệt đối không tự ý chạy git add hay git commit. Chờ tôi xác nhận.
```

#### Mẫu b: Soạn mô tả Pull Request
```text
Dựa trên kết quả chạy test thực tế và lệnh git diff --stat trên nhánh hiện tại, hãy soạn thảo bản mô tả Pull Request theo đúng mẫu template trong .github/pull_request_template.md.
Yêu cầu:
- Điền đầy đủ: Tóm tắt việc đã làm, việc liên quan, cách kiểm tra kèm lệnh thật, kết quả kiểm thử.
- Tích chọn các mục checklist đã hoàn thành (bao gồm việc xác nhận đã cập nhật tài liệu theo docs/CHANGE_PROPAGATION.md).
- Chỉ điền các thông tin có bằng chứng thực tế từ diff và log test, không suy đoán.
Chỉ in bản thảo ra chat để tôi xem duyệt, không ghi vào file.
```

---

## 7. Git và duyệt vào main

Quy chuẩn phân nhánh, viết thông điệp commit và quy trình Pull Request bắt buộc tuân thủ theo các tiêu đề tương ứng trong `CONTRIBUTING.md`:
* Đặt tên nhánh: tuân thủ `CONTRIBUTING.md` mục "Đặt tên nhánh".
* Định dạng commit: tuân thủ `CONTRIBUTING.md` mục "Viết commit".
* Quy trình làm việc và mở PR: tuân thủ `CONTRIBUTING.md` mục "Quy trình làm một việc và mở Pull Request".
* Người xét duyệt và tiêu chí duyệt: tuân thủ `CONTRIBUTING.md` mục "Ai review và review thế nào".
* Tiêu chí hoàn thành trước khi gộp: tuân thủ `CONTRIBUTING.md` mục "Việc phải đạt trước khi coi là xong".
* Quy tắc ngày tháng và mã commit khi cập nhật tài liệu: tuân thủ `AGENTS.md` mục "Quy tắc ngày tháng, commit & khung 4 phần".

### Quy ước do nhóm quyết định (ngày 2026-09-29)
1. `main` là nhánh ổn định. Không ai, kể cả agent, đẩy thẳng lên `main`; mọi thay đổi đi qua nhánh riêng và Pull Request.
2. Tên nhánh: `loại/mô-tả-ngắn`, viết thường, không dấu, nối bằng gạch ngang. Loại: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. [CẦN XÁC NHẬN: repo hiện có nhánh dạng `feature/...`, nhóm chọn `feat/` hay `feature/`]
3. Commit: một dòng `loại: việc đã làm`, tiếng Việt, mỗi commit một việc.
4. Quy trình: cập nhật `main` → tạo nhánh → làm → chạy `pytest backend/tests` → commit → đẩy nhánh → mở PR và điền template → được duyệt → gộp → xóa nhánh.
5. Người duyệt: tối thiểu 1 người khác tác giả. [THIẾU: chưa có tên hoặc vai trò người duyệt]. Người duyệt đọc diff, xem kết quả test, kiểm tra tài liệu đã cập nhật theo `docs/CHANGE_PROPAGATION.md`. Tác giả không tự duyệt PR của mình.
6. Duyệt kỹ hơn (người duyệt tự chạy test) với thay đổi thuộc các luật bảo toàn ở mục "Nguyên tắc chung" trong `CONTRIBUTING.md`, CSDL và migration, cấu hình ngưỡng, xác thực và phân quyền.

### Quy tắc cho agent khi dùng git:
* Chỉ commit khi tôi yêu cầu rõ, và chỉ trên nhánh riêng. Không push, không merge, không đụng `main`.
* Không `git push --force`, `git reset --hard`, không xóa nhánh, không viết lại lịch sử.
* Không `git add .`. Thêm từng file sau khi đã xem `git status` và `git diff`.
* Không commit `.env`, `*.db`, `*.bak`, `__pycache__`, `node_modules`.
* Không duyệt hay gộp PR thay người.

### Khối lệnh thao tác cho người (PowerShell):
```powershell
git switch main
git pull
git switch -c <loại>/<mô-tả-ngắn>
# làm việc...
git status
git diff
git add <đường-dẫn-file-cụ-thể>
git commit -m "<loại>: <việc đã làm>"
git push -u origin <tên-nhánh>
# mở PR, điền template, chờ duyệt; sau khi gộp: git switch main; git pull
```

---

## 8. Checklist của người sau khi agent xong

Trước khi nghiệm thu kết quả công việc của Agent, thành viên nhóm thực hiện kiểm tra chéo theo 4 bước sau:

1. **Kiểm tra phạm vi thay đổi mã nguồn**:
   ```powershell
   git status --short
   git diff --stat
   ```
   *Xác nhận*: Agent chỉ chạm vào các file nằm trong phạm vi được phép, không có file lạ, không có file rác hoặc file sao lưu CSDL lọt vào git.

2. **Chạy kiểm thử tự động xác nhận**:
   ```powershell
   pytest backend/tests
   npm --prefix frontend run build
   ```
   *Xác nhận*: Toàn bộ các test cases chạy đạt kết quả PASS (0 failed) và frontend biên dịch thành công không có lỗi syntax/import.

3. **Xác nhận tính đầy đủ của tài liệu cập nhật**:
   * Đối chiếu với `docs/CHANGE_PROPAGATION.md` mục "Ma trận lan truyền thay đổi chi tiết" tương ứng với loại thay đổi vừa thực hiện.
   * Kiểm tra nội dung cập nhật tuân thủ đúng Quy tắc khung 4 phần: chỉ ghi vào phần "Hiện trạng" và "Đã thay đổi"; không tự ý viết vào "Sắp thay đổi" hay "Cần thay đổi".
   * Kiểm tra ngày tháng và mã commit: nếu chưa commit thì phải ghi rõ "chưa commit".

4. **Tìm kiếm các nhãn tồn đọng chưa giải quyết**:
   ```powershell
   Select-String -Path "docs\**\*.md" -Pattern "\[THIẾU|\[CẦN XÁC NHẬN"
   ```
   *Xác nhận*: Không có nhãn mới phát sinh ngoài ý muốn hoặc nếu có phải được ghi nhận rõ ràng để người dùng xử lý.

---

## 9. Mục và file còn thiếu / nên tạo

Bảng kiểm kê trạng thái thực tế các thành phần trong dự án (chỉ ghi nhận hiện trạng kiểm tra, không tự ý tạo file):

| Thành phần / File / Mục | Trạng thái thực tế | Bên chịu trách nhiệm cung cấp / Quyết định |
| :--- | :---: | :--- |
| `CLAUDE.md` ở thư mục gốc | Chưa có | Người dùng (chủ dự án) tự viết |
| `GEMINI.md` ở thư mục gốc | Chưa có | Người dùng (chủ dự án) tự viết |
| `Dockerfile` và `docker-compose.yml` | Chưa có | Nhóm dự án quyết định khi cần đóng gói triển khai hoặc nộp bài |
| `.github/workflows/ci.yml` | Chưa có | Nhóm dự án quyết định khi đưa dự án lên GitHub repository |
| Script khởi động 1-click (`start.bat` hoặc `run.ps1`) | Chưa có | Nhóm dự án quyết định khi cần công cụ khởi động nhanh |
| `CONTRIBUTING.md` mục "Đặt tên nhánh" | Đã có quy ước loại nhánh | [CẦN XÁC NHẬN: repo hiện có nhánh dạng `feature/...`, nhóm chọn `feat/` hay `feature/`] |
| `CONTRIBUTING.md` mục "Viết commit" | Đã có quy ước | Đã chuẩn hóa dạng `loại: việc đã làm` |
| `CONTRIBUTING.md` mục "Quy trình làm một việc và mở Pull Request" | Đã có quy ước | Đã chuẩn hóa quy trình 4 bước |
| `CONTRIBUTING.md` mục "Ai review và review thế nào" | Đã có quy tắc tối thiểu | [THIẾU: chưa có tên hoặc vai trò người duyệt cụ thể] |
| `.github/pull_request_template.md` | Đã có file vật lý | Cần cập nhật số test thật và bổ sung dòng checklist trỏ tới `docs/CHANGE_PROPAGATION.md` |
| Dòng checklist trỏ tới `docs/CHANGE_PROPAGATION.md` trong PR template | Chưa có | Người dùng phê duyệt sửa file `.github/pull_request_template.md` |
| Khối quy tắc git cho agent trong `AGENTS.md` | Chưa có | Người dùng phê duyệt bổ sung vào `AGENTS.md` từ bản thảo |
| Chuẩn hóa tiêu đề 4 phần (`Hiện trạng`, `Đã thay đổi`, `Sắp thay đổi`, `Cần thay đổi`) tại các file `docs/` | Chưa có | [Đề xuất của agent, chờ duyệt]: Chuẩn hóa đồng loạt tiêu đề cấp 2 tại các file tài liệu trong `docs/` |
| Nội dung cho phần `Sắp thay đổi` và `Cần thay đổi` tại các file `docs/` | Đang thiếu nội dung | Nhóm dự án / Product Owner cung cấp kế hoạch cụ thể trước khi điền |

### Kết quả quét nhãn tồn đọng trong toàn bộ `docs/`:
* Nhãn `[THIẾU]`: 3 vị trí (1 tại `docs/CHANGE_PROPAGATION.md`, 1 tại `docs/architecture/ANALYSIS_SUMMARY.md`, 1 tại `docs/qa/README.md`).
* Nhãn `[CẦN XÁC NHẬN]`: 3 vị trí (tại `docs/CHANGE_PROPAGATION.md`).
