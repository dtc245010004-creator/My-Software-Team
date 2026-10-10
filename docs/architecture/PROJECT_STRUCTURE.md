# Project Structure

> **Loại tài liệu**: Bản đồ cấu trúc & Ma trận truy vết hệ thống (Single Source of Architecture Truth)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.2 số 8  
> **Nguồn đối chiếu**: Cây thư mục vật lý đã xác minh, mã nguồn `backend/` & `frontend/`, và `[nguồn tạm: nentangtramsac_bandaydu.md]` ([nentangtramsac_bandaydu.md](../../nentangtramsac_bandaydu.md))

---

## 0. Tiến trình cấu trúc (Theo khung 4 phần: Hiện trạng / Đã thay đổi / Sắp thay đổi / Cần thay đổi)

### 0.1. Hiện trạng
* **Hạn mức ví điện tử & Bảo mật xác thực**:
  * Tầng cơ sở dữ liệu: `backend/app/models/wallet.py` dòng 11 có ràng buộc cứng `CheckConstraint("balance >= -500000", name="check_min_balance")`. Bảng `users` trang bị 2 cột `failed_login_attempts` và `locked_until`.
  * Tầng ứng dụng: `backend/app/core/config.py` quy định `NEGATIVE_BALANCE_LIMIT = -300000` (ngưỡng khóa nợ), `MAX_SAFE_DEBT_LIMIT = -500000` (chặn thấu chi tối đa), `MAX_FAILED_LOGIN_ATTEMPTS = 5` và `LOCKOUT_DURATION_MINUTES = 15` (khóa tạm 15 phút khi sai mật khẩu 5 lần).
* **Sổ cái ví S-41**: `WalletTransaction` là append-only; `post_ledger_entry` là điểm duy nhất cập nhật `Wallet.balance`, với `TOPUP`/`REFUND` dương và `CHARGE_FEE` âm. Job đối soát dùng một truy vấn nhóm mỗi `RECONCILE_INTERVAL_MINUTES` (mặc định 15), khóa ví lệch bằng `is_reconcile_locked`, khác với `is_debt_locked`. Admin chỉ mở khóa qua endpoint có lý do khi tổng ledger đã khớp.
* **Cấu hình migration**: `backend/alembic.ini` trỏ tới `backend/alembic/`; `alembic heads` ngày 10/10/2026 xác nhận một head `f41a0b7c9d22`. Toàn chuỗi lên head và S-41 tiến/lùi/tiến đã kiểm tra trên PostgreSQL tạm; không chạy migration trên DB dự án.
* **Giao thức OCPP 1.6J**: `backend/app/ocpp/frames.py` là bộ đọc/ghi thuần; gateway `/ocpp/{charge_point_code}` xử lý BootNotification, Authorize, MeterValues, CALLRESULT/CALLERROR chờ lệnh và idempotency CSDL. `dispatcher.py` ghép phản hồi theo message ID bằng `asyncio.Future`; API Reset gọi lại dispatcher dùng chung. MeterValues gửi CALLRESULT trước thao tác DB; kiểm tra lùi/trùng và lưu số đo trong transaction có khóa. S-22 trả phiên hiện tại kèm số đo mới nhất; S-23 chờ `StopTransaction` thật sau khi trụ nhận `RemoteStopTransaction`; S-24 lưu yêu cầu RemoteStart trước khi gửi để không lỡ phản hồi sớm; reconnect giữ phiên dựa trên DB. S-27 cung cấp nhật ký append-only, giới hạn bản ghi Operator theo trạm được sở hữu. Job `flag_abnormal_charging_sessions_job` chạy mỗi phút, chỉ gắn cờ khi `last_seen_at` quá `ABNORMAL_SESSION_THRESHOLD_SECONDS` (mặc định 500 giây), không tự đóng phiên.
* **Tính tiền S-28**: `backend/app/services/billing.py` tập trung công thức tiền điện và phí chiếm trụ; bốn điểm kết thúc phiên dùng chung `calculate_session_total`. Connector lưu thời điểm đổi trạng thái và hai mốc idle từ StatusNotification; ChargingSession lưu riêng `idle_amount`. `IDLE_FEE_MAX_MINUTES` (mặc định 240) giới hạn số phút chịu phí sau ân hạn.
* **Tài khoản demo**: `backend/app/services/demo_account_service.py` đồng bộ an toàn các tài khoản/role demo, ví thiếu và IdTag cho stack phát triển khi bật `ENABLE_DEMO_ACCOUNTS=true`; không xóa dữ liệu khác. Nút 1-Click dùng `admin / 12345678a`; `driver_debt` vẫn bị từ chối đăng nhập theo cờ khóa nợ.
* **Bản đồ tối tài xế**: `frontend/src/config/mapConfig.js` dùng OSM tiles kèm lớp CSS `map-tiles-dark`; không phụ thuộc Carto API key.
* **Phạm vi đọc trạm/trụ**: `backend/app/services/station_service.py:filter_station_access` là bộ lọc dùng chung cho list/detail/tree/grid trạm và list/detail trụ. Operator bị giới hạn bởi `Station.operator_id`; Admin xem toàn bộ; khách chỉ xem tài nguyên hoạt động. Bản ghi thiếu GPS vẫn được trả trong truy vấn không đặt bán kính; Connector `Type 2` cũ được chuẩn hóa ở DTO mà không cập nhật DB.
* **Số lượng kiểm thử tự động**: Lượt full suite backend trong Docker ngày 10/10/2026 đạt 451 passed, 307 warnings. Nhóm test wallet ACID/S-41 và nâng schema Compose SQLite legacy đạt 19 passed. Các tổng baseline lịch sử 84, 89 và 90 ca mâu thuẫn `[CẦN XÁC NHẬN]`.
* **Compose với SQLite legacy**: `backend/app/services/compose_schema_service.py` thêm cột `is_reconcile_locked`, unique index và trigger append-only còn thiếu vào volume cũ theo cách idempotent; giữ nguyên số dư và giao dịch hiện tại. Backend đã healthy sau khi build lại.
* **Mô hình dữ liệu**: SQLAlchemy hiện khai báo 18 bảng; `session_billing_segments` lưu snapshot giá/kWh từng đoạn, ngày áp dụng và thành tiền đã làm tròn.
* **Realtime và xử lý OCPP**: ActiveSession dùng `frontend/src/services/websocket.js` qua proxy `/ws/telemetry`, chuyển các trường telemetry backend sang tên UI. StopTransaction ghi `transactionData` vào `meter_values` hiện có; Available trước StopTransaction gắn cờ review thay vì tự kết thúc phiên. Job scheduler dọn RemoteStart quá hạn mỗi phút. Thay đổi ngày 10/10/2026 được kiểm tra bằng full backend suite 437 passed, 307 warnings; frontend 39 passed/build thành công; Compose runtime health và WebSocket smoke thành công.
* **Compose và CI**: `docker-compose.yml` là cấu hình Docker Compose dùng chung cho Sprint 1–4; `.github/workflows/ci.yml` kiểm tra cấu hình, backend và frontend.
* **Khởi chạy toàn bộ Sprint 1–4**: `docker-compose.yml` chạy backend, frontend Nginx, PostgreSQL và simulator; dùng `docker compose up -d --build` hoặc `python run.py`, với API `8001`, UI `8080`, PostgreSQL `5433`. `down` giữ volume.
* **Hạ tầng trụ ảo T-55/T-56**: `docker-compose.yml` có service `ocpp-simulator`, mặc định seed và kết nối 20 mã `SIM-001`…`SIM-020`; seeder OCPP riêng trong `tools/ocpp-spike/` không gọi `backend/seed_data.py`. Stack cô lập đã xác nhận 20/20 trụ Online trên SQLite và PostgreSQL. Kịch bản reconnect qua backend/Postgres thật đạt ba vòng; full backend suite đạt 268 passed, 299 warnings. Workflow `.github/workflows/main.yml` chạy tích hợp sau unit tests và luôn dọn Compose stack.
* **Bộ điều khiển chạy dự án**: `run.py` gọi Docker Compose; `python run.py` build/chạy toàn bộ stack, các action `ps`, `logs`, `down` xem trạng thái, log và dừng mà giữ dữ liệu.
* **Mô phỏng RemoteStart/RemoteStop**: `ALLOW_REMOTE_START_SIMULATION` mặc định false; chế độ mô phỏng chỉ được ADMIN bật ngoài pytest. `TESTING` một mình không mở quyền này.
* **Cơ cấu tổ chức tài liệu**: Phân tách thành 6 phân khu chuyên trách trong `docs/` (`architecture/`, `devops/`, `planning/`, `qa/`, `design/`, `research/`); hiện có 37 file Markdown theo lần đếm ngày 08/10/2026 (chưa commit).

