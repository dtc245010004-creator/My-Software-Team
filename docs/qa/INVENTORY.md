# TEST INVENTORY

> **Loại tài liệu**: Sổ cái kiểm kê tài sản kiểm thử (Test Asset Master Register)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.3 số 12  
> **Quy tắc tuân thủ**: Phản ánh chính xác 100% các ca kiểm thử tự động đang có hiệu lực trong mã nguồn dự án; không sử dụng dữ liệu ước lượng.

---

## 1. Purpose

Tài liệu này đóng vai trò là **Sổ cái kiểm kê tài sản kiểm thử trung tâm** của dự án EV CSMS. Mục tiêu nhằm:
1. Định danh và lập danh mục toàn bộ các ca kiểm thử tự động hiện có trong kho mã nguồn.
2. Thiết lập ma trận truy vết giữa Ca kiểm thử (Test Case) ↔ Mã nguồn (Source Code) ↔ Yêu cầu nghiệp vụ.
3. Cung cấp căn cứ khoa học để phân tích tác động và lựa chọn kịch bản kiểm thử hồi quy chọn lọc khi có thay đổi.

---

## 2. Test Inventory Alignment & Traceability Standards

Mọi ca kiểm thử trong kho lưu trữ đều tuân thủ các nguyên tắc chuẩn hóa:
* **Tính độc lập (Test Isolation)**: Mỗi ca kiểm thử sử dụng session CSDL riêng biệt hoặc rollback tự động sau khi kết thúc để không gây ô nhiễm dữ liệu chéo giữa các test.
* **Quy chuẩn định danh (Naming Convention)**: Tên hàm kiểm thử bắt đầu bằng tiền tố `test_<hành động>_<kỳ vọng>` (ví dụ: `test_register_success_creates_wallet_atomically`).
* **Bằng chứng thực thi (Evidence-based Rule)**: Mọi báo cáo trạng thái PASS/FAIL đều phải xuất phát từ nhật ký thực thi thực tế của công cụ kiểm thử (`pytest`), không chấp nhận trạng thái suy diễn trên giấy.

---

## 3. Test Coverage Summary

Căn cứ lịch sử chạy kiểm thử: ghi nhận ngày 29/09/2026 là 84 passed, trong khi các tổng hợp khác ghi 89 và 90 ca `[CẦN XÁC NHẬN]`. Full suite mới nhất ngày 08/10/2026 đạt 298 passed, 1 skipped, 302 warnings trên Python 3.14.7; 299 ca được thu thập trong 123.28 giây.

