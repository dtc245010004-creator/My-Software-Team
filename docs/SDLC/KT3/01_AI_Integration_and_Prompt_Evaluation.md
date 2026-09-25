# BÁO CÁO THIẾT KẾ VÀ ĐÁNH GIÁ TÍCH HỢP AI & HEURISTIC FALLBACK (MỐC KT3)

> **Dự án:** Nền tảng Vận hành Trạm sạc Xe điện Thông minh (EV CSMS)  
> **Mã hồ sơ:** KT3-01  
> **Ngày hoàn thành:** 25/09/2026  
> **Phiên bản:** 1.0.0  
> **Trạng thái:** HOÀN THÀNH — ĐÃ ĐẠT TOÀN BỘ TIÊU CHÍ (DoD 64/64 Tests Passed)

---

## 1. TỔNG QUAN KIẾN TRÚC DUAL-LOOP & NGUYÊN TẮC CỐT LÕI

Hệ thống tích hợp trí tuệ nhân tạo của EV CSMS được xây dựng theo mô hình **Dual-Loop Architecture (Hai vòng lặp song song)** nhằm cân bằng giữa tốc độ phản hồi tức thời (vật lý lưới điện) và khả năng phân tích ngữ cảnh chuyên sâu (kinh tế và kỹ thuật).

```
               [ EV CSMS Dual-Loop Architecture ]
                           
   Fast Loop (Heuristic Engine)           Slow Loop (Gemini AI Engine)
  ┌─────────────────────────────┐        ┌─────────────────────────────┐
  │ - Tốc độ: < 5ms             │        │ - Tốc độ: 1-3s (Timeout 5s) │
  │ - 100% In-memory/CSDL local │        │ - Google Gemini 1.5 Flash   │
  │ - Weighted Fair Sharing SoC │        │ - Phân tích xu hướng sâu    │
  │ - Rule-based Maintenance    │        │ - Tư vấn định giá doanh thu │
  │ - Độc lập khi offline       │        │ - Cố vấn NLP vận hành       │
  └──────────────┬──────────────┘        └──────────────┬──────────────┘
                 │                                      │
                 ▼                                      ▼
           [ Bộ điều khiển dự phòng (Graceful Degradation Controller) ]
           ├─ Gọi Gemini AI trước (Slow Loop)
           ├─ Bắt mọi Exception (Key rỗng, Quota 429, Timeout > 5s, JSON parse lỗi)
           └─ Tự động Fallback sang Heuristic: source="HEURISTIC_FALLBACK", is_fallback=True
```

### Bốn nguyên tắc bất khả xâm phạm

1. **AI Advisory Only (Chỉ đóng vai trò Cố vấn)**: AI không bao giờ can thiệp trực tiếp vào rơ-le vật lý hay cập nhật số dư ví tiền của người dùng. Mọi điều phối công suất mang tính tham chiếu và điều tiết thông số trần (`power_limit_override_kw`).
2. **Chuẩn hóa phản hồi (Dual Metadata)**: Mọi kết quả phản hồi từ module AI đều bắt buộc chứa hai trường định danh:
   - `source`: `"GEMINI_AI"` hoặc `"HEURISTIC_FALLBACK"`
   - `is_fallback`: `Boolean` (`True` nếu chạy qua Heuristic)
3. **Tuyệt đối không gây sập hệ thống (Zero HTTP 500 on AI Failure)**: Khi Gemini API gặp sự cố (mất mạng, hết hạn ngạch, timeout quá 5 giây, cú pháp JSON sai), hệ thống tự động fallback sang Heuristic và trả về HTTP 200 kèm dữ liệu dự phòng.
4. **Heuristic hoạt động độc lập 100%**: Heuristic Engine (`FallbackService`) được thiết kế không phụ thuộc vào bất kỳ kết nối ngoại vi nào, bảo đảm hệ thống web vận hành liên tục 24/7.

---

## 2. CHI TIẾT 3 MODULE NGHIỆP VỤ AI

### 2.1. Module 1: Smart Charging & Load Balancing (Điều phối tải lưới điện)

