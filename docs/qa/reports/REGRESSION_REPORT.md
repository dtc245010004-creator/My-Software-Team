# BÁO CÁO KIỂM THỬ HỒI QUY (REGRESSION REPORT) — CSMS

> **Loại tài liệu**: Báo cáo kiểm soát hồi quy (Regression Verification Report)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 15  
> **Quy tắc tuân thủ**: Số liệu được kiểm chứng trực tiếp từ việc chạy lại toàn bộ test suites sau mỗi đợt điều chỉnh mã nguồn.

---

## Sửa lỗi theo Báo cáo EV CSMS (10/10/2026, code commit `0bb5f67`)

* **Mã nguồn đã cập nhật**: telemetry ActiveSession dùng WebSocket singleton và ánh xạ đúng tên trường; StopTransaction lưu transactionData vào `MeterValue` hiện có và xử lý cảnh báo `Available` đến trước StopTransaction; scheduler tự chuyển RemoteStart đã quá hạn sang `EXPIRED`; RemoteStop offline trả 409; mô phỏng bị tắt mặc định và chỉ ADMIN dùng được ngoài pytest; trang phiên trống có CTA cho tài xế; Compose đặt tag image simulator.
* **Ruff**: `backend/.venv/Scripts/ruff.exe check .` đạt **All checks passed** ngày 10/10/2026.
* **Alembic**: `alembic heads` trả một head `e72b461d9ac3` (merge của `5f9249bf58da` và `d8f56c4a911e`). Chỉ kiểm tra danh sách head, chưa chạy upgrade/downgrade.
* **Backend**: full suite trong Docker **437 passed, 307 warnings**.
* **Frontend**: `npm test` **39 passed**; `npm run build` thành công với cảnh báo bundle JavaScript lớn hơn 500 kB.
* **Compose/runtime**: cấu hình hợp lệ; backend/frontend HTTP 200, tài khoản demo đăng nhập được, WebSocket smoke `CONNECTED/SUBSCRIBED/PONG`. Chưa kiểm tra giao diện trực quan trên trình duyệt.
* **Migration**: `alembic heads` có một head `e72b461d9ac3`; không chạy migration lên DB dự án trong lượt này.

---

## Full Suite S-28 (08/10/2026)

* **Kết quả**: **298 passed, 1 skipped, 302 warnings** trong 123.28 giây; pytest thu thập 299 ca trên Python 3.14.7.
* **Phạm vi mới**: 20 ca `test_billing_idle_fee.py` kiểm tra tính phí, trạng thái connector, trần phút cấu hình, `Available` muộn, giá trị tariff và lỗi HTTP 422; toàn bộ 20 ca passed.
* **Lỗi hồi quy**: Không có test thất bại sau khi sửa tương thích của StatusNotification với các mock OCPP hiện có.

## Full Suite S-33 — SCRUM-222/221/220/223/225 (09/10/2026, code commit `60e801a` trên `origin/Duong`)

* **Kết quả tại thời điểm chạy S-33 (09/10/2026)**: **411 passed, 303 warnings**; 411 test cases thu thập, 159.16 giây trong backend container Python 3.12. Full suite mới hơn ngày 10/10 đạt 437 passed, 307 warnings (mục phía trên).
* **Phạm vi mới**: 6 ca `test_billing_segments.py` xác minh snapshot giá/idempotency/legacy; 8 ca `test_invoice.py` xác minh DTO, phí chiếm trụ, RBAC, trạng thái review và hóa đơn chưa chốt.
* **Migration**: `d8f56c4a911e` thêm các snapshot idle fee trên `charging_sessions`, sau migration `5ccaa686da2b` tạo `session_billing_segments`; PostgreSQL Compose tạm đạt chu trình upgrade → downgrade → upgrade và duy trì một Alembic head. DB dự án không bị migrate.

## Kiểm tra lại sau điều chỉnh idle fee legacy (09/10/2026, code commit `60e801a` trên `origin/Duong`)

* `test_invoice.py`: **8 passed**.
* Lượt host lịch sử: **409 passed, 1 skipped, 1 error** do Windows `WinError 5` khi tạo `tmp_path` cho test migration; đây không phải lỗi assertion. Vấn đề môi trường được giải quyết bằng cách chạy full suite trong Docker; kết quả mới nhất là 437 passed, 307 warnings.

---

## 1. Danh sách Kiểm thử Hồi quy Hiện tại (Current Regression Tests)