| Nhóm chức năng kiểm thử | File mã nguồn kiểm thử | Số ca kiểm thử | Trạng thái xác thực | Độ phủ trọng yếu |
| :--- | :--- | :---: | :---: | :--- |
| Nhóm chức năng kiểm thử | File mã nguồn kiểm thử | Số ca kiểm thử | Trạng thái xác thực | Độ phủ trọng yếu |
| :--- | :--- | :---: | :---: | :--- |
| **Xác thực & Bảo mật (Auth & RBAC)** | `backend/tests/test_auth.py` | 18 | 100% PASS | Đăng ký, đăng nhập JWT, hash bcrypt, chặn khóa nợ, khóa tạm 15 phút sau 5 lần sai, phân quyền RBAC |
| **Khách vãng lai (Guest Driver)** | `backend/tests/test_driver_unauthenticated.py` | 4 | 100% PASS | Sạc không cần đăng nhập, nạp tiền tự do, cấu hình pin tùy chỉnh |
| **Vòng đời phiên sạc (Session Lifecycle)** | `backend/tests/test_sessions.py` | 5 | 100% PASS | Bắt đầu sạc, giải phóng đầu nối, kiểm tra idempotent stop |
| **Giao dịch & Tiền tệ ACID** | `backend/tests/test_sessions_acid.py` | 8 | 100% PASS | Trừ tiền nguyên tử, biểu giá TOU, khóa độc quyền đầu nối, chặn nợ |
| **Ví điện tử ACID (Wallet ACID)** | `backend/tests/test_wallet_acid.py` | 5 | 100% PASS | Nạp tiền, trừ tiền, giới hạn thấu chi -300k, CheckConstraint -500k |
| **Quản trị Mạng lưới Trạm (Stations)** | `backend/tests/test_stations.py` | 15 | 100% PASS | CRUD trạm, mã trụ duy nhất, phân quyền CPO, IDOR, tìm kiếm khoảng cách |
| **Mô phỏng sạc (Simulator & Telemetry)** | `backend/tests/test_simulator.py` | 10 | 100% PASS | Đường cong CC/CV, ngắt khi đầy/quá nhiệt/nợ, phục hồi crash |
| **Trí tuệ nhân tạo (AI Fallback & Scheduler)** | `backend/tests/test_ai_fallback.py` | 18 | 100% PASS | Heuristic fallback, phân tích nhiệt độ, biểu giá động, lập lịch định kỳ |
| **Kiểm tra sức khỏe dịch vụ** | `backend/tests/test_health.py` | 1 | 100% PASS | Endpoint `/health`, kết nối CSDL |
| **BASELINE TỔNG CỘNG** | **9 Test Suites** | **89** | **100% PASS trong lần chạy baseline** | **Kết quả cũ, không bao gồm suite OCPP mới** |
| **OCPP Idempotency** | `backend/tests/test_ocpp_idempotency.py` | 4 | 100% PASS | Gửi lặp năm lần, session CSDL mới, cùng message ID khác action, cleanup 7 ngày |
| **OCPP Authorize** | `backend/tests/test_authorize.py` | 6 | 100% PASS | Thẻ không tồn tại, blocked, expired, trạm inactive, accepted và mã thẻ duy nhất |
| **OCPP Server Reset** | `backend/tests/test_ocpp_reset.py` | 5 | 100% PASS | CALLRESULT, CALLERROR, CALL xen kẽ, offline, timeout và RBAC |
| **OCPP MeterValues** | `backend/tests/test_meter_values.py` | 5 | 100% PASS | Lưu measurand năng lượng, bỏ qua measurand khác, ghi orphan, ACK trước DB, thời gian xử lý 20 lần gửi |
| **OCPP MeterValues Dedup** | `backend/tests/test_meter_values_dedup.py` | 5 | 100% PASS | Timestamp lùi, bản tin trùng, counter giảm, cùng timestamp hiệu chỉnh và đồng thời |
| **Abnormal Charging Session Job** | `backend/tests/test_abnormal_session_job.py` | 3 | 100% PASS | Đánh dấu heartbeat quá ngưỡng, bỏ qua heartbeat mới, xác minh job mỗi phút chỉ gắn cờ và không đóng phiên |
| **Biểu giá và phí chiếm trụ S-28** | `backend/tests/test_billing_idle_fee.py` | 20 | 20/20 passed trong full suite 08/10/2026 | Ân hạn, làm tròn, trần phút cấu hình, Available muộn, field tariff và HTTP 422 |

**Bổ sung kiểm chứng ngày 08/10/2026**: Full backend suite đạt **298 passed, 1 skipped, 302 warnings** (299 ca thu thập trong 123.28 giây, Python 3.14.7). Riêng S-28 có **20/20 ca passed**; migration nâng/hạ/nâng đã chạy trên SQLite tạm.

---

## 4. Test Case Inventory

Bảng danh mục chi tiết baseline 89 ca đã ghi nhận trước khi thêm suite OCPP:

### 4.1. Suite: `test_auth.py` (18 tests)
1. `test_register_success_creates_wallet_atomically`: Đăng ký tài khoản thành công đồng thời tạo ví tiền nguyên tử.
2. `test_register_atomicity_rollback_on_wallet_failure`: Rollback đăng ký nếu khởi tạo ví thất bại.
3. `test_register_duplicate_username`: Chặn đăng ký trùng username.
4. `test_register_duplicate_email`: Chặn đăng ký trùng email.
5. `test_register_password_too_short`: Chặn mật khẩu dưới 8 ký tự.
6. `test_register_password_exceeds_72_bytes`: Chặn mật khẩu vượt quá 72 bytes của thuật toán bcrypt.
7. `test_register_password_lacks_digits_or_letters`: Chặn mật khẩu thiếu chữ hoặc số.
8. `test_register_response_excludes_password_hash`: Đảm bảo API không làm lộ password_hash ra ngoài client.
9. `test_register_rejects_client_supplied_role`: Chặn client tự gửi role nâng cao (luôn gán CUSTOMER).
10. `test_login_wrong_credentials`: Báo lỗi HTTP 401 khi sai mật khẩu.
11. `test_login_success_and_get_me`: Đăng nhập cấp mã token JWT và lấy thông tin `/auth/me`.
12. `test_rbac_forbidden_for_insufficient_role`: Phân quyền RBAC chặn quyền truy cập endpoint Admin đối với Customer.
13. `test_login_debt_locked_shows_error`: Chặn đăng nhập tài khoản nợ kèm thông báo `"tài khoản bị khóa vì - quá 300k"`.
14. `test_login_wrong_password_increments_attempts_and_shows_remaining`: Đăng nhập sai mật khẩu tăng số lần sai và hiển thị số lần thử còn lại.
15. `test_login_lockout_after_max_failed_attempts`: Đăng nhập sai liên tiếp 5 lần kích hoạt khóa tạm 15 phút (HTTP 403 Forbidden).
16. `test_login_blocked_during_lockout_without_checking_password`: Trong thời gian bị khóa, mọi yêu cầu đăng nhập (kể cả mật khẩu đúng) đều bị chặn ngay lập tức.
17. `test_login_auto_unlock_after_lockout_duration`: Tự động mở khóa và reset biến đếm khi đã hết thời gian khóa tạm và đăng nhập đúng.
18. `test_login_success_resets_failed_attempts_counter`: Nhập sai dưới ngưỡng rồi đăng nhập đúng thì reset số lần đếm thất bại về 0.

