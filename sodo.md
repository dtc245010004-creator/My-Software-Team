# SƠ ĐỒ KIẾN TRÚC VÀ LUỒNG VẬN HÀNH HỆ THỐNG EV CSMS
> **Tài liệu tổng hợp, trực quan hóa toàn diện bức tranh kiến trúc và giải pháp kỹ thuật giải quyết các rủi ro từ `yêu cầu.md`**

---

## 1. Bức tranh Kiến trúc Tổng thể Hệ thống (Overall System Architecture)

Hệ thống được thiết kế theo mô hình phân tầng chặt chẽ, tách bạch giữa **Luồng điều khiển (Control Plane)**, **Luồng dữ liệu thời gian thực (Data Plane)** và **Hàng đợi sự kiện nội bộ (Internal Event Bus)**.

```mermaid
flowchart TD
    subgraph Clients["TẦNG GIAO DIỆN (Frontend: React 19 + Vite + Tailwind CSS)"]
        UI_Admin["Admin Portal"]
        UI_CPO["CPO Dashboard & Stations"]
        UI_Driver["Driver Portal (Ví & Sạc)"]
        UI_Sim["Charging Simulator UI"]
    end

    subgraph API_Gateway["TẦNG CỔNG GIAO TIẾP (FastAPI Gateway)"]
        REST["REST Endpoints (Auth, Stations, Wallet, AI)"]
        WSHub["WebSocket Telemetry Hub (Ticket-based Auth)"]
    end

    subgraph Core_Services["TẦNG DỊCH VỤ NGHIỆP VỤ (Core Services)"]
        AuthSvc["Auth & RBAC (JWT + Ownership Check)"]
        StationSvc["Station & Charger Service"]
        SessionSvc["Session Lifecycle Service"]
        WalletSvc["Wallet Service (ACID Transaction)"]
        TariffSvc["TOU Tariff Engine"]
        SmartChargeSvc["Smart Charging / Load Balancer (Heuristic)"]
    end

    subgraph Event_Bus["TẦNG SỰ KIỆN NỘI BỘ (Internal Event Bus - asyncio)"]
        Bus["Event Bus (EmergencyStop | BatteryFull | OutOfBalance)"]
    end

    subgraph Simulation_Engine["BỘ MÔ PHỎNG PHẦN CỨNG (Hardware Simulator)"]
        Sim["Charging Simulator (CC-CV Curve, Temp, SoC %)"]
        SafetyCutoff["Rơ-le bảo vệ phần cứng (Hardware Safety Cut-off)"]
    end

    subgraph AI_Engine["PHÂN HỆ TRÍ TUỆ NHÂN TẠO (AI Engine)"]
        Gemini["Google Gemini API (Slow Loop: Phân tích Trend, Tối ưu giá)"]
        AIFallback["Heuristic Rule Generator (Fallback khi Offline/429)"]
    end

    subgraph Storage["TẦNG DỮ LIỆU (Hybrid Data Layer)"]
        MemBuffer[("In-Memory State Buffer (RAM / State Dict)")]
        DB[("Database: SQLite / PostgreSQL (Khóa dòng & ACID)")]
    end

    %% Luồng điều khiển (Control Plane)
    Clients -->|1. Lệnh HTTP / REST| REST
    REST --> AuthSvc
    REST --> StationSvc
    REST --> SessionSvc
    REST --> WalletSvc

    %% Điều khiển phiên sạc & Simulator
    SessionSvc -->|Khởi tạo / Dừng phiên| Sim
    SessionSvc -->|Khóa giữ chỗ / Trừ cước| WalletSvc
    WalletSvc -->|ACID Transaction| DB
    SessionSvc -->|Lưu Session / Checkpoint| DB

    %% Luồng dữ liệu Telemetry (Data Plane)
    Sim -->|2. Telemetry tick 2-5s| MemBuffer
    MemBuffer -->|Đẩy dữ liệu tức thời| WSHub
    WSHub <-->|Stream dữ liệu hiển thị| Clients
    
    %% Vòng lặp điều phối tải tức thời (Fast Loop)
    MemBuffer -->|Dữ liệu P, I, U| SmartChargeSvc
    SmartChargeSvc -->|Điều tiết công suất P_max| Sim

    %% Sự kiện khẩn cấp qua Event Bus
    Sim -->|Quá nhiệt / Quá áp| SafetyCutoff
    SafetyCutoff -->|Trigger EmergencyStop| Bus
    WalletSvc -->|Hết số dư khả dụng| Bus
    Bus -->|Dừng sạc khẩn cấp| SessionSvc
    Bus -->|Cảnh báo tức thì| WSHub

    %% Vòng lặp AI phân tích (Slow Loop)
    DB -.->|Dữ liệu chuỗi thời gian 10-30p| Gemini
    Gemini -->|Khuyến nghị chiến lược CPO| REST
    Gemini -.->|Lỗi mạng / Hết Quota| AIFallback
```