Bộ kiểm thử hồi quy được kích hoạt sau đợt cập nhật logic khóa tạm chống vét cạn mật khẩu và đóng gói Staging ngày **30/09/2026**:
* **Phạm vi hồi quy**: Toàn bộ các module có liên quan trực tiếp hoặc gián tiếp đến Xác thực (`Auth`), Ví tiền (`Wallet`), Phiên sạc (`ChargingSession`) và Trạm sạc (`Station`).
* **Danh sách Test Suites thực thi hồi quy**:
  1. `backend/tests/test_auth.py` (18 tests) — Kiểm tra cơ chế xác thực JWT, RBAC, phản hồi lỗi khóa nợ và khóa tạm 15 phút sau 5 lần sai.
  2. `backend/tests/test_wallet_acid.py` (5 tests) — Kiểm tra tính nguyên tử ACID, nạp tiền, trừ tiền và chuyển trạng thái `is_debt_locked`.
  3. `backend/tests/test_sessions_acid.py` (8 tests) — Kiểm tra ràng buộc ví khi bắt đầu phiên sạc, trừ tiền khi kết thúc và ngưỡng chặn nợ.
  4. `backend/tests/test_sessions.py` (5 tests) — Kiểm tra vòng đời phiên sạc và xung đột đầu nối.
  5. `backend/tests/test_driver_unauthenticated.py` (4 tests) — Kiểm tra luồng sạc của tài xế khách không đăng nhập.
  6. `backend/tests/test_stations.py` (15 tests) — Kiểm tra phân quyền quản trị trạm, trụ và đầu nối của CPO.
  7. `backend/tests/test_simulator.py` (10 tests) — Kiểm tra ngắt sạc khi vượt hạn mức nợ và cơ chế phục hồi sập server.
  8. `backend/tests/test_ai_fallback.py` (18 tests) — Kiểm tra hệ thống khuyến nghị và hạ cấp AI.
  9. `backend/tests/test_health.py` (1 test) — Kiểm tra kết nối dịch vụ.

---

## 2. Kết quả Thực thi Kiểm thử Cũ (Test cũ chạy lại có còn PASS không)

* **Số lượng test case cũ trước đợt chỉnh sửa**: 84 tests.
* **Số lượng test case mới bổ sung**: 05 tests (các test khóa tạm chống vét cạn trong `backend/tests/test_auth.py`).
* **Tổng số test case chạy lại**: **89 tests**.
* **Kết quả**: **89/89 PASSED 100%**.
* **Đánh giá**: Toàn bộ 84 test cũ chạy lại đều vượt qua, không có bất kỳ test cũ nào bị gãy hoặc thay đổi hành vi ngoài ý muốn.

---

## 3. So sánh Hành vi Trước vs Hiện tại (Behavior Comparison)

| Luồng nghiệp vụ / Thành phần | Hành vi trước khi sửa | Hành vi hiện tại (Đã xác minh) | Tác động hồi quy |
| :--- | :--- | :--- | :--- |
| **CSDL Ràng buộc Ví (`wallet.py`)** | `CheckConstraint("balance >= -1000000")` | `CheckConstraint("balance >= -500000")` | Không ảnh hưởng test cũ; bảo vệ an toàn CSDL chặt chẽ hơn |
| **Đăng nhập Tài khoản nợ (`auth.py`)** | Cho phép đăng nhập bình thường kể cả khi nợ | Chặn đăng nhập với HTTP 403: `"tài khoản bị khóa vì - quá 300k"` | Đã xác nhận qua test `test_login_debt_locked_shows_error` |
| **Đăng nhập Sai mật khẩu (`auth.py`)** | Chỉ trả HTTP 401 chung chung, không đếm số lần sai | Tăng `failed_login_attempts`, báo số lần còn lại, khóa tạm 15 phút sau 5 lần sai (HTTP 403) | 13 test cũ của auth vẫn PASS; thêm 5 tests mới xác nhận |
| **Triển khai Staging (`docker-compose.staging.yml`)** | Chưa có file Docker và Compose cho staging | Đóng gói Backend/Frontend qua Docker Compose, tích hợp CI GitHub Actions | Không ảnh hưởng mã nguồn chạy local; chuẩn hóa môi trường |

---

## 4. Lỗi Hồi quy (Regression Defects)

* **Số lượng lỗi hồi quy phát hiện**: **0 lỗi**.
* **Chi tiết**: Không có lỗi hồi quy nào được ghi nhận trong đợt kiểm thử tự động ngày 30/09/2026.
* **Cập nhật 07/10/2026 (chưa commit)**: Trong phạm vi chọn lọc trạm/trụ, `test_station_ownership_rbac.py`, `test_stations.py` và `test_chargers_grid.py` đạt **35 passed, 4 warnings**. Chưa chạy toàn bộ backend suite.

---

## 5. Trạng thái Hồi quy Tổng thể (Regression Status)