### 4.2. Suite: `test_driver_unauthenticated.py` (4 tests)
13. `test_driver_wallet_me_without_login`: Khách sạc lấy thông tin ví tự động tạo theo session.
14. `test_driver_topup_with_name_without_login`: Khách nạp tiền ví kèm họ tên mà không cần tài khoản.
15. `test_driver_start_and_stop_session_without_login`: Khách thực hiện trọn vẹn phiên sạc cắm và dừng.
16. `test_driver_start_session_with_custom_battery_and_initial_soc`: Khách tùy chỉnh dung lượng pin (kWh) và % pin ban đầu.

### 4.3. Suite: `test_sessions.py` (5 tests)
17. `test_start_session_available_connector_success`: Bắt đầu phiên sạc trên đầu nối đang rảnh (`AVAILABLE`).
18. `test_start_session_charging_conflict_fails`: Chặn cắm sạc khi đầu nối đang có phiên sạc khác (`CHARGING`).
19. `test_start_session_debt_locked_forbidden`: Chặn bắt đầu phiên sạc nếu tài khoản đang bị khóa nợ.
20. `test_stop_session_settles_and_frees_connector`: Dừng phiên sạc, quyết toán tiền và trả trạng thái đầu nối về rảnh.
21. `test_stop_session_idempotency`: Dừng phiên sạc nhiều lần không làm nhân bản giao dịch thanh toán.

### 4.4. Suite: `test_sessions_acid.py` (8 tests)
22. `test_topup_wallet_success`: Nạp tiền ví tăng số dư chính xác.
23. `test_start_session_requires_minimum_balance`: Bắt buộc số dư tối thiểu 50.000 VND mới được cắm sạc.
24. `test_start_session_blocked_when_in_debt`: Chặn sạc khi số dư âm.
25. `test_start_session_locks_connector_exclusively`: Khóa độc quyền đầu nối trong suốt phiên sạc.
26. `test_calculate_bill_with_tou_tariff_at_connect_time`: Áp dụng đúng biểu giá điện TOU theo giờ kết nối.
27. `test_stop_session_deducts_wallet_atomically`: Trừ tiền ví nguyên tử đồng bộ với hóa đơn phiên sạc.
28. `test_stop_session_allows_negative_balance_within_limit`: Cho phép số dư âm trong hạn mức thấu chi cho phép.
29. `test_driver_cannot_stop_another_drivers_session`: Chặn tài xế A can thiệp dừng phiên sạc của tài xế B.

### 4.5. Suite: `test_wallet_acid.py` (5 tests)
30. `test_topup_wallet_success`: Nạp tiền thành công và ghi lịch sử giao dịch `TOPUP`.
31. `test_deduct_fee_with_sufficient_balance`: Trừ tiền phí sạc khi số dư khả dụng đủ.
32. `test_deduct_fee_allows_debt_within_limit`: Cho phép trừ tiền đẩy số dư xuống âm trong ngưỡng -300k.
33. `test_deduct_fee_exceeding_debt_limit_triggers_debt_lock`: Khóa nợ `is_debt_locked: True` khi âm vượt ngưỡng.
34. `test_topup_clears_debt_lock_when_positive`: Tự động mở khóa nợ khi người dùng nạp tiền đưa số dư về dương.

