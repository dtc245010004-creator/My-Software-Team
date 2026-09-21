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

**Hệ thống quản lý kho có tích hợp AI — Đề tài 07.** Doanh nghiệp nhỏ quản lý hàng hóa,
nhà cung cấp, phiếu nhập, phiếu xuất, tồn kho và cảnh báo hàng sắp hết. AI hỗ trợ sinh
báo cáo nhập-xuất-tồn, gợi ý nhập hàng và tóm tắt biến động bất thường.

Đề bài gốc: [`de_tai_07.md`](de_tai_07.md). Đặc tả hợp nhất: [`Prompt.md`](Prompt.md).

Dự án là đồ án môn học — code cần có comment rõ ràng để sinh viên **giải thích được** trước
hội đồng. Ưu tiên MVP chạy đúng nghiệp vụ kho trước, tối ưu sau.

## Stack

| Hạng mục | Lựa chọn |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 |
| CSDL | SQLite + giao dịch ACID |
| Frontend | React 18 + Vite + Tailwind CSS |
| AI Engine | Google Gemini API + Heuristic Fallback (chạy được khi mất mạng/hết quota) |
| Kiểm thử | pytest tại `backend/tests/` |

## Cấu trúc thư mục thực tế

```
E:\hệ thống quản lý kho\          <- thư mục gốc
├── backend/
│   ├── app/
│   │   ├── api/v1/               <- endpoints (auth, products, suppliers, imports, exports, ai...)
│   │   ├── core/                 <- config.py, database.py
│   │   ├── models/               <- ORM models
│   │   ├── schemas/              <- Pydantic schemas
│   │   ├── services/             <- business logic (inventory_service, ai_service...)
│   │   └── main.py
│   ├── tests/                    <- bộ test pytest
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── codebase-map.md           <- bản đồ mã nguồn (đọc đầu mỗi phiên)
│   ├── implementation_plan.md
│   ├── plans/                    <- kế hoạch từng bước đã duyệt
│   │   ├── TIEN-DO.md
│   │   └── Buoc-NN-*.md
│   └── SDLC/                    <- tài liệu chấm điểm 4 giai đoạn
│       ├── KT1/
│       ├── KT2/
│       ├── KT3/
│       └── final/
├── de_tai_07.md                  <- đề bài gốc, KHONG SUA
├── Prompt.md                     <- đặc tả hợp nhất đầy đủ
└── CLAUDE.md                     <- file này
```

## Quy ước ngôn ngữ

- **Tài liệu, comment, thông báo lỗi hiển thị cho người dùng: tiếng Việt.**
- **Định danh code, tên bảng, tên cột, tên hàm, tên biến, tên file: tiếng Anh không dấu.**
  Ví dụ: `product`, `supplier`, `import_note`, `export_note`, `stock_ledger`.
- Thông điệp commit: tiếng Việt không dấu, dạng `<loại>: <mô tả>`.

## Vai trò người dùng

`admin` (quản trị viên) · `warehouse_keeper` (thủ kho) · `accountant` (kế toán)

---

# 6. Quy trình mỗi phiên làm việc

## Mở phiên — làm đủ 3 việc này trước khi làm bất cứ gì khác

1. **Làm việc tại `E:\hệ thống quản lý kho`.** Mọi đường dẫn trong tài liệu đều tương đối
   so với thư mục này.
2. Đọc [`docs/codebase-map.md`](docs/codebase-map.md) để biết hiện có những file nào, làm gì.
3. Đọc [`docs/plans/TIEN-DO.md`](docs/plans/TIEN-DO.md) để biết đang ở bước nào và còn việc gì chưa xong.

## Đóng phiên — bắt buộc nếu phiên có thay đổi code

1. Chạy test tại `backend/tests/`, ghi lại kết quả thật.
2. Cập nhật `docs/codebase-map.md` nếu có thêm/xóa/đổi vai trò file.
3. Cập nhật `docs/plans/TIEN-DO.md` tick bước đã hoàn thành.

