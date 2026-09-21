# BƯỚC 10: VIẾT BỘ TEST TỰ ĐỘNG PYTEST & SCRIPT SEED DATA (TESTING & DEMO DATA)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-10-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT3/02_Test_Plan_and_Results.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) báo cáo kết quả kiểm thử cho giảng viên chấm điểm KT3.
> - Mã nguồn kiểm thử được sinh trực tiếp vào `backend/tests/` và `backend/seed_data.py`.

---

## 1. Mục tiêu bước 10
- Xây dựng bộ kiểm thử tự động (Automated Test Suite) bằng `pytest` bao phủ các trường hợp kiểm thử bắt buộc theo yêu cầu đề bài và rubric bài KT3:
  1. Kiểm thử lập phiếu nhập kho cập nhật đúng tồn kho.
  2. Kiểm thử lập phiếu xuất kho: xuất hợp lệ và **chặn đứng tồn kho âm (trả về HTTP 400)**.
  3. Kiểm thử tính toàn vẹn của Thẻ kho (`stock_ledger`).
  4. Kiểm thử hàm tổng hợp dữ liệu AI và cơ chế Heuristic Fallback khi offline.
- Xây dựng script `seed_data.py` nạp sẵn bộ dữ liệu mẫu phong phú và thực tế trong 60 ngày để phục vụ demo chấm điểm.

---

## 2. Nội dung công việc chi tiết

### 2.1. Bộ Kiểm thử Tự động (`backend/tests/`)
1. `tests/conftest.py`:
   - Tạo database SQLite in-memory tách biệt cho test runner.
   - Cung cấp test client `httpx.AsyncClient` hoặc `TestClient`.
   - Tạo sẵn token đăng nhập cho 3 vai trò: Admin, Thủ kho, Kế toán.
2. `tests/test_stock_transactions.py`:
   - `test_import_stock_success()`: Nhập 50 cái $\rightarrow$ Tồn kho tăng 50 $\rightarrow$ Thẻ kho có 1 dòng ghi nhận.
   - `test_export_stock_success()`: Xuất 20 cái $\rightarrow$ Tồn kho giảm còn 30 $\rightarrow$ Thẻ kho cập nhật số dư 30.
   - `test_prevent_negative_stock()`: Thử xuất 50 cái (trong khi chỉ còn 30) $\rightarrow$ Bắt buộc nhận mã lỗi HTTP 400 $\rightarrow$ Tồn kho vẫn giữ nguyên 30.
   - `test_concurrency_export()`: Hai yêu cầu xuất cùng lúc không làm âm tồn kho.
3. `tests/test_ai_service.py`:
   - `test_ai_aggregation_pipeline()`: Kiểm tra hàm tổng hợp dữ liệu kho chạy đúng với dữ liệu rỗng và có dữ liệu.
   - `test_ai_fallback_offline()`: Đảm bảo khi không có internet/API key, hệ thống vẫn sinh phân tích hợp lệ qua Fallback Engine.

### 2.2. Script Nạp Dữ liệu Mẫu (`backend/seed_data.py`)
- Tạo 3 tài khoản đăng nhập chuẩn:
  - `admin` / `admin123` (Quản trị viên)
  - `thukho` / `thukho123` (Thủ kho)
  - `ketoan` / `ketoan123` (Kế toán)
- Tạo 4 nhóm hàng: Thiết bị văn phòng, Linh kiện máy tính, Phụ kiện mạng, Thiết bị lưu trữ.
- Tạo 20+ mặt hàng mẫu với các trạng thái khác nhau:
  - Hàng bình thường (tồn kho an toàn).
  - Hàng sắp hết (`current_stock <= min_stock`).
  - Hàng tồn kho lâu ngày không xuất (> 30 ngày).
  - Hàng có lượng xuất tăng đột biến trong tuần gần nhất.
- Tạo 5 nhà cung cấp uy tín và 30+ giao dịch nhập/xuất trong vòng 60 ngày để AI có đủ dữ liệu lịch sử phân tích.

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
backend/
├── seed_data.py                               # Script nạp 20+ SP, 3 tài khoản, dữ liệu 60 ngày
└── tests/
    ├── __init__.py
    ├── conftest.py                            # Fixtures SQLite in-memory, TestClient, Auth tokens
    ├── test_stock_transactions.py             # Test nhập, xuất, chặn tồn kho âm, thẻ kho
    └── test_ai_service.py                     # Test pipeline tổng hợp dữ liệu & fallback offline