### 4.6. Suite: `test_stations.py` (15 tests)
35. `test_public_list_stations_and_pagination`: Xem danh sách trạm sạc công khai kèm phân trang.
36. `test_haversine_distance_search`: Tìm kiếm trạm sạc gần nhất theo tọa độ định vị bán kính km.
37. `test_customer_forbidden_from_creating_station`: Chặn vai trò CUSTOMER tự tạo trạm sạc.
38. `test_operator_create_station_sets_operator_id`: CPO tạo trạm tự động gán quyền sở hữu `operator_id`.
39. `test_idor_station_level_forbidden`: Chặn CPO A sửa hoặc xóa trạm thuộc quyền CPO B.
40. `test_admin_full_access_to_any_station`: Admin có toàn quyền quản trị trên mọi trạm sạc.
41. `test_add_charger_and_connectors_to_station`: Thêm trụ sạc và các đầu nối vào trạm.
42. `test_oversubscription_calculation`: Tính toán hệ số vượt tải công suất hạ tầng trạm.
43. `test_unique_constraint_charger_code_and_connector_number`: Ràng buộc tính duy nhất của mã trụ và số thứ tự đầu nối.
44. `test_idor_charger_level_create_update_delete`: Chặn truy cập trái phép cấp trụ sạc giữa các CPO.
45. `test_idor_patch_charger_status`: Chặn sửa trạng thái trụ sạc của đơn vị khác.
46. `test_atomic_soft_delete_and_reactivate_station`: Xóa mềm và kích hoạt lại trạm sạc nguyên tử.
47. `test_get_live_dashboard_metrics`: Lấy thông số KPI vận hành trực tiếp của trạm.
48. `test_get_grid_load_profile`: Lấy biểu đồ phụ tải điện lưới của trạm sạc.
49. `test_get_grid_load_profile_timeline`: Lấy dòng thời gian phụ tải theo chuỗi thời gian thực.

### 4.7. Suite: `test_simulator.py` (10 tests)
50. `test_simulator_initialization_and_random_soc`: Khởi tạo thông số mô phỏng và ngẫu nhiên % pin ban đầu.
51. `test_charging_curve_cc_cv_phases`: Mô phỏng chính xác 2 pha sạc dòng không đổi (CC) và áp không đổi (CV).
52. `test_auto_cutoff_on_battery_full`: Tự động ngắt sạc khi pin đạt 100%.
53. `test_auto_cutoff_on_overheat_emergency`: Tự động ngắt sạc khẩn cấp khi nhiệt độ vượt ngưỡng an toàn.
54. `test_auto_cutoff_on_debt_limit_exceeded`: Tự động ngắt sạc khi tiền điện vượt quá hạn mức nợ ví.
55. `test_checkpoint_saves_snapshot_to_db`: Lưu định kỳ checkpoint dữ liệu sạc xuống CSDL.
56. `test_server_crash_reconciliation`: Tự động đóng và quyết toán các phiên sạc mồ côi sau khi máy chủ khởi động lại.
57. `test_simulator_rbac_and_idor_protection`: Bảo vệ quyền điều khiển mô phỏng theo đúng phân quyền.
58. `test_session_stop_automatically_takes_simulator_kwh`: Lấy số điện năng kWh thực tế từ simulator khi kết thúc phiên.
59. `test_simulator_manager_threadsafe_from_worker_thread`: An toàn đa luồng giữa tiến trình tính toán và event loop.