- **Bài toán**: Ngăn ngừa sự cố quá tải máy biến áp khi tổng công suất các xe cắm sạc vượt quá công suất lưới an toàn của trạm: $P_{\text{limit}} = P_{\text{grid\_max}} \times 0.95$.
- **Cơ chế kích hoạt (3 lớp)**:
  1. *Event-driven (Fast Loop / Heuristic)*: Kích hoạt tức thì khi có phiên sạc mới cắm vào/rút ra hoặc độ chênh lệch dung lượng pin $\Delta\text{SoC} \ge 5\%$.
  2. *Periodic Job (Slow Loop / Gemini)*: `AsyncIOScheduler` chạy ngầm mỗi 3 phút quét toàn bộ các trạm đang hoạt động để phân tích xu hướng tải.
  3. *On-demand API*: `POST /api/v1/ai/smart-charging/{station_id}`.
- **Thuật toán Weighted Fair Sharing theo SoC**:
  $$w_i = \begin{cases} 1.2 & \text{nếu } \text{SoC}_i < 50\% \text{ (ưu tiên pin yếu)} \\ 1.0 & \text{nếu } 50\% \le \text{SoC}_i \le 80\% \text{ (tải thông thường)} \\ 0.6 & \text{nếu } \text{SoC}_i > 80\% \text{ (giai đoạn CV giảm dòng)} \end{cases}$$
  Nếu tổng yêu cầu $\sum P_{\text{req}} > P_{\text{limit}}$, công suất phân bổ cho mỗi cổng:
  $$P_{\text{alloc}}[i] = \min\left(P_{\text{req}}[i], P_{\text{limit}} \times \frac{w_i \cdot P_{\text{req}}[i]}{\sum_j (w_j \cdot P_{\text{req}}[j])}\right)$$
  Bảo đảm: $\sum P_{\text{alloc}} \le P_{\text{limit}}$ và $P_{\text{alloc}}[i] \le P_{\text{req}}[i]$.
- **WebSocket Broadcast**: Sau mỗi lần điều phối, kết quả được phát sóng qua sự kiện `SMART_CHARGING_ALLOCATION_UPDATED` để Dashboard Frontend cập nhật tức thì.

---

### 2.2. Module 2: Predictive Maintenance (Bảo trì dự đoán trụ sạc)

- **API**: `POST /api/v1/ai/predictive-maintenance/{charger_id}`
- **Ngưỡng rủi ro cứng (`risk_level`)**:
  - $T_{\text{max}} > 85^\circ\text{C} \rightarrow$ `CRITICAL` (Nguy cơ cháy nổ, khuyến nghị ngắt sạc khẩn cấp).
  - $T_{\text{max}} > 75^\circ\text{C}$ hoặc sụt áp $> 10\% \rightarrow$ `HIGH` (Cảnh báo quá nhiệt, kiểm tra tản nhiệt và dây dẫn).
  - $65^\circ\text{C} < T_{\text{max}} \le 75^\circ\text{C} \rightarrow$ `MEDIUM` (Nhiệt độ vận hành cao, theo dõi sát).
  - $T_{\text{max}} \le 65^\circ\text{C} \rightarrow$ `NORMAL` (Vận hành an toàn).
- **Công thức tính điểm sức khỏe liên tục (`health_score`, thang 0–100)**:
  $$\text{Penalty}_T = \min(50.0, (T_{\text{max}} - 45.0) \times 1.5) \quad (\text{với } T_{\text{max}} > 45^\circ\text{C})$$
  $$\text{Penalty}_V = \min(30.0, (\Delta V_{\text{drop}} - 2.0) \times 3.0) \quad (\text{với } \Delta V_{\text{drop}} > 2.0\%)$$
  $$\text{HealthScore} = \max(0.0, \min(100.0, 100.0 - \text{Penalty}_T - \text{Penalty}_V))$$