### 0.2. Đã thay đổi
* **SCRUM-283–290 thuộc S-41 (10/10/2026 - chưa commit)**: Dùng `post_ledger_entry` cho nạp/trừ, khóa ghi đồng thời, unique reference, trigger chặn sửa/xóa dòng sổ và cờ `is_reconcile_locked`. Scheduler đối soát theo cấu hình; ví lệch bị khóa, Admin mở lại bằng endpoint có lý do chỉ khi tổng sổ khớp. Ghi nhận lệch/mở khóa qua logger và `audit_logs`; demo/seeder mới ghi số dư mở đầu thành dòng ledger. Full suite Docker đạt 451 passed, 307 warnings; PostgreSQL migration và trigger đã xác minh trên database tạm.
* **Sửa Compose backend unhealthy (10/10/2026 - chưa commit)**: Volume SQLite cũ không có `wallets.is_reconcile_locked`; helper Compose bổ sung schema thiếu cùng trigger/unique index mà không thay đổi dữ liệu. Thêm `backend/tests/test_compose_schema_service.py`; backend `/docs` trả 200 và toàn stack được khởi động.
* **Sửa lỗi theo Báo cáo EV CSMS (10/10/2026, code commit `0bb5f67`)**: Đưa ActiveSession về dùng WebSocket singleton và ánh xạ telemetry; lưu `transactionData` vào `MeterValue`; giữ phiên cần review khi Available đến sớm; thêm job hết hạn RemoteStart; chuẩn hóa RemoteStop offline thành 409; khóa mô phỏng từ xa theo cấu hình/role; thêm CTA bản đồ cho tài xế và image tag simulator. Backend full suite 437 passed, 307 warnings; Ruff `All checks passed`; frontend 39 test passed/build thành công. Compose health và WebSocket smoke thành công; chưa kiểm tra UI trực quan.
* **Bản đồ tối, đăng nhập demo và lệnh chạy chung (09/10/2026 - chưa commit)**: Chuyển tile tối khỏi Carto endpoint yêu cầu API key sang OSM với filter CSS hiện có; Compose phát triển đồng bộ tài khoản demo có kiểm soát mà không drop DB; `docker compose up -d --build` và `python run.py` chạy stack đầy đủ Sprint 1–4 dưới project `ev-csms`, tiếp tục dùng các volume dữ liệu sẵn có `ev-sprint3_sqlite_data` và `ev-sprint3_postgres_data`.
* **Bỏ cấu hình Compose phụ (09/10/2026 - chưa commit)**: Xóa `docker-compose.staging.yml` và `docker-compose.env.example`; README/vận hành chỉ hướng dẫn Compose dùng chung, CI kiểm tra `docker compose config --quiet`. Không đổi named volume database.
* **SCRUM-188/189/190/192 thuộc S-28 (08/10/2026 - chưa commit)**: Thêm phí chiếm trụ/ân hạn theo biểu giá, kiểm tra giá trị âm ở Pydantic, ghi nhận mốc `Finishing`/`SuspendedEV` và `Available`, gom bốn công thức tính tổng vào `billing.py`, lưu `ChargingSession.idle_amount`, và giới hạn phút chịu phí từ settings `IDLE_FEE_MAX_MINUTES` (mặc định 240). Nếu `Available` đến sau billing, chỉ lưu mốc kết thúc; hóa đơn/sổ cái đã ghi không đổi và không tự trừ ví lần hai. Chờ mentor xác nhận cách ghi dòng sổ cái/trừ ví nếu triển khai phí bổ sung. `backend/tests/test_billing_idle_fee.py` có 20 ca; full suite đạt 298 passed, 1 skipped. Migration đã kiểm tra tiến/lùi/nâng lại trên SQLite tạm; không cập nhật DB dự án.
* **SCRUM-222/221/220/223/225 thuộc S-33 (09/10/2026, commit `60e801a` trên `origin/Duong`)**: Snapshot các đoạn S-30/S-31 được lưu cùng giao dịch chốt phiên; endpoint hóa đơn đọc giá/tiền đã chốt, áp RBAC, trả `pending_review` không có số tiền và giữ tổng legacy mà không backfill. DTO hóa đơn có dòng phí chiếm trụ từ snapshot phiên. `test_billing_segments.py` (6) và `test_invoice.py` (8) vẫn được bao phủ trong full suite ngày 10/10/2026: 437 passed, 307 warnings. Migration `d8f56c4a911e` đã kiểm tra upgrade/downgrade/upgrade trên PostgreSQL Compose tạm.
* **Tích hợp S-22/S-23/S-24/S-27 từ nhánh `hung` (07/10/2026 - chưa commit)**: Thêm API phiên hiện tại/số đo mới nhất, luồng RemoteStop chờ StopTransaction, RemoteStart lưu yêu cầu trước khi gửi, và audit log append-only có lọc theo trạm Operator. Sửa phân quyền audit log/Reset, race khi trụ phản hồi nhanh, xử lý thời gian SQLite và chuỗi migration; bỏ các model legacy không còn tham chiếu và `extend_existing` thừa. Toàn bộ backend đạt 275 passed, 1 skipped; Ruff sạch. Migration chỉ chạy trên DB SQLite tạm; DB dự án không bị thay đổi.
* **Sửa phạm vi truy cập trạm/trụ (07/10/2026 - chưa commit)**: Dùng chung bộ lọc owner cho các API list/detail/tree/grid; chi tiết ngoài phạm vi trả `404`, khách không đọc được tài nguyên đã ngừng hoạt động. Giữ trạm thiếu GPS trong kết quả tìm kiếm không bán kính và chuẩn hóa `Type 2` chỉ ở phản hồi. 35 test chọn lọc passed, Ruff sạch; DB dự án không được ghi.
* **Cấu hình khởi chạy Compose (07/10/2026 - chưa commit)**: Tách cổng host để tránh xung đột, thêm healthcheck cho frontend và backend, giữ named volume database; CI override backend port về `8000` để tương thích URL kiểm thử tích hợp.
* **Khung tin nhắn OCPP 1.6J — T-14/T-15 (01/10/2026 - chưa commit)**: Tạo `backend/app/ocpp/` với parser/builder ba loại khung và `backend/tests/test_ocpp_frames.py`; 20 ca OCPP passed riêng, full suite đạt 140 passed và 1 cảnh báo thư viện.
* **BootNotification và gateway OCPP — T-16/T-17 thuộc S-08 (01/10/2026 - chưa commit)**: Thêm `/ocpp/{charge_point_code}`, handler BootNotification, trường metadata trụ, heartbeat interval cấu hình được và migration `5e76bf9b9e5a`; 8 ca WebSocket mới passed, full suite đạt 148 passed và 1 warning.
* **Idempotency OCPP — T-30/T-31 thuộc S-14 (01/10/2026 - chưa commit)**: Thêm model `OcppMessage`, migration `057c4ed34525`, phát lại phản hồi từ CSDL khi CALL trùng, và job dọn bản ghi quá 7 ngày trong scheduler hiện có; 4 test mới, full suite đạt 152 passed và 1 warning.
* **Ủy quyền thẻ OCPP — T-32/T-33 thuộc S-15 (01/10/2026 - chưa commit)**: Thêm `IdTag`, migration `45ab6640633a`, seed thẻ mẫu cho tài khoản tài xế (`CUSTOMER` trong RBAC hiện tại), handler `Authorize` và 6 test; migration kiểm chứng upgrade/downgrade trên DB tạm.
* **Hồi quy sau S-15 (01/10/2026 - chưa commit)**: Full backend suite đạt 158 passed, 1 warning trong 117.08 giây; tổng 38 ca OCPP.
* **Lệnh Reset OCPP từ máy chủ — T-34/T-35 thuộc S-16 (01/10/2026 - chưa commit)**: Thêm dispatcher có timeout cấu hình, ghép phản hồi CALLRESULT/CALLERROR theo message ID và API `POST /api/v1/chargers/{code}/reset` giới hạn Admin/Operator; test bao phủ lệnh online, offline, timeout, CALLERROR và role tài xế.
* **Hồi quy sau S-16 (01/10/2026 - chưa commit)**: Full backend suite đạt 163 passed, 1 warning trong 122.08 giây; năm suite OCPP có tổng 43 ca.
* **MeterValues — T-40/T-41 thuộc S-19 (05/10/2026 - chưa commit)**: Thêm model và migration `meter_values` với chỉ mục `(session_id, recorded_at)`, chỉ lưu `Energy.Active.Import.Register`, chuyển giá trị không có phiên đang sạc vào bảng `orphan_messages` hiện có và xác nhận CALLRESULT trước thao tác DB. Thêm 5 test; Ruff sạch; full backend suite đạt 258 passed, 1 skipped, 181 warnings. DB dự án không đổi. Docker không khả dụng; full upgrade từ DB trống bị chặn bởi migration lịch sử tạo lặp `charging_points.last_seen_at`.
* **Loại bỏ số đo lùi/trùng — T-42/T-43 thuộc S-20 (05/10/2026 - chưa commit)**: Khóa transaction trước khi đọc số đo mới nhất theo session/measurand; mẫu lùi bị bỏ qua kèm cảnh báo, mẫu trùng hoàn toàn bỏ qua im lặng, mẫu mới có giá trị giảm vẫn lưu và bật `ChargingSession.needs_review`. Cùng timestamp nhưng khác value được giữ như bản hiệu chỉnh. Thêm migration `339c5001fe7a` và 5 test dedup/concurrency; full suite đạt 263 passed, 1 skipped, 181 warnings; Ruff sạch.
* **Khôi phục phiên sau mất kết nối — T-44/T-45/T-46 thuộc S-21 (05/10/2026 - chưa commit)**: Trạng thái Charging đọc phiên CHARGING đã lưu; lần gửi lại StartTransaction với cùng thẻ/meterStart trả transactionId hiện có; MeterValues được gắn theo transactionId DB. StopTransaction tra cứu trong phạm vi đúng trụ, đóng phiên khi trụ offline và lấy ended_at từ timestamp tin nhắn. Kịch bản tích hợp trong `backend/tests/integration/test_reconnect_scenario.py` chạy ba vòng liên tiếp với 5 và 20 trụ; full suite đạt 264 passed, 1 skipped, 298 warnings; Ruff trên file đổi sạch.
* **Phát hiện phiên bất thường — T-53 thuộc S-25 (05/10/2026, commit `7af7b19`)**: Thêm `ChargingSession.is_abnormal` và `abnormal_reason`; job APScheduler chạy mỗi phút so sánh heartbeat của trụ với cấu hình `ABNORMAL_SESSION_THRESHOLD_SECONDS=500`. Job chỉ gắn cờ/lý do, giữ nguyên status phiên. Migration `c4ab19f2d7e1`, ba test mới; full suite đạt 267 passed, 1 skipped, 298 warnings; Ruff sạch.
* **Hạ tầng test 20 trụ ảo — T-55/T-56 thuộc S-26 (05/10/2026, commit `bfefab8`)**: Thêm Docker service dùng lại luồng WebSocket/OCPP Spike K-01 và mã SIM riêng, seeder độc lập, Heartbeat định kỳ; workflow main chạy sau unit tests với Postgres/backend/simulator thật, kiểm tra ba vòng reconnect 5 trụ và dọn container/volume bằng trap. Bài test so sánh từng phiên với 5 kWh, ghi mã trụ/session khi sai. Kiểm chứng stack cô lập đạt 20/20 Online trên SQLite/PostgreSQL; kịch bản reconnect đạt 3/3; full backend suite đạt 268 passed, 299 warnings. CI chưa được kích hoạt từ nhánh này.
* **Admin Demo 1-Click (01/10/2026, mã nguồn commit `7f764ea`)**: Credential trong `DEMO_USERS.ADMIN` được đổi từ `admin / AdminPass123` sang `admin / 12345678a`; `AuthContext.quickSwitch()` dùng cấu hình tập trung và `Login.jsx` hiển thị detail 403 từ API. Build trực tiếp trên host bị chặn do thiếu `vite`, nhưng Docker build và cập nhật container frontend thành công. Tài khoản đã được gỡ khóa tạm; login API trả HTTP 200 với role `ADMIN`.
* **Chuẩn hóa thư mục migration (01/10/2026 - chưa commit)**: Xóa cây revision cũ `backend/migrations/`; giữ `backend/alembic/` làm nguồn migration duy nhất theo cấu hình `backend/alembic.ini`.
* **Giao diện Quản lý Trụ & Đầu nối - S-05 (03/10/2026 - chưa commit)**:
  * `frontend/src/pages/Stations.jsx`: thêm form Thêm đầu nối, báo lỗi trùng mã trụ tại ô "Mã trụ", báo lỗi trùng số thứ tự đầu nối tại ô nhập, mở nút gắn trụ cho `OPERATOR`. Không đổi cấu trúc thư mục, không thêm file.
