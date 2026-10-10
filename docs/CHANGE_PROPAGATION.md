# HƯỚNG DẪN LAN TRUYỀN THAY ĐỔI TÀI LIỆU (CHANGE PROPAGATION GUIDE)

> **Loại tài liệu**: Quy chuẩn đồng bộ và lan truyền thay đổi kỹ thuật (Change Propagation & Synchronization Guide)  
> **Vị trí lưu trữ**: `docs/CHANGE_PROPAGATION.md`  
> **Đối tượng tuân thủ**: Toàn bộ AI Agents, QA Engineers và Lập trình viên tham gia dự án  
> **Mục đích**: Quy định rõ ràng khi chỉnh sửa bất kỳ thành phần nào trong mã nguồn hoặc cấu hình thì bắt buộc phải cập nhật đồng bộ vào những tài liệu nào, đảm bảo tài liệu phản ánh trung thực trạng thái của hệ thống.

---

## BẢNG TÓM TẮT: LOẠI THAY ĐỔI VÀ TÀI LIỆU BẮT BUỘC CẬP NHẬT

| Khi thay đổi thứ này | Thư mục / Mẫu file bị tác động | Tài liệu bắt buộc cập nhật (đường dẫn từ gốc) |
| :--- | :--- | :--- |
| **1. Tham số / Cấu hình / Biến môi trường** | `backend/app/core/config.py`, `backend/.env.example` | `docs/devops/OPERATIONS.md`<br/>`docs/planning/SPRINT_STATUS.md`<br/>`docs/architecture/PROJECT_STRUCTURE.md`<br/>`README.md (ở thư mục gốc)` |
| **2. CSDL / Ràng buộc / Entity Model / Migration** | `backend/app/models/`<br/>`backend/alembic/versions/`<br/>`backend/seed_data.py` | `docs/architecture/PROJECT_STRUCTURE.md`<br/>`docs/planning/SPRINT_STATUS.md`<br/>`README.md (ở thư mục gốc)`<br/>`docs/devops/OPERATIONS.md` |
| **3. Test Cases (Thêm / Sửa / Xóa)** | `backend/tests/test_*.py` | `docs/qa/INVENTORY.md`<br/>`docs/qa/reports/TEST_REPORT.md`<br/>`docs/qa/reports/REGRESSION_REPORT.md`<br/>`docs/architecture/PROJECT_STRUCTURE.md`<br/>`docs/planning/SPRINT_STATUS.md`<br/>`README.md (ở thư mục gốc)` |
| **4. Logic API / Endpoint Backend** | `backend/app/api/v1/endpoints/`<br/>`backend/app/schemas/`<br/>`backend/app/api/v1/__init__.py` | `backend/README.md`<br/>`docs/qa/integration/FRONTEND_BACKEND.md`<br/>Hồ sơ câu chuyện người dùng trong `docs/qa/stories/` |
| **5. Giao diện / Sai lệch thiết kế (UI Drift)** | `frontend/src/pages/`<br/>`frontend/src/components/`<br/>`frontend/src/context/` | `docs/design/README.md`<br/>`docs/design/OPERATOR_DASHBOARD_UX.md`<br/>`docs/qa/integration/FRONTEND_BACKEND.md` |
| **6. Thêm tính năng / Use Case / Hoàn thành Story** | `backend/app/`<br/>`frontend/src/` | Hồ sơ câu chuyện người dùng trong `docs/qa/stories/`<br/>`docs/planning/SPRINT_STATUS.md`<br/>`docs/architecture/PROJECT_STRUCTURE.md`<br/>`README.md (ở thư mục gốc)` |
| **7. Sửa lỗi (Fix Bug)** | File mã nguồn tại `backend/app/` hoặc `frontend/src/` | `docs/qa/reports/BUG_REPORT.md`<br/>`docs/qa/reports/REGRESSION_REPORT.md`<br/>`docs/planning/SPRINT_STATUS.md`<br/>`docs/architecture/PROJECT_STRUCTURE.md` |
| **8. Dependency / Thư viện phụ thuộc** | `backend/requirements.txt`<br/>`frontend/package.json`<br/>`frontend/package-lock.json` | `docs/devops/OPERATIONS.md`<br/>`backend/README.md`<br/>`docs/architecture/PROJECT_STRUCTURE.md` |
| **9. Thêm / Di chuyển / Đổi tên tài liệu** | Các file `.md` trong `docs/` hoặc thư mục gốc | `docs/architecture/PROJECT_STRUCTURE.md`<br/>`docs/architecture/ANALYSIS_SUMMARY.md`<br/>`docs/README.md`<br/>`README.md (ở thư mục gốc)` |
| **10. Sửa nội dung tài liệu** | Các file `.md` trong `docs/` hoặc thư mục gốc | Chỉ sửa trực tiếp file đó; chỉ cập nhật `docs/planning/SPRINT_STATUS.md` và `docs/architecture/PROJECT_STRUCTURE.md` khi cấu trúc phân khu thay đổi |

