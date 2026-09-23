# MASTER ROADMAP
## Nền tảng vận hành trạm sạc xe điện tích hợp AI (EV CSMS)

> Vai trò: Bức tranh toàn cảnh — la bàn định hướng. Xem `GEMINI.md §9` quy ước nguồn sự thật.
> **Cập nhật lần cuối:** 2026-09-24.

---

## Phân cấp nguồn sự thật

```
docs/plans/TIEN-DO.md          ← Trạng thái thực tế (tick ✅ ở đây là chính thức)
MASTER-ROADMAP.md               ← Bức tranh toàn cảnh + điều hướng (file này)
Buoc-NN.md                      ← Spec thực thi chi tiết cho từng bước
```

Khi hai file mâu thuẫn: TIEN-DO.md thắng về trạng thái; Buoc-NN.md thắng về cách làm.

---

## Trạng thái 8 phân hệ (Concurrent Workstreams)

> Quy ước: ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét
> Phản ánh đúng tiến độ thực tế của 6 thành viên theo `phân công.md`.

| Phân hệ | Tên | Mốc | Phụ trách | Trạng thái | Tiến độ | Thực tế & Xung đột với `sodo.md` |
|:---:|---|:---:|:---:|:---:|:---:|---|
| **Phần 0** | Đặc tả & Kiến trúc | KT1 | Lead Architect | 🔄 | 90% | Đã xong tài liệu nền tảng. Còn thiếu `docs/SDLC/KT1/01_SRS_and_UseCases.md`. |
| **Phần I** | Hạ tầng Docker & CI/CD | Toàn dự án | Study332 + Hiếu + KimiCoNY | ⚠️ | 60% | Đã có PostgreSQL container, Dockerfile Backend, CI GitHub Actions (`backend-ci` + `frontend-ci`). Xung đột tên DB `ev_csms_db` cần đồng bộ. |
| **Phần II** | Backend Core, CSDL & Kênh Realtime | KT2 | KimiCoNY (BE1) | 🔄 | 60% (KT2) / 85% (T-01) | Khung FastAPI + Alembic + Ruff + pytest OK. Cần CORSMiddleware, sửa `env.py` crash khi thiếu `.env`, Router `/api/v1`, `core/websocket.py`. |
| **Phần III** | Frontend & Layout CPO | KT3 | Hiếu + Study332 | 🔄 | 65% (KT3) / 100% (Jira Login/WS) | **2026-09-24: Form Đăng nhập + Auth Flow + WebSocket Heartbeat + Reconnect ✅** (theo Jira). Vite Proxy `/api` + `/ws` đã cấu hình. Còn thiếu: Recharts, các trang nghiệp vụ (Stations/Wallet/Sessions/AI). |
| **Phần IV** | Quản trị Trạm, Trụ, Cổng & Biểu giá TOU | KT2 | BE2 + FE2 | ⬜ | 0% | Chờ Bước 02 hoàn thiện ERD. |
| **Phần V** | Ví ACID, Phiên sạc & Simulator | KT2/KT3 | BE3 + FE3 | 🔄 | 10% | Có `ChargePoint`/`Connector` models (T-10). Chờ `Wallet`/`Session`/`Tariff` models và Simulator Backend. |
| **Phần VI** | AI: Smart Charging & Predictive Maintenance | KT3 | BE3 + FE2 | ⬜ | 0% | Kiến trúc 2 vòng lặp theo `sodo.md`. |
| **Phần VII** | Test toàn diện, Seed Data & Đóng gói | Cuối kỳ | Cả 6 | ⬜ | 0% | Có `test_placeholder.py` mồi pytest. |

---

## Chi tiết Phần III — Frontend

| # | Nhiệm vụ | Ưu tiên | Buoc | Deliverable | Trạng thái | Ghi chú |
|---|---|:---:|---|---|:---:|---|
| III.1 | Khởi tạo Vite + React 19 | 🔴 P0 | 10 | `package.json` | ✅ | React 19.2.8 + Vite 8 + Oxlint |
| III.2 | Cài deps tiện ích (axios, react-router-dom, sonner, lucide-react) | 🔴 P0 | — | `package.json` | ✅ | 2026-09-24 |
| III.3 | Vite Proxy `/api` & `/ws` | 🔴 P0 | 10 | `vite.config.js` | ✅ | 2026-09-24 → `localhost:8000` |
| III.4 | Form Đăng nhập (Login) | 🔴 P0 | Jira | `LoginPage.jsx` + `.css` | ✅ | 2026-09-24 — Email + Password (Eye/EyeOff) + validate + loading + Toast |
| III.5 | Auth Flow (Login/Logout/Me) | 🔴 P0 | Jira | `authService.js` + `AuthContext.jsx` + `ProtectedRoute.jsx` | ✅ | 2026-09-24 — JWT localStorage + Bearer interceptor + redirect |
| III.6 | WebSocket Client (Heartbeat + Reconnect + Status) | 🔴 P0 | Jira | `websocket.js` | ✅ | 2026-09-24 — Ping 30s + backoff 1s→15s + 6 trạng thái |
| III.7 | Simulator UI (4 cards telemetry) | 🔴 P0 | Jira | `SimulatorPage.jsx` + `.css` | ✅ | 2026-09-24 — SoC/kW/V/A/Temp + cảnh báo T > 70/85°C |
| III.8 | Dashboard page (chào user + đèn báo WS + 3 card link) | 🔴 P0 | Jira | `DashboardPage.jsx` + `.css` | ✅ | 2026-09-24 |
| III.9 | CPO Dashboard với Recharts (phụ tải, doanh thu) | 🔴 P0 | 10 | `Dashboard.jsx` (đổi tên) | ⬜ | Cần Recharts |
| III.10 | Stations / Wallet / Sessions / AIAdvisor pages | 🔴 P0 | 10 | `pages/*.jsx` | ⬜ |  |

---

## Lịch sử cập nhật

| Ngày | Người | Thay đổi |
|:---:|:---:|---|
| 2026-09-22 | KimiCoNY | Backend FastAPI + SQLAlchemy + Alembic + Dockerfile |
| 2026-09-22 | Study332 | CI/CD GitHub Actions cho Frontend |
| 2026-09-22 | Hiếu | Khung Frontend React 19 + Vite + Oxlint + Docker Postgres |
| 2026-09-22 | dtc245090028 | Khởi tạo Master Roadmap chuyển sang EV CSMS |
| 2026-09-23 | KimiCoNY | CI Backend (`backend-ci` job: ruff + pytest); seed roles |
| 2026-09-23 | idbibbool-arch | T-04 — Bảng users + roles + 5-role seed |
| 2026-09-23 | hungblubu | T-05 — Login backend với khóa tạm 15 phút |
| 2026-09-23 | KimiCoNY | T-10 — Bảng ChargePoint + Connector với UNIQUE constraints |
| **2026-09-24** | **dtc245090028** | **FE-Jira-Login + FE-Jira-Simulator ✅** — Form Đăng nhập + Auth Flow + WebSocket Heartbeat/Reconnect/Status; 4 page chunks build PASS; cập nhật codebase-map & TIEN-DO |