### Các thành phần then chốt giải quyết rủi ro kiến trúc:
* **`In-Memory State Buffer`**: Giảm tải áp lực I/O lên Database. Telemetry tick (2–5s) chỉ cập nhật RAM; DB chỉ ghi dữ liệu theo chu kỳ chốt số (checkpoint 30–60s) hoặc khi kết thúc phiên.
* **`Internal Event Bus (asyncio)`**: Khớp nối lỏng (Decoupling) giữa các module. Các sự kiện ngắt sạc khẩn cấp (`EmergencyStop`), hết tiền ví (`OutOfBalance`), hoặc pin đầy (`BatteryFull`) được xử lý bất đồng bộ, không gây nghẽn luồng chính.
* **`Hardware Safety Cut-off`**: Rơ-le ảo ngắt điện tức thì khi phát hiện nhiệt độ vượt ngưỡng an toàn ($T > 85^\circ\text{C}$), độc lập hoàn toàn với phản hồi từ AI hay CSDL.
* **Tách biệt Control Plane & Data Plane**: Lệnh điều khiển đi qua REST $\rightarrow$ `SessionSvc` $\rightarrow$ `Sim`; dữ liệu đo đếm đi từ `Sim` $\rightarrow$ `MemBuffer` $\rightarrow$ `WSHub` $\rightarrow$ Frontend.

---

## 2. Kiến trúc 2 Vòng lặp: Fast Heuristic Loop vs Slow AI Loop (Điểm 1 & 2)

Hệ thống phân tách rạch ròi giữa **vòng lặp thời gian thực (Fast Loop)** để duy trì nhịp telemetry/điều phối tải và **vòng lặp chiến lược (Slow Loop)** phục vụ phân tích ngôn ngữ tự nhiên từ Gemini API.

```mermaid
flowchart TD
    subgraph Fast_Loop["VÒNG LẶP NHANH (Fast Loop: 2 - 5 Giây)"]
        A["Bộ giả lập / Trụ sạc (Simulator)"] -->|"Telemetry tick (P, U, I, SoC, T)"| B["FastAPI WebSocket Server"]
        B -->|"Dữ liệu tức thời"| C["Heuristic Engine (Nội bộ)"]
        C -->|"Kiểm tra ngưỡng an toàn (T > 70°C, Quá tải)"| D{"Có vi phạm?"}
        D -->|"Có"| E["Ngắt sạc khẩn cấp / Giảm dòng sạc tức thì"]
        D -->|"Không"| F["Phân bổ công suất theo tỷ lệ (Proportional Sharing)"]
        F -->|"Lệnh điều khiển P_max"| A
        B -->|"Broadcast dữ liệu hiển thị"| G["Frontend UI (Recharts / Live Gauge)"]
    end

    subgraph Slow_Loop["VÒNG LẶP CHẬM (Slow Loop: 1 - 5 Phút hoặc Sự kiện)"]
        B -->|"Lưu Time-series buffer"| H[("In-memory Buffer / DB")]
        H -->|"Chuỗi dữ liệu 10-30 phút"| I["AI Background Service"]
        I -->|"Gọi API phân tích xu hướng"| J["Google Gemini API"]
        J -->|"Báo cáo chẩn đoán & Khuyến nghị tối ưu"| K["Bảng điều khiển CPO (AI Advisor)"]
        K -->|"CPO duyệt khuyến nghị"| L["Cập nhật cấu hình / Biểu giá / Lịch bảo trì"]
        L -.->|"Áp dụng chính sách mới"| C
    end

    subgraph Fallback_Mechanism["Cơ chế Dự phòng (Offline / Rate-limit)"]
        J -.->|"Lỗi mạng / 429 Rate Limit"| M["Heuristic Fallback Rule"]
        M -->|"Sinh cảnh báo theo mẫu quy tắc"| K
    end
```