---

## NGUYÊN TẮC BẮT BUỘC (ĐỌC KỸ TRƯỚC KHI THỰC HIỆN)

### 1. Quy tắc khung 4 phần
* Khi sửa đổi mã nguồn hoặc cấu hình, **chỉ được phép cập nhật vào 2 phần**:
  * **"Hiện trạng"**: Cập nhật giá trị thực tế sau khi sửa.
  * **"Đã thay đổi"**: Ghi nhận lịch sử thay đổi (ngày và mã commit theo quy tắc mục 2, giá trị cũ $\longrightarrow$ giá trị mới, lý do thay đổi theo yêu cầu).
* **Tuyệt đối không tự ý viết thêm vào "Sắp thay đổi" hoặc "Cần thay đổi"** khi người dùng (chủ dự án) chưa duyệt chính thức.

### 2. Quy tắc xác định ngày và mã commit (Áp dụng chung cho mọi khối)
Trước khi ghi nhận vào tài liệu, thực hiện kiểm tra trạng thái Git:
1. Chạy lệnh: `git status --short`
2. **Nếu file vừa sửa vẫn còn xuất hiện trong kết quả** (thay đổi đang thực hiện, chưa commit):
   $\longrightarrow$ Ghi nhận ngày hiện tại theo định dạng DD/MM/YYYY kèm chuỗi: `(chưa commit)`.
3. **Nếu file vừa sửa không còn trong kết quả** (đã commit xong):
   $\longrightarrow$ Chạy lệnh: `git log -1 --format="%cd (%h): %s"` để lấy ngày chính xác và mã băm commit ngắn từ Git.

### 3. Quy tắc an toàn vận hành & CSDL
* **Sao lưu CSDL trước khi thao tác**: Khi chạy bất kỳ lệnh nào có nguy cơ thay đổi cấu trúc bảng hoặc ghi đè dữ liệu, bắt buộc tạo bản sao lưu CSDL bằng lệnh:
  ```powershell
  Copy-Item -Path "backend\ev_csms.db" -Destination "backend\ev_csms.db.bak"
  ```
  > [!WARNING]
  > **Tuyệt đối không commit file sao lưu `.bak` vào kho lưu trữ Git**. Kiểm tra `git status` trước khi commit để đảm bảo file `.bak` không bị thêm vào staging.
* **Cảnh báo `backend/seed_data.py`**: File này thực thi hàm `Base.metadata.drop_all()`, đồng nghĩa với việc **xóa sạch toàn bộ dữ liệu hiện có trong CSDL và nạp lại từ đầu**. Bắt buộc sao lưu DB trước khi chạy, hoặc chỉ chạy trên file CSDL kiểm thử tạm.
* **Cảnh báo `alembic upgrade head`**: Lệnh di chuyển schema có thể gây xung đột với dữ liệu hiện tại, bắt buộc sao lưu DB trước khi thực thi.
* **Cảnh báo môi trường ảo (Virtualenv)**: Lệnh `pip install` **bắt buộc phải thực hiện trong môi trường ảo** (`venv` hoặc `.venv`), tuyệt đối không cài đè lên môi trường Python toàn cục của hệ thống.
* **Cảnh báo tiến trình giao diện**: Lệnh `npm run dev` là tiến trình chạy nền liên tục (foreground) chặn luồng điều khiển, **không dùng làm lệnh kiểm tra tự động**. Để kiểm tra tính toàn vẹn cú pháp và đóng gói giao diện, chỉ sử dụng lệnh không chặn: `npm --prefix frontend run build`.