* **Bộ chạy Local Dev ở thư mục gốc (30/09/2026 - chưa commit)**:
  * Thêm `run.py` để mở Uvicorn và Vite cùng lúc, kiểm tra dependencies cần thiết, và dừng cả hai tiến trình khi nhấn `Ctrl+C`.
* **Hợp nhất cây migration Alembic (30/09/2026, commit `d7acaf4`)**:
  * Thêm revision merge `795931a69149` để hợp nhất hai head `c2d3e4f5a6b7` và `d3a5e8b1c4f2`.
  * Sửa revision `f99adeda980d`: bỏ thao tác thêm lặp cột `wallets.is_debt_locked` và đặt mặc định `0` cho `charging_sessions.current_soc` khi nâng cấp dữ liệu hiện có.
* **Khôi phục migration nền PostgreSQL (30/09/2026, commit `d8c8ff6`)**:
  * Khôi phục revision `a1b2c3d4e5f6` để tạo các bảng lõi; nối `03906fa596ea` làm revision kế tiếp để các khóa ngoại như `tariffs.station_id` có bảng đích.
* **Gộp các head Alembic còn lại (30/09/2026, commit `3cdb675`)**:
  * Thêm revision merge `f2c9a6d81b40` nối `795931a69149` và `e4b6f9a2c1d3`; revision này chỉ hợp nhất lịch sử, không đổi schema.