Không được để việc cập nhật tài liệu trôi sang phiên sau.

## Luật kế hoạch

Mỗi khi một kế hoạch được người dùng duyệt, **lưu ngay vào `docs/plans/Buoc-NN-<slug>.md`**
với checklist `[ ]` cho từng bước, tick `[x]` trong lúc thực hiện.

---

# 7. Luật kiểm thử

Bộ test nằm tại `backend/tests/`. Chạy bằng:
```bash
cd backend
pytest
```

## Ba luật chống test giả

Rủi ro lớn nhất khi sinh test bằng AI là test luôn xanh nhưng không chứng minh điều gì.

1. **Không mock chính lớp đang test.** Mock chỉ dành cho ranh giới ngoài: Gemini API, thời gian hệ thống.
2. **Mỗi bug fix phải có test tái hiện được bug** — chạy đỏ trước khi sửa, xanh sau khi sửa.
3. **Test AI phải assert nội dung thật**, không chỉ assert "không ném exception".

## Hai luật bao phủ

- Mỗi hàm public trong `backend/app/services/` có tối thiểu **1 test happy path + 1 test biên**.
- Mọi thay đổi liên quan tồn kho phải kèm test chặn tồn âm (tồn kho không được âm).

**Không đặt mục tiêu coverage phần trăm** — chỉ tiêu coverage đẻ ra test chạy qua code mà không
kiểm tra gì.

---

# 8. Ranh giới kiến trúc

- `backend/app/api/v1/` chỉ làm HTTP: parse request, kiểm tra quyền, trả response. **Không chứa logic nghiệp vụ.**
- `backend/app/services/` chứa toàn bộ logic nghiệp vụ, test được mà không cần khởi động app.
- Mọi thao tác thay đổi tồn kho **phải đi qua database transaction ACID** — không cập nhật
  `current_stock` lẻ tẻ ngoài transaction.

## Quy tắc an toàn AI

Hai điều tuyệt đối:

- **Không gửi giá mua/giá nhập** vào prompt AI khi không cần phân tích chi phí.
- AI **không tự thay đổi số liệu kho** — chỉ đọc và sinh nhận xét/gợi ý.
- Nếu API AI lỗi/hết quota → **Fallback Heuristic Engine** tự động kích hoạt, giao diện không vỡ.

---

# 9. Bài học — luật phân loại

**Khi phát hiện một lỗi do chính mình gây ra lần thứ hai, phải phân loại trước khi đóng phiên:**

- **Tự động hóa được** → thêm test vào `backend/tests/`.
- **Không tự động hóa được** → thêm **một dòng** vào danh sách dưới đây.
- Danh sách này có **trần cứng 5 dòng**. Muốn thêm dòng thứ 6 thì phải xóa một dòng hoặc tự động hóa
  một dòng cũ.

## Danh sách (0/5 dòng)

*(Trống — chưa có bài học nào được ghi nhận)*

---

# 10. Phân tích đường dẫn còn thiếu

Các file/thư mục dưới đây **chưa tồn tại** nhưng có thể cần tạo. Phân tích ưu tiên và nội dung
cần chuẩn bị cho từng mục.

## Cao — nên tạo ngay để làm việc đúng quy trình

### `docs/sessions/` — log phiên làm việc

**Nên thêm không?** Có.

Không có log phiên thì agent phiên sau không biết đang làm dở gì, dễ làm lại hoặc bỏ sót.

**Nội dung cần chuẩn bị:**
- Thư mục `docs/sessions/`
- File `docs/sessions/README.md` — quy ước: mỗi phiên chat tạo một file `YYYY-MM-DD-NN.md`
- Khung file log phiên tối thiểu:

```markdown
# Phien YYYY-MM-DD-NN
## Muc tieu phien
## Viec da lam
## Ket qua test
## Viec con do / buoc tiep theo
```