---

## 3. Ma trận & Ranh giới AI thật vs Heuristic / Rule-based (Điểm 2)

| Nghiệp vụ | Tầng Heuristic / Rule-based (Tức thời, Cố định) | Tầng Gemini AI (Định kỳ, Phân tích sâu) | Rủi ro nếu gán nhãn sai |
|---|---|---|---|
| **Smart Charging (Điều phối tải)** | Chia tỷ lệ công suất dựa trên $\sum P_{i} \le P_{\text{grid\_max}}$. Cắt giảm ngay lập tức khi lưới điện sụt áp. | Dự báo nhu cầu phụ tải theo thời gian, tối ưu hóa biểu giá TOU, đề xuất giờ sạc chi phí thấp cho khách hàng. | Bị bắt bẻ nếu gọi thuật toán chia tỷ lệ toán học là "AI". |
| **Predictive Maintenance (Bảo trì dự đoán)** | Cảnh báo ngưỡng cứng: $T > 70^\circ\text{C}$ $\implies$ Warning; $T > 85^\circ\text{C}$ $\implies$ Emergency Stop. | Phân tích biến thiên $\Delta T / \Delta t$ kết hợp dòng điện $I(t)$ để phát hiện suy hao tiếp xúc cáp sạc trước khi nóng quá mức. | Ngưỡng cố định là Rule-based thuần túy; AI phải phân tích chuỗi thời gian (trend). |
| **Tariff & Revenue Optimization** | Áp dụng đúng giá theo khung giờ cao điểm/thấp điểm (TOU cố định). Tính đúng phụ phí phạt. | Phân tích thói quen sạc của tài xế, đề xuất điều chỉnh biểu giá động để kéo giãn phụ tải sang giờ thấp điểm. | Tránh nhầm lẫn giữa tính cước theo công thức với tối ưu hóa doanh thu bằng mô hình học. |

---

## 4. Luồng Kết nối & Xác thực WebSocket An toàn (Điểm 3)

Không truyền JWT trực tiếp trên URL Query String (`?token=...`) để tránh lộ trong log server/proxy. Áp dụng cơ chế **Ticket Handshake** (Vé ngắn hạn 30s, 1 lần dùng).

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend / Client
    participant AuthAPI as FastAPI REST Auth
    participant WS as FastAPI WebSocket Server
    participant RedisDB as DB / Cache

    Client->>AuthAPI: POST /api/v1/auth/ws-ticket (Kèm Bearer JWT ở Header)
    AuthAPI->>AuthAPI: Kiểm tra JWT & Quyền người dùng
    AuthAPI->>RedisDB: Tạo Ticket tạm thời (TTL = 30 giây, 1 lần dùng)
    AuthAPI-->>Client: Trả về { ws_ticket: "uuid-v4-token" }

    Client->>WS: Kết nối ws://host/ws/telemetry?ticket=uuid-v4-token
    WS->>RedisDB: Xác thực & Thu hồi ticket ngay lập tức
    alt Ticket hợp lệ
        WS-->>Client: Chấp nhận kết nối (101 Switching Protocols)
        WS->>Client: Send {"event": "CONNECTED", "role": "operator"}
        loop Vòng lặp Telemetry (2 - 5s)
            WS->>Client: Send Telemetry Data (SoC, kW, Voltage, Temp)
        end
    else Ticket không hợp lệ hoặc hết hạn
        WS-->>Client: Đóng kết nối (Close Code: 4001 Unauthorized)
    end