### 4. Quy tắc dẫn chiếu và lấy số thực
* Không tự ý chép lại các con số từ trí nhớ hoặc từ tài liệu cũ (số test, hạn mức ví, số lượng bảng, số lượng endpoint, số lượng màn hình...).
* Mọi con số điền vào tài liệu **bắt buộc phải lấy từ lệnh kiểm tra thực tế**.
* Mọi file tài liệu và file mã nguồn phải ghi **đường dẫn đầy đủ từ thư mục gốc của dự án**. Phân biệt rõ các file `README.md` khác nhau:
  * `README.md (ở thư mục gốc)`
  * `backend/README.md`
  * `docs/README.md`
  * `docs/design/README.md`
  * `docs/qa/README.md`
  * `docs/qa/stories/README.md`
* Dẫn chiếu vị trí cập nhật theo **tên phần trong khung 4 phần** ("Hiện trạng", "Đã thay đổi", "Sắp thay đổi", "Cần thay đổi") hoặc tiêu đề đặc thù rút gọn bỏ số thứ tự.
* Mọi thông tin không chắc chắn hoặc có sự mâu thuẫn giữa hai nguồn: Bắt buộc ghi nhãn `[CẦN XÁC NHẬN: <nội dung mâu thuẫn kèm cả hai nguồn>]`. Bỏ toàn bộ các từ ngữ khẳng định chủ quan như "100%", "hoàn hảo", "không bao giờ sót".

---

## MA TRẬN LAN TRUYỀN THAY ĐỔI CHI TIẾT

---

### Khối 1: Thay đổi Tham số / Cấu hình / Biến môi trường
* **Khi thay đổi gì**: Điều chỉnh các ngưỡng nghiệp vụ (hạn mức nợ ví, trần thấu chi CSDL, thời hạn JWT, cổng dịch vụ, danh sách CORS, chu kỳ nhịp tim...) hoặc thêm/xóa biến môi trường.
* **File code bị tác động**:
  * `backend/app/core/config.py`
  * `backend/.env.example`
* **Lệnh kiểm tra để lấy số thực**:
  * Đọc giá trị cấu hình thực tế trong code: Đọc trực tiếp tại file `backend/app/core/config.py`.
  * Chạy kiểm tra toàn bộ hệ thống để đảm bảo không gãy cấu hình: `pytest backend/tests`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/devops/OPERATIONS.md`: Cập nhật giá trị biến thực tế vào bảng trong phần tiêu đề "Biến môi trường".
  * `docs/planning/SPRINT_STATUS.md`: Cập nhật giá trị mới vào phần tiêu đề "Hiện trạng", ghi nhận lịch sử thay đổi (ngày, mã commit hoặc chưa commit, giá trị cũ $\longrightarrow$ giá trị mới, lý do theo yêu cầu) vào phần tiêu đề "Đã thay đổi".
  * `docs/architecture/PROJECT_STRUCTURE.md`: Cập nhật giá trị mới vào phần tiêu đề "Hiện trạng", ghi nhận lịch sử thay đổi vào phần tiêu đề "Đã thay đổi" và phần "Important Components".
  * `README.md (ở thư mục gốc)`: Cập nhật thông số tương ứng trong phần tiêu đề "Kiến trúc thực tế" (thuộc phần "Tổng quan hệ thống").

---

### Khối 2: Thay đổi CSDL / Ràng buộc / Entity Model / Migration
* **Khi thay đổi gì**: Thêm bảng, sửa cột, đổi ràng buộc (`CheckConstraint`, `UniqueConstraint`, khóa ngoại) hoặc tạo file di chuyển CSDL Alembic mới.
* **File code bị tác động**:
  * Các file thực thể SQLAlchemy trong thư mục `backend/app/models/`
  * Các file kịch bản di chuyển CSDL trong thư mục `backend/alembic/versions/`
  * `backend/seed_data.py`
* **Lệnh kiểm tra để lấy số thực**:
  * Sao lưu CSDL trước khi thao tác: `Copy-Item -Path "backend\ev_csms.db" -Destination "backend\ev_csms.db.bak"`
  * Chạy nâng cấp migration: `cd backend; alembic upgrade head`
  * Chạy kiểm tra giao dịch và toàn vẹn dữ liệu: `pytest backend/tests/test_sessions_acid.py backend/tests/test_wallet_acid.py`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/architecture/PROJECT_STRUCTURE.md`: Cập nhật thực thể và ràng buộc vào phần tiêu đề "Hiện trạng", ghi nhận nội dung thay đổi schema vào phần tiêu đề "Đã thay đổi".
  * `docs/planning/SPRINT_STATUS.md`: Cập nhật cơ chế bảo vệ CSDL vào phần tiêu đề "Hiện trạng", ghi nhận lịch sử vào phần tiêu đề "Đã thay đổi".
  * `README.md (ở thư mục gốc)`: Cập nhật số lượng và danh sách bảng CSDL trong phần tiêu đề "Trạng thái nhanh" và chi tiết trong phần tiêu đề "Kiến trúc thực tế".
  * `docs/devops/OPERATIONS.md`: Cập nhật lưu ý migration/seed data trong phần tiêu đề "Cơ sở dữ liệu".