### 4.8. Suite: `test_ai_fallback.py` (18 tests)
60. `test_smart_charging_normal`: Thuật toán sạc thông minh phân bổ tải ở điều kiện bình thường.
61. `test_smart_charging_overload_emergency`: Giảm công suất sạc khẩn cấp khi điện lưới quá tải.
62. `test_predictive_maintenance_critical_temp`: Cảnh báo bảo trì dự đoán khi nhiệt độ trụ tăng đột biến.
63. `test_predictive_maintenance_high_voltage_drop`: Cảnh báo sụt áp bất thường trên đường dây.
64. `test_predictive_maintenance_medium_temp`: Cảnh báo mức độ trung bình khi nhiệt độ ấm dần.
65. `test_predictive_maintenance_normal`: Xác nhận trạng thái bình thường khi thông số chuẩn.
66. `test_predictive_maintenance_thermal_trend`: Phân tích xu hướng tích lũy nhiệt độ theo thời gian.
67. `test_dynamic_pricing_advice_trigger_shift`: Khuyến nghị điều chỉnh giá điện để giãn phụ tải cao điểm.
68. `test_dynamic_pricing_advice_keep_current`: Khuyến nghị giữ nguyên giá điện khi tải phân bổ đều.
69. `test_fallback_ai_ask`: Cơ chế phản hồi câu hỏi tư vấn bằng Heuristic khi AI mất mạng.
70. `test_customer_forbidden_on_all_ai_endpoints`: Chặn tài xế truy cập vào các API phân tích AI của ban quản trị.
71. `test_operator_idor_forbidden`: Chặn CPO truy cập báo cáo AI của trạm thuộc CPO khác.
72. `test_operator_a_smart_charging_success`: CPO lấy thành công kế hoạch sạc thông minh cho trạm của mình.
73. `test_operator_a_predictive_maintenance_success`: CPO lấy thành công báo cáo bảo trì dự đoán.
74. `test_operator_a_pricing_advice_success`: CPO nhận khuyến nghị điều chỉnh giá.
75. `test_operator_ask_advisor_fallback_success`: CPO sử dụng trợ lý cố vấn AI qua cơ chế fallback.
76. `test_admin_has_full_access`: Admin có toàn quyền truy xuất mọi báo cáo AI toàn hệ thống.
77. `test_gemini_smart_charging_success_mock`: Giả lập phản hồi thành công từ mô hình Gemini.
78. `test_gemini_timeout_or_error_graceful_fallback`: Tự động hạ cấp sang luật nội bộ khi Gemini timeout/lỗi mạng.
79. `test_scheduler_calculate_and_broadcast_integration`: Tiến trình lập lịch định kỳ phân tích và phát sóng cảnh báo.
80. `test_cumulative_energy_captures_short_session_under_60s`: Ghi nhận chính xác điện năng kể cả phiên sạc ngắn dưới 60 giây.

### 4.9. Suite: `test_health.py` (1 test)
81. `test_health_check`: Kiểm tra endpoint `/api/v1/health` trả về kết quả healthy và kết nối CSDL tốt.
*(Ghi chú: 3 test cases còn lại phát sinh từ các bộ kiểm thử có tham số hóa `@pytest.mark.parametrize` trong bộ test suites)*.

### 4.10. Suite: `test_ocpp_frames.py` (20 ca)
1. `test_parse_and_build_round_trip_preserves_frame_value` (15 ca tham số hóa): Round-trip toàn bộ 14 khung từ log Spike K-01 thật và một CALLERROR mẫu tự tạo do thiếu log Spike thật cho loại khung này.
2. `test_parse_invalid_frame_raises_with_ocpp_error_code` (5 ca tham số hóa): Không phải mảng, thiếu phần tử, loại khung lạ, payload không phải object và action chưa hỗ trợ.

**Kết quả tại checkpoint T-14/T-15 ngày 01/10/2026**: Suite khung OCPP đạt 20 passed với `--noconftest`; full backend suite tại checkpoint đó đạt 140 passed, 1 warning. Kết quả mới sau T-16/T-17 được ghi trong mục 4.11.

### 4.11. Suite: `test_boot_notification.py` (8 ca)
1. `test_boot_notification_persists_metadata_and_accepts`: Lưu metadata từ log thật K-01, trả `Accepted`, thời gian UTC, interval cấu hình và trạng thái `online`.
2. `test_inactive_station_rejects_boot_without_marking_charging_point_online`: Trạm inactive nhận `Rejected`, không chuyển trụ sang online.
3. `test_second_boot_notification_updates_same_charging_point`: Boot lặp cập nhật cùng bản ghi trụ.
4. `test_other_action_before_boot_acceptance_returns_security_error`: Action trước khi boot được chấp nhận nhận `SecurityError`.
5. `test_boot_notification_uses_configured_heartbeat_interval`: Phản hồi đọc chu kỳ từ settings.
6. `test_unknown_charge_point_closes_before_accepting`: Mã trụ không tồn tại đóng bằng mã 4001 và được ghi log cùng IP.
7. `test_missing_boot_metadata_is_saved_as_none` (2 ca tham số hóa): Trường metadata tùy chọn thiếu được lưu `None` mà không từ chối Boot.

**Kết quả kiểm thử cập nhật ngày 01/10/2026**: Ba suite OCPP có 32 ca; full backend suite đạt 152 passed, 1 warning. Test được chạy trong thư mục tạm dưới `.venv` để giữ nguyên các DB test có sẵn.