```

---

## 5. Phân quyền & Cô lập Dữ liệu Đa CPO (Multi-tenancy Isolation) (Điểm 4)

Đảm bảo CPO A không thể truy cập, sửa đổi hoặc theo dõi trạm sạc của CPO B thông qua việc kiểm tra quyền sở hữu (`ownership check`) ở tầng Service/Dependency.

```mermaid
flowchart TD
    Req["Request từ CPO: GET/PUT /stations/{station_id}"] --> AuthMiddleware["FastAPI Dependency: get_current_user"]
    CheckRole{"Role của user là gì?"}
    AuthMiddleware --> CheckRole

    CheckRole -->|"Admin"| AllowAll["Toàn quyền truy cập (Bỏ qua lọc CPO)"]
    CheckRole -->|"Operator (CPO)"| CheckOwner{"station.operator_id == current_user.id?"}
    CheckRole -->|"Customer"| Deny["403 Forbidden (Không có quyền quản trị)"]

    CheckOwner -->|"Đúng"| Process["Cho phép thực thi nghiệp vụ (Xem/Sửa trạm)"]
    CheckOwner -->|"Sai"| Error403["403 Forbidden / 404 Not Found (Bảo vệ bí mật CPO khác)"]

    Process --> Response["Trả kết quả cho Client"]
    AllowAll --> Process
```

---

## 6. Máy trạng thái Cổng sạc & Tính Phí chiếm chỗ (Idle Fee) (Điểm 7 & 8)

Mô phỏng trạng thái **lấy cảm hứng từ máy trạng thái OCPP (OCPP-like State Machine)**, kết hợp cơ chế kích hoạt thời gian ân hạn (`grace period`) và tính phí phạt chiếm chỗ súng sạc sau khi sạc đầy.

```mermaid
stateDiagram-v2
    [*] --> Available: Khởi tạo / Rút súng

    Available --> Preparing: Cắm súng vào xe (Cable Plugin)
    Preparing --> Available: Rút súng / Hủy phiên sạc

    Preparing --> Charging: Quẹt thẻ / Xác nhận ví đủ số dư tối thiểu
    
    state Charging {
        [*] --> InProgress: Bắt đầu nạp điện (kW > 0)
        InProgress --> InProgress: Telemetry tick (Cộng dồn kWh & tiền điện)
    }

    Charging --> SuspendedEV: Pin đầy (SoC = 100%) hoặc Xe dừng nhận điện
    Charging --> Finishing: Người dùng bấm 'Dừng sạc' trên App

    state SuspendedEV {
        [*] --> GracePeriod: Đếm ngược thời gian ân hạn (vd: 15 phút)
        GracePeriod --> IdleFeeActive: Hết 15 phút nhưng chưa rút súng
        IdleFeeActive --> IdleFeeActive: Tính phí phạt chiếm chỗ (VNĐ/phút)
    }

    SuspendedEV --> Finishing: Người dùng bấm dừng hoặc ngắt phiên
    Finishing --> Available: Rút súng sạc khỏi xe (Unplug Cable)
    Finishing --> [*]: Chốt hóa đơn & Quyết toán ví