---

### Khối 3: Thêm / Sửa / Xóa Test Case
* **Khi thay đổi gì**: Bổ sung test case mới, sửa đổi kỳ vọng (assertion) của test cũ, hoặc xóa bớt ca kiểm thử.
* **File code bị tác động**:
  * Các file kiểm thử trong thư mục `backend/tests/test_*.py`
* **Lệnh kiểm tra để lấy số thực**:
  * Đếm chính xác tổng số test cases và danh mục: `pytest backend/tests --collect-only -q`
  * Chạy toàn bộ để lấy số lượng test pass/fail: `pytest backend/tests -v`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/qa/INVENTORY.md`: Cập nhật số đếm thực tế vào tiêu đề chính, thêm/sửa dòng test case vào bảng trong phần tiêu đề "Test Case Inventory".
  * `docs/qa/reports/TEST_REPORT.md`: Cập nhật số lượng test thực tế trong phần tiêu đề "Test Statistics", dán kết quả chạy mới vào phần tiêu đề "Detailed Results".
  * `docs/qa/reports/REGRESSION_REPORT.md`: Cập nhật số test trong phần tiêu đề "Kết quả Thực thi Kiểm thử Cũ".
  * `docs/architecture/PROJECT_STRUCTURE.md`: Cập nhật tổng số test vào phần tiêu đề "Hiện trạng", ghi nhận tên test mới và lý do bổ sung vào phần tiêu đề "Đã thay đổi", cập nhật phần tiêu đề "Source → Historical Test Mapping".
  * `docs/planning/SPRINT_STATUS.md`: Cập nhật số lượng test vào phần tiêu đề "Hiện trạng", ghi nhận lịch sử vào phần tiêu đề "Đã thay đổi".
  * `README.md (ở thư mục gốc)`: Cập nhật con số đếm thực tế trong phần tiêu đề "Trạng thái nhanh" và bảng kê test trong phần tiêu đề "Kiểm thử".

---

### Khối 4: Thay đổi Logic API / Endpoint Backend
* **Khi thay đổi gì**: Bổ sung endpoint mới, sửa URL router, thay đổi mã lỗi HTTP, sửa Schema DTO Pydantic đầu vào/ra, hoặc điều chỉnh phân quyền RBAC.
* **File code bị tác động**:
  * Các file router trong thư mục `backend/app/api/v1/endpoints/`
  * Các file schema DTO trong thư mục `backend/app/schemas/`
  * `backend/app/api/v1/__init__.py`
* **Lệnh kiểm tra để lấy số thực**:
  * Chạy bộ test liên quan đến endpoint đó: `pytest backend/tests/test_auth.py backend/tests/test_stations.py backend/tests/test_sessions.py`
  * **Xuất schema OpenAPI mà không cần mở server**:
    ```powershell
    python -c "import sys; sys.path.insert(0, 'backend'); from app.main import app; import json; print('Endpoints count:', len(app.openapi()['paths']))"
    ```
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `backend/README.md`: Cập nhật danh sách endpoint và mã phản hồi trong phần tiêu đề "API chính".
  * `docs/qa/integration/FRONTEND_BACKEND.md`: Cập nhật hợp đồng giao tiếp API vào bảng ca kiểm thử trong phần tiêu đề "Scope" hoặc tạo mục ca kiểm thử mới.
  * File hồ sơ câu chuyện người dùng tương ứng trong thư mục `docs/qa/stories/`: Cập nhật bằng chứng phản hồi API vào phần tiêu đề "Test Execution & Evidence".

---

### Khối 5: Điều chỉnh Giao diện / Sai lệch thiết kế (UI Drift)
* **Khi thay đổi gì**: Điều chỉnh layout màn hình, thêm nút thao tác nhanh (Quick-Switch), thay đổi cơ chế hiển thị lỗi, hoặc quyết định đi chệch đặc tả UX ban đầu có lý do kỹ thuật.
* **File code bị tác động**:
  * Các màn hình trong thư mục `frontend/src/pages/`
  * Các thành phần giao diện trong thư mục `frontend/src/components/`
  * Các ngữ cảnh xác thực/trạng thái trong thư mục `frontend/src/context/`
* **Lệnh kiểm tra để lấy số thực**:
  * Kiểm tra tính toàn vẹn cú pháp và biên dịch giao diện (không dùng lệnh chặn terminal `npm run dev`):
    ```powershell
    npm --prefix frontend run build
    ```
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/design/README.md`: Ghi nhận quyết định thay đổi và lý do vào phần tiêu đề "Quyết định lệch so với đặc tả (có lý do)", cập nhật danh sách màn hình trong phần tiêu đề "Trạng thái triển khai".
  * `docs/design/OPERATOR_DASHBOARD_UX.md`: Cập nhật đặc tả chi tiết nếu thay đổi thuộc khu vực Dashboard điều hành (ví dụ: các phần "App Shell & Layout Structure", "KPI Metrics & Summary Cards"...).
  * `docs/qa/integration/FRONTEND_BACKEND.md`: Cập nhật hành vi tương tác phía client vào phần ca kiểm thử tương ứng.