* **Lượt full suite hoàn chỉnh gần nhất**: **PASSED** — 437 passed, 307 warnings (10/10/2026, Python 3.12 container, code commit `0bb5f67`).
* **Kiểm tra frontend/runtime**: frontend 39 passed và build thành công; Compose backend/frontend HTTP 200, đăng nhập demo và WebSocket smoke thành công. Chưa kiểm tra trực quan trên trình duyệt.
* **Lượt kiểm tra chọn lọc mới nhất (07/10/2026, chưa commit)**: Các test quyền trạm/trụ và tìm kiếm GPS đạt **35 passed, 4 warnings**; Ruff các file đổi sạch. Đây không phải kết quả của full suite.
* **Lượt full suite lịch sử (09/10/2026, code commit `60e801a` trên `origin/Duong`)**: **411 passed, 303 warnings**; đã được thay thế bởi lượt xác minh ngày 10/10/2026 với 437 passed, 307 warnings.

## 6. Kiểm chứng sau thay đổi khung OCPP (01/10/2026)

* **Kiểm thử chọn lọc**: `backend/tests/test_ocpp_frames.py` đạt 20 passed khi chạy độc lập.
* **Hồi quy toàn bộ cho lần thay đổi này**: 140 passed, 1 warning; kết quả bao gồm các test OCPP mới. Test chạy trong `backend/.venv` từ thư mục tạm để không ghi đè các file test DB có sẵn.

## 7. Kiểm chứng sau gateway OCPP và BootNotification (01/10/2026)

* **Kiểm thử chọn lọc**: `backend/tests/test_boot_notification.py` có 8 ca WebSocket cho Boot, trạm inactive, Boot lặp, SecurityError, heartbeat cấu hình được, mã trụ lạ và trường tùy chọn thiếu.
* **Hồi quy toàn bộ**: 148 passed, 1 warning trong 110.56 giây; kết quả bao gồm 20 ca frame và 8 ca gateway OCPP. Chạy trong thư mục tạm dưới `backend/.venv` để giữ nguyên các DB test có sẵn.

## 8. Kiểm chứng sau idempotency OCPP (01/10/2026)

* **Kiểm thử chọn lọc**: `backend/tests/test_ocpp_idempotency.py` đạt 4 passed; xác minh phát lại response từ CSDL, session mới, cảnh báo action không khớp và cleanup quá 7 ngày.
* **Hồi quy toàn bộ**: 152 passed, 1 warning trong 116.35 giây; có 32 ca OCPP. Suite chạy trong thư mục cô lập dưới `backend/.venv` để tránh ảnh hưởng các DB test có sẵn.

## 9. Kiểm chứng sau Authorize OCPP và idTag (01/10/2026)

* **Kiểm thử chọn lọc**: `test_authorize.py` đạt 6 passed; các suite Authorize, BootNotification và idempotency đạt 18 passed.
* **Hồi quy toàn bộ**: 158 passed, 1 warning trong 117.08 giây; có 38 ca OCPP. Suite chạy trong thư mục cô lập dưới `backend/.venv`.
* **Warning**: `FutureWarning` có sẵn từ `google.generativeai` trong `app/services/ai_service.py`.

## 12. Hồi quy sau MeterValues OCPP (05/10/2026)

* Suite MeterValues: **5 passed**; hồi quy OCPP cùng các luồng phiên sạc: **45 passed, 1 skipped, 79 warnings**.
* Full backend suite: **258 passed, 1 skipped, 181 warnings trong 137.81 giây**; Ruff backend: sạch.
* Test chạy trên DB tạm. SHA-256 của `backend/ev_csms.db` trước và sau kiểm tra giống nhau; không chạy migration trên DB dự án.
* Migration mới kiểm chứng được tiến/lùi ở head hiện tại trên DB tạm. Chuỗi migration từ DB trống bị chặn bởi lỗi lịch sử tạo trùng cột `charging_points.last_seen_at` trong `5ba0e05433d7`.

## 13. Hồi quy sau lọc số đo lùi/trùng MeterValues (05/10/2026)

* `test_meter_values.py` và `test_meter_values_dedup.py`: **10 passed**, gồm kiểm thử concurrency hai bản tin trùng.
* Full backend suite: **263 passed, 1 skipped, 181 warnings trong 138.62 giây**; Ruff backend sạch.
* Migration `339c5001fe7a` nâng/hạ/nâng thành công trên DB tạm. DB dự án không được dùng để chạy test hoặc migration; SHA-256 kiểm tra vẫn là `65C50528BD176262A1438E98DDF44F77620F751D351769CD5751AEAFDE2639BC`.

## 14. Hồi quy sau khôi phục phiên OCPP (05/10/2026)