docs/
└── SDLC/
    └── KT3/
        └── 02_Test_Plan_and_Results.md        # File báo cáo kết quả chạy Pytest phục vụ chấm điểm KT3
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Chạy lệnh `pytest tests/ -v` đạt **100% Passed**.
- [ ] Chạy lệnh `python seed_data.py` nạp dữ liệu thành công trong $< 3$ giây, không phát sinh lỗi duplicate key.
- [ ] Báo cáo kết quả kiểm thử được lưu chính xác tại `docs/SDLC/KT3/02_Test_Plan_and_Results.md`.

---

## 4b. Chiến lược kiểm thử & Ma trận test-cases

### Chiến lược 3 tầng

| Tầng | Mô tả | Công cụ |
|---|---|---|
| **Unit** | Test từng hàm `services/` độc lập, không cần chạy HTTP server | pytest + SQLite in-memory |
| **Integration** | Test API endpoint từ đầu đến cuối qua `TestClient` | pytest + httpx |
| **E2E thủ công** | Smoke-checklist bấm tay trước khi demo — xem mục 4c bên dưới | — |

**Quy ước dùng fixture:**
- `db_session`: SQLite in-memory, rollback sau mỗi test
- `client`: `TestClient(app)` dùng `db_session` override
- `auth_headers_admin`, `auth_headers_thukho`, `auth_headers_ketoan`: token JWT sẵn

**Cách mock Gemini API:**
```python
@pytest.fixture
def mock_gemini(monkeypatch):
    monkeypatch.setattr("app.services.ai_service.call_gemini", lambda prompt: "MOCKED_RESPONSE")
```

### Ma trận nghiệp vụ → ca test → file test

| Nghiệp vụ | Ca test bắt buộc | File test |
|---|---|---|
| Nhập kho | Tồn tăng đúng + thẻ kho có 1 dòng | `test_stock_transactions.py` |
| Xuất kho hợp lệ | Tồn giảm đúng + thẻ kho `balance_after` khớp | `test_stock_transactions.py` |
| Xuất kho quá tồn | HTTP 400, tồn không đổi | `test_stock_transactions.py` |
| Hủy phiếu nhập | Tồn hoàn trả đúng | `test_stock_transactions.py` |
| Thẻ kho cân đối | `Tồn đầu + Nhập - Xuất = Tồn cuối` | `test_stock_transactions.py` |
| AI pipeline | Dữ liệu vào không chứa giá mua | `test_ai_service.py` |
| AI fallback | API lỗi → fallback trả đúng cấu trúc JSON | `test_ai_service.py` |

---

## 4c. Smoke-checklist kiểm thử bấm tay (trước demo KT3/Cuối kỳ)

Thực hiện theo thứ tự. Tick khi đã xác nhận không lỗi:

- [ ] **Đăng nhập**: 3 tài khoản (`admin`, `thukho`, `ketoan`) đăng nhập thành công, sai mật khẩu trả lỗi rõ ràng
- [ ] **Dashboard**: Hiển thị KPIs (tổng hàng, tổng tồn, badge cảnh báo hàng dưới ngưỡng)
- [ ] **Nhập kho**: Lập phiếu nhập → Confirm → Tồn kho tăng đúng trong danh sách hàng hóa
- [ ] **Xuất kho hợp lệ**: Lập phiếu xuất (đủ hàng) → Tồn giảm đúng
- [ ] **Xuất kho thiếu hàng**: Nhập số lượng vượt tồn → Giao diện báo lỗi rõ ràng, tồn không đổi
- [ ] **Cảnh báo tồn**: Hàng có `current_stock ≤ min_stock` hiển thị badge/cảnh báo
- [ ] **Thẻ kho**: Tra cứu stock_ledger → Chuỗi `balance_after` liên tục, không nhảy số
- [ ] **AI báo cáo tháng**: Bấm nút → Nhận kết quả trong ≤15 giây (hoặc fallback nếu offline)
- [ ] **AI gợi ý nhập hàng**: Bấm nút → Danh sách hàng cần nhập có số lượng gợi ý
- [ ] **AI bất thường**: Bấm nút → Danh sách mặt hàng có biến động đột biến hoặc tồn lâu
- [ ] **AI fallback**: Xóa `GEMINI_API_KEY` khỏi `.env`, restart → 3 chức năng AI vẫn trả kết quả, giao diện không vỡ

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/hệ thống quản lý kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 10** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 10 | Viết Bộ Test Tự động (Pytest) & Seed Data | Hoàn thành | `backend/tests/test_stock_transactions.py`, `backend/seed_data.py` | Đã hoàn thiện test suite Pytest pass 100% và script seed_data.py nạp dữ liệu 60 ngày |
```

