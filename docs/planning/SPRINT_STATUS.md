# Tình trạng dự án và sprint — CSMS

> **Loại tài liệu**: Bảng điều khiển tiến độ quản trị (Project Health & Sprint Status Dashboard)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.2 số 9  
> **Nguồn trích xuất**: [nguồn tạm: nentangtramsac_bandaydu.md] (Sheet: Sprints, Epics, Backlog, Rủi ro, DoD-DoR), Git log, và mã nguồn Python/FastAPI thực tế.

---

## 1. Tóm tắt một trang

* **Tên dự án**: Nền tảng vận hành trạm sạc xe điện (CSMS) `[nguồn tạm: nentangtramsac_bandaydu.md: Sheet Thông tin]`.
* **Mục tiêu sản phẩm (Product Goal)**: Đơn vị vận hành mạng lưới trạm sạc nắm được mọi phiên sạc theo thời gian thực qua giao thức OCPP, tính đúng tiền theo biểu giá nhiều khung, không để trạm vượt công suất, và đối soát được doanh thu khớp với số kWh đã cấp `[nguồn tạm: nentangtramsac_bandaydu.md: Sheet Thông tin]`.
* **Mô hình Scrum**: Sprint 1 tuần (5 ngày làm việc / sprint). Đơn vị ước lượng: Story Point (Fibonacci) `[nguồn tạm: nentangtramsac_bandaydu.md: Sheet Thông tin]`.
* **Khung theo dõi 4 chiều**:
  1. *Hiện trạng (Đã có)*: Sprint 1 hoàn thành 5 User Stories cốt lõi; backend hiện có 163 test đã passed trong lần full suite ngày 01/10/2026, gồm 43 ca OCPP.
  2. *Đã thay đổi*: Cập nhật CSDL giới hạn tràn nợ `-500.000` VND (trước là `-1.000.000` VND), thêm thông báo khóa nợ khi đăng nhập, tăng số test từ 83 lên 84; chuẩn hóa migration về `backend/alembic/`; đồng bộ nút Admin demo 1-Click với tài khoản `admin / 12345678a` (01/10/2026, chưa commit).
  3. *Sắp thay đổi*: Kế hoạch Sprint 2 (20 SP) xử lý tin nhắn giao thức OCPP 1.6J và màn hình theo dõi trụ sạc.
  4. *Cần thay đổi / Tồn đọng*: Kết nối phần cứng trạm thật (S-05 AC3), cổng thanh toán thật (R-02), cấu hình Docker môi trường (R-06).

---

## 2. Sprint 1 — “Chủ trạm khai báo được trạm, trụ và đầu nối; cả nhóm chạy được dự án”

Căn cứ theo [nguồn tạm: nentangtramsac_bandaydu.md: Sheet Sprints & Backlog]:
* **Cam kết Sprint 1**: 12 Story Points (SP).
* **Danh mục Story**:
  1. `S-01` (3 SP): Khung ứng dụng chạy được trên máy cá nhân/staging — **ACCEPTED** (Đã đóng gói Docker Backend/Frontend, `docker-compose.staging.yml` và pipeline CI `.github/workflows/ci-staging.yml`).
  2. `S-02` (2 SP): Đăng nhập bằng email và mật khẩu, khoá tạm khi sai nhiều lần và khi nợ — **ACCEPTED** (Hoàn thiện cơ chế khóa tạm 15 phút sau 5 lần sai mật khẩu và khóa nợ -300k).
  3. `S-03` (2 SP): Mỗi vai trò chỉ thấy và thao tác được phần việc của mình (RBAC) — **ACCEPTED**.
  4. `S-04` (2 SP): Chủ trạm tạo và sửa thông tin trạm sạc — **ACCEPTED**.
  5. `S-05` (1 SP): Chủ trạm thêm trụ và đầu nối vào trạm, mã trụ là duy nhất — **CONDITIONAL ACCEPTANCE** (Đạt AC1, AC2, AC4; AC3 dời theo biên bản giải trình gửi PO).
  6. `K-01` (2 SP): Spike nghiên cứu kết nối trụ sạc ảo với máy chủ WebSocket OCPP — **COMPLETED**.

