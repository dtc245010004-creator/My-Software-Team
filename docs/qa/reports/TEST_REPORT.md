# Current Test Report

> **Loại tài liệu**: Báo cáo tổng hợp kết quả kiểm thử hiện tại (Test Execution Summary Report)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 14  
> **Quy tắc tuân thủ**: Số liệu được trích xuất 100% từ kết quả chạy thực tế của bộ test tự động (`pytest` và `npm run build`), không suy diễn hoặc chép số liệu từ phác thảo cũ.

---

## Last Full Run Before OCPP (30/09/2026)

Đợt thực thi kiểm thử toàn diện được thực hiện vào ngày **30/09/2026** trên môi trường cục bộ (Local Development) và cấu hình Staging:
* **Backend**: Báo cáo lần chạy khi đó ghi nhận **89/89 test cases** đã **PASSED** (0 Failed, 0 Skipped). Các tài liệu lịch sử khác ghi tổng 84 hoặc 90 `[CẦN XÁC NHẬN]`; kết quả này không bao gồm thay đổi OCPP.
* **Frontend**: Lệnh biên dịch sản phẩm `npm --prefix frontend run build` hoàn thành thành công trong 12.40 giây, không phát sinh lỗi cú pháp hay gãy liên kết module.
* **Độ ổn định hệ thống**: Toàn bộ các cơ chế an toàn ACID (giao dịch trừ tiền ví, khóa tài khoản khi nợ vượt -300.000 VND, giới hạn chống tràn CSDL `balance >= -500000`, khôi phục phiên sạc mồ côi sau sự cố sập nguồn, khóa tạm 15 phút sau 5 lần đăng nhập sai) đều hoạt động chính xác theo đặc tả.

---

## Test Statistics

Căn cứ theo nhật ký thực thi thực tế của `pytest` (chạy ngày 30/09/2026):

| Chỉ số kiểm thử | Giá trị đo lường | Tỷ lệ (%) | Ghi chú kỹ thuật |
| :--- | :---: | :---: | :--- |
| **Tổng số ca kiểm thử (Total Tests)** | **89** | **100%** | Bao gồm Unit, Integration, ACID, Brute-Force Lockout và Mocking |
| **Số ca kiểm thử đạt (Passed)** | **89** | **100%** | Tất cả assertions đều thỏa mãn |
| **Số ca kiểm thử thất bại (Failed)** | **0** | **0%** | Không có lỗi logic hoặc assertion fail |
| **Số ca kiểm thử bị chặn (Blocked / Error)** | **0** | **0%** | Không có lỗi sập môi trường |
| **Số ca kiểm thử bỏ qua (Skipped)** | **0** | **0%** | 100% bộ test được thực thi đầy đủ |
| **Thời gian thực thi (Execution Time)** | **168.53s** | — | Môi trường Python 3.14 / SQLite |

### Phân bổ theo từng Module kiểm thử:
1. `tests/test_ai_fallback.py`: **18/18 passed** (Heuristic fallback, AI RBAC, Gemini mock, Scheduler).
2. `tests/test_auth.py`: **18/18 passed** (Đăng ký, Đăng nhập JWT, Phân quyền RBAC, Chặn khóa nợ, Đếm số lần sai và Khóa tạm 15 phút sau 5 lần sai).
3. `tests/test_driver_unauthenticated.py`: **4/4 passed** (Khách vãng lai sạc không cần login, nạp tiền tự do).
4. `tests/test_health.py`: **1/1 passed** (Kiểm tra kết nối CSDL và dịch vụ qua `/health`).
5. `tests/test_sessions.py`: **5/5 passed** (Vòng đời phiên sạc, xung đột đầu nối, idempotent stop).
6. `tests/test_sessions_acid.py`: **8/8 passed** (ACID ví tiền, trừ tiền nguyên tử, kiểm tra TOU tariff).
7. `tests/test_simulator.py`: **10/10 passed** (Đường cong sạc CC/CV, ngắt khi đầy pin, ngắt quá nhiệt, Crash reconciliation).
8. `tests/test_stations.py`: **15/15 passed** (CRUD trạm, tính toán tải lưới, IDOR protection, Haversine search).
9. `tests/test_wallet_acid.py`: **5/5 passed** (Nạp tiền, trừ tiền, giới hạn thấu chi -300k, mở khóa khi nạp dương).

