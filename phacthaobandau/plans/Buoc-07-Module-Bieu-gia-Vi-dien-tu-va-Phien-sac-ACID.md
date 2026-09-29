# BƯỚC 07: MODULE BIỂU GIÁ, VÍ ĐIỆN TỬ & PHIÊN SẠC (ACID TRANSACTIONS)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-07-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, services, endpoints).
> - Sản phẩm bàn giao: `docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md`.

---

## 1. Mục tiêu bước 7 (Trọng tâm kỹ thuật đồ án)

- Xây dựng hệ thống tính cước theo biểu giá linh hoạt theo khung giờ (Time-of-Use - TOU Tariff).
- Xây dựng ví điện tử (`Wallet`) với **giao dịch Database Transaction ACID**:
  + Khóa dòng bi quan (`with_for_update`) khi trừ tiền phiên sạc.
  + Chặn 100% nguy cơ số dư âm bất hợp lệ.
  + Tự động ghi nhận lịch sử giao dịch (`WalletTransaction`) để đối soát minh bạch.
- Quản lý vòng đời phiên sạc (`ChargingSession`): Khóa cổng sạc độc quyền, kiểm tra số dư ban đầu, tự động ngắt sạc khi hết tiền và xuất hóa đơn điện tử khi hoàn tất.

---

## 2. Nội dung công việc chi tiết

### 2.1. Biểu giá linh hoạt (Tariff)

- Cấu hình giá điện theo khung giờ:
  + Giờ thấp điểm (Off-Peak): ví dụ 2,500 VND/kWh.
  + Giờ bình thường (Normal): ví dụ 3,200 VND/kWh.
  + Giờ cao điểm (Peak): ví dụ 4,500 VND/kWh.
  + Phí chiếm chỗ (Idle Fee): ví dụ 1,000 VND/phút sau khi pin đầy 15 phút.

### 2.2. Giao dịch Ví tiền ACID (Wallet Service)

- Phương thức `topup_wallet(user_id, amount, note)`: Cộng tiền, ghi nhận transaction `TOPUP`.
- Phương thức `deduct_charging_fee(session_id, user_id, amount)`:
  + Bắt đầu Transaction: `db.begin()`.
  + Khóa dòng ví: `wallet = db.query(Wallet).filter_by(user_id=user_id).with_for_update().first()`.
  + Kiểm tra `wallet.balance >= amount`. Nếu không đủ: `raise InsufficientBalanceException` $\rightarrow$ Rollback.
  + Giảm `wallet.balance -= amount`.
  + Tạo bản ghi `WalletTransaction(wallet_id, amount, 'CHARGE_FEE', balance_after)`.
  + Cập nhật `ChargingSession.status = 'COMPLETED'`.
  + Commit transaction.

### 2.3. Vòng đời Phiên sạc (Session Service)

- `start_session(user_id, connector_id)`:
  + Kiểm tra cổng sạc có đang `AVAILABLE` không.
  + Kiểm tra số dư ví $\ge 50,000$ VND.
  + Cập nhật connector $\rightarrow$ `CHARGING`.
  + Tạo `ChargingSession(status='CHARGING', meter_start=0)`.
- `stop_session(session_id, user_id, stop_reason)`:
  + Chốt `meter_stop` và tính `total_kwh`.
  + Tính tiền theo biểu giá TOU.
  + Thực hiện giao dịch trừ ví qua `WalletService`.
  + Mở khóa connector $\rightarrow$ `AVAILABLE`.

---

## 3. Cấu trúc file cần sinh

```text
backend/
├── app/
│   ├── models/
│   │   ├── tariff.py                  # Model Tariff
│   │   ├── wallet.py                  # Model Wallet & WalletTransaction
│   │   └── session.py                 # Model ChargingSession
│   ├── schemas/
│   │   ├── tariff.py
│   │   ├── wallet.py
│   │   └── session.py
│   ├── services/
│   │   ├── wallet_service.py          # Logic trừ tiền ACID, nạp tiền
│   │   └── session_service.py         # Quản lý phiên sạc & tính cước TOU
│   └── api/v1/endpoints/
│       ├── tariffs.py                 # Endpoints quản lý biểu giá
│       ├── wallet.py                  # Endpoints ví tiền
│       └── sessions.py                # Endpoints bắt đầu/dừng phiên sạc
```

---

## 4. Checklist thực hiện & Definition of Done

