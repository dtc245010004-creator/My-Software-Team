# Hệ thống quản lý kho — Đề tài 07

> **File này là nhật ký vận hành phiên làm việc** — dành cho bạn (người dùng) đọc trước mỗi phiên.
> Ở Giai đoạn 7, file này sẽ được thay thế bằng hướng dẫn cài đặt thật sự.

---

## ⚡ MỞ PHIÊN — làm theo thứ tự này

### Bước 1 — Nhắc AI đọc ngữ cảnh (copy paste vào chat)

```
Đọc các file sau trước khi làm bất cứ gì:
1. CLAUDE.md — quy tắc làm việc, kiến trúc, trigger cập nhật tài liệu
2. docs/codebase-map.md — file nào đang có, vai trò gì
3. docs/plans/TIEN-DO.md — đang ở bước nào, còn gì chưa xong
4. docs/MASTER-ROADMAP.md — bức tranh toàn cảnh 8 giai đoạn
```

> Nếu đang ở giữa 1 bước cụ thể, bổ sung thêm:
> `5. docs/plans/Buoc-NN-<tên>.md — kế hoạch chi tiết bước đang làm`

---

### Bước 2 — Bạn tự kiểm tra (không cần AI)

- [ ] `docs/plans/TIEN-DO.md` — Bước hiện tại đang ở trạng thái gì?
- [ ] `docs/MASTER-ROADMAP.md` — Giai đoạn nào đang ⬜ / 🔄 / ✅?
- [ ] Phiên trước có việc còn dở không? (xem cột "Ghi chú" trong TIEN-DO.md)
- [ ] Backend/Frontend có đang chạy không? (nếu đang code)

---

### Bước 3 — Thảo luận với AI TRƯỚC KHI bắt đầu bước mới

Trước khi bảo AI viết code cho bước tiếp theo, hỏi AI những thứ này:

```
Trước khi bắt đầu [Bước XX], hãy trả lời:
1. Bước này phụ thuộc vào gì? Đã đủ chưa?
2. File nào sẽ được tạo mới / sửa đổi?
3. Có rủi ro gì cần lưu ý không?
4. Tiêu chí hoàn thành (Definition of Done) là gì?
```

> Nếu AI không nêu được tiêu chí hoàn thành rõ ràng → **chưa bắt đầu code**.

---

## 🔚 ĐÓNG PHIÊN — không được bỏ qua nếu có thay đổi code

- [ ] Chạy `cd backend && pytest` — ghi kết quả vào cột "Ghi chú" của TIEN-DO.md
- [ ] Tick `[x]` vào checkbox của các nhiệm vụ đã hoàn thành trong `Buoc-NN.md`
- [ ] Cập nhật `docs/plans/TIEN-DO.md` — đổi trạng thái bước (nếu xong hẳn)
- [ ] Cập nhật `docs/MASTER-ROADMAP.md` — đổi ô trạng thái + thêm dòng lịch sử
- [ ] Cập nhật `docs/codebase-map.md` — nếu có file mới / xóa / đổi vai trò
- [ ] Nếu kế hoạch thay đổi so với Buoc-NN.md → thêm `📝 Cập nhật thực tế [ngày]` vào Buoc-NN.md

---

## 🗺️ LINK NHANH

| Tài liệu | Mục đích | Khi nào dùng |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | Quy tắc toàn dự án | Nhắc AI đọc đầu phiên |
| [docs/MASTER-ROADMAP.md](docs/MASTER-ROADMAP.md) | Bức tranh 8 giai đoạn | Xem tổng thể, điều hướng |
| [docs/plans/TIEN-DO.md](docs/plans/TIEN-DO.md) | Trạng thái thực tế | Biết đang ở đâu |
| [docs/codebase-map.md](docs/codebase-map.md) | File nào đang có | Khi AI hỏi "file X ở đâu" |
| [Prompt.md](Prompt.md) | Đặc tả hợp nhất | Khi cần tra nghiệp vụ/kỹ thuật |
| [de_tai_07.md](de_tai_07.md) | Đề bài gốc GV — KHÔNG SỬA | Khi cần đối chiếu yêu cầu gốc |

---

## 📊 TRẠNG THÁI DỰ ÁN (cập nhật thủ công)

```
Giai đoạn hiện tại : ⬜ 0 — Nền tảng dự án
Bước đang làm      : Chưa bắt đầu
Mốc SDLC gần nhất  : KT1
Ngày cập nhật dòng này: 2026-09-20
```

> Cập nhật 3 dòng trên sau mỗi phiên để phiên sau bạn biết ngay mình đang đứng ở đâu.

---

## 💬 CÂU HỎI THƯỜNG HỎI AI

**"Tôi nên làm bước tiếp theo là gì?"**
```
Đọc TIEN-DO.md và MASTER-ROADMAP.md, sau đó đề xuất bước tiếp theo
theo đúng thứ tự dependency. Nêu lý do tại sao bước đó nên làm trước.
```

**"Kế hoạch bước này có vấn đề gì không?"**
```
Đọc docs/plans/Buoc-NN-<tên>.md và phân tích:
- Có thiếu dependency nào không?
- Có rủi ro kỹ thuật nào chưa được xử lý?
- Definition of Done có đủ kiểm tra được không?
```

**"Tôi muốn điều chỉnh kế hoạch bước XX"**
```
Tôi muốn thay đổi [mô tả thay đổi] trong Bước XX.
Hãy: (1) phân tích tác động sang các bước khác,
(2) đề xuất nội dung ghi chú 📝 vào Buoc-XX.md,
(3) xem có cần cập nhật MASTER-ROADMAP.md không.
```

**"Review code tôi vừa viết"**
```
Review file [tên file] theo tiêu chí trong CLAUDE.md §2, §3, §7, §8.
Đặc biệt kiểm tra: transaction ACID, chống tồn kho âm, không hardcode giá mua vào AI.
```