---

### Khối 6: Thêm tính năng / Use Case mới / Hoàn thành Story
* **Khi thay đổi gì**: Hoàn thành toàn bộ chức năng theo tiêu chí nghiệm thu (AC) của một User Story mới hoặc mở rộng Use Case nghiệp vụ.
* **File code bị tác động**: Toàn bộ các file mã nguồn Backend tại `backend/app/` và Frontend tại `frontend/src/` thuộc phạm vi tính năng đó.
* **Lệnh kiểm tra để lấy số thực**:
  * Chạy toàn bộ bộ test tự động: `pytest backend/tests`
  * Kiểm tra build giao diện: `npm --prefix frontend run build`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * File hồ sơ câu chuyện người dùng tương ứng trong thư mục `docs/qa/stories/`:
    * Đối với các Story đã có file: Cập nhật trạng thái nghiệm thu vào phần tiêu đề "Current Status Summary" và bổ sung nhật ký bằng chứng kiểm thử vào "Test Execution & Evidence".
    * Đối với Story mới chưa có file: Tạo file hồ sơ nghiệm thu mới theo cấu trúc chuẩn.
  * `docs/planning/SPRINT_STATUS.md`: Cập nhật danh sách tính năng vào phần tiêu đề "Hiện trạng", ghi nhận tính năng mới và điểm Story Point hoàn thành vào phần tiêu đề "Đã thay đổi".
  * `docs/architecture/PROJECT_STRUCTURE.md`: Cập nhật bảng ma trận truy vết trong phần tiêu đề "Requirement → Task → Source Mapping", ghi nhận việc bổ sung tính năng vào phần tiêu đề "Đã thay đổi".
  * `README.md (ở thư mục gốc)`: Cập nhật chức năng hướng dẫn thử nghiệm trong phần tiêu đề "Dùng thử hệ thống".

---

