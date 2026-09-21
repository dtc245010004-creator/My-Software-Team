# BƯỚC 07: MODULE NHẬP XUẤT KHO & THẺ KHO TRANSACTION ACID (CORE INVENTORY)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-07-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - `docs/SDLC/KT2/02_Transaction_Design_and_Negative_Stock_Prevention.md`: SẢN PHẨM BÀN GIAO THẬT (Deliverable) giải trình giải pháp Transaction và chống tồn âm cho giảng viên chấm điểm KT2.
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, services, endpoints).

---

## 1. Mục tiêu bước 7
- Xây dựng nghiệp vụ cốt lõi của kho bãi: Lập Phiếu nhập kho, Lập Phiếu xuất kho.
- Đảm bảo tính nhất quán dữ liệu 100% bằng Database Transactions (ACID):
  - Nhập hàng: Tăng tồn kho và tự động ghi Thẻ kho.
  - Xuất hàng: Kiểm tra tồn kho nghiêm ngặt, **chặn đứng nguy cơ tồn kho âm**, giảm tồn kho và tự động ghi Thẻ kho.
- Xây dựng Thẻ kho (`stock_ledger`) - sổ kiểm toán bất biến phục vụ truy vết lịch sử biến động từng giây.
- Báo cáo Nhập - Xuất - Tồn theo kỳ (tồn đầu kỳ + nhập - xuất = tồn cuối kỳ).

---

## 2. Nội dung công việc chi tiết

### 2.1. Models CSDL
- `app/models/import_note.py`: `ImportNote` và `ImportNoteDetail`.
- `app/models/export_note.py`: `ExportNote` và `ExportNoteDetail`.
- `app/models/stock_ledger.py`: `StockLedger` (Thẻ kho).

### 2.2. Nghiệp vụ Quản lý Kho bằng Transaction (`inventory_service.py`)
1. **Lập Phiếu Nhập**:
   ```python
   # Thực thi trong 1 transaction duy nhất
   with db.begin():
       # 1. Tạo phiếu nhập (ImportNote)
       # 2. Tạo các dòng chi tiết (ImportNoteDetail)
       # 3. Cập nhật tăng current_stock của từng sản phẩm
       # 4. Ghi bản ghi vào StockLedger (type='IMPORT', qty_change=+X, balance_after=...)
   ```
2. **Lập Phiếu Xuất (Chống tồn kho âm)**:
   ```python
   # Thực thi trong 1 transaction duy nhất
   with db.begin():
       # 1. Với từng sản phẩm yêu cầu xuất:
       #    Kiểm tra: product.current_stock >= item.quantity
       #    Nếu KHÔNG đủ: raise HTTPException(400, "Không đủ hàng trong kho!") -> Tự động ROLLBACK
       # 2. Trừ tồn kho: product.current_stock -= item.quantity
       # 3. Tạo phiếu xuất và chi tiết
       # 4. Ghi bản ghi vào StockLedger (type='EXPORT', qty_change=-Y, balance_after=...)
   ```

### 2.3. Tra cứu Thẻ kho & Báo cáo Nhập - Xuất - Tồn
- `GET /api/v1/stock-ledger`: Tra cứu lịch sử thẻ kho theo mặt hàng, thời gian.
- `GET /api/v1/reports/inventory-summary`: Báo cáo Nhập - Xuất - Tồn theo khoảng thời gian (`from_date`, `to_date`).

---

## 3. Cấu trúc file/thư mục cần sinh
Khi thực hiện bước này, các file và thư mục sau phải được tạo ra:

```text
backend/
├── app/
│   ├── models/
│   │   ├── import_note.py             # Model Phiếu nhập & Chi tiết phiếu nhập
│   │   ├── export_note.py             # Model Phiếu xuất & Chi tiết phiếu xuất
│   │   └── stock_ledger.py            # Model Thẻ kho kiểm toán
│   ├── schemas/
│   │   ├── import_note.py             # Schemas ImportNote
│   │   ├── export_note.py             # Schemas ExportNote
│   │   ├── stock_ledger.py            # Schemas StockLedger
│   │   └── report.py                  # Schemas Báo cáo Nhập-Xuất-Tồn
│   ├── services/
│   │   └── inventory_service.py       # Logic Transaction Nhập, Xuất & Thẻ kho
│   └── api/
│       └── v1/
│           └── endpoints/
│               ├── import_notes.py    # Endpoints lập & tra cứu phiếu nhập
│               ├── export_notes.py    # Endpoints lập & tra cứu phiếu xuất
│               ├── stock_ledger.py    # Endpoints tra cứu thẻ kho
│               └── reports.py         # Endpoints báo cáo thống kê
docs/
└── SDLC/
    └── KT2/
        └── 02_Transaction_Design_and_Negative_Stock_Prevention.md  # Tài liệu giải trình thiết kế Transaction KT2
```

---

## 4. Ràng buộc kỹ thuật & Tiêu chí hoàn thành (Definition of Done)
- [ ] Nếu xuất hàng quá số lượng tồn hiện có, API bắt buộc trả về mã lỗi HTTP 400 kèm thông báo chi tiết số lượng thiếu; số tồn kho không bị thay đổi.
- [ ] Mọi giao dịch nhập/xuất đều tạo ra bản ghi tương ứng trong `stock_ledger` với `balance_after` hoàn toàn chính xác.
- [ ] Báo cáo Nhập - Xuất - Tồn khớp công thức: `Tồn đầu + Nhập - Xuất = Tồn cuối`.

---

## 4b. Deliverable bổ sung — `docs/architecture.md` (trước KT2)

Tạo `docs/architecture.md` để giảng viên có thể đọc kiến trúc hệ thống mà không cần đọc code.

**Nội dung tối thiểu:**
- Sơ đồ luồng nhập kho: `request → API → InventoryService → transaction ACID → stock_ledger`
- Sơ đồ luồng xuất kho: `kiểm tồn atomic → trừ tồn / rollback nếu âm → stock_ledger`
- Sơ đồ luồng AI: `tổng hợp dữ liệu → gọi Gemini → fallback heuristic nếu lỗi`
- Mô tả ranh giới 3 tầng: `api/` (HTTP only) · `services/` (business logic) · `models/` (ORM + DB)

---

## 5. Cập nhật tiến độ
Sau khi hoàn thành bước này, mở file [docs/plans/TIEN-DO.md](file:///E:/hệ thống quản lý kho/docs/plans/TIEN-DO.md) và cập nhật dòng **Bước 07** theo đúng mẫu sau:

```markdown
| YYYY-MM-DD | Bước 07 | Module Nhập/Xuất kho & Thẻ kho (Transaction) | Hoàn thành | `backend/app/services/inventory_service.py`, `models/stock_ledger.py` | Đã hoàn thiện logic Transaction Nhập/Xuất kho, chống tồn âm và Thẻ kho |
```