* **Khung ứng dụng Staging và Khóa tạm mật khẩu (30/09/2026 - chưa commit)**:
  * Ngày thay đổi: **30/09/2026** (chưa commit).
  * Khung Staging & CI/CD: Đóng gói Docker đa tầng cho Backend/Frontend, thiết lập Nginx reverse proxy, file `docker-compose.staging.yml` và pipeline kiểm thử tự động `.github/workflows/ci-staging.yml` (hoàn thiện Story S-01).
  * Chống vét cạn mật khẩu: Bổ sung cột `failed_login_attempts` và `locked_until` vào bảng `users` qua migration Alembic `149038e71dc9`, cập nhật endpoint `auth.py` tự động khóa tạm 15 phút khi sai liên tiếp 5 lần (hoàn thiện Story S-02).
  * Số ca kiểm thử tự động (84 → 89 test cases): Bổ sung 5 ca kiểm thử mới trong `backend/tests/test_auth.py` xác thực việc đếm số lần sai, khóa tạm và tự động mở khóa.
* **Hạn mức ví điện tử (giá trị cũ → giá trị mới)**:
  * Ngày thay đổi: **29/09/2026** (ghi nhận từ Git log qua commit `cb9a5c8: tái tạo`).
  * Nội dung thay đổi: Giảm trần thấu chi DB từ `-1.000.000` VND xuống `-500.000` VND (`CheckConstraint("balance >= -500000")`), và thiết lập ngưỡng khóa nợ `-300.000` VND tại tầng ứng dụng (`config.py`).
  * Ghi chú: Thực hiện theo yêu cầu của người dùng.