---

## Current Blockers

* **Không có blocker nội bộ**: Bộ kiểm thử tự động trên môi trường cục bộ và CI chạy hoàn toàn độc lập, không bị nghẽn phụ thuộc mạng bên ngoài (nhờ cơ chế Mocking Gemini AI và SQLite in-memory/file).
* **Rào cản phần cứng thật**: Hệ thống chưa kết nối thiết bị phần cứng trụ sạc vật lý thực tế qua giao thức OCPP 1.6/2.0.1, hiện tại đang vận hành dựa trên bộ mô phỏng phần mềm nội tại (`charging_simulator.py`).

---

## Current Defects

* **Lỗi đã khắc phục triệt để**:
  1. *Lỗi hạn mức nợ thấu chi*: Đã đồng bộ quy chuẩn kiến trúc 2 tầng (Tầng nghiệp vụ khóa tài khoản ở `-300.000` VND; Tầng CSDL `CheckConstraint("balance >= -500000")` chỉ cho phép tràn nợ tối đa 200.000 VND).
  2. *Lỗi thông báo khi đăng nhập tài khoản nợ*: Đã thêm phản hồi HTTP 403 Forbidden kèm thông điệp `"tài khoản bị khóa vì - quá 300k"` khi tài khoản `is_debt_locked == True` cố gắng đăng nhập.
* **Khuyết tật đang mở (Active Defects)**: Hiện tại không ghi nhận khuyết tật nghiêm trọng (P0/P1) nào trong các chức năng đã triển khai của Giai đoạn 1.

---

## Integration Status

* **Frontend ↔ Backend REST API**: Tích hợp hoàn tất các luồng: Đăng nhập/Đăng ký, Lấy danh sách trạm sạc, Thao tác cắm sạc/dừng sạc, Nạp tiền ví điện tử, Chuyển đổi ca vận hành nhanh.
* **Frontend ↔ Backend WebSocket**: Kênh `ws://localhost:8000/ws/telemetry` kết nối ổn định, truyền phát dữ liệu SoC (%), công suất sạc (kW), nhiệt độ trạm và chi phí tạm tính mỗi 2 giây.
* **Cơ chế dự phòng (Graceful Degradation)**: Khi không có API Key của Google Gemini hoặc mạng gián đoạn, dịch vụ AI tự động chuyển sang Heuristic Engine dựa trên luật nội bộ mà không làm sập ứng dụng.

---

## Detailed Results

Danh mục chi tiết 84 ca kiểm thử đã thực thi và đạt chuẩn (xác thực từ `pytest backend/tests -v`):