### 4.12. Suite: `test_ocpp_idempotency.py` (4 ca)
1. `test_repeated_message_id_reuses_saved_response_five_times`: Gửi cùng CALL năm lần; response giữ nguyên, handler không ghi đè metadata ban đầu và chỉ có một bản ghi chống lặp.
2. `test_duplicate_is_recognized_by_a_new_database_session`: Kết nối lại tạo session CSDL mới; phản hồi và dữ liệu ban đầu vẫn được phát lại.
3. `test_reused_message_id_with_different_action_replays_and_warns`: Khi cùng message ID được gửi với action khác, gateway phát response cũ và ghi cảnh báo.
4. `test_cleanup_job_removes_only_messages_older_than_seven_days`: Job dọn bản ghi quá 7 ngày, giữ lại bản ghi 6 ngày tuổi.

**Kết quả kiểm thử cập nhật ngày 01/10/2026**: Ba suite OCPP có 32 ca; full backend suite đạt 152 passed, 1 warning trong 116.35 giây.

### 4.13. Suite: `test_authorize.py` (6 ca)
1. `test_authorize_returns_expected_id_tag_info_and_masks_unknown_code` (5 ca tham số hóa): Thẻ không tồn tại, thẻ blocked, thẻ expired, trạm inactive và thẻ hợp lệ; kiểm tra `idTagInfo` và log không chứa mã thẻ đầy đủ.
2. `test_id_tag_code_must_be_unique`: CSDL từ chối hai thẻ có cùng `code` bằng `IntegrityError`.

**Kết quả kiểm thử cập nhật ngày 01/10/2026**: Full backend suite đạt 158 passed, 1 warning trong 117.08 giây; bốn suite OCPP có tổng 38 ca.

### 4.14. Suite: `test_ocpp_reset.py` (5 ca)
1. `test_reset_online_forwards_callresult_and_processes_other_calls`: Trụ online nhận CALL Reset, gateway vẫn xử lý Authorize do trụ gửi trong lúc chờ, rồi ghép CALLRESULT theo message ID.
2. `test_reset_offline_returns_conflict_without_dispatching`: Trụ offline trả HTTP 409 và không gọi dispatcher.
3. `test_reset_no_response_returns_gateway_timeout`: Không có phản hồi trong 0.5 giây test trả HTTP 504.
4. `test_reset_returns_bad_gateway_for_ocpp_callerror`: CALLERROR được chuyển thành lỗi gateway với mã, mô tả và details.
5. `test_reset_rejects_customer_role`: Tài khoản CUSTOMER nhận HTTP 403.

**Kết quả kiểm thử cập nhật ngày 01/10/2026**: Full backend suite đạt 163 passed, 1 warning trong 122.08 giây; năm suite OCPP có tổng 43 ca.

### 4.15. Suite: `test_meter_values.py` (5 ca)
1. `test_meter_values_persists_energy_sample_for_active_session`: lưu mẫu năng lượng gắn với phiên sạc đang chạy và giữ timestamp từ payload.
2. `test_meter_values_ignores_other_measurands_and_preserves_unit`: bỏ qua đại lượng không phải năng lượng, giữ nguyên đơn vị Wh/kWh.
3. `test_meter_values_without_active_session_is_saved_as_orphan`: lưu payload vào bảng `orphan_messages` khi không có phiên `CHARGING` phù hợp.
4. `test_meter_values_acknowledges_before_database_write`: xác nhận CALLRESULT trước khi handler/ghi DB.
5. `test_meter_values_handles_twenty_messages_under_200ms_each`: đo 20 lần gửi liên tiếp, mỗi lần dưới 200 ms.

**Kết quả kiểm thử ngày 05/10/2026**: Suite MeterValues đạt 5 passed; full backend suite đạt 258 passed, 1 skipped, 181 warnings.

### 4.16. Suite: `test_meter_values_dedup.py` (5 ca)
1. `test_meter_values_ignores_older_timestamp_and_logs_once`: bỏ qua mẫu có thời gian cũ, không thêm dòng và ghi đúng một cảnh báo kèm session/mốc thời gian.
2. `test_meter_values_ignores_exact_duplicate_without_warning`: bỏ qua cùng timestamp + value mà không ghi cảnh báo.
3. `test_meter_values_records_lower_value_at_newer_timestamp_and_marks_session`: vẫn lưu counter giảm ở thời gian mới và bật `needs_review`.
4. `test_meter_values_keeps_same_timestamp_value_correction`: giữ mẫu hiệu chỉnh cùng timestamp nhưng value khác theo xác nhận nghiệp vụ.
5. `test_concurrent_exact_meter_values_are_serialized_and_saved_once`: gửi đồng thời hai mẫu giống nhau và chỉ giữ một dòng.

**Kết quả kiểm thử ngày 05/10/2026**: Suite MeterValues S-19 và dedup S-20 đạt 10 passed; full backend suite đạt 263 passed, 1 skipped, 181 warnings.