* **Số ca kiểm thử tự động (83 → 84 test cases)**:
  * Ngày thay đổi: **29/09/2026**.
  * Ca kiểm thử mới bổ sung: `backend/tests/test_auth.py::test_login_debt_locked_shows_error`.
  * Lý do bổ sung: Bổ sung theo yêu cầu của người dùng nhằm xác thực tài khoản có `is_debt_locked == True` (âm quá 300.000 VND) khi đăng nhập sẽ nhận phản hồi lỗi HTTP 403 Forbidden kèm thông điệp `"tài khoản bị khóa vì - quá 300k"`.
* **Dọn dẹp thư mục gốc**:
  * Chuyển toàn bộ các file phác thảo ban đầu và tài liệu cũ sang thư mục `phacthaobandau/` để bảo toàn lịch sử và không làm nhiễu không gian làm việc chính.

### 0.3. Sắp thay đổi
* **Khởi tạo thư mục và handlers OCPP**: Chuẩn bị cấu trúc `backend/app/ocpp/handlers/` theo kế hoạch Sprint 2 (`S-06` đến `S-16`) theo `[nguồn tạm: nentangtramsac_bandaydu.md]`.

### 0.4. Cần thay đổi
* **Kịch bản vận hành root**: Cần bổ sung các script tự động hóa khởi chạy ở thư mục gốc (`start.bat` / `run.ps1`) thay cho việc phải mở thủ công 2 terminal riêng biệt.
* **Thẩm định cấu hình phần cứng trạm sạc**: Cần hoàn thiện cơ chế kết nối với phần cứng sạc vật lý hoặc cổng giả lập độc lập.

---

## 1. Mục đích của tài liệu

Tài liệu này là **Nguồn sự thật kiến trúc duy nhất (Single Source of Architecture Truth)**, phục vụ:
* Cung cấp cây thư mục vật lý chuẩn xác theo mã nguồn thực tế của kho mã nguồn.
* Định danh các module thành phần cốt lõi và thẩm quyền sở hữu.
* Thiết lập ma trận truy vết đầy đủ giữa Yêu cầu (Requirement/AC) $\longleftrightarrow$ Công việc (Task) $\longleftrightarrow$ Mã nguồn (Source Code) $\longleftrightarrow$ Ca kiểm thử (Test Case).

---

## 2. Structure Authority (Thẩm quyền cấu trúc)

* **Quyền phê duyệt cấu trúc thư mục**: Solution Architect phối hợp cùng Tech Lead dự án.
* **Quy chuẩn bảo tồn**: Bất kỳ sự thay đổi nào về cấu trúc thư mục cấp 1 hoặc cấp 2 trong `docs/`, `backend/`, `frontend/` đều phải được phản ánh cập nhật vào tài liệu này trước khi gộp nhánh vào `main`.

---

## 3. Tester Ownership (Quyền sở hữu của Tester)

* **Vùng Tester có toàn quyền**: Toàn bộ thư mục `docs/qa/` và `backend/tests/`.
* **Vùng Tester chỉ đọc**: `backend/app/`, `frontend/src/`, `docs/planning/`, `docs/architecture/`.
* **Kỷ luật bất biến**: Tester tuyệt đối không tự ý sửa đổi mã nguồn ứng dụng; mọi khiếm khuyết phải được lập hồ sơ tại `docs/qa/reports/BUG_REPORT.md`.

---

## 4. Verified Project Tree (Cây thư mục đã xác minh)

Cây thư mục vật lý thực tế trên ổ đĩa tại thời điểm kiểm chứng ngày 29/09/2026:

Các đường dẫn được thêm cho SCRUM-188/189/190/192 đã được đối chiếu lại ngày 08/10/2026.