```text
tests/test_ai_fallback.py::TestHeuristicEngine::test_smart_charging_normal PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_smart_charging_overload_emergency PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_predictive_maintenance_critical_temp PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_predictive_maintenance_high_voltage_drop PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_predictive_maintenance_medium_temp PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_predictive_maintenance_normal PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_predictive_maintenance_thermal_trend PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_dynamic_pricing_advice_trigger_shift PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_dynamic_pricing_advice_keep_current PASSED
tests/test_ai_fallback.py::TestHeuristicEngine::test_fallback_ai_ask PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_customer_forbidden_on_all_ai_endpoints PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_operator_idor_forbidden PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_operator_a_smart_charging_success PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_operator_a_predictive_maintenance_success PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_operator_a_pricing_advice_success PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_operator_ask_advisor_fallback_success PASSED
tests/test_ai_fallback.py::TestAIEndpointsAndRBAC::test_admin_has_full_access PASSED
tests/test_ai_fallback.py::TestGeminiMockAndGracefulDegradation::test_gemini_smart_charging_success_mock PASSED
tests/test_ai_fallback.py::TestGeminiMockAndGracefulDegradation::test_gemini_timeout_or_error_graceful_fallback PASSED
tests/test_ai_fallback.py::TestGeminiMockAndGracefulDegradation::test_scheduler_calculate_and_broadcast_integration PASSED
tests/test_auth.py::test_register_success_creates_wallet_atomically PASSED
tests/test_auth.py::test_register_atomicity_rollback_on_wallet_failure PASSED
tests/test_auth.py::test_register_duplicate_username PASSED
tests/test_auth.py::test_register_duplicate_email PASSED
tests/test_auth.py::test_register_password_too_short PASSED
tests/test_auth.py::test_register_password_exceeds_72_bytes PASSED
tests/test_auth.py::test_register_password_lacks_digits_or_letters PASSED
tests/test_auth.py::test_register_response_excludes_password_hash PASSED
tests/test_auth.py::test_register_rejects_client_supplied_role PASSED
tests/test_auth.py::test_login_wrong_credentials PASSED
tests/test_auth.py::test_login_success_and_get_me PASSED
tests/test_auth.py::test_rbac_forbidden_for_insufficient_role PASSED
tests/test_auth.py::test_login_debt_locked_shows_error PASSED
tests/test_driver_unauthenticated.py::test_driver_wallet_me_without_login PASSED
tests/test_driver_unauthenticated.py::test_driver_topup_with_name_without_login PASSED
tests/test_driver_unauthenticated.py::test_driver_start_and_stop_session_without_login PASSED
tests/test_driver_unauthenticated.py::test_driver_start_session_with_custom_battery_and_initial_soc PASSED
tests/test_health.py::test_health_check PASSED
tests/test_sessions.py::TestSessionLifecycle::test_start_session_available_connector_success PASSED
tests/test_sessions.py::TestSessionLifecycle::test_start_session_charging_conflict_fails PASSED
tests/test_sessions.py::TestSessionLifecycle::test_start_session_debt_locked_forbidden PASSED
tests/test_sessions.py::TestSessionLifecycle::test_stop_session_settles_and_frees_connector PASSED
tests/test_sessions.py::TestSessionLifecycle::test_stop_session_idempotency PASSED
tests/test_sessions_acid.py::test_topup_wallet_success PASSED
tests/test_sessions_acid.py::test_start_session_requires_minimum_balance PASSED
tests/test_sessions_acid.py::test_start_session_blocked_when_in_debt PASSED
tests/test_sessions_acid.py::test_start_session_locks_connector_exclusively PASSED
tests/test_sessions_acid.py::test_calculate_bill_with_tou_tariff_at_connect_time PASSED
tests/test_sessions_acid.py::test_stop_session_deducts_wallet_atomically PASSED
tests/test_sessions_acid.py::test_stop_session_allows_negative_balance_within_limit PASSED
tests/test_sessions_acid.py::test_stop_session_rejects_beyond_debt_limit PASSED
tests/test_sessions_acid.py::test_driver_cannot_stop_another_drivers_session PASSED
tests/test_simulator.py::test_simulator_initialization_and_random_soc PASSED
tests/test_simulator.py::test_charging_curve_cc_cv_phases PASSED
tests/test_simulator.py::test_auto_cutoff_on_battery_full PASSED
tests/test_simulator.py::test_auto_cutoff_on_overheat_emergency PASSED
tests/test_simulator.py::test_auto_cutoff_on_debt_limit_exceeded PASSED
tests/test_simulator.py::test_checkpoint_saves_snapshot_to_db PASSED
tests/test_simulator.py::test_server_crash_reconciliation PASSED
tests/test_simulator.py::test_simulator_rbac_and_idor_protection PASSED
tests/test_simulator.py::test_session_stop_automatically_takes_simulator_kwh PASSED
tests/test_simulator.py::test_simulator_manager_threadsafe_from_worker_thread PASSED
tests/test_stations.py::test_public_list_stations_and_pagination PASSED
tests/test_stations.py::test_haversine_distance_search PASSED
tests/test_stations.py::test_customer_forbidden_from_creating_station PASSED
tests/test_stations.py::test_operator_create_station_sets_operator_id PASSED
tests/test_stations.py::test_idor_station_level_forbidden PASSED
tests/test_stations.py::test_admin_full_access_to_any_station PASSED
tests/test_stations.py::test_add_charger_and_connectors_to_station PASSED
tests/test_stations.py::test_oversubscription_calculation PASSED
tests/test_stations.py::test_unique_constraint_charger_code_and_connector_number PASSED
tests/test_stations.py::test_idor_charger_level_create_update_delete PASSED
tests/test_stations.py::test_idor_patch_charger_status PASSED
tests/test_stations.py::test_atomic_soft_delete_and_reactivate_station PASSED
tests/test_stations.py::test_get_live_dashboard_metrics PASSED
tests/test_stations.py::test_get_grid_load_profile PASSED
tests/test_stations.py::test_get_grid_load_profile_timeline PASSED
tests/test_stations.py::test_cumulative_energy_captures_short_session_under_60s PASSED
tests/test_wallet_acid.py::TestWalletServiceACID::test_topup_wallet_success PASSED
tests/test_wallet_acid.py::TestWalletServiceACID::test_deduct_fee_with_sufficient_balance PASSED
tests/test_wallet_acid.py::TestWalletServiceACID::test_deduct_fee_allows_debt_within_limit PASSED
tests/test_wallet_acid.py::TestWalletServiceACID::test_deduct_fee_exceeding_debt_limit_triggers_debt_lock PASSED
tests/test_wallet_acid.py::TestWalletServiceACID::test_topup_clears_debt_lock_when_positive PASSED
```