### Việc làm thêm ngoài backlog Sprint 1 (28/9)
Căn cứ theo mã nguồn thực tế:
1. **Bộ mô phỏng sạc nội bộ (`charging_simulator.py`)**: Giả lập đường cong sạc pin CC/CV, tự ngắt khi pin 100%, tự ngắt khi quá nhiệt.
2. **Module Ví tiền ACID (`wallet.py`, `wallet_service.py`)**: Trừ tiền nguyên tử, kiểm tra ngưỡng nợ -300.000 VND và ràng buộc CSDL CheckConstraint -500.000 VND.
3. **Kênh Telemetry WebSocket (`/ws/telemetry`)**: Truyền phát thông số sạc trực tiếp lên giao diện mỗi 2 giây.
4. **Hệ thống AI Heuristic Fallback (`ai_service.py`)**: Phân tích nhiệt độ, gợi ý biểu giá khi không có khóa Google Gemini.

---

## 3. Hệ thống hiện có gì (Hiện trạng As-Is)

### Hiện trạng hạn mức ví và tài chính
Căn cứ mã nguồn thực tế tại `backend/app/models/wallet.py` và `backend/app/core/config.py`:
* **Ngưỡng khóa nợ ứng dụng (`config.py:23`)**: `NEGATIVE_BALANCE_LIMIT = -300000` (-300.000 VND). Khi số dư nhỏ hơn mức này, tài khoản chuyển cờ `is_debt_locked = True`.
* **Giới hạn tràn nợ tối đa CSDL (`config.py:24` & `wallet.py:11`)**: `MAX_SAFE_DEBT_LIMIT = -500000`, CSDL chặn cứng bằng `CheckConstraint("balance >= -500000", name="check_min_balance")`.
* **Cơ chế chặn đăng nhập (`auth.py`)**: Tài khoản nợ bị chặn đăng nhập với HTTP 403 Forbidden kèm thông điệp `"tài khoản bị khóa vì - quá 300k"`.
* **Cơ chế chống vét cạn mật khẩu (`auth.py`, `config.py`)**: Ngưỡng thử sai `MAX_FAILED_LOGIN_ATTEMPTS = 5` lần. Khi chạm ngưỡng, tài khoản bị khóa tạm thời `LOCKOUT_DURATION_MINUTES = 15` phút (HTTP 403 Forbidden) và tự động mở lại sau khi hết thời hạn.

### Hiện trạng thành phần phần mềm
* **Backend API**: 8 router modules REST API (34 endpoints) và 1 kênh WebSocket `/ws/telemetry`.
* **Bộ khung và gateway OCPP 1.6J**: `frames.py` thuần đọc/ghi CALL, CALLRESULT, CALLERROR; `dispatcher.py` chờ phản hồi lệnh máy chủ theo message ID; gateway `/ocpp/{charge_point_code}` xử lý BootNotification, Authorize và idempotency CSDL, tách biệt `/ws/telemetry`. API chargers có lệnh Reset cho Admin/Operator.
* **Timeout lệnh OCPP**: `OCPP_CALL_TIMEOUT_SECONDS = 30.0`; endpoint Reset ghi đè 30 giây theo hợp đồng API.
* **Frontend SPA**: 6 màn hình chức năng tại `frontend/src/pages/`.
* **Đăng nhập demo Admin**: Nút 1-Click đọc username/mật khẩu từ `DEMO_USERS.ADMIN`; cấu hình mã nguồn hiện tại là `admin / 12345678a`. Frontend Docker đã build lại; đăng nhập API xác nhận HTTP 200, user `admin`, role `ADMIN` sau khi gỡ khóa tạm.
* **Kiểm thử tự động**: Full backend suite đạt 163 passed, 1 warning ngày 01/10/2026. Số lịch sử 90 ca ở tài liệu này mâu thuẫn với 84/89 ca trong README và QA Inventory `[CẦN XÁC NHẬN]`.
* **Migration Alembic**: `backend/alembic.ini` cấu hình `backend/alembic/` làm nguồn duy nhất; revision mới nhất trong cây là `45ab6640633a`. Các migration mới được kiểm chứng trên DB tạm, chưa áp dụng lên CSDL dự án.
* **Đóng gói & CI/CD**: Khung ứng dụng Staging qua `docker-compose.staging.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf` và pipeline CI `.github/workflows/ci-staging.yml`.