### Khối 7: Sửa lỗi (Fix Bug)
* **Khi thay đổi gì**: Khắc phục lỗi sai khác logic (Defect), vá lỗ hổng bảo mật (IDOR, RBAC), hoặc xử lý ngoại lệ gây sập tiến trình.
* **File code bị tác động**: File mã nguồn cụ thể chứa lỗi tại `backend/app/` hoặc `frontend/src/`.
* **Lệnh kiểm tra để lấy số thực**:
  * Chạy test case kiểm tra lỗi: `pytest backend/tests/test_<tên_file>.py`
  * Chạy toàn bộ kiểm thử để xác nhận không lỗi hồi quy: `pytest backend/tests`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/qa/reports/BUG_REPORT.md`: Chuyển trạng thái từ OPEN sang RESOLVED / CLOSED, ghi nhận nguyên nhân và biện pháp xử lý dưới mục định danh lỗi tương ứng trong phần tiêu đề "Danh mục lỗi đã xác nhận (Active Defects)". Nếu phát sinh lỗi mới, mở mã lỗi tiếp theo.
  * `docs/qa/reports/REGRESSION_REPORT.md`: Ghi nhận việc sửa lỗi không gây tác dụng phụ hồi quy trong phần tiêu đề "Lỗi Hồi quy (Regression Defects)" và "Trạng thái Hồi quy Tổng thể (Regression Status)".
  * `docs/planning/SPRINT_STATUS.md`: Ghi nhận việc sửa lỗi vào phần tiêu đề "Đã thay đổi".
  * `docs/architecture/PROJECT_STRUCTURE.md`: Ghi nhận việc sửa lỗi vào phần tiêu đề "Đã thay đổi".

---

### Khối 8: Đổi Dependency / Thư viện phụ thuộc
* **Khi thay đổi gì**: Cài đặt thêm thư viện mới, nâng cấp phiên bản package, hoặc gỡ bỏ thư viện không còn sử dụng.
* **File code bị tác động**:
  * `backend/requirements.txt`
  * `frontend/package.json`
  * `frontend/package-lock.json`
* **Lệnh kiểm tra để lấy số thực**:
  * Kiểm tra cài đặt Backend trong môi trường ảo: `pip install -r backend/requirements.txt`
  * Kiểm tra cài đặt và đóng gói Frontend: `npm --prefix frontend install; npm --prefix frontend run build`
  * Chạy kiểm thử tự động: `pytest backend/tests`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/devops/OPERATIONS.md`: Cập nhật phiên bản môi trường yêu cầu trong phần tiêu đề "Yêu cầu".
  * `backend/README.md`: Cập nhật danh mục thư viện lõi trong phần tiêu đề "Lệnh khởi chạy (trong backend/)".
  * `docs/architecture/PROJECT_STRUCTURE.md`: Ghi nhận việc bổ sung thư viện vào phần tiêu đề "Đã thay đổi".

---

### Khối 9: Thêm / Di chuyển / Đổi tên tài liệu
* **Khi thay đổi gì**: Tạo thêm file tài liệu mới, di chuyển file giữa các phân khu trong `docs/`, đổi tên file Markdown hoặc dọn dẹp file phác thảo.
* **File bị tác động**: Các file tài liệu Markdown trong thư mục `docs/` hoặc thư mục gốc.
* **Lệnh kiểm tra để lấy số thực**:
  * Liệt kê chính xác cây thư mục thực tế trên ổ đĩa: `Get-ChildItem -Path "docs" -Recurse -File | Select-Object FullName`
  * Đếm tổng số lượng file markdown: `(Get-ChildItem -Path "docs" -Recurse -File -Filter "*.md").Count`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * `docs/architecture/PROJECT_STRUCTURE.md`: Cập nhật cây thư mục chuẩn xác trong phần tiêu đề "Verified Project Tree (Cây thư mục đã xác minh)", cập nhật danh mục file trong phần tiêu đề "Hiện trạng", ghi nhận lý do di chuyển/đổi tên vào phần tiêu đề "Đã thay đổi".
  * `docs/architecture/ANALYSIS_SUMMARY.md`: Cập nhật danh mục và vai trò của các file trong phần tiêu đề "Khảo sát kết cấu các mục chính của các file .md".
  * `docs/README.md`: Cập nhật bản đồ điều hướng liên kết trong phần tiêu đề "Bản đồ điều hướng toàn hệ thống".
  * `README.md (ở thư mục gốc)`: Cập nhật danh sách tài liệu trong phần tiêu đề "Tài liệu liên quan".

---

### Khối 10: Sửa chính các file tài liệu (Refactoring Docs / Bổ sung nguồn)
* **Khi thay đổi gì**: Điều chỉnh nội dung văn bản, sửa lỗi chính tả, bổ sung trích dẫn nguồn thực tế, chuyển trạng thái mục thiếu sang đã hoàn thành.
* **File bị tác động**: Các file tài liệu Markdown trong thư mục `docs/` hoặc thư mục gốc.
* **Lệnh kiểm tra để lấy số thực**:
  * Kiểm tra sự xuất hiện của các nhãn thiếu: `Select-String -Path "docs\**\*.md" -Pattern "\[THIẾU"`
  * Kiểm tra sự xuất hiện của các nhãn nghi vấn: `Select-String -Path "docs\**\*.md" -Pattern "\[CẦN XÁC NHẬN"`
  * Lấy thông tin ngày/commit: Áp dụng Quy tắc mục 2 ở phần Nguyên tắc.