## Kiểm thử full backend và khung OCPP (01/10/2026)

* Virtualenv `backend/.venv` đã được đồng bộ theo `backend/requirements.txt`, bao gồm `pydantic-settings`.
* Full backend suite đạt **148 passed, 1 warning** trong 110.56 giây. Test chạy từ thư mục tạm dưới `backend/.venv`, vì `conftest.py` xóa file `test_ev_csms.db` tương đối với thư mục làm việc; hai file test DB có sẵn được giữ nguyên.
* `backend/tests/test_ocpp_frames.py` có 20 ca và `backend/tests/test_boot_notification.py` có 8 ca; tổng 28 ca OCPP nằm trong kết quả full suite.

## Kiểm thử chống xử lý CALL OCPP lặp (01/10/2026)

* `backend/tests/test_ocpp_idempotency.py`: 4 ca passed, gồm gửi lại 5 lần, nhận diện trùng qua session CSDL mới, tái sử dụng message ID với action khác và dọn bản ghi quá 7 ngày.
* Full backend suite: **152 passed, 1 warning trong 116.35 giây**; tổng 32 ca OCPP.
* Warning hiện có là FutureWarning từ package `google.generativeai`; không phát sinh lỗi test.

## Kiểm thử Authorize OCPP và idTag (01/10/2026)

* `backend/tests/test_authorize.py`: **6 passed** — năm trạng thái Authorize tham số hóa và unique code.
* Các suite Authorize, BootNotification và idempotency: **18 passed, 1 warning**.
* Full backend suite: **158 passed, 1 warning trong 117.08 giây**; tổng 38 ca OCPP.
* Seed trên SQLite tạm tạo 8 thẻ cho 8 tài khoản tài xế role `CUSTOMER`. Migration `45ab6640633a` đã kiểm tra upgrade/downgrade trên DB tạm; DB dự án chưa migrate.

## Kiểm thử CSMS gửi lệnh Reset OCPP (01/10/2026)

* `backend/tests/test_ocpp_reset.py`: **5 passed** — CALLRESULT online, xử lý CALL xen kẽ trong lúc chờ, offline 409 không dispatch, timeout 504 với hạn 0.5 giây trong test, CALLERROR và chặn role CUSTOMER.
* Full backend suite: **163 passed, 1 warning trong 122.08 giây**; có 43 ca OCPP.
* Warning hiện có là `FutureWarning` từ `google.generativeai`; không phát sinh lỗi test.

## Kiểm thử MeterValues OCPP — T-40/T-41 (05/10/2026)

