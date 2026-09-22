# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# 5. Ngữ cảnh dự án

**Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV Charging Station Management System - EV CSMS).**
Hệ thống web toàn diện phục vụ quản lý mạng lưới trạm sạc xe điện, bao gồm: quản lý trạm sạc, trụ sạc (EVSE), cổng sạc (Connector), cấu hình biểu giá điện linh hoạt (TOU Tariff), ví điện tử khách hàng (Wallet), phiên sạc thời gian thực (Charging Sessions) và giám sát telemetry (SoC %, công suất kW, kWh, chi phí). Đồng thời, tích hợp AI hỗ trợ điều phối công suất thông minh (Smart Charging/Load Balancing), dự báo bảo trì kỹ thuật (Predictive Maintenance) và tư vấn tối ưu biểu giá doanh thu.

Đặc tả gốc: [`nentang.md`](nentang.md). Đặc tả hợp nhất: [`Prompt.md`](Prompt.md). Sơ đồ kiến trúc & luồng vận hành: [`sodo.md`](sodo.md).

> ⚠️ **Lưu ý quan trọng**: Dự án là một nền tảng web hoàn chỉnh, trực quan, có module giả lập sạc (Simulator) để người dùng/hội đồng có thể tương tác trực tiếp. Các kịch bản trong `docs/SDLC/` được chia thành các mốc nhỏ (KT1, KT2, KT3, Final) để phục vụ chấm điểm tiến độ bài tập cá nhân, không áp đặt các quy chuẩn của đề tài quản lý kho cũ vào hệ thống này.

## Stack công nghệ

| Hạng mục | Lựa chọn | Vai trò |
|---|---|---|
| Backend | FastAPI (Python 3.10+) + SQLAlchemy 2.0 | REST API hiệu năng cao + WebSocket telemetry |
| CSDL | SQLite (phát triển/test) / PostgreSQL (sẵn sàng) | Lưu trữ ACID, ràng buộc khóa ngoại & check constraint |
| Realtime | FastAPI WebSocket | Truyền nhận dữ liệu đo đếm sạc thời gian thực (Telemetry) |
| Frontend | React 18 + Vite + Tailwind CSS | Giao diện quản trị CPO, giao diện tài xế & bộ mô phỏng sạc |
| UI & Charts | Lucide Icons + Recharts | Hiển thị biểu đồ sạc realtime và thống kê doanh thu |
| AI Engine | Google Gemini API + Heuristic Fallback | Phân tích điều phối tải & bảo trì; tự động fallback khi offline |
| Kiểm thử | pytest tại `backend/tests/` | Đảm bảo logic tính cước, phiên sạc và ví tiền chính xác |

## Cấu trúc thư mục thực tế

> Xem `docs/codebase-map.md` để biết chính xác file nào đang tồn tại và vai trò của nó.