### Phần "Đã thay đổi" (Lịch sử điều chỉnh kỹ thuật)
* **T-14/T-15 thuộc S-07 (01/10/2026 - chưa commit)**: Thêm package khung OCPP 1.6J và bộ test parametrize; 20/20 ca OCPP passed riêng và full backend suite đạt 140 passed, 1 warning.
* **T-16/T-17 thuộc S-08 (01/10/2026 - chưa commit)**: Bổ sung gateway WebSocket OCPP, handler BootNotification, migration metadata trụ và trạng thái `online`, cấu hình heartbeat; 8 test WebSocket và full backend suite đạt 148 passed, 1 warning.
* **T-30/T-31 thuộc S-14 (01/10/2026 - chưa commit)**: Thêm model và migration `OcppMessage`, phát lại phản hồi CALL theo khóa CSDL bền vững, cảnh báo khi action khác, và job scheduler dọn bản ghi quá 7 ngày. 4 test idempotency mới và full backend suite 152 passed, 1 warning.
* **T-32/T-33 thuộc S-15 (01/10/2026 - chưa commit)**: Thêm model/migration `IdTag`, seed một thẻ mẫu cho mỗi tài khoản `CUSTOMER`, handler Authorize kiểm tra thẻ và trạm, cùng 6 test gồm 5 kết quả nghiệp vụ và unique code. Full suite đạt 158 passed, 1 warning; tổng 38 ca OCPP.
* **T-34/T-35 thuộc S-16 (01/10/2026 - chưa commit)**: Thêm dispatcher dùng lại được để gửi CALL và nhận đúng CALLRESULT/CALLERROR mà không chặn gateway; endpoint Reset giới hạn role Admin/Operator, báo 409 khi offline và 504 khi timeout. Test tích hợp dùng WebSocket trụ thật trong TestClient.
* **Hồi quy sau S-16**: Full suite đạt 163 passed, 1 warning trong 122.08 giây; tổng 43 ca OCPP.
* **Sửa lỗi Admin Demo 1-Click (01/10/2026, mã nguồn commit `7f764ea`)**: Đồng bộ credential `admin / 12345678a` giữa `frontend/src/config/roleConfig.js`, `frontend/src/context/AuthContext.jsx` và `backend/seed_data.py`; build trực tiếp trên host thiếu `vite`, Docker build thành công và container frontend đã được cập nhật. Đã gỡ khóa tạm sau 5 lần thử sai; login API trả HTTP 200 với role `ADMIN`.
* **Thời điểm thực hiện bổ sung**: Ngày **01/10/2026** (chưa commit), theo yêu cầu của người dùng:
  * Xóa `backend/migrations/` vì không được cấu hình trong `backend/alembic.ini`; giữ `backend/alembic/` làm nguồn duy nhất. Không chạy migration lên database.
* **Giao diện Quản lý Trụ & Đầu nối (S-05)**: Ngày **03/10/2026** (chưa commit), thực hiện **theo yêu cầu của người dùng**:
  * `frontend/src/pages/Stations.jsx`: thêm form **Thêm đầu nối** cho từng trụ; báo lỗi trùng mã trụ ngay tại ô "Mã trụ" (trước đây là banner chung); báo lỗi trùng số thứ tự đầu nối tại ô nhập; nút gắn trụ đổi từ chỉ `ADMIN` sang `ADMIN` + `OPERATOR`.
  * Không thay đổi backend, CSDL hay test tự động.