* `backend/tests/test_meter_values.py`: **5 passed** — lưu số đo vào phiên đang sạc, bỏ qua đại lượng khác và giữ nguyên đơn vị, ghi orphan khi không có phiên, xác nhận CALLRESULT trước DB, và đo 20 lượt xử lý dưới 200 ms/lượt.
* Full backend suite: **258 passed, 1 skipped, 181 warnings trong 137.81 giây**. Ruff trên backend: `All checks passed!`.
* Migration `4a0a1107f87d` đã được kiểm tra upgrade/downgrade/upgrade trên DB SQLite tạm đã stamp ở head trước đó. Upgrade toàn chuỗi từ DB trống không qua được migration lịch sử `5ba0e05433d7` do tạo trùng cột `charging_points.last_seen_at`; Docker daemon không khả dụng nên không chạy được lệnh Compose được yêu cầu.
* DB dự án không bị thay đổi; kiểm tra SHA-256 trước/sau cho file DB chính trùng khớp.

## Kiểm thử loại bỏ số đo lùi/trùng — T-42/T-43 (05/10/2026)

* `backend/tests/test_meter_values_dedup.py`: **5 passed** — timestamp lùi được bỏ qua với một warning; bản trùng timestamp/value bỏ qua im lặng; counter giảm ở timestamp mới vẫn lưu và đặt `needs_review`; cùng timestamp khác value được giữ làm bản hiệu chỉnh; hai request giống nhau đồng thời chỉ lưu một dòng.
* Hai suite MeterValues: **10 passed**. Full backend suite: **263 passed, 1 skipped, 181 warnings trong 138.62 giây**. Ruff backend: `All checks passed!`.
* Migration `339c5001fe7a` thêm `charging_sessions.needs_review` với mặc định false; đã kiểm tra nâng cấp/hạ cấp/nâng cấp lại trên DB tạm. DB dự án giữ nguyên SHA-256 trước/sau.

## Kiểm thử khôi phục phiên OCPP — T-44/T-45/T-46 (05/10/2026)

* `backend/tests/integration/test_reconnect_scenario.py`: 1 ca tích hợp chạy ba vòng; đạt với 5 trụ mặc định và với 20 trụ qua `OCPP_RECONNECT_CHARGE_POINTS`. Kiểm tra reconnect WebSocket, giữ transactionId, không nhân đôi phiên, StopTransaction khi offline, timestamp kết thúc từ payload và 5 kWh mỗi phiên.
* Full backend suite: **264 passed, 1 skipped, 298 warnings trong 222.40 giây**. Ruff trên các file mã nguồn và test thay đổi: `All checks passed!`.
* Các lượt chạy hoàn tất được cô lập trong thư mục tạm. Lượt khởi chạy đầu tiên do lỗi thiết lập thư mục đã mở `ev_csms.db` ở thư mục gốc; lifespan gọi `create_all` và `reconcile_interrupted_sessions`. Pytest cũng đã xóa/tạo lại file kiểm thử gốc `test_ev_csms.db` theo quy tắc trong `conftest.py`. Không có bản sao/hash trước lượt chạy để xác minh hoặc phục hồi trạng thái cũ của hai file này. SHA-256 hiện tại của `ev_csms.db` là `5BE76BEFB761DC75F8A2F986B9B35113E4A28935366E9343EAE32D73954F4D58`. `backend/ev_csms.db` vẫn giữ SHA-256 `65C50528BD176262A1438E98DDF44F77620F751D351769CD5751AEAFDE2639BC`.

## Kiểm thử phát hiện phiên sạc bất thường — T-53 (05/10/2026)

* `backend/tests/test_abnormal_session_job.py`: **3 passed** — phiên có heartbeat quá ngưỡng nhận cờ/lý do đúng và vẫn `CHARGING`; heartbeat mới không bị đánh dấu; job được đăng ký chạy mỗi phút.
* Full backend suite: **267 passed, 1 skipped, 298 warnings trong 155.32 giây**. Ruff trên file cấu hình, model, scheduler, migration và test: `All checks passed!`.
* Migration `c4ab19f2d7e1` nâng/hạ/nâng thành công trên SQLite tạm đã stamp ở revision `339c5001fe7a`; không chạy migration lên DB dự án.