```
<project-root>/
├── backend/                      <- (Sẽ scaffold ở Bước 03 & 04)
│   ├── app/
│   │   ├── api/v1/endpoints/     <- stations, chargers, sessions, wallet, tariffs, ai
│   │   ├── core/                 <- config.py, database.py, security.py, websocket.py
│   │   ├── models/               <- user, station, charging_point, connector, session, wallet, tariff
│   │   ├── schemas/              <- pydantic schemas cho request/response
│   │   ├── services/             <- station_service, session_service, wallet_service, ai_service
│   │   ├── simulator/            <- charging_simulator.py (giả lập tín hiệu OCPP-like & telemetry)
│   │   └── main.py               <- FastAPI app, WebSocket routes, CORS
│   ├── tests/                    <- test_sessions, test_wallet_acid, test_tariffs, test_ai_fallback
│   ├── requirements.txt
│   └── .env.example
├── frontend/                     <- (Sẽ scaffold ở Bước 10)
│   ├── src/
│   │   ├── components/           <- Navbar, Sidebar, StatCard, ChargingChart, LiveGauge
│   │   ├── context/              <- AuthContext, NotificationContext
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx     <- Tổng quan mạng lưới trạm, doanh thu & trạng thái trụ
│   │   │   ├── Stations.jsx      <- Quản lý trạm sạc, trụ sạc, cổng sạc
│   │   │   ├── Sessions.jsx      <- Lịch sử và chi tiết các phiên sạc
│   │   │   ├── Simulator.jsx     <- Giao diện mô phỏng cắm sạc & theo dõi realtime
│   │   │   ├── Wallet.jsx        <- Quản lý ví tiền, nạp tiền và lịch sử trừ cước
│   │   │   └── AIAdvisor.jsx     <- Phân tích điều phối tải & bảo trì dự đoán
│   │   ├── services/             <- api.js, websocket.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── docs/
│   ├── codebase-map.md           <- Bản đồ mã nguồn
│   ├── MASTER-ROADMAP.md         <- Lộ trình 8 giai đoạn toàn diện
│   ├── implementation_plan.md    <- Phân tích yêu cầu & kế hoạch kiến trúc
│   ├── plans/
│   │   ├── TIEN-DO.md            <- Trạng thái tiến độ thực tế
│   │   └── Buoc-NN-*.md          <- Kế hoạch chi tiết từng bước (Buoc-01 -> Buoc-11)
│   └── SDLC/                     <- Hồ sơ mốc đánh giá bài tập cá nhân (KT1, KT2, KT3, Final)
├── nentang.md                    <- Đặc tả nghiệp vụ nền tảng trạm sạc xe điện
├── Prompt.md                     <- Đặc tả hợp nhất hệ thống
├── sodo.md                       <- Sơ đồ kiến trúc tổng thể & 2 vòng lặp (Dual-loop)
├── yêu cầu.md                    <- Bản phản biện kỹ thuật & rủi ro cần xem lại
├── HUONGDAN.md                   <- Hướng dẫn vận hành phiên làm việc
└── GEMINI.md                     <- Quy tắc hướng dẫn AI
```

## Quy ước ngôn ngữ

- **Tài liệu, comment, thông báo lỗi hiển thị cho người dùng: tiếng Việt.**
- **Định danh code, tên bảng, tên cột, tên hàm, tên biến, tên file: tiếng Anh không dấu.**
  Ví dụ: `station`, `charging_point`, `connector`, `charging_session`, `wallet`, `tariff`.
- Thông điệp commit: tiếng Việt không dấu, dạng `<loại>: <mô tả>`.

## Vai trò người dùng (RBAC)

- `admin`: Quản trị viên toàn hệ thống, quản lý tài khoản CPO và cấu hình nền tảng.
- `operator`: Đơn vị vận hành trạm sạc (CPO), quản lý trạm, trụ, cấu hình biểu giá và theo dõi bảo trì.
- `customer`: Khách hàng lái xe điện, nạp ví, cắm sạc và theo dõi tiến trình sạc cá nhân.

---

# 6. Quy trình mỗi phiên làm việc

## Mở phiên — làm đủ 3 việc này trước khi làm bất cứ gì khác

1. **Làm việc tại thư mục gốc dự án (mặc định: thư mục làm việc hiện tại hoặc biến môi trường `PROJECT_ROOT`; trên máy dev hiện tại là `E:\Nền tảng vận hành trạm sạc xe điện`).**
2. Đọc [`docs/codebase-map.md`](docs/codebase-map.md) để nắm rõ hiện trạng file.
3. Đọc [`docs/plans/TIEN-DO.md`](docs/plans/TIEN-DO.md) để biết đang ở bước nào và công việc tiếp theo.

## Đóng phiên — bắt buộc nếu phiên có thay đổi code

1. Chạy test tại `backend/tests/`, ghi lại kết quả thật.
2. Cập nhật `docs/codebase-map.md` nếu có thêm/xóa/đổi vai trò file.
3. Cập nhật `docs/plans/TIEN-DO.md` tick bước đã hoàn thành.

Không được để việc cập nhật tài liệu trôi sang phiên sau.

---

# 7. Luật kiểm thử & Bảo toàn dữ liệu