### 4.17. Suite tích hợp reconnect OCPP — `integration/test_reconnect_scenario.py` (1 ca)
1. `test_reconnect_scenario_keeps_one_session_and_expected_energy`: chạy ba vòng liên tiếp; mỗi trụ bắt đầu phiên, gửi MeterValues, ngắt WebSocket ngẫu nhiên, kết nối lại, gửi StatusNotification/StartTransaction lặp và StopTransaction. Kiểm tra số phiên không nhân đôi, kWh đúng số mô phỏng và thời điểm kết thúc theo payload. Mặc định 5 trụ; biến `OCPP_RECONNECT_CHARGE_POINTS` cho phép chạy 20 trụ.

**Kết quả kiểm thử ngày 05/10/2026**: Kịch bản đạt với 5 và 20 trụ; full backend suite đạt 264 passed, 1 skipped, 298 warnings.

### 4.18. Suite `test_abnormal_session_job.py` (3 ca)
1. `test_abnormal_session_job_flags_stale_point_without_closing_session`: trụ quá ngưỡng được đánh dấu với lý do chứa đúng số giây cấu hình; phiên vẫn `CHARGING`.
2. `test_abnormal_session_job_ignores_recently_seen_point`: heartbeat mới không bị đánh dấu, trạng thái phiên vẫn `CHARGING`.
3. `test_abnormal_session_job_is_registered_once_per_minute`: job được đăng ký vào APScheduler theo chu kỳ một phút.

**Kết quả kiểm thử ngày 05/10/2026**: 3 passed; full backend suite đạt 267 passed, 1 skipped, 298 warnings.

* **Kiểm thử tự động**: Baseline trước khi nhập S-30/S-31 đạt 298 passed, 1 skipped, 302 warnings ngày 08/10/2026; 299 ca được thu thập trên Python 3.14.7. Cần chạy lại full suite sau khi hợp nhất.
* **Migration Alembic**: `backend/alembic.ini` cấu hình `backend/alembic/` làm nguồn duy nhất; head hiện tại là `1660df6b86c6`. Hai migration S-28 đã kiểm chứng tiến/lùi/tiến trên DB SQLite tạm, chưa áp dụng lên CSDL dự án.
* **Đóng gói & CI/CD**: Khung ứng dụng Staging qua `docker-compose.staging.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf` và pipeline CI `.github/workflows/ci-staging.yml`.

### Phần "Đã thay đổi" (Lịch sử điều chỉnh kỹ thuật)
* **SCRUM-188/189/190/192 thuộc S-28 (08/10/2026 - chưa commit)**: Thêm phí chiếm trụ theo biểu giá và ân hạn, kiểm tra dữ liệu âm ở schema, lưu thời điểm connector báo `Finishing`/`SuspendedEV` và `Available`, tập trung phép tính vào `billing.py`, lưu `idle_amount`, và áp trần số phút từ `IDLE_FEE_MAX_MINUTES` (mặc định 240). Khi `Available` đến sau billing, không sửa hóa đơn/sổ cái và không tự trừ ví lần hai; mentor cần xác nhận cách quyết toán bổ sung. 20 test billing chọn lọc passed; baseline full suite đạt 298 passed, 1 skipped. Hai migration đã kiểm tra nâng/hạ/nâng trên SQLite tạm.
* **Sửa phân quyền đọc trạm/trụ và hiển thị trạm thiếu GPS (07/10/2026 - chưa commit)**: Dùng chung bộ lọc truy vấn cho API list/detail/tree/grid trạm và list/detail trụ; truy cập ngoài phạm vi trả `404`; chuẩn hóa `Type 2` cũ trong DTO, không ghi DB. 35 test chọn lọc passed, Ruff sạch.