- **Xu hướng nhiệt (`thermal_trend`)**:
  So sánh nhiệt độ trung bình 3 phiên/mẫu gần nhất ($\overline{T}_{\text{recent}}$) với 3 phiên/mẫu trước đó ($\overline{T}_{\text{prev}}$):
  - $\Delta T > +2.0^\circ\text{C} \rightarrow$ `"increasing"`
  - $\Delta T < -2.0^\circ\text{C} \rightarrow$ `"decreasing"`
  - Khác $\rightarrow$ `"stable"`

---

### 2.3. Module 3: Dynamic Pricing Advisor & NLP Operations Chat

- **Tư vấn Biểu giá TOU (`POST /api/v1/ai/pricing-advice/{station_id}`)**:
  - Heuristic phân tích tỷ lệ lấp đầy (Occupancy Rate) trong 7 ngày qua.
  - **Quy tắc điều chỉnh**:
    Nếu $\text{Occupancy}_{\text{peak}} > 80\%$ VÀ $(\text{Occupancy}_{\text{peak}} - \text{Occupancy}_{\text{offpeak}}) \ge 30\%$:
    - Giá cao điểm: tăng $+15\%$ (`suggested_peak = price_peak * 1.15`)
    - Giá thấp điểm: giảm $-10\%$ (`suggested_offpeak = price_offpeak * 0.90`)
    - Giá bình thường: giữ nguyên
    - Mục tiêu: Giãn tải giờ cao điểm, dịch chuyển nhu cầu sạc sang ban đêm.
    Ngược lại: Giữ nguyên biểu giá hiện tại.
- **Trợ lý Cố vấn NLP Vận hành (`POST /api/v1/ai/ask`)**:
  - Nhận câu hỏi tự do từ CPO / Quản trị viên.
  - Tự động trích xuất các thông số vận hành thực tế (Grounding Data) từ CSDL: Doanh thu 7 ngày gần nhất, tổng số phiên sạc, tỷ lệ lấp đầy bình quân, số lượng trụ sạc đang bị lỗi (`FAULTED`).
  - Nếu Gemini ngoại tuyến: Tự động trả lời qua Heuristic kèm bản tóm tắt `basic_stats`, không làm gián đoạn trải nghiệm người dùng.

---

## 3. BẢO MẬT & PHÂN QUYỀN (RBAC & IDOR DEFENSE)

| Endpoint | Quyền hạn cho phép | Quy tắc kiểm soát IDOR |
| :--- | :--- | :--- |
| `POST /api/v1/ai/smart-charging/{station_id}` | `ADMIN`, `OPERATOR` | `verify_station_ownership`: Operator chỉ thao tác trên trạm thuộc quyền sở hữu của mình. Khách hàng (`CUSTOMER`) nhận HTTP 403. |
| `POST /api/v1/ai/predictive-maintenance/{charger_id}` | `ADMIN`, `OPERATOR` | `verify_charger_ownership`: Operator chỉ kiểm tra trụ sạc thuộc trạm của mình. |
| `POST /api/v1/ai/pricing-advice/{station_id}` | `ADMIN`, `OPERATOR` | `verify_station_ownership`: Không cho phép Operator A xem đề xuất định giá của Operator B. |
| `POST /api/v1/ai/ask` | `ADMIN`, `OPERATOR` | Chỉ người quản trị hệ thống và vận hành trạm mới được truy cập dữ liệu kinh doanh. |

---

## 4. KẾT QUẢ THỰC THI KIỂM THỬ TỰ ĐỘNG (DoD VERIFICATION)

Toàn bộ bộ kiểm thử tự động đã được thực hiện bằng `pytest` trên môi trường Python 3.14:

```text
============================= test session starts =============================
platform win32 -- Python 3.14.6, pytest-8.2.2, pluggy-1.6.0
rootdir: E:\AAA\backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.14.2, cov-7.1.0, flask-1.3.0
collected 64 items

tests\test_ai_fallback.py .....................                          [ 32%]
tests\test_auth.py ............                                          [ 51%]
tests\test_health.py .                                                   [ 53%]
tests\test_sessions_acid.py .........                                    [ 67%]
tests\test_simulator.py .........                                        [ 81%]
tests\test_stations.py ............                                      [100%]

======================= 64 passed, 1 warning in 36.00s ========================
```