```text
E:\Nền tảng vận hành trạm sạc xe điện\
├── .github/                           # Biểu mẫu PR & Quy trình CI/CD
│   ├── workflows/                     # GitHub Actions CI & Staging Validation
│   │   └── ci-staging.yml
│   └── pull_request_template.md
├── backend/                           # Phân hệ Dịch vụ Máy chủ (FastAPI)
│   ├── alembic/                       # Kịch bản di chuyển cơ sở dữ liệu
│   │   └── versions/                  # Migration đến S-41, head f41a0b7c9d22
│   ├── alembic.ini                    # Cấu hình công cụ Alembic
│   ├── app/                           # Mã nguồn nghiệp vụ Backend
│   │   ├── api/                       # Định nghĩa router và dependency injection (RBAC)
│   │   ├── core/                      # Cấu hình ứng dụng, bảo mật và kết nối CSDL
│   │   ├── models/                    # Lớp thực thể SQLAlchemy (User, Station, Wallet...)
│   │   │   ├── id_tag.py               # Thẻ OCPP gắn với tài khoản người dùng
│   │   │   ├── meter_value.py           # Số đo điện năng gắn với phiên sạc
│   │   │   ├── ocpp_message.py         # Kết quả CALL OCPP đã lưu để chống xử lý lặp
│   │   │   ├── session.py              # Phiên sạc, gồm cờ needs_review và idle_amount
│   │   │   ├── session_billing_segment.py # Snapshot đơn giá và thành tiền từng đoạn
│   │   │   └── tariff.py               # Biểu giá TOU gắn với trạm và phí chiếm trụ
│   │   ├── schemas/                   # Lớp xác thực Pydantic (In/Out DTOs)
│   │   ├── services/                  # Xử lý nghiệp vụ lõi
│   │   │   ├── billing.py             # Tính tiền điện và phí chiếm trụ dùng chung
│   │   │   └── billing_segment_service.py # Lưu snapshot đoạn giá khi chốt phiên
│   │   ├── simulator/                 # Bộ mô phỏng sạc nội bộ CC/CV
│   │   ├── ocpp/                      # Bộ khung, gateway và handler OCPP 1.6J
│   │   │   ├── __init__.py
│   │   │   ├── dispatcher.py           # Gửi CALL CSMS→trụ và chờ phản hồi bất đồng bộ
│   │   │   ├── frames.py               # Parser/builder thuần, không phụ thuộc WebSocket
│   │   │   ├── gateway.py              # WebSocket /ocpp/{charge_point_code}
│   │   │   └── handlers/
│   │   │       ├── __init__.py
│   │   │       ├── authorize.py        # Kiểm tra trạng thái và thời hạn idTag
│   │   │       ├── boot_notification.py
│   │   │       └── meter_values.py     # Lưu mẫu Energy.Active.Import.Register theo phiên
│   │   └── main.py                    # Điểm khởi động ứng dụng FastAPI & WebSocket
│   ├── .dockerignore                  # Danh sách loại trừ đóng gói Docker backend
│   ├── Dockerfile                     # Đóng gói container hóa FastAPI (Python 3.12)
│   ├── ev_csms.db                     # Cơ sở dữ liệu SQLite chính
│   ├── pytest.ini                     # Cấu hình thực thi kiểm thử tự động
│   ├── README.md                      # Hướng dẫn kỹ thuật phân hệ Backend
│   ├── requirements.txt               # Danh mục thư viện Python phụ thuộc
│   ├── seed_data.py                   # Script nạp dữ liệu mẫu cho demo
│   ├── tests/                         # Bộ kiểm thử tự động
│   │   ├── test_billing_idle_fee.py   # Kiểm thử tính phí và kiểm tra API S-28
│   │   ├── test_billing_segments.py  # Snapshot đoạn giá và hóa đơn legacy S-33
│   │   └── test_invoice.py           # Hóa đơn S-33, RBAC, review và phí chiếm trụ
├── docs/                              # TRUNG TÂM TRI THỨC VÀ TÀI LIỆU DỰ ÁN
│   ├── README.md                      # Cổng điều hướng toàn hệ thống & FAQ Tester
│   ├── codebase-map.md                # Bản đồ khu vực mã nguồn và luồng billing S-28
│   ├── architecture/                  # Phân khu Kiến trúc & Bản đồ hệ thống
│   │   ├── ANALYSIS_SUMMARY.md
│   │   └── PROJECT_STRUCTURE.md
│   ├── design/                        # Phân khu Thiết kế trải nghiệm UX/UI
│   │   ├── OPERATOR_DASHBOARD_UX.md
│   │   └── README.md (UI Drift Log)
│   ├── devops/                        # Phân khu Vận hành & Hạ tầng
│   │   └── OPERATIONS.md
│   ├── planning/                      # Phân khu Quản trị & Tiến độ Sprint
│   │   ├── SPRINT_PLAN.md
│   │   └── SPRINT_STATUS.md
│   ├── qa/                            # Phân khu Đảm bảo chất lượng & Kiểm định
│   │   ├── INVENTORY.md
│   │   ├── README.md
│   │   ├── STANDARD.md
│   │   ├── integration/FRONTEND_BACKEND.md
│   │   ├── plans/TEST_PLAN.md
│   │   ├── reports/ (TEST_REPORT, REGRESSION_REPORT, BUG_REPORT)
│   │   └── stories/ (S-01 đến S-05, S-07, S-08, S-14, S-15, S-16, S-28)
│   └── research/                      # Phân khu Nghiên cứu kỹ thuật (Spikes)
│       ├── K-01-ocpp-simulator.md
│       └── S-05-AC3-ghi-nhan-cho-PO.md
├── frontend/                          # Phân hệ Giao diện Người dùng (React Vite)
│   ├── src/                           # Mã nguồn client SPA (pages, components, config, context, data, services)
│   │   ├── components/                # Thành phần UI (StationsMapView, StationLocationPicker, MetricBox...)
│   │   ├── config/                    # Cấu hình bản đồ tập trung (mapConfig.js: OSM Dark & Esri)
│   │   ├── data/                      # Dữ liệu tĩnh (provinces.json 63 tỉnh thành)
│   │   ├── services/                  # Dịch vụ API & Geocoding OpenStreetMap
│   │   └── pages/                     # Màn hình giao diện SPA (Stations, Dashboard...)
│   ├── .dockerignore                  # Danh sách loại trừ đóng gói Docker frontend
│   ├── Dockerfile                     # Đóng gói container hóa đa tầng (Node build -> Nginx)
│   ├── nginx.conf                     # Cấu hình máy chủ Web Nginx phục vụ tĩnh & reverse proxy
│   ├── package.json                   # Cấu hình gói và thư viện Node.js (Leaflet, React)
│   ├── tailwind.config.js             # Cấu hình bảng màu và design tokens
│   └── vite.config.js                 # Cấu hình máy chủ Vite & Reverse Proxy
├── phacthaobandau/                    # Kho lưu trữ các tài liệu phác thảo cũ
├── docker-compose.yml                 # Stack Backend, Frontend, PostgreSQL và simulator Sprint 1–4
├── run.py                             # Điều khiển toàn bộ stack Docker Compose
├── CONTRIBUTING.md                    # Quy ước làm việc nhóm, Git flow & PR checklist
├── nentangtramsac_bandaydu.md         # Bảng tính chuẩn hóa yêu cầu và tiến độ Scrum
├── README.md                          # Cổng đón tiếp chung & Hướng dẫn khởi động nhanh
└── taicautruc.md                      # Bản thiết kế tái cấu trúc hệ thống tài liệu
```

---

## 5. Important Components (Các thành phần quan trọng)