* **Thời điểm thực hiện**: Ngày **30/09/2026** (chưa commit), thực hiện **theo yêu cầu của người dùng**:
  * *Khung Staging & CI/CD*: Bổ sung Dockerfile đa tầng cho Backend/Frontend, cấu hình Reverse Proxy Nginx, file `docker-compose.staging.yml` và pipeline GitHub Actions `.github/workflows/ci-staging.yml` cho Story S-01.
  * *Bảo vệ đăng nhập chống vét cạn*: Thêm 2 cột `failed_login_attempts` và `locked_until` vào bảng `users` qua migration Alembic `149038e71dc9`, cập nhật endpoint `POST /api/v1/auth/login` đếm số lần sai và khóa tạm 15 phút khi sai liên tiếp 5 lần cho Story S-02.
  * *Giao diện Thêm trụ sạc & Bản đồ Leaflet cho trạm sạc*:
    - Bổ sung nút `+ GẮN TRỤ SẠC` và Modal Form cấu hình trụ sạc mới trực tiếp trên `Stations.jsx`.
    - Tích hợp component bản đồ `StationLocationPicker.jsx` sử dụng Leaflet (OpenStreetMap Dark qua CSS Invert Filter & Esri World Imagery vệ tinh, cấu hình tập trung tại `mapConfig.js`), ghim SVG draggable, tra cứu Nominatim debounced (>= 500ms) kèm fallback, nút vị trí hiện tại GPS, reverse geocoding tự động điền địa chỉ khi trống, kiểm tra ranh giới Việt Nam (lat 8-24, lng 102-110).
    - Hỗ trợ nút `SỬA TRẠM` và modal cập nhật trạm sạc kèm tọa độ bản đồ.
    - CSDL: Tạo migration Alembic `d3a5e8b1c4f2_make_station_coordinates_nullable.py` chuyển `latitude` và `longitude` thành nullable=True để tương thích dữ liệu trạm cũ.
    - Chế độ xem Bản đồ toàn cảnh mạng lưới trạm sạc: Bổ sung component `StationsMapView.jsx` với bộ chuyển đổi `[DANH SÁCH] | [BẢN ĐỒ]` trên trang `Stations.jsx`, tự động fitBounds ôm trọn các trạm có tọa độ (maxZoom 15), marker SVG đổi màu theo trạng thái (Xanh lá `ACTIVE`, Vàng `MAINTENANCE`, Xám `INACTIVE`), viền vàng cảnh báo tọa độ nghi ngờ (`10.7769, 106.7009` từ form cũ hoặc ngoài VN), Dark Popup chi tiết (thông tin trạm, số trụ/trụ rảnh, nút xem chi tiết và Google Maps chỉ đường), nút ghim bản đồ trên từng card trạm trong danh sách, thanh Legend và chuyển đổi lớp OSM Dark / Esri Vệ tinh.
  * *Số lượng test case*: Tăng từ **84 lên 90 tests** (thêm 5 tests khóa tạm đăng nhập và 1 test kiểm thử tọa độ trạm sạc `test_station_coordinates_nullable_and_crud` trong `backend/tests/test_stations.py`, tất cả 90 tests đều passed).
* **Thời điểm thực hiện trước đó**: Ngày **29/09/2026** (theo Git log commit `cb9a5c8: tái tạo` lúc 12:48:02 +0700):
  * *Hạn mức CSDL*: Thay đổi từ `balance >= -1000000` $\longrightarrow$ `balance >= -500000`.
  * *Xác thực đăng nhập*: Chặn đăng nhập tài khoản nợ với HTTP 403 Forbidden.
  * *Số lượng test case*: Tăng từ **83 lên 84 tests**.
* **Hợp nhất cây migration Alembic**: Ngày **30/09/2026**, commit `d7acaf4`, thêm revision merge `795931a69149` để quy hai nhánh `c2d3e4f5a6b7` và `d3a5e8b1c4f2` về một head; sửa revision `f99adeda980d` để tránh thêm lặp `wallets.is_debt_locked` và cấp mặc định `0` cho `charging_sessions.current_soc`.
* **Khôi phục migration nền PostgreSQL**: Ngày **30/09/2026**, commit `d8c8ff6`, khôi phục revision `a1b2c3d4e5f6` tạo các bảng lõi và nối `03906fa596ea` làm revision kế tiếp để tránh lỗi thiếu bảng `stations`.
* **Gộp các head Alembic còn lại**: Ngày **30/09/2026**, commit `3cdb675`, thêm revision merge `f2c9a6d81b40` nối `795931a69149` và `e4b6f9a2c1d3`; không thay đổi schema.