---

### `docs/testing/` — chiến lược & ma trận test

**Nên thêm không?** Có, khi bắt đầu viết test (Bước 10).

Hiện tại `backend/tests/` chỉ có `__init__.py` — chưa có test nào. Tài liệu testing nên đi kèm
khi bắt đầu viết test để tránh viết trùng hoặc bỏ sót ca quan trọng.

**Nội dung cần chuẩn bị:**
- `docs/testing/test-strategy.md` — 3 tầng test (unit service, integration API, e2e), quy ước
  dùng fixture, cách mock Gemini API
- `docs/testing/test-cases.md` — ma trận: nghiệp vụ → ca test → file test. Ưu tiên:
  - Nhập kho: tăng tồn đúng, ghi thẻ kho
  - Xuất kho: trừ tồn đúng, **chặn tồn âm**
  - Hủy phiếu: hoàn tồn đúng
  - AI fallback: giao diện không vỡ khi API lỗi

---

## Trung bình — nên có trước khi nộp KT2/KT3

### `docs/architecture.md` — sơ đồ kiến trúc

**Nên thêm không?** Có, trước KT2.

**Nội dung cần chuẩn bị:**
- Cây thư mục (đã có sẵn ở mục 5 — chép và mở rộng)
- Sequence diagram: luồng nhập kho (request → API → service → transaction → stock_ledger)
- Sequence diagram: luồng xuất kho (kiểm tồn → atomic update → rollback nếu âm)
- Sequence diagram: luồng AI (tổng hợp dữ liệu → gọi Gemini → fallback nếu lỗi)
- Mô tả ranh giới 3 tầng: `api/` · `services/` · `models/`

---

### `docs/roadmap.md` — lộ trình gắn mốc chấm điểm

**Nên thêm không?** Tùy — nội dung đã nằm rải rác trong `docs/plans/`. Chọn một trong hai:
- Tạo `docs/roadmap.md` tổng hợp 4 mốc KT1/KT2/KT3/Cuối kỳ và link sang từng `Buoc-NN.md`.
- Hoặc dùng `docs/plans/TIEN-DO.md` thay thế (đã có).

**Nếu tạo mới, nội dung tối thiểu:**
- Bảng 4 mốc SDLC × sản phẩm cần nộp × trạng thái hiện tại
- Link đến từng kế hoạch bước

---

### `docs/testing/smoke-checklist.md` — kiểm thử bấm tay

**Nên thêm không?** Có, trước KT3.

**Nội dung cần chuẩn bị:**
- Danh sách thao tác cần bấm tay để xác nhận giao diện đúng trước khi demo
- Phân theo luồng: Đăng nhập → Nhập kho → Xuất kho → Cảnh báo tồn → AI báo cáo → AI fallback

---

## Thấp — tùy chọn, thêm nếu cần

### `backend/app/api/v1/endpoints/ai.py` — endpoint AI

**Nên thêm không?** Có — theo đúng cấu trúc đã thiết kế trong `Prompt.md`. Hiện tại thư mục
`backend/app/api/v1/` còn trống (chỉ có `__init__.py`). Cần tạo toàn bộ endpoints.

**Nội dung khi tạo:**
- `POST /api/v1/ai/report` — sinh báo cáo nhập-xuất-tồn tháng
- `POST /api/v1/ai/suggest` — gợi ý nhập hàng
- `POST /api/v1/ai/anomalies` — tóm tắt biến động bất thường
- Mọi endpoint phải gọi qua `ai_service.py`, không gọi Gemini trực tiếp từ router

### `backend/app/services/ai_service.py` — tầng nghiệp vụ AI

**Nên thêm không?** Có — đây là điều kiện để endpoint AI hoạt động và để test được.