* Kịch bản `backend/tests/integration/test_reconnect_scenario.py` đạt ba lượt mô phỏng liên tiếp với cấu hình 5 trụ và 20 trụ; số phiên đúng, không nhân đôi, kWh và timestamp StopTransaction khớp payload.
* Full backend suite: **264 passed, 1 skipped, 298 warnings trong 222.40 giây**; Ruff các file đổi sạch.
* Các lượt chạy đầy đủ dùng CSDL tạm. Lượt thử ban đầu chạy nhầm từ thư mục dự án và đã mở `ev_csms.db`/tái tạo `test_ev_csms.db`; không có snapshot trước lượt chạy. `backend/ev_csms.db` không đổi hash.

## 15. Hồi quy sau job phát hiện phiên bất thường (05/10/2026)

* `backend/tests/test_abnormal_session_job.py`: **3 passed**; xác nhận stale heartbeat được gắn cờ, heartbeat mới được giữ nguyên và lịch APScheduler là mỗi phút. Phiên vẫn ở trạng thái `CHARGING`.
* Full backend suite: **267 passed, 1 skipped, 298 warnings trong 155.32 giây**; Ruff các file thay đổi sạch.
* T-55/T-56: full backend suite trong container Python 3.12 đạt **268 passed, 299 warnings**; reconnect qua WebSocket/PostgreSQL thật đạt 3/3 vòng, 5 kWh mỗi phiên; 20/20 trụ SIM hiển thị Online trước khi dọn stack cô lập.
* Migration `c4ab19f2d7e1` đã nâng/hạ/nâng trên SQLite tạm; không áp dụng lên DB dự án.

## 10. Kiểm chứng sau dispatcher và API Reset OCPP (01/10/2026)

* **Kiểm thử chọn lọc**: `test_ocpp_reset.py` đạt 5 passed; kiểm tra CALLRESULT/CALLERROR theo ID, CALL khác vẫn xử lý trong khi chờ, offline, timeout và RBAC.
* **Hồi quy toàn bộ**: 163 passed, 1 warning trong 122.08 giây; có 43 ca OCPP.
* **Warning**: `FutureWarning` có sẵn từ `google.generativeai` trong `app/services/ai_service.py`.

## 11. Sửa lỗi Admin Demo 1-Click (01/10/2026)

* **Thay đổi**: `DEMO_USERS.ADMIN` và `AuthContext.quickSwitch()` dùng chung credential `admin / 12345678a`, trùng với tài khoản admin trong `backend/seed_data.py`.
* **Kiểm chứng build**: `npm --prefix frontend run build` trên host bị chặn do `'vite' is not recognized`; `docker compose -f docker-compose.staging.yml build frontend` thành công và container frontend được cập nhật.
* **Điều tra / xác minh đăng nhập**: Các POST login trong log trả 403; DB cho thấy `failed_login_attempts = 5` và `locked_until` còn hiệu lực. Đã xóa khóa tạm cho `admin`. Gửi một lần đăng nhập API với `admin / 12345678a` nhận HTTP 200, username `admin`, role `ADMIN` (không ghi token ra output).

## 12. Hồi quy sổ cái ví append-only S-41 (10/10/2026, chưa commit)

* `test_wallet_ledger_s41.py` + `test_wallet_acid.py`: **18 passed**; xác minh giao dịch chỉ thêm dòng, hai writer không làm mất dòng, reconcile lock chặn giao dịch và Admin chỉ mở sau khi ledger khớp.
* Full suite host: **448 passed, 1 skipped, 1 setup error** do Windows `WinError 5` ở thư mục pytest tạm cho test migration. Không có failure assertion trong lượt chạy; Docker Desktop chưa truy cập được để chạy suite container.
* Migration S-41 đạt chu trình tiến/lùi/tiến và kiểm tra trigger trên SQLite tạm; trigger PostgreSQL chưa kiểm chứng. Không có migration nào chạy trên DB dự án.

## 13. Xác minh bổ sung S-41 và hồi phục Compose (10/10/2026, chưa commit)

* Backend full suite trong Docker: **451 passed, 307 warnings**. Bộ test schema SQLite Compose cũ cùng S-41/wallet ACID: **19 passed**.
* PostgreSQL tạm đạt `upgrade head → downgrade -1 → upgrade head`; trigger thực tế từ chối UPDATE và DELETE trên `wallet_transactions`. Database tạm đã xóa.
* Sửa lỗi startup từ SQLite volume cũ thiếu `wallets.is_reconcile_locked`; nâng schema idempotent bổ sung cột, chỉ mục duy nhất và trigger. Backend healthy, `/docs` trả 200 và toàn bộ services Compose được khởi động; DB dự án không chạy Alembic.
