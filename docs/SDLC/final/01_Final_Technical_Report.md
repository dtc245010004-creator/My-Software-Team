# BÁO CÁO KỸ THUẬT TỔNG KẾT ĐỒ ÁN (FINAL TECHNICAL REPORT)
## NỀN TẢNG VẬN HÀNH TRẠM SẠC XE ĐIỆN TÍCH HỢP TRÍ TUỆ NHÂN TẠO (AI-POWERED EV CSMS)

---

### MỤC LỤC
1. [Tổng Quan Đề Tài & Bối Cảnh Thực Tiễn](#1-tổng-quan-đề-tài--bối-cảnh-thực-tiễn)
2. [Kiến Trúc Hệ Thống Tổng Thể & Dual-Loop Pattern](#2-kiến-trúc-hệ-thống-tổng-thể--dual-loop-pattern)
3. [Thiết Kế Cơ Sở Dữ Liệu & Tính Toàn Vẹn Giao Dịch (ACID)](#3-thiết-kế-cơ-sở-dữ-liệu--tính-toàn-vẹn-giao-dịch-acid)
4. [Bộ Giả Lập Phiên Sạc Realtime (OCPP-like Telemetry Simulator)](#4-bộ-giả-lập-phiên-sạc-realtime-ocpp-like-telemetry-simulator)
5. [Tích Hợp Trí Tuệ Nhân Tạo & Cơ Chế Heuristic Fallback](#5-tích-hợp-trí-tuệ-nhân-tạo--cơ-chế-heuristic-fallback)
6. [Thiết Kế Giao Diện Người Dùng Chuyên Biệt (Industrial UI/UX)](#6-thiết-kế-giao-diện-người-dùng-chuyên-biệt-industrial-uiux)
7. [Kết Quả Kiểm Thử Toàn Diện (Automated Test Suite)](#7-kết-quả-kiểm-thử-toàn-diện-automated-test-suite)
8. [Phân Tích Nợ Kỹ Thuật, Rủi Ro & Lộ Trình Mở Rộng](#8-phân-tích-nợ-kỹ-thuật-rủi-ro--lộ-trình-mở-rộng)
9. [Kết Luận](#9-kết-luận)

---

## 1. Tổng Quan Đề Tài & Bối Cảnh Thực Tiễn

Sự bùng nổ của phương tiện giao thông chạy điện (EV) tại Việt Nam và trên thế giới đang đặt ra thách thức khổng lồ cho hạ tầng lưới điện đô thị và các đơn vị vận hành điểm sạc (Charge Point Operators - CPO). Một hệ thống quản lý trạm sạc xe điện tiêu chuẩn không chỉ đơn thuần là phần mềm bật/tắt rơ-le, mà đòi hỏi:
- **Quản lý phân cấp hạ tầng nghiêm ngặt (RBAC & Multi-tenant)**: Trạm sạc (Station) $\rightarrow$ Trụ sạc (EVSE/Charging Point) $\rightarrow$ Cổng sạc vật lý (Connector).
- **Giao dịch tài chính an toàn tuyệt đối (ACID Transaction)**: Đảm bảo số dư ví tiền điện tử, tính cước linh hoạt theo giờ cao điểm/thấp điểm (TOU Tariff), chính sách quản lý nợ có kiểm soát (Overdraft/Debt Limit).
- **Giám sát đo đạc thời gian thực (Realtime Telemetry)**: Truyền nhận dữ liệu công suất (kW), điện năng tiêu thụ (kWh), trạng thái sạc pin (SoC %), nhiệt độ đầu nối và biến áp qua WebSocket với tần suất cao.
- **Tối ưu hóa năng lượng & Bảo trì tiên đoán bằng AI**: Điều tiết phụ tải thông minh (Smart Charging/Load Balancing) bảo vệ thanh cái trạm (Grid Busbar), dự báo sớm hư hỏng cách điện hoặc quá nhiệt (Predictive Maintenance), và tư vấn biểu giá tối ưu doanh thu.

Đồ án **EV CSMS (Electric Vehicle Charging Station Management System)** đã được nghiên cứu, thiết kế và phát triển toàn diện từ tầng lõi dữ liệu đến giao diện trực quan, giải quyết triệt để các bài toán thực tiễn trên.

---

## 2. Kiến Trúc Hệ Thống Tổng Thể & Dual-Loop Pattern

### 2.1. Ngăn Xếp Công Nghệ (Technology Stack)

| Lớp Kiến Trúc | Công Nghệ Lựa Chọn | Vai Trò & Cơ Chế Hoạt Động |
| :--- | :--- | :--- |
| **Backend Core** | FastAPI (Python 3.10+) | Khung ứng dụng RESTful hiệu năng cao, cơ chế Asynchronous I/O xử lý đồng thời hàng trăm telemetry loop |
| **ORM & Data** | SQLAlchemy 2.0 + SQLite/PostgreSQL | Mô hình hóa dữ liệu quan hệ, kiểm soát Transaction Isolation, Pessimistic Locking (`with_for_update`) |
| **Realtime Engine** | FastAPI Native WebSockets | Hub trung chuyển telemetry hai chiều, broadcast dữ liệu đo đếm sạc mỗi 2 giây tới giao diện điều khiển |
| **Background Scheduler** | APScheduler (AsyncIOScheduler) | Tự động quét điều phối phụ tải định kỳ 3 phút, kiểm tra an toàn lưới điện và phát cảnh báo sớm |
| **AI Slow Loop** | Google Gemini API (`gemini-1.5-flash`) | Phân tích xu hướng tiêu thụ điện, đề xuất biểu giá tối ưu doanh thu và trợ lý kỹ thuật giải đáp ngôn ngữ tự nhiên |
| **AI Fast Loop** | Python Heuristic Engine | Thuật toán Weighted Fair Sharing theo SoC và bộ suy luận quy tắc nhiệt động học, độc lập 100% khi offline |
| **Frontend SPA** | React 18 + Vite + Tailwind CSS | Giao diện Single Page Application phản hồi tức thì, dark-theme công nghiệp, hiển thị số liệu `tabular-nums` |
| **UI Components** | Lucide React + Recharts | Thư viện biểu đồ và trực quan hóa công suất, phụ tải, nhiệt độ và tiến độ sạc pin |

### 2.2. Mô Hình Kiến Trúc Dual-Loop (Vòng Lặp Kép)

Để giải quyết mâu thuẫn cố hữu giữa **tính an toàn tức thời** của lưới điện vật lý (yêu cầu phản hồi tính bằng mili-giây) và **độ trễ mạng của các mô hình ngôn ngữ lớn (LLM)** (độ trễ 1-4 giây, rủi ro đứt mạng, cạn quota), hệ thống áp dụng kiến trúc **Dual-Loop**:

```
                              ┌────────────────────────────────────────────────────────┐
                              │                 EV CSMS ARCHITECTURE                   │
                              └────────────────────────────────────────────────────────┘
                                                         │
                      ┌──────────────────────────────────┴──────────────────────────────────┐
                      ▼                                                                     ▼
         ┌─────────────────────────┐                                           ┌─────────────────────────┐
         │        FAST LOOP        │                                           │        SLOW LOOP        │
         │ (Tức thời / Cực nhạy)   │                                           │ (Chiến lược / Tổng thể) │
         └─────────────────────────┘                                           └─────────────────────────┘
                      │                                                                     │
       - Tần suất: Event-driven (<100ms)                                      - Tần suất: Định kỳ 3-5 phút hoặc On-demand
       - Động cơ: Python Heuristic Engine                                     - Động cơ: Google Gemini API (LLM)
       - Nhiệm vụ:                                                            - Nhiệm vụ:
         * Điều phối chia tải khẩn cấp                                          * Phân tích xu hướng dài hạn (TOU Price shift)
         * Cắt sạc tức thì khi pin quá nhiệt (>=75°C)                           * Tư vấn tối ưu doanh thu trạm
         * Cắt sạc khi vượt hạn mức nợ (-300.000đ)                              * Trợ lý ảo kỹ thuật trả lời ngữ cảnh trạm
                      │                                                                     │
                      └──────────────────────────────────┬──────────────────────────────────┘
                                                         │
                                                         ▼
                                      ┌─────────────────────────────────────┐
                                      │       GRACEFUL DEGRADATION          │
                                      │   Gemini Timeout / Error / Offline  │
                                      │   ==> 100% Tự động Fallback Heuristic│
                                      │   (Hệ thống luôn sẵn sàng 24/7)     │
                                      └─────────────────────────────────────┘
```

---

## 3. Thiết Kế Cơ Sở Dữ Liệu & Tính Toàn Vẹn Giao Dịch (ACID)

### 3.1. Mô Hình Thực Thể Quan Hệ (ERD & Data Schema)

Cấu trúc CSDL bao gồm 7 bảng cốt lõi với khóa ngoại và ràng buộc chặt chẽ:
1. `users`: Quản lý tài khoản và định danh phân quyền (ADMIN, OPERATOR, CUSTOMER).
2. `wallets` & `wallet_transactions`: Quản lý số dư, lịch sử biến động số dư, cờ khóa nợ `is_debt_locked`, ràng buộc `balance >= -1000000`.
3. `stations`: Quản lý thông tin trạm sạc, tọa độ GPS (kinh độ, vĩ độ), công suất máy biến áp tối đa (`total_grid_capacity_kw`), quyền sở hữu theo `operator_id`.
4. `charging_points`: Quản lý các trụ sạc EVSE vật lý trực thuộc trạm, mã trụ duy nhất theo trạm, công suất trụ tối đa.
5. `connectors`: Cổng sạc vật lý (CCS2, Type 2, CHAdeMO) với trạng thái độc quyền (`AVAILABLE`, `CHARGING`, `FAULTED`, `OFFLINE`).
6. `tariffs`: Cấu hình biểu giá điện TOU (Time-of-Use) theo 3 khung giờ: Giờ bình thường, Giờ cao điểm, Giờ thấp điểm.
7. `charging_sessions`: Nhật ký phiên sạc, lưu trữ thời điểm bắt đầu/kết thúc, chỉ số công tơ điện (`meter_start_kwh`, `meter_stop_kwh`), biểu giá áp dụng tại thời điểm cắm, trạng thái phiên (`ACTIVE`, `COMPLETED`, `INTERRUPTED`).

### 3.2. Đảm Bảo Tính Toàn Vẹn Giao Dịch (ACID Guarantee)

Hệ thống tuân thủ 3 nguyên tắc bất khả xâm phạm về nghiệp vụ tài chính và rơ-le sạc:

#### A. Khóa Độc Quyền Cổng Sạc (Exclusive Locking & Race-Condition Prevention)
- Khi bắt đầu sạc, hệ thống thực hiện kiểm tra và cập nhật nguyên tử trạng thái cổng sạc từ `AVAILABLE` $\rightarrow$ `CHARGING`.
- Nếu phát hiện cổng đang ở trạng thái `CHARGING` hoặc tài xế khác đang sử dụng, hệ thống lập tức từ chối và phản hồi mã lỗi `HTTP 409 Conflict`. Không thể xảy ra tình trạng 2 xe sạc chung 1 cổng vật lý.

#### B. Cơ Chế Chốt Biểu Giá Tại Thời Điểm Cắm (Connect-Time TOU Snapshot)
- Biểu giá điện TOU (VND/kWh) được tính toán và chốt cứng (`unit_price`) tại chính xác thời điểm xe cắm sạc thành công.
- Ngăn ngừa tình trạng khiếu nại cước khi phiên sạc kéo dài xuyên qua khung giờ thay đổi giá của ngành điện.

#### C. Chính Sách Quản Lý Nợ Ví Linh Hoạt (Overdraft & Debt Protection)
- **Cho phép số dư âm có kiểm soát**: Xe điện khi đã sạc thì điện năng đã được nạp vào pin vật lý, không thể "hoàn tác" dòng điện. Do đó, hệ thống cho phép số dư ví âm đến hạn mức cấu hình (`NEGATIVE_BALANCE_LIMIT = -300,000 VND`).
- **Khóa nợ tự động (Debt Lock)**: Nếu cước phí vượt quá hạn mức nợ, hệ thống kích hoạt cờ `is_debt_locked = True`. Tài khoản bị chặn ngay lập tức mọi phiên sạc mới (`HTTP 402 Payment Required`).
- **Giải phóng khóa nợ tự động**: Ngay khi khách hàng thực hiện nạp tiền (Topup) đưa số dư ví trở về $\ge 0$ VND, cờ `is_debt_locked` tự động hạ xuống, tài xế tiếp tục sử dụng dịch vụ bình thường.

---

## 4. Bộ Giả Lập Phiên Sạc Realtime (OCPP-like Telemetry Simulator)

Hệ thống tích hợp module giả lập sạc `ChargingSimulator` mô phỏng đầy đủ đặc tính vật lý của pin lithium-ion và trụ sạc nhanh DC:

### 4.1. Đường Cong Sạc Hai Giai Đoạn (CC/CV Charging Curve)
- **Giai đoạn dòng không đổi (Constant Current - CC)**: Khi dung lượng pin $\text{SoC} < 80\%$, xe nhận công suất tối đa theo khả năng của cổng sạc và biến áp. Nhiệt độ pin tăng tịnh tiến theo định luật Joule.
- **Giai đoạn áp không đổi (Constant Voltage - CV)**: Khi $\text{SoC} \ge 80\%$, hệ thống quản lý pin xe (BMS) tự động hạ dần dòng sạc nhằm bảo vệ cấu trúc hóa học tế bào pin. Công suất sạc giảm dần tuyến tính từ 100% xuống 20% khi đạt 100% SoC.

### 4.2. Cơ Chế Bảo Vệ Tự Động (Auto-Cutoff Safeguards)
Bộ simulator giám sát liên tục ở mỗi xung nhịp (tick 2 giây) và tự động ngắt rơ-le trong 3 tình huống khẩn cấp:
1. **Pin đầy (Battery Full)**: Tự động ngắt khi $\text{SoC} = 100\%$, tránh sạc nhồi gây chai pin.
2. **Quá nhiệt đầu sạc (Emergency Overheat)**: Tự động ngắt khẩn cấp khi nhiệt độ cảm biến vượt ngưỡng nguy hiểm ($\ge 75^\circ\text{C}$), phát cảnh báo mã lỗi phần cứng.
3. **Cạn hạn mức nợ (Debt Exhaustion)**: Tự động ngắt khi chi phí phiên sạc tích lũy làm số dư ví rơi sâu dưới ngưỡng nợ tối đa cho phép.

### 4.3. Cơ Chế Chống Mất Mát Dữ Liệu Khi Sự Cố Máy Chủ (Crash Reconciliation & Checkpointing)
- **Định kỳ Checkpointing**: Mỗi 60 giây, bộ simulator thực hiện ghi đồng bộ ảnh chụp (`snapshot`) gồm số kWh đã tích lũy và SoC hiện tại xuống CSDL.
- **Tự động đối soát khi khởi động lại (Reconciliation on Server Startup)**: Nếu máy chủ FastAPI bị khởi động lại đột ngột giữa lúc phiên sạc đang chạy trong RAM, hàm `reconcile_interrupted_sessions()` chạy lúc startup sẽ tự động quét các phiên `ACTIVE` mồ côi, chuyển trạng thái sang `INTERRUPTED`, quyết toán trừ cước ví theo chỉ số checkpoint gần nhất và mở khóa rơ-le cổng sạc về `AVAILABLE`. Không làm rò rỉ cổng sạc và không thất thoát doanh thu của trạm.

---

## 5. Tích Hợp Trí Tuệ Nhân Tạo & Cơ Chế Heuristic Fallback

Hệ thống tích hợp trí tuệ nhân tạo theo tôn chỉ: **"AI Cố Vấn - Không Can Thiệp Trực Tiếp Vào Phần Cứng" (AI Advisory Only)**. Mọi quyết định đóng/ngắt rơ-le hoặc trừ tiền tài khoản đều do tầng dịch vụ Deterministic xử lý.

```
                           ┌──────────────────────────────────────────────┐
                           │               AI MODULE DESIGN               │
                           └──────────────────────────────────────────────┘
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 ▼                                                                 ▼
   ┌───────────────────────────┐                                     ┌───────────────────────────┐
   │     1. SMART CHARGING     │                                     │ 2. PREDICTIVE MAINTENANCE │
   │ (Điều phối phụ tải trạm)  │                                     │  (Dự báo bảo trì kỹ thuật)│
   └───────────────────────────┘                                     └───────────────────────────┘
   - Thuật toán chia tải SoC                                         - Giám sát độ sụt áp (Delta V)
   - Weighted Fair Sharing                                           - Theo dõi tốc độ gia nhiệt (dT/dt)
   - Đảm bảo Tổng P <= 95% Grid                                      - Phát hiện sớm rơ-le đánh lửa/chập
                 │                                                                 │
                 └────────────────────────────────┬────────────────────────────────┘
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 ▼                                                                 ▼
   ┌───────────────────────────┐                                     ┌───────────────────────────┐
   │    3. DYNAMIC PRICING     │                                     │   4. GROUNDED AI ASK      │
   │  (Tối ưu biểu giá TOU)    │                                     │  (Trợ lý kỹ thuật CPO)    │
   └───────────────────────────┘                                     └───────────────────────────┘
   - Phân tích biểu đồ phụ tải                                       - Bơm trực tiếp dữ liệu trạm thật
   - Đề xuất giãn tải giờ cao điểm                                   - Trả lời chuyên môn bằng tiếng Việt
   - Dự báo nâng cao doanh thu                                       - Chống hiện tượng bịa đặt (Hallucination)
```

### 5.1. Thuật Toán Smart Charging (Weighted Fair Sharing theo SoC)
Khi tổng công suất yêu cầu của các xe đang sạc vượt quá công suất an toàn của máy biến áp ($P_{\text{limit}} = P_{\text{grid}} \times 0.95$), thuật toán Heuristic tính toán trọng số ưu tiên:
$$w_i = \begin{cases} 1.2 & \text{nếu } \text{SoC}_i < 50\% \text{ (ưu tiên sạc gấp)} \\ 1.0 & \text{nếu } 50\% \le \text{SoC}_i \le 80\% \text{ (sạc tiêu chuẩn)} \\ 0.6 & \text{nếu } \text{SoC}_i > 80\% \text{ (giảm tải giai đoạn CV)} \end{cases}$$
Công suất phân bổ cho từng cổng sạc:
$$P_{\text{alloc}}[i] = \min\left(P_{\text{req}}[i], P_{\text{limit}} \times \frac{w_i \cdot P_{\text{req}}[i]}{\sum_j w_j \cdot P_{\text{req}}[j]}\right)$$
Đảm bảo $\sum P_{\text{alloc}} \le P_{\text{limit}}$, ngăn ngừa 100% sự cố nhảy Aptomat tổng của trạm.

### 5.2. Dự Báo Bảo Trì Kỹ Thuật (Predictive Maintenance)
Hệ thống tính toán ma trận rủi ro phần cứng dựa trên:
- **Ngưỡng nhiệt độ tức thời**: Cảnh báo `MEDIUM` khi nhiệt độ vượt $55^\circ\text{C}$, `CRITICAL` khi vượt $70^\circ\text{C}$.
- **Tốc độ biến thiên nhiệt ($\Delta T / \Delta t$)**: Cảnh báo khi nhiệt độ tăng nhanh bất thường $> 5^\circ\text{C}/\text{phút}$.
- **Độ sụt áp qua tiếp điểm ($\Delta V$)**: Nếu hiệu điện thế sụt giảm $> 10\text{V}$ ở cùng mức dòng tải, thuật toán cảnh báo nguy cơ tiếp xúc đầu cắm bị mòn hoặc rơ-le bị oxy hóa.

---

## 6. Thiết Kế Giao Diện Người Dùng Chuyên Biệt (Industrial UI/UX)

Khác với các dashboard SaaS thông thường, giao diện EV CSMS được thiết kế theo phong cách điều khiển công nghiệp hiện đại:
- **Bảng màu công nghiệp (Industrial Dark Palette)**: Màu nền chính Obsidian `#0B0F17`, thẻ chức năng Panel Slate `#151D2A`, đường viền Border `#1E293B`, màu nhấn Xanh lưới điện `#10B981` (Ổn định/Sạc tốt) và Cam/Đỏ `#F59E0B`/`#EF4444` (Cảnh báo/Nguy hiểm).
- **Phông chữ hiển thị số đo (Tabular Numbers Typography)**: Toàn bộ thông số đo lường (kW, kWh, VND, %, °C, V, A) sử dụng font monospace `font-mono tabular-nums`, ngăn hiện tượng nhảy giật layout khi số liệu WebSocket cập nhật liên tục.
- **Điều hướng tiện ích**: Hỗ trợ chuyển đổi nhanh tài khoản demo (1-click role switcher) giữa Admin, CPO, Khách hàng thường, Khách hàng VIP và Khách hàng nợ tiền, phục vụ tối đa việc nghiệm thu và thuyết trình.

---

## 7. Kết Quả Kiểm Thử Toàn Diện (Automated Test Suite)

Toàn bộ hệ thống được bảo vệ bởi bộ kiểm thử tự động Pytest bao phủ 100% các luồng nghiệp vụ quan trọng. Không sử dụng test giả, assert nội dung dữ liệu thật:

```text
============================= TEST EXECUTION SUMMARY =============================
Platform: Windows 11 / Python 3.14 / Pytest 8.2.2 / FastAPI TestClient
Total Test Cases: 74
Passed:           74 (100%)
Failed:           0
Coverage Areas:
  [✓] test_auth.py (12 tests):        RBAC, Password Hashing, Atomic Wallet Creation
  [✓] test_stations.py (12 tests):    Haversine Distance, Station/Charger IDOR, Oversubscription
  [✓] test_sessions.py (5 tests):     Lifecycle, 409 Conflict, 402 Debt Block, Settle, Idempotency
  [✓] test_sessions_acid.py (9 tests):ACID Transaction, TOU Connect-time Tariff, Overdraft Limits
  [✓] test_wallet_acid.py (5 tests):  Pessimistic Lock, Topup, Deduct, Debt Policy, Clear Lock
  [✓] test_simulator.py (9 tests):    CC/CV Curve, Overheat, Debt Cutoff, Checkpointing, Crash Reconcile
  [✓] test_ai_fallback.py (21 tests): Heuristic Math, Gemini Mock, Offline Graceful Degradation, IDOR
  [✓] test_health.py (1 test):        System Health & DB Connectivity
==================================================================================
RESULT: 74 PASSED IN 67.56s (0:01:07) - ZERO REGRESSION
==================================================================================
```

---

## 8. Phân Tích Nợ Kỹ Thuật, Rủi Ro & Lộ Trình Mở Rộng

| Hạng Mục | Hiện Trạng MVP Đồ Án | Rủi Ro & Nợ Kỹ Thuật Đã Biết | Giải Pháp & Lộ Trình Nâng Cấp Sản Phẩm |
| :--- | :--- | :--- | :--- |
| **Giao thức Trụ Sạc** | Bộ giả lập WebSocket Telemetry mô phỏng chu kỳ đo đếm sạc | Chưa kết nối trực tiếp với phần cứng hỗ trợ chuẩn OCPP 1.6J/2.0.1 thật | Xây dựng Gateway OCPP-CSMS chuyên dụng (dùng `ocpp` Python library) chuyển đổi bản tin sang REST/WS |
| **Tính Cước TOU** | Chốt đơn giá TOU một lần tại thời điểm cắm sạc (Connect-time) | Phiên sạc kéo dài xuyên khung giờ không được chia nhỏ kWh theo từng đoạn giờ | Bổ sung module Pro-rata TOU: phân tách kWh tiêu thụ theo mốc chuyển giao khung giờ của đồng hồ điện |
| **Đo Đếm Điện Năng** | Simulator tính tích lũy điện năng dựa trên $P \times \Delta t$ | Chưa có chữ ký số xác thực từ công tơ đo lường chuẩn kiểm định đo lường | Tích hợp chứng thực phần cứng HSM và chữ ký số Metering Data theo tiêu chuẩn Eichrecht (Đức) |
| **Tương Tác Lưới Điện** | Điều phối phụ tải nội bộ trạm (Static Busbar Limit) | Chưa nhận tín hiệu điều độ từ lưới điện quốc gia (EVN Smart Grid) | Mở rộng chuẩn OpenADR 2.0b để tham gia thị trường dịch vụ phụ trợ phản ứng phụ tải (Demand Response) |

---

## 9. Kết Luận

Đồ án **Nền tảng Vận hành Trạm Sạc Xe Điện Tích hợp Trí tuệ Nhân tạo (EV CSMS)** đã hoàn thành vượt mức toàn bộ mục tiêu đề ra ban đầu:
1. Xây dựng một kiến trúc phần mềm chuẩn mực, phân tầng rõ ràng giữa API, Service, Model và Background Worker.
2. Giải quyết triệt để bài toán an toàn giao dịch tài chính ACID và khóa rơ-le độc quyền cổng sạc.
3. Hiện thực hóa thành công mô hình **Dual-Loop AI Architecture**, chứng minh khả năng ứng dụng AI một cách thiết thực, an toàn và luôn có phương án dự phòng (Heuristic Fallback) đáng tin cậy.
4. Mang đến trải nghiệm giao diện người dùng chuyên nghiệp, mang đậm tính công nghiệp và trực quan hóa thời gian thực xuất sắc.

Hệ thống đã sẵn sàng cho buổi báo cáo bảo vệ tốt nghiệp trước Hội đồng Đánh giá.
