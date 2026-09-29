# DANH MỤC HỒ SƠ NGHIỆM THU USER STORIES (QA STORIES HUB)

> **Loại tài liệu**: Danh mục và hướng dẫn hồ sơ nghiệm thu Story (Story Acceptance Index)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.4 & Mục 3  
> **Trạng thái**: ACTIVE (Nguồn sự thật nghiệm thu tính năng Giai đoạn 1)

---

## 1. Nguyên tắc lập hồ sơ nghiệm thu Story

Mỗi User Story trong hệ thống phải có một hồ sơ độc lập (`S-xx.md`) tuân thủ nghiêm ngặt 3 nguyên tắc:
1. **Liên kết truy vết hai chiều (Bidirectional Traceability)**: Kết nối chặt chẽ từ Yêu cầu nghiệp vụ $\longleftrightarrow$ Nhiệm vụ kỹ thuật $\longleftrightarrow$ Mã nguồn triển khai $\longleftrightarrow$ Ca kiểm thử tự động.
2. **Chứng cứ thực tế (Evidence-based)**: Không công nhận hoàn thành nếu thiếu bằng chứng chạy test thực tế từ `pytest` hoặc nhật ký kiểm thử.
3. **Trung thực về hiện trạng**: Nếu có tiêu chí chưa đạt (như AC3 của S-05), phải ghi nhận rõ ràng lý do kỹ thuật và tham chiếu biên bản giải trình gửi Product Owner.

---

## 2. Danh mục các Story đã xác minh trong Giai đoạn 1

| Mã Story | Tiêu đề nghiệp vụ | Phạm vi mã nguồn chính | Bộ kiểm thử liên kết | Trạng thái nghiệm thu |
| :---: | :--- | :--- | :--- | :---: |
| [`S-01`](S-01.md) | Khung ứng dụng chạy được trên máy cá nhân | `backend/app/main.py`, `frontend/src/` | `test_health.py` (1 test) | **ACCEPTED** |
| [`S-02`](S-02.md) | Đăng nhập bằng email/mật khẩu, khoá tạm khi nợ | `backend/app/api/v1/endpoints/auth.py` | `test_auth.py` (12 tests) | **ACCEPTED** |
| [`S-03`](S-03.md) | Mỗi vai trò chỉ thao tác phần việc của mình (RBAC) | `backend/app/core/security.py`, `deps.py` | `test_auth.py`, `test_stations.py` | **ACCEPTED** |
| [`S-04`](S-04.md) | Chủ trạm tạo và sửa thông tin trạm sạc | `backend/app/api/v1/endpoints/stations.py` | `test_stations.py` (15 tests) | **ACCEPTED** |
| [`S-05`](S-05.md) | Chủ trạm thêm trụ và đầu nối, mã trụ là duy nhất | `backend/app/api/v1/endpoints/chargers.py` | `test_stations.py` | **IN_PROGRESS / CONDITIONAL** |

---

## 3. Quy chuẩn cấu trúc một file Story (S-xx.md)

Theo Hiến chương kiểm thử `docs/qa/STANDARD.md`, mỗi hồ sơ Story bắt buộc bao gồm đúng 5 phần:
* **Mục 1**: `Requirement & Acceptance Criteria` (Đặc tả các tiêu chí AC và yêu cầu phi chức năng).
* **Mục 2**: `Tasks Liên Kết / Task Scope (T-xx)` (Danh mục công việc kỹ thuật cụ thể).
* **Mục 3**: `Test Execution & Evidence` (Bằng chứng chạy test thực tế, logs và API assertions).
* **Mục 4**: `Current Status Summary` (Tổng kết trạng thái Story, Task và các Blocker nếu có).
* **Mục 5**: `Luồng Độc Lập: General Review Findings` (Đánh giá độc lập về an toàn CSDL, IDOR, UI drift).

---

## 4. Trạng thái nghiệm thu tổng thể

* **Tổng số Story của Giai đoạn 1**: 05 Stories.
* **Đã nghiệm thu hoàn tất (`ACCEPTED`)**: 04 Stories (S-01, S-02, S-03, S-04).
* **Nghiệm thu có điều kiện / Tạm hoãn 1 phần (`IN_PROGRESS / CONDITIONAL`)**: 01 Story (S-05 — Đạt AC1, AC2, AC4; riêng AC3 kết nối trạm thật qua OCPP được dời sang giai đoạn tiếp theo theo biên bản tham vấn gửi PO).
* **Số lỗi nghiêm trọng còn mở**: 0 lỗi.