---

## 4. Sprint 2 — “Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ” (28/9 – 5/10, 20 SP)

Căn cứ theo [nguồn tạm: nentangtramsac_bandaydu.md: Sheet Sprints dòng 23]:
* **Mục tiêu**: Trụ ảo nối vào hệ thống được xác thực, và vận hành viên thấy đúng trạng thái mọi trụ kể cả khi kết nối chập chờn.
* **Quy mô cam kết**: 20 Story Points (gồm 11 Stories từ S-06 đến S-16 `[nguồn tạm: nentangtramsac_bandaydu.md: Sheet Backlog dòng 93-165]`).

### Phân tích
Xử lý đồng thời 50 kết nối WebSocket từ các trụ ảo và đồng bộ trạng thái xuống màn hình của Vận hành viên trong vòng 1 giây.

### S-11 còn lại gì (3 SP)
`S-11` `[nguồn tạm: nentangtramsac_bandaydu.md: Sheet Backlog dòng 126]`:
* Hiển thị lưới 20 trụ sạc trên cùng một màn hình tải dưới 2 giây.
* Nhận sự kiện cập nhật trạng thái đầu nối thời gian thực qua Server-Sent Events hoặc WebSocket.
* Phân quyền hiển thị theo trạm sở hữu của từng CPO.
* Tự động kết nối lại khi đường truyền mạng bị gián đoạn.

### Ba phương án cam kết (cần PO chọn)
1. **Phương án Đầy đủ (20 SP - Khuyến nghị)**: Thực hiện toàn bộ từ S-06 đến S-16; yêu cầu cả nhóm 7–8 người phối hợp theo các làn song song.
2. **Phương án An toàn (16 SP)**: Dời lệnh điều khiển từ xa `S-16` (Reset - 1 SP) và tính năng xử lý trùng mã `S-14` (2 SP) sang Sprint 3.
3. **Phương án Tối thiểu (12 SP)**: Chỉ tập trung thông luồng kết nối WebSocket (`S-06`, `S-07`, `S-08`, `S-09`, `S-10`, `S-11`), dời phần ngắt kết nối và timeout sang Sprint sau.

### Cách rút ngắn chuỗi (không đổi phạm vi)
* Áp dụng nguyên tắc: Mỗi handler OCPP viết trên một file độc lập theo mẫu `T-16` để tránh xung đột mã nguồn khi commit Git (giải quyết rủi ro `R-09` `[nguồn tạm: nentangtramsac_bandaydu.md: Sheet Rủi ro dòng 418]`).

---

## 5. Lộ trình các sprint sau (theo backlog)

Căn cứ theo [nguồn tạm: nentangtramsac_bandaydu.md: Sheet Sprints dòng 24-29]:

| Sprint | Mục tiêu cốt lõi | Quy mô (SP) | Stories trọng tâm |
| :---: | :--- | :---: | :--- |
| **Sprint 3** | Phiên sạc trọn vẹn từ cắm đến rút, số kWh đúng dù rớt mạng | 20 | S-17 → S-27 (Start, Stop, MeterValues, Audit logs) |
| **Sprint 4** | Tính đúng tiền theo biểu giá nhiều khung giờ (TOU) | 20 | S-28 → S-34 (Biểu giá 24h, cắt khung, phí chiếm trụ) |
| **Sprint 5** | Tài xế nạp ví và tiền tự trừ khi sạc xong, số dư khớp sổ cái | 20 | S-35 → S-41 (Cổng thanh toán sandbox, sổ cái ACID) |
| **Sprint 6** | Trạm không bao giờ vượt hạn mức công suất (Smart Charging) | 19 | S-42 → S-46 (SetChargingProfile, chia tải động) |
| **Sprint 7** | Tài xế tìm trạm trống và đặt chỗ thành công (ReserveNow) | 19 | S-47 → S-51 (Tìm kiếm vị trí, giữ chỗ, hủy chỗ) |
| **Sprint 8** | Đối soát doanh thu khớp kWh và chia sẻ đối tác | 20 | S-52 → S-57 (Báo cáo kỳ, chốt sổ, ẩn danh hóa NĐ 13) |