- [x] Cài đặt cấu hình tài chính trong `app/core/config.py` (`MIN_START_BALANCE=50000`, `NEGATIVE_BALANCE_LIMIT=-300000`, `MAX_SAFE_DEBT_LIMIT=-1000000`).
- [x] Cài đặt Models & Schemas cho `Tariff`, `Wallet`, `WalletTransaction`, `ChargingSession` với kiểu dữ liệu `Decimal` chuẩn xác.
- [x] Cài đặt `wallet_service.py` với transaction ACID, khóa bi quan `with_for_update` và chính sách nợ cho phép âm đến hạn mức, kích hoạt `is_debt_locked`.
- [x] Cài đặt `session_service.py` với kiểm tra độc quyền cổng sạc (Atomic Conditional Update), tính cước TOU 3 khung giờ chốt 1 lần lúc cắm sạc, chống gọi trùng (Idempotency) và IDOR Guard.
- [x] Cài đặt Endpoints API cho `/tariffs`, `/wallet`, `/sessions` và đăng ký vào router v1.
- [x] Khởi tạo Alembic baseline migration `03906fa596ea_initial_schema_step07.py`.
- [x] Bộ kiểm thử `backend/tests/test_sessions_acid.py` với 9 test cases đặc thù (bao gồm Concurrency THẬT bằng `ThreadPoolExecutor` kiểm chứng xung đột đồng thời 201 vs 409) đạt 100% (9/9 passed).
- [x] Toàn bộ test suite Backend 34/34 tests pass 100%.
- [x] Soạn tài liệu bàn giao `docs/SDLC/KT2/02_Transaction_Design_and_Wallet_ACID.md` (đặc tả kiến trúc, sequence diagram, policy và 2 nợ kỹ thuật: client-reported kWh, chưa có giám sát real-time).
- [x] Cập nhật trạng thái Bước 07 trong `docs/plans/TIEN-DO.md`, `codebase-map.md`, `MASTER-ROADMAP.md`.

---

## 5. Ghi nhận thực tế triển khai & Quyết định kỹ thuật

1. **Khóa cổng sạc độc quyền chống Race Condition:**
   + Sử dụng câu lệnh SQL nguyên tử: `UPDATE connectors SET status = 'CHARGING' WHERE id = :cid AND status = 'AVAILABLE' AND is_active = 1;`.
   + Nếu `rowcount == 0` $\rightarrow$ Ném ngay `HTTP 409 Conflict`.
   + Đã được kiểm thử đa luồng thực tế bằng `concurrent.futures.ThreadPoolExecutor(max_workers=2)`, bảo đảm khi 2 request gửi đồng thời, đúng 1 request nhận HTTP 201 và đúng 1 request nhận HTTP 409.
2. **Chính sách số dư và kiểm soát nợ (Balance & Debt Policy):**
   + Tài khoản có `balance < 0`: Chặn bắt đầu phiên mới bằng `HTTP 402 Payment Required` (kèm message: "Tài khoản đang có số dư âm. Vui lòng nạp tiền để tiếp tục sạc").
   + Tài khoản có `0 <= balance < 50,000 VND`: Chặn bắt đầu phiên mới bằng `HTTP 400 Bad Request`.
   + Khi kết thúc phiên: Điện năng đã sạc vào xe không thể hoàn tác nên hệ thống trừ đủ tiền cước. Nếu số dư âm vượt quá `NEGATIVE_BALANCE_LIMIT = -300,000 VND`, tài khoản bị gắn cờ `wallet.is_debt_locked = True`. CSDL trang bị `CheckConstraint("balance >= -1000000")` tĩnh để phòng vệ rủi ro.
3. **Cơ chế biểu giá TOU (Time-of-Use):**
   + Đơn giá điện được chốt 1 lần tại thời điểm bắt đầu phiên sạc và lưu vào `ChargingSession.applied_price_per_kwh`. Phiên sạc kết thúc ở khung giờ khác vẫn giữ nguyên đơn giá này.
4. **Ghi nhận 2 nợ kỹ thuật cho mốc KT2:**
   + Chỉ số `meter_stop_kwh` hiện do client tự báo cáo (sẽ thay bằng Hardware Simulator ở Bước 08).
   + Chưa có scheduler/worker giám sát real-time ngắt rơ-le giữa chừng khi cạn tiền (sẽ tích hợp ở Bước 08 và Bước 09).