Bộ test nằm tại `backend/tests/`. Chạy bằng:
```bash
cd backend
pytest
```

## Ba luật chống test giả

1. **Không mock chính lớp đang test.** Mock chỉ dành cho ranh giới ngoài: Gemini API, thời gian hệ thống.
2. **Mỗi bug fix phải có test tái hiện được bug** — chạy đỏ trước khi sửa, xanh sau khi sửa.
3. **Test AI phải assert nội dung thật**, không chỉ assert "không ném exception".

## Ba luật bất khả xâm phạm về nghiệp vụ trạm sạc

- **Bảo toàn số dư ví (No Negative Balance)**: Mọi thao tác trừ tiền phiên sạc phải dùng Database Transaction, đảm bảo số dư ví không bao giờ âm bất hợp lệ.
- **Trạng thái trụ sạc độc quyền**: Không cho phép bắt đầu 2 phiên sạc đồng thời trên cùng một cổng sạc (`connector`).
- **An toàn ngắt sạc khẩn cấp**: Khi số dư ví hết hoặc xảy ra sự cố quá nhiệt/sụt áp, hệ thống phải dừng phiên sạc ngay lập tức và chốt số điện năng đã tiêu thụ.

---

# 8. Ranh giới kiến trúc & An toàn AI

- `backend/app/api/v1/` chỉ làm HTTP/WebSocket: parse request, kiểm tra quyền, trả response. **Không chứa logic nghiệp vụ.**
- `backend/app/services/` chứa toàn bộ logic nghiệp vụ (tính cước, trừ ví, cập nhật phiên sạc), test được độc lập.
- `backend/app/simulator/` chứa logic phát xung nhịp giả lập telemetry sạc (SoC %, công suất, kWh).

## Quy tắc an toàn AI

- **AI chỉ đóng vai trò cố vấn/phân tích**: AI đưa ra khuyến nghị phân bổ công suất hoặc gợi ý biểu giá, không trực tiếp thay đổi số dư ví hay đóng/ngắt rơ-le vật lý ngoài ý muốn.
- **Bảo mật thông tin**: Tuyệt đối không đưa thông tin nhạy cảm của người dùng (mật khẩu, khóa riêng, thông tin thẻ) vào prompt AI.
- **Cơ chế Fallback Heuristic bắt buộc**: Nếu Gemini API lỗi, hết hạn ngạch hoặc mất mạng, hệ thống tự động kích hoạt thuật toán Heuristic chia tải theo tỷ lệ công suất và phân tích ngưỡng cảnh báo, bảo đảm Web app vẫn hoạt động 100%.

---

# 9. Nguồn sự thật & Quy ước cập nhật tài liệu

## Phân cấp nguồn sự thật
```
TIEN-DO.md          → THẮNG về trạng thái (bước nào xong, bước nào chưa)
Buoc-NN.md          → THẮNG về cách làm (spec kỹ thuật, checklist, file cần tạo)
MASTER-ROADMAP.md   → Bức tranh toàn cảnh; chỉ cập nhật khi TIEN-DO.md đã cập nhật xong
```

## Cấu trúc tài liệu SDLC (Bài tập cá nhân)
- `docs/plans/`: Bản đồ các bước thực hiện chi tiết.
- `docs/MASTER-ROADMAP.md`: La bàn định hướng 8 giai đoạn.
- `docs/SDLC/`: Các mốc kiểm tra bài tập cá nhân:
  - `KT1/`: Đánh giá đặc tả yêu cầu, thiết kế kiến trúc, ERD CSDL và API contract.
  - `KT2/`: Đánh giá hiện thực hóa Core Backend, mô phỏng sạc (Simulator) và giao dịch ví tiền ACID.
  - `KT3/`: Đánh giá tích hợp AI (Smart Charging, Predictive Maintenance, Fallback) và giao diện Web Frontend.
  - `final/`: Đánh giá kiểm thử toàn diện, tối ưu hiệu năng, tài liệu bàn giao và kịch bản demo bảo vệ.