1. **`backend/app/main.py`**: Trái tim điều phối ứng dụng, quản lý vòng đời khởi động/tắt máy, dọn dẹp phiên sạc mồ côi, và thiết lập kênh WebSocket Telemetry.
2. **`backend/app/core/config.py`**: Quản trị tập trung toàn bộ tham số môi trường, thời hạn JWT, ngưỡng nợ ví `-300.000` VND và giới hạn chống tràn CSDL `-500.000` VND.
3. **`backend/app/models/wallet.py`**: Thực thể ví tiền điện tử với ràng buộc CSDL cứng `CheckConstraint("balance >= -500000")`.
4. **`backend/app/simulator/charging_simulator.py`**: Tiến trình mô phỏng chu kỳ sạc pin xe điện theo đường cong CC/CV, bảo vệ quá nhiệt và ngắt sạc tự động.
5. **`frontend/src/context/AuthContext.jsx`**: Quản trị phiên làm việc và phân quyền RBAC phía client.
6. **`tools/ocpp-spike/run_simulator.py`**: Giữ các client OCPP 1.6J trực tuyến và gửi Heartbeat; số lượng do `SIMULATOR_CHARGE_POINT_COUNT` điều khiển.
7. **`backend/app/models/session_billing_segment.py` và `backend/app/services/billing_segment_service.py`**: Lưu snapshot đơn giá, kWh và tiền của từng đoạn S-30/S-31 cùng giao dịch chốt phiên.

---

## 6. QA Documentation Map (Bản đồ tài liệu QA)

```mermaid
flowchart TD
    STD[STANDARD.md<br/>Hiến chương kiểm thử] --> INV[INVENTORY.md<br/>Sổ cái 403 Tests]
    STD --> PLAN[plans/TEST_PLAN.md<br/>Chiến lược đa tầng]
    PLAN --> REP[reports/TEST_REPORT.md<br/>Kết quả thực tế]
    PLAN --> REG[reports/REGRESSION_REPORT.md<br/>Kiểm thử hồi quy]
    PLAN --> BUG[reports/BUG_REPORT.md<br/>Sổ theo dõi lỗi]
    STD --> STO[stories/S-xx.md<br/>Hồ sơ nghiệm thu Story]
    STD --> INT[integration/FRONTEND_BACKEND.md<br/>Tích hợp Client-Server]
```

---

## 7. Requirement → Task → Source Mapping

Ma trận truy vết ánh xạ các Story đã triển khai:

| Story | Yêu cầu nghiệp vụ (AC) | Tasks kỹ thuật (T-xx) | Mã nguồn phụ trách | Ca kiểm thử xác minh |
| :---: | :--- | :--- | :--- | :--- |
| **S-01** | Khung ứng dụng chạy được trên máy | T-01, T-02, T-03, T-04 | `backend/app/main.py`, `frontend/vite.config.js` | `test_health.py` |
| **S-02** | Đăng nhập JWT, hash mật khẩu, khóa nợ | T-05 | `backend/app/api/v1/endpoints/auth.py` | `test_auth.py` (12 tests) |
| **S-03** | Phân quyền 3 vai trò (RBAC), chống IDOR | T-06, T-07 | `backend/app/core/security.py`, `deps.py` | `test_auth.py`, `test_stations.py` |
| **S-04** | CPO tạo, sửa, xóa mềm trạm sạc | T-08, T-09 | `backend/app/api/v1/endpoints/stations.py` | `test_stations.py` (8 tests) |
| **S-05** | Thêm trụ và đầu nối, mã trụ duy nhất | T-10, T-11 | `backend/app/api/v1/endpoints/chargers.py` | `test_stations.py` (4 tests) |
| **S-07** | Đọc/ghi ba loại khung tin nhắn OCPP 1.6J | T-14, T-15 | `backend/app/ocpp/frames.py` | `backend/tests/test_ocpp_frames.py` (20 ca); `docs/qa/stories/S-07.md` |
| **S-08** | Nhận BootNotification và phản hồi Accepted/Rejected theo trạng thái trạm | T-16, T-17 | `backend/app/ocpp/gateway.py`, `backend/app/ocpp/handlers/boot_notification.py`, `backend/app/models/station.py` | `backend/tests/test_boot_notification.py` (8 ca); `docs/qa/stories/S-08.md` |
| **S-14** | Chống xử lý lặp CALL OCPP dựa trên CSDL và dọn dữ liệu quá hạn | T-30, T-31 | `backend/app/models/ocpp_message.py`, `backend/app/ocpp/gateway.py`, `backend/app/services/scheduler_service.py` | `backend/tests/test_ocpp_idempotency.py` (4 ca); migration `057c4ed34525`; `docs/qa/stories/S-14.md` |
| **S-15** | Phân quyền sạc bằng idTag OCPP | T-32, T-33 | `backend/app/models/id_tag.py`, `backend/app/ocpp/handlers/authorize.py`, `backend/app/ocpp/gateway.py`, `backend/seed_data.py` | `backend/tests/test_authorize.py` (6 ca); migration `45ab6640633a`; `docs/qa/stories/S-15.md` |
| **S-16** | Máy chủ gửi lệnh Reset OCPP có tương quan phản hồi | T-34, T-35 | `backend/app/ocpp/dispatcher.py`, `backend/app/ocpp/gateway.py`, `backend/app/api/v1/endpoints/chargers.py` | `backend/tests/test_ocpp_reset.py` (5 ca); `docs/qa/stories/S-16.md` |
| **S-19** | Ghi số đo điện năng MeterValues | T-40, T-41 | `backend/app/models/meter_value.py`, `backend/app/ocpp/handlers/meter_values.py`, `backend/app/ocpp/gateway.py` | `backend/tests/test_meter_values.py` (5 ca); migration `4a0a1107f87d` |
| **S-20** | Loại bỏ số đo lùi/trùng và đánh dấu bộ đếm cần xem xét | T-42, T-43 | `backend/app/ocpp/handlers/meter_values.py`, `backend/app/models/session.py` | `backend/tests/test_meter_values_dedup.py` (5 ca); migration `339c5001fe7a` |
| **S-26** | Hạ tầng kiểm thử tích hợp 20 trụ OCPP ảo | T-55, T-56 | `docker-compose.yml`, `tools/ocpp-spike/`, `.github/workflows/main.yml` | Compose khởi chạy backend/frontend, 20 trụ; cổng host API 8001/UI 8080; `tools/ocpp-spike/test_reconnect_scenario.py` chạy qua backend/Postgres thật; 3 vòng reconnect; CI ép API về cổng 8000 và cleanup qua trap |
| **S-28** | Khai báo biểu giá kWh và phí chiếm trụ | SCRUM-188, SCRUM-189, SCRUM-190, SCRUM-192 | `backend/app/models/tariff.py`, `backend/app/services/billing.py`, `backend/app/ocpp/handlers/status_notification.py`, `backend/app/models/session.py` | `backend/tests/test_billing_idle_fee.py` (20 ca); migrations `783e7f907c98`, `1660df6b86c6`; mentor cần xác nhận cách quyết toán phí bổ sung khi `Available` đến muộn |
| **S-33** | Lưu đơn giá đã áp dụng và trả hóa đơn theo từng đoạn | SCRUM-222, SCRUM-221, SCRUM-220, SCRUM-223, SCRUM-225 | `backend/app/models/session_billing_segment.py`, `backend/app/services/billing_segment_service.py`, `backend/app/schemas/invoice.py`, `backend/app/api/v1/endpoints/sessions.py` | `test_billing_segments.py` (6), `test_invoice.py` (8); migrations `5ccaa686da2b`, `d8f56c4a911e`; RBAC, review null-money, idle-fee line, legacy không backfill |