---

## 6. Rủi ro — trạng thái hiện tại

Căn cứ theo [nguồn tạm: nentangtramsac_bandaydu.md: Sheet Rủi ro dòng 410-418]:

| Mã | Tên rủi ro | Mức độ | Biện pháp giảm thiểu | Trạng thái |
| :---: | :--- | :---: | :--- | :---: |
| **R-01** | Đặc tả OCPP dài và lạ, team đọc lâu | Cao | Thực hiện Spike K-01 chỉ đọc 8 tin nhắn cốt lõi | **ĐÃ GIẢM THIỂU** |
| **R-02** | Chưa có tài khoản sandbox thanh toán | Cao | Thiết kế S-36 nạp tay dự phòng trong lúc chờ cổng | **ĐANG THEO DÕI** |
| **R-03** | Chống trùng tin nhắn bằng biến memory | Cao | NFR bắt buộc lưu khóa chống trùng trong CSDL | **ĐÃ KIỂM SOÁT** |
| **R-04** | Bộ tính tiền sai ở ca biên (nửa đêm) | Cao | Viết riêng Story S-32 với bộ test đáp án tính tay | **KẾ HOẠCH SP 4** |
| **R-05** | Velocity thực tế lệch so với ước lượng | TB | Đo velocity 3 sprint đầu và có 25 SP đệm | **ĐANG THEO DÕI** |
| **R-06** | Thiếu DevOps, staging hỏng không ai sửa | TB | Tự động hóa qua script và container | **CẦN BỔ SUNG** |
| **R-07** | Dữ liệu vị trí vi phạm Nghị định 13/2023 | TB | Ẩn danh hóa lịch sử sạc trong S-57 | **KẾ HOẠCH SP 8** |
| **R-08** | Simulator không tôn trọng SetChargingProfile | Cao | Kiểm tra hồ sơ sạc ngay từ khâu thử nghiệm | **KẾ HOẠCH SP 6** |
| **R-09** | Xung đột merge khi cùng sửa module OCPP | TB | Mỗi handler một file riêng biệt, Daily Scrum | **ÁP DỤNG SP 2** |

---

## 7. Definition of Done — đã đạt / chưa

Căn cứ theo [nguồn tạm: nentangtramsac_bandaydu.md: Sheet DoD-DoR dòng 424-433]:
- [x] Code review được duyệt bởi ít nhất 1 thành viên khác (quy ước tại `CONTRIBUTING.md`).
- [x] Unit test cho nhánh logic mới; độ phủ không giảm (90 test cases).
- [x] CI xanh: build frontend thành công, test backend 90/90 passed.
- [x] Không lưu secret/mật khẩu trong mã nguồn; mật khẩu băm bằng bcrypt.
- [ ] AC pass trên staging với trụ ảo chạy thật (Đang tạm hoãn do vận hành trên local dev).
- [x] Không log thông tin nhạy cảm, mã thẻ hoặc mật khẩu vào console stdout.
- [x] Cập nhật README và tài liệu kỹ thuật đồng bộ với mã nguồn.

---

## 8. Nhánh Git hiện có (chưa merge vào main)

Căn cứ lệnh `git branch -a` trên kho lưu trữ ngày 29/09/2026:
* `feature/FE-quan-ly-tram-sac`: Nhánh phát triển giao diện quản lý trạm sạc phía frontend.
* `feature/S-01-khung-ung-dung-staging`: Nhánh thử nghiệm đóng gói khung ứng dụng.
* Các nhánh cá nhân của thành viên đội ngũ: `Duong`, `ManhDung`, `feature/Nguyenkhanhduy`, `hung`, `quocdung`.