### 4.19. Suite `test_billing_idle_fee.py` (20 ca)
1. `test_calculate_idle_fee_within_grace_period`: Không thu phí trong ân hạn.
2. `test_calculate_idle_fee_rounds_billable_minutes_up_after_grace`: Phần vượt ân hạn được làm tròn lên theo phút.
3. `test_calculate_session_total_without_idle_status_charges_energy_only`: Thiếu mốc chiếm trụ thì chỉ thu tiền điện.
4. `test_status_notifications_capture_idle_start_and_available_time`: Ghi nhận thời điểm `Finishing` và `Available`.
5. `test_calculate_idle_fee_caps_chargeable_minutes`: Giới hạn phần phút chịu phí ở 240 phút.
6. `test_settings_default_idle_fee_cap_is_240_minutes`, `test_calculate_session_total_uses_configured_idle_fee_cap`: Xác minh mặc định và việc đọc trần từ settings.
7. `test_late_available_only_records_marker_after_session_billing`: `Available` tới sau khi chốt chỉ lưu mốc, không đổi hóa đơn, số dư ví hoặc sổ giao dịch.
8. `test_create_tariff_defaults_idle_fields_to_zero`, `test_update_tariff_accepts_idle_fields`: Kiểm tra mặc định và lưu các trường phí/ân hạn.
9. `test_create_tariff_rejects_negative_values`, `test_update_tariff_rejects_negative_values`: Kiểm tra HTTP 422 và tên trường trong lỗi tiếng Việt.

**Kết quả baseline ngày 08/10/2026**: 20/20 ca passed.

### 4.20. Suite biểu giá chia đoạn và qua nửa đêm — `test_pricing_engine.py` (20 ca)
S-30 kiểm thử chia các phiên thành nhiều khung TOU và nội suy tại ranh giới thiếu số đo; S-31 kiểm thử phiên qua nửa đêm/đa ngày, múi giờ trạm, biểu giá từng ngày và nhóm hóa đơn. Bộ test cũng kiểm tra làm tròn từng đoạn, đầu vào dict, tính thuần và quyền truy cập API/IDOR.

**Kết quả được nhánh `quocdung` ghi nhận ngày 08/10/2026**: 20 ca `test_pricing_engine.py` passed; full suite khi đó đạt 290 passed, 1 skipped. Đây là kết quả trên revision trước khi hợp nhất với `main`; cần đối chiếu với lượt kiểm thử mới.

---

## 5. Historical Tests

* **Giai đoạn trước**: 83 test cases đã được xây dựng và duy trì trong quá trình phát triển Giai đoạn 1.
* **Cập nhật ngày 29/09/2026**: Bổ sung thêm ca kiểm thử `test_login_debt_locked_shows_error` để kiểm chứng thông báo khóa nợ cho người dùng, nâng tổng số lên 84 test cases.

---

## 6. Unverified Mappings

Các thành phần hiện tại chưa thể kiểm thử tự động do thiếu thiết bị vật lý:
1. Giao thức truyền thông phần cứng OCPP 1.6/2.0.1 qua kết nối dây cáp vật lý.
2. Thiết bị quẹt thẻ RFID thực tế tại trụ sạc.
3. Đồng hồ đo điện năng vật lý (Hardware Energy Meter) bên trong trụ sạc.

---

## 7. Coverage Gaps

* **Khoảng trống 1**: Chưa có kiểm thử tự động cho luồng thanh toán VNPay IPN thật (do chưa tích hợp cổng thanh toán sản xuất).
* **Khoảng trống 2**: Chưa có kiểm thử End-to-End (E2E) tự động bằng Playwright/Cypress cho toàn bộ thao tác giao diện React phía client.

---

## 8. Regression Reference

### 8.1. Bảng ma trận ánh xạ kiểm thử hồi quy

| Khi chỉnh sửa module | Bộ test bắt buộc phải chạy lại |
| :--- | :--- |
| **`app/models/wallet.py` hoặc `wallet_service.py`** | `test_wallet_acid.py`, `test_sessions_acid.py`, `test_auth.py` |
| **`app/api/v1/endpoints/auth.py`** | `test_auth.py`, `test_driver_unauthenticated.py` |
| **`app/models/station.py` hoặc `station_service.py`** | `test_stations.py`, `test_ai_fallback.py` |
| **`app/simulator/charging_simulator.py`** | `test_simulator.py`, `test_sessions.py` |
| **`app/ocpp/frames.py`** | `test_ocpp_frames.py` |

### 8.2. Danh mục ứng viên kiểm thử theo thành phần dùng chung

Khi sửa các file cấu hình nền tảng (`app/core/config.py`, `app/core/database.py`), toàn bộ **89 test cases** thuộc cả 9 suites đều là ứng viên bắt buộc phải chạy lại.

---

## 9. Inventory Verification Metadata

* **Ngày kiểm chứng**: 30/09/2026.
* **Môi trường thực thi**: Python 3.14 / pytest 8.x, SQLite 3.
* **Kết quả lịch sử 30/09/2026**: 89 passed; không bao gồm suite OCPP bổ sung ngày 01/10/2026.
* **Người xác thực**: AI Assistant phối hợp cùng Tech Lead dự án.