**Nội dung khi tạo:**
- `tong_hop_du_lieu(db, tu_ngay, den_ngay)` — truy vấn SQL tổng hợp, loại bỏ giá mua
- `sinh_bao_cao(du_lieu)` — gọi Gemini, fallback nếu lỗi
- `goi_y_nhap_hang(du_lieu)` — gọi Gemini, fallback heuristic tự tính `suggested_qty = (min_stock * 2) - current_stock`
- `tom_tat_bien_dong(du_lieu)` — gọi Gemini, fallback tự gắn nhãn xuất tăng/hàng ứ đọng

---

# 11. Nguồn sự thật & Quy ước cập nhật tài liệu

## Phân cấp nguồn sự thật (khi hai file mâu thuẫn)

```
TIEN-DO.md          → THẮNG về trạng thái (bước nào xong, bước nào chưa)
Buoc-NN.md          → THẮNG về cách làm (spec kỹ thuật, checklist, file cần tạo)
MASTER-ROADMAP.md   → Bức tranh toàn cảnh; chỉ cập nhật khi TIEN-DO.md đã cập nhật xong
```

**Nguyên tắc:** MASTER-ROADMAP.md không bao giờ là tài liệu đầu tiên được sửa.
Mọi thay đổi trạng thái đi theo chiều: `thực tế code` → `TIEN-DO.md` → `MASTER-ROADMAP.md`.

---

## Kế hoạch sống — nguyên tắc bổ sung dần

`docs/plans/Buoc-NN.md` là tài liệu **sống**, không phải đá granite. Khi thực tế khác với
kế hoạch ban đầu, **không xóa nội dung cũ** — thêm ghi chú ngay bên dưới mục liên quan:

```markdown
> 📝 **Cập nhật thực tế [YYYY-MM-DD]:** [Mô tả điều đã thay đổi và lý do]
```

Ví dụ: phát hiện cần thêm index vào bảng khi đang làm Bước 07 → thêm ghi chú vào
`Buoc-07.md`, không tạo file mới và không xóa nội dung cũ.

---

## Trigger cập nhật tài liệu — điều kiện cụ thể, không phải "nhớ thì làm"

Mỗi trigger dưới đây là **bắt buộc**, không tùy chọn:

| Khi nào | Cập nhật gì | Thứ tự |
|---|---|:---:|
| Hoàn thành 1 nhiệm vụ trong Buoc-NN.md | Tick `[x]` vào checkbox tương ứng trong Buoc-NN.md | 1 |
| Hoàn thành toàn bộ 1 Bước (Buoc-NN) | Cập nhật dòng tương ứng trong `TIEN-DO.md` thành `Hoàn thành` | 2 |
| Cập nhật TIEN-DO.md xong | Cập nhật ô trạng thái tương ứng trong `MASTER-ROADMAP.md` | 3 |
| Thêm/xóa/đổi vai trò file bất kỳ | Cập nhật `docs/codebase-map.md` | ngay lập tức |
| Phát hiện kế hoạch cần điều chỉnh | Thêm ghi chú `📝 Cập nhật thực tế` vào Buoc-NN.md liên quan | ngay lập tức |
| Kết thúc phiên có thay đổi code | Chạy `pytest`, ghi kết quả vào TIEN-DO.md cột "Ghi chú" | cuối phiên |

**Không được đóng phiên** nếu bất kỳ trigger nào ở trên chưa được thực hiện.

---

## Quy ước MASTER-ROADMAP.md

- Chỉ có **1 tài liệu MASTER-ROADMAP**: `docs/MASTER-ROADMAP.md`.
- Mọi thay đổi trạng thái trong MASTER-ROADMAP phải có 1 dòng mới trong bảng
  **"Lịch sử cập nhật"** ở cuối file (không xóa dòng cũ).
- Khi thêm nhiệm vụ mới vào MASTER-ROADMAP, phải đồng thời thêm vào Buoc-NN.md tương ứng
  hoặc tạo Buoc-NN.md mới — không để nhiệm vụ chỉ tồn tại ở MASTER-ROADMAP mà không có
  spec chi tiết.