```

---

## 7. Luồng Giao dịch Ví tiền & Nạp tiền Giả lập (Sandbox Top-up) (Điểm 6)

Làm rõ cơ chế **Nạp tiền mô phỏng (Demo Top-up)** và quy trình trừ tiền đảm bảo tính toàn vẹn **ACID (Không âm ví)**.

```mermaid
sequenceDiagram
    autonumber
    actor User as Tài xế / Khách hàng
    participant App as Giao diện Web / App
    participant WalletSvc as Wallet Service
    participant DB as CSDL (ACID Transaction)
    participant ChargeSvc as Charging Session Service

    Note over User, App: 1. NẠP TIỀN GIẢ LẬP (SANDBOX TOP-UP)
    User->>App: Bấm chọn mệnh giá "Nạp 200.000đ (Demo)"
    App->>WalletSvc: POST /api/v1/wallet/topup (mock_payment=True)
    WalletSvc->>DB: BEGIN TRANSACTION<br/>Cộng balance + 200.000<br/>Ghi WalletTransaction (type=TOPUP, status=SUCCESS)<br/>COMMIT
    WalletSvc-->>App: Trả về số dư mới cập nhật

    Note over User, App: 2. BẮT ĐẦU VÀ QUYẾT TOÁN PHIÊN SẠC (ACID)
    User->>App: Bấm "Bắt đầu sạc"
    App->>ChargeSvc: Start Session
    ChargeSvc->>WalletSvc: Kiểm tra số dư khả dụng
    alt Số dư < 50.000 VNĐ
        WalletSvc-->>ChargeSvc: Từ chối (Số dư không đủ mức tối thiểu)
        ChargeSvc-->>App: Báo lỗi "Vui lòng nạp thêm tiền"
    else Số dư >= 50.000 VNĐ
        WalletSvc->>DB: Đánh dấu giữ chỗ (Hold / Lock balance = 50.000đ)
        ChargeSvc-->>App: Kích hoạt sạc thành công
        
        loop Trong phiên sạc
            ChargeSvc->>WalletSvc: Kiểm tra số dư tiêu hao liên tục
            alt Số dư sắp cạn (còn < 5.000đ)
                ChargeSvc->>ChargeSvc: Tự động ngắt sạc khẩn cấp (Emergency Stop)
            end
        end

        User->>App: Kết thúc phiên sạc
        ChargeSvc->>WalletSvc: Quyết toán hóa đơn cuối cùng (Final Settlement)
        WalletSvc->>DB: BEGIN TRANSACTION<br/>Trừ tiền thật theo kWh + Phí chiếm chỗ<br/>Giải phóng số dư giữ chỗ<br/>Ghi SessionTransaction (type=CHARGING_FEE)<br/>COMMIT
        WalletSvc-->>App: Trả về hóa đơn chi tiết
    end
```

---

## 8. Điều phối Quá tải Lưới điện Đa Trạm (Multi-Station Grid Overload) (Đề nghị bổ sung 3)

Xử lý kịch bản nhiều trạm sạc thuộc cùng một CPO chia sẻ chung một trạm biến áp / công suất lưới điện khu vực.

```mermaid
flowchart TD
    Substation["Trạm biến áp Khu vực (Transformer Capacity: 250 kW)"] --> StationA["Trạm Sạc A (Cấu hình tối đa: 150 kW)"]
    Substation --> StationB["Trạm Sạc B (Cấu hình tối đa: 150 kW)"]

    subgraph Station_A_EVSE["Trạm Sạc A (2 Trụ sạc)"]
        StationA --> EVSE_A1["Trụ 1 (Đang sạc 60 kW)"]
        StationA --> EVSE_A2["Trụ 2 (Đang sạc 70 kW)"]
    end

    subgraph Station_B_EVSE["Trạm Sạc B (2 Trụ sạc)"]
        StationB --> EVSE_B1["Trụ 3 (Đang sạc 60 kW)"]
        StationB --> EVSE_B2["Trụ 4 (Xe mới cắm sạc: Yêu cầu 80 kW)"]
    end

    subgraph Load_Balancer["Bộ Điều phối Phụ tải Cụm (Cluster Load Balancer)"]
        Calc["Tổng công suất yêu cầu: 60 + 70 + 60 + 80 = 270 kW > 250 kW (QUÁ TẢI)"]
        Action["Kích hoạt thuật toán Fair-Share Dynamic Throttling"]
    end

    EVSE_B2 -.-> Calc
    Calc --> Action
    Action -->|"Giảm công suất Trụ 1: 50 kW"| EVSE_A1
    Action -->|"Giảm công suất Trụ 2: 60 kW"| EVSE_A2
    Action -->|"Giảm công suất Trụ 3: 50 kW"| EVSE_B1
    Action -->|"Cấp cho Trụ 4: 90 kW (250 - 160 = 90 kW)"| EVSE_B2