---

## 8. Dependency Map (Bản đồ phụ thuộc hệ thống)

### 8.1. Story → Story Dependency
Căn cứ theo Sheet: Backlog trong `[nguồn tạm: nentangtramsac_bandaydu.md]`:
* `S-01` $\longrightarrow$ `S-02` $\longrightarrow$ `S-03` $\longrightarrow$ `S-04` $\longrightarrow$ `S-05`.
* `S-05` + `K-01` $\longrightarrow$ `S-06` (Khởi đầu chuỗi Sprint 2).

### 8.2. Task → Task Dependency
* `T-01` (DB setup) $\longrightarrow$ `T-04` (Bảng users) $\longrightarrow$ `T-05` (Form login) $\longrightarrow$ `T-06` (Middleware vai trò) $\longrightarrow$ `T-08` (Bảng stations) $\longrightarrow$ `T-10` (Bảng chargers).

### 8.3. Test → Prerequisite Dependency
* CSDL kiểm thử phải được khởi tạo schema sạch sẽ trước khi thực thi các test suite có thao tác ghi dữ liệu (`test_auth.py`, `test_wallet_acid.py`).

### 8.4. Source → Dependent Component
* `backend/app/core/config.py` và `database.py` là các module nền tảng; mọi thay đổi tại đây đều ảnh hưởng trực tiếp tới toàn bộ hệ thống.

---

## 9. Source → Historical Test Mapping (Bản đồ ánh xạ lịch sử kiểm thử)

* **83 ca kiểm thử ban đầu**: Phủ kín các phân hệ Auth, Stations, Sessions, Simulator và AI Fallback.
* **Ca kiểm thử thứ 84 (`test_login_debt_locked_shows_error`)**: Bổ sung ngày 29/09/2026 tại `test_auth.py` để xác thực phản hồi lỗi HTTP 403 khi tài khoản nợ đăng nhập.
* **S-33 (`test_billing_segments.py`, `test_invoice.py`)**: 14 ca xác minh snapshot đoạn giá, hóa đơn sau khi tariff đổi, RBAC, phiên review không có tiền, phí chiếm trụ và legacy không backfill.
* **S-41 và schema Compose cũ (`test_wallet_ledger_s41.py`, `test_compose_schema_service.py`)**: 14 ca xác minh ghi ledger/reconcile/trigger và nâng idempotent SQLite legacy; nhóm cùng `test_wallet_acid.py` đạt 19 passed.

---

## 10. Project-Specific Hierarchy & Traceability Facts (Phân cấp nhiệm vụ & Thực tế truy vết dự án)

### 10.1. Project Hierarchy Facts
* Hệ thống được cấu trúc theo 11 Epics (E-01 đến E-11), phân rã thành 66 User Stories (S-01 đến S-66) và 58 Tasks kỹ thuật (T-01 đến T-58) theo `[nguồn tạm: nentangtramsac_bandaydu.md]`.

### 10.2. Project Traceability Facts
* Mọi thay đổi mã nguồn trên nhánh Git đều phải có liên kết với ít nhất một User Story hoặc Task ID trong phần mô tả Pull Request (theo biểu mẫu `.github/pull_request_template.md`).

---

## 11. Impact / Regression Map (Bản đồ phân tích tác động & hồi quy)

* Khi chỉnh sửa `app/models/wallet.py`: Bắt buộc chạy lại `test_wallet_acid.py`, `test_sessions_acid.py` và `test_auth.py`.
* Khi chỉnh sửa `app/models/station.py`: Bắt buộc chạy lại `test_stations.py` và `test_ai_fallback.py`.
* Khi chỉnh sửa `app/core/config.py`: Bắt buộc kích hoạt chạy lại toàn bộ backend suite; lần chạy ngày 01/10/2026 có 163 ca.

---

## 12. Current Structure Gaps (Các khoảng trống cấu trúc hiện tại)

1. **OCPP còn thiếu các action khác**: Gateway tra mã trụ, quản lý kết nối và xử lý BootNotification, Authorize; các handler cho Heartbeat, StatusNotification và giao dịch cùng cơ chế tương quan CALL/CALLRESULT vẫn thuộc các task tiếp theo. `/ws/telemetry` tiếp tục phục vụ dashboard riêng.
2. **Thiếu thư mục chứa script DevOps ở root**: Chưa có file `docker-compose.yml`, `start.bat` hoặc `run.ps1` ở thư mục gốc.

---

## 13. Structure Verification Metadata (Thông tin kiểm chứng cấu trúc)

* **Ngày kiểm chứng**: 01/10/2026.
* **Người xác thực**: AI Assistant phối hợp cùng Lead Developer.
* **Trạng thái cấu trúc**: **ACTIVE & VERIFIED**; 18 bảng ORM; lần kiểm thử toàn backend gần nhất đạt 437 passed, 307 warnings (10/10/2026, code commit `0bb5f67`).