### Danh mục 21 Test Cases của Module AI (`test_ai_fallback.py`):

1. `test_smart_charging_safe_grid`: Lưới an toàn ($\le 95\%$), cấp 100% công suất yêu cầu.
2. `test_smart_charging_overload_weighted_fair_sharing`: Quá tải lưới, điều phối chuẩn theo trọng số SoC ($w=1.2, 1.0, 0.6$).
3. `test_smart_charging_empty_requests`: Xử lý trạm không có phiên sạc an toàn.
4. `test_predictive_maintenance_critical_temp`: $T > 85^\circ\text{C} \rightarrow$ `CRITICAL`.
5. `test_predictive_maintenance_high_voltage_drop`: Sụt áp $> 10\% \rightarrow$ `HIGH`.
6. `test_predictive_maintenance_medium_temp`: $65^\circ\text{C} < T \le 75^\circ\text{C} \rightarrow$ `MEDIUM`.
7. `test_predictive_maintenance_normal`: Thông số tiêu chuẩn $\rightarrow$ `NORMAL`, điểm sức khỏe cao.
8. `test_predictive_maintenance_thermal_trend`: Phát hiện chính xác xu hướng nhiệt tăng dần (`increasing`).
9. `test_dynamic_pricing_advice_trigger_shift`: Giờ cao điểm $> 80\%$ & chênh lệch $\ge 30\% \rightarrow$ Tăng cao điểm $+15\%$, giảm thấp điểm $-10\%$.
10. `test_dynamic_pricing_advice_keep_current`: Chênh lệch thấp $\rightarrow$ Khuyến nghị giữ nguyên biểu giá.
11. `test_fallback_ai_ask`: Hỏi đáp Heuristic khi ngoại tuyến trả về số liệu thực tế.
12. `test_customer_forbidden_on_all_ai_endpoints`: Khách hàng bị chặn 403 trên cả 4 endpoints AI.
13. `test_operator_idor_forbidden`: Operator B can thiệp trạm/trụ của Operator A bị chặn 403.
14. `test_operator_a_smart_charging_success`: Operator A gọi thành công trạm của mình (Heuristic Fallback).
15. `test_operator_a_predictive_maintenance_success`: Dự báo bảo trì thành công với Heuristic.
16. `test_operator_a_pricing_advice_success`: Tư vấn giá thành công qua HTTP API.
17. `test_operator_ask_advisor_fallback_success`: Trợ lý NLP tự động trả về `basic_stats` khi AI offline.
18. `test_admin_has_full_access`: Admin có quyền trên toàn bộ trạm và trụ sạc.
19. `test_gemini_smart_charging_success_mock`: Mock Gemini API thành công $\rightarrow$ `source="GEMINI_AI"`, `is_fallback=False`.
20. `test_gemini_timeout_or_error_graceful_fallback`: Mock Gemini API ném Exception/Quota/Timeout $\rightarrow$ Tự động chuyển Fallback, HTTP 200, không ném 500.
21. `test_scheduler_calculate_and_broadcast_integration`: Kiểm thử tích hợp hàm lõi tính toán và phát sóng WebSocket qua scheduler.

---

## 5. BÀN GIAO MÃ NGUỒN VÀ TIẾN ĐỘ

- [x] Tạo `backend/app/schemas/ai.py` chuẩn hóa Pydantic Schemas.
- [x] Tạo `backend/app/services/fallback_service.py` độc lập 100%.
- [x] Tạo `backend/app/services/ai_service.py` tích hợp Gemini API, Prompt Grounding và Timeout 5s.
- [x] Tạo `backend/app/services/scheduler_service.py` lập lịch định kỳ 3 phút và phát sóng WebSocket.
- [x] Tạo `backend/app/api/v1/endpoints/ai.py` và đăng ký trong `api_router`.
- [x] Tích hợp Event-driven SoC delta ($\ge 5\%$) trong `ChargingSimulator`.
- [x] Hoàn thiện 21 tests mới, nâng tổng test suite lên **64/64 tests pass 100%**.
- [x] Hoàn thiện hồ sơ bàn giao KT3: `docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md`.