* **Danh sách tài liệu phải cập nhật**:
  * Đối với các sửa đổi nội dung nhỏ, sửa chính tả, bổ sung nguồn trích dẫn: **Chỉ sửa trực tiếp tại file tài liệu đó**, không ghi vào `docs/planning/SPRINT_STATUS.md` và `docs/architecture/PROJECT_STRUCTURE.md`.
  * **Chỉ khi cấu trúc tài liệu thay đổi** (thêm/xóa file hoặc thay đổi cách tổ chức phân khu): Ghi nhận đợt cập nhật vào phần tiêu đề "Đã thay đổi" của `docs/planning/SPRINT_STATUS.md` và phần tiêu đề "Đã thay đổi" của `docs/architecture/PROJECT_STRUCTURE.md`.

---

## BƯỚC KIỂM TRA CHÉO CUỐI CÙNG: ĐỐI CHIẾU SỰ THỐNG NHẤT SỐ LIỆU GIỮA CÁC TÀI LIỆU

Trước khi kết thúc bất kỳ lượt sửa đổi nào, Agent hoặc người thực hiện bắt buộc phải thực hiện bước kiểm tra chéo (Cross-document Consistency Verification) theo checklist sau:

1. **Đối chiếu số lượng ca kiểm thử (Test Cases)**:
   * Chạy lệnh `pytest backend/tests --collect-only -q` để lấy số đếm thực tế.
   * Con số này phải trùng khớp trên tất cả các tài liệu:
     * `docs/qa/INVENTORY.md`
     * `docs/qa/reports/TEST_REPORT.md`
     * `docs/qa/reports/REGRESSION_REPORT.md`
     * `docs/architecture/PROJECT_STRUCTURE.md`
     * `docs/planning/SPRINT_STATUS.md`
     * `README.md (ở thư mục gốc)`
2. **Đối chiếu số lượng bảng CSDL (Database Tables)**:
   * Đếm số lượng bảng khai báo thực tế trong `backend/app/models/`.
   * Số lượng này phải đồng nhất trên `README.md (ở thư mục gốc)`, `docs/architecture/PROJECT_STRUCTURE.md`, `docs/planning/SPRINT_STATUS.md`.
3. **Đối chiếu số lượng Endpoint API**:
   * Chạy lệnh xuất OpenAPI schema không cần mở server: `python -c "import sys; sys.path.insert(0, 'backend'); from app.main import app; print(len(app.openapi()['paths']))"`.
   * Đối chiếu với mô tả API trong `backend/README.md` và `docs/architecture/ANALYSIS_SUMMARY.md`.
4. **Đối chiếu số lượng màn hình Giao diện**:
   * Đếm số file `.jsx` trong thư mục `frontend/src/pages/`.
   * Đối chiếu với danh sách màn hình trong `docs/design/README.md`, `README.md (ở thư mục gốc)`, `docs/architecture/ANALYSIS_SUMMARY.md`.
5. **Đối chiếu hạn mức ví và trần nợ CSDL**:
   * Kiểm tra giá trị khai báo trong `backend/app/core/config.py` và `backend/app/models/wallet.py`.
   * Giá trị này phải đồng nhất trên:
     * `docs/devops/OPERATIONS.md`
     * `docs/planning/SPRINT_STATUS.md`
     * `docs/architecture/PROJECT_STRUCTURE.md`
     * `README.md (ở thư mục gốc)`
6. **Đối chiếu số lượng file tài liệu**:
   * Chạy lệnh `(Get-ChildItem -Path "docs" -Recurse -File -Filter "*.md").Count` để đếm số file thực tế.
   * Cây thư mục được vẽ trong `docs/architecture/PROJECT_STRUCTURE.md` và `docs/README.md` phải khớp chính xác với số file thực tế trên ổ đĩa.
7. **Quy tắc xử lý mâu thuẫn**:
   * **Nếu hai nguồn trong code hoặc giữa code và tài liệu khác nhau**: Ghi nhận cả hai giá trị kèm nhãn `[CẦN XÁC NHẬN: nguồn A ghi X, nguồn B ghi Y]`. **Tuyệt đối không tự ý sửa ép số liệu của một bên theo bên kia** khi chưa được người dùng (chủ dự án) xác nhận.

---

*(Ghi chú: Các file chỉ dẫn tác tử như `CLAUDE.md`, `GEMINI.md` hiện chưa có trong kho mã nguồn. Khi các file này được tạo, sẽ bổ sung thêm một dòng trỏ tới file này).*