```

---

## 9. Tóm tắt Kỹ thuật Dành cho Buổi Bảo vệ Đồ án

| Vấn đề phản biện | Câu trả lời chuẩn mực kỹ thuật |
|---|---|
| **"Tại sao không dùng AI điều khiển từng giây?"** | Mô hình LLM có độ trễ 1-3s và giới hạn rate-limit nên không phù hợp với vòng lặp realtime. Hệ thống dùng **Heuristic toán học nội bộ chạy mỗi tick (2-5s)** để bảo vệ an toàn tức thời, và dùng **Gemini AI định kỳ (mỗi vài phút)** để phân tích xu hướng và cố vấn chiến lược. |
| **"Cảnh báo nhiệt độ có phải AI không?"** | Không. Ngưỡng cứng $T > 70^\circ\text{C}$ là **Rule-based Fallback** đảm bảo an toàn vật lý. AI đóng vai trò phân tích **chuỗi dữ liệu đa biến** (tốc độ tăng nhiệt kết hợp công suất sạc) để dự báo hỏng hóc trước khi chạm ngưỡng báo động. |
| **"Hệ thống có chuẩn OCPP 1.6J không?"** | Hệ thống xây dựng **mô hình máy trạng thái lấy cảm hứng từ chuẩn OCPP (OCPP-like)** để quản lý vòng đời cổng sạc, không đóng vai trò là một máy chủ OCPP 1.6J hoàn chỉnh do giới hạn phạm vi mô phỏng web. |
| **"Tiền trong ví nạp từ đâu?"** | Để phục vụ thử nghiệm và đánh giá đồ án, hệ thống cung cấp module **Sandbox/Mock Top-up**. Toàn bộ giao dịch trừ cước phiên sạc được xử lý qua **DB ACID Transaction**, cam kết số dư không âm. |

---

## 10. Đặc tả Công nghệ & Quy chuẩn Kiểm soát Chất lượng (Modernized Tech Stack & QA)

| Hạng mục | Công nghệ chấp nhận | Vai trò & Giải pháp kiểm soát chất lượng |
|---|---|---|
| **Core Frontend** | **React 19 + Vite** | Khung giao diện hiệu năng cao, tối ưu HMR, nạp module ESM tức thì. Kiểm soát tương thích với các thư viện `recharts`, `lucide-react`, `axios`. |
| **CSS & Styling** | **Tailwind CSS + PostCSS** | Thiết kế giao diện Dashboard, Simulator, Driver Portal trực quan, responsive theo chuẩn Design System. |
| **Linting Song song** | **Oxlint + ESLint** | • **Oxlint**: Lint tốc độ cao (Rust-based), phát hiện nhanh lỗi cú pháp.<br>• **ESLint (`eslint-plugin-oxlint`)**: Bổ trợ kiểm tra toàn diện rules Tailwind CSS, React Hooks và tiêu chuẩn Accessibility (a11y). |
| **Giao tiếp & Proxy** | **Vite Proxy (`/api`, `/ws`)** | Chuyển tiếp request `/api` và kết nối `/ws` về FastAPI (port 8000), kết hợp cơ chế Ticket-based Handshake ngăn chặn lộ JWT trên URL. |
| **Điều phối Staging** | **Docker Compose (Postgres 16 + Backend + Frontend)** | Đóng gói môi trường đồng nhất 3 tầng, bảo mật hoàn toàn qua file `.env` (không hardcode secret), CSDL chuẩn `ev_csms_db`. |
| **CI/CD Pipeline** | **GitHub Actions** | Tự động hóa kiểm tra: Linting Frontend (`oxlint` + `eslint`), build Vite, test Backend (`pytest` ACID ví) và kiểm tra hợp lệ `docker-compose.yml`. |

