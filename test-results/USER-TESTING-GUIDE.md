# Hướng Dẫn Kiểm Thử Cho Người (Tester chưa có kinh nghiệm)

> File này dành cho **bạn** đọc và làm theo. Không cần biết code. Việc còn lại (viết/chạy test tự động) đã có `AGENT-TESTING-GUIDE.md` giao cho agent.

## 0. Vai trò của bạn trong 2 chữ: **Blackbox thủ công**

Bạn kiểm thử **từ góc nhìn người dùng cuối** — không quan tâm code viết thế nào, chỉ quan tâm: bấm vào thì có đúng như mong đợi không. Agent giỏi tìm lỗi logic/code hơn bạn, nhưng **không có trực giác** về cái gì "kỳ", "khó dùng", hoặc "người dùng thật sẽ làm vậy". Đó là phần của bạn.

## 1. Công cụ cần chuẩn bị (chọn theo tình huống)

| Muốn test gì | Dùng gì | Lấy ở đâu |
| --- | --- | --- |
| Giao diện web (trang, nút, form) | Trình duyệt (Chrome/Edge) + F12 (DevTools) để xem lỗi console | Có sẵn |
| Gọi thử API mà không cần code | **Thunder Client** hoặc **REST Client** (extension VSCode) | Cài trong tab Extensions của VSCode |
| Test API có giao diện riêng, lưu lịch sử gọi | **Postman** | postman.com, cài desktop app |
| Test luồng đăng nhập/nhiều tài khoản cùng lúc | Trình duyệt ở chế độ ẩn danh (Incognito) — mở nhiều tab với các tài khoản khác nhau không bị đè session | Có sẵn |

Bạn **không cần cài hết**. Nếu chỉ test giao diện web → chỉ cần trình duyệt. Nếu cần thử API trước khi frontend làm xong → thêm Thunder Client.

## 2. Trước khi bắt đầu test — hỏi agent 3 câu này

Đừng tự đoán, hỏi thẳng agent (hoặc người viết code) để khỏi mất thời gian:

1. "App đang chạy ở đâu?" (link web, hay lệnh nào để mở lên máy mình)
2. "Có tài khoản demo/seed sẵn không? Mật khẩu gì, ứng với vai trò nào?"
3. "Danh sách các luồng chính (use case) đã code xong là gì?" — để biết cái nào test được, cái nào chưa có nên chưa test.

## 3. Bạn tự làm những việc này (không giao cho agent)

- **Thử input "lạ"**: để trống, số âm, ký tự đặc biệt, dán chuỗi rất dài, bấm nút 2 lần liên tục, back trình duyệt giữa luồng — agent viết test theo logic nó hiểu, còn bạn thử theo kiểu người dùng vô ý/cố ý phá.
- **Thử đổi vai trò**: nếu hệ thống có nhiều loại người dùng (actor), đăng nhập từng vai trò và thử làm việc **không thuộc quyền của mình** (VD: vai trò A cố mở trang chỉ dành cho vai trò B) — xem có bị chặn đúng không.
- **Đánh giá trải nghiệm/thẩm mỹ**: giao diện có rối không, chữ có tràn không, trên điện thoại có vỡ layout không — agent không "nhìn" và đánh giá đẹp/xấu được.
- **Thử luồng dài, nhiều bước liên tiếp** (không phải 1 hành động đơn lẻ): ví dụ đăng nhập → làm việc A → chuyển qua việc B → quay lại việc A xem dữ liệu còn đúng không.
- **Quyết định cuối**: có đồng ý merge/dùng bản này không — agent chỉ báo cáo, không tự quyết.

## 4. Cách ghi lại lỗi tìm được

Mỗi khi thấy lỗi, ghi ngay theo mẫu ngắn (đừng để tới cuối buổi mới nhớ lại):

```text
- [Mức độ: Nhẹ/Trung bình/Nghiêm trọng] <tên lỗi ngắn>
  Vai trò/màn hình: ...
  Bước làm: 1) ... 2) ... 3) ...
  Kỳ vọng: ...
  Thực tế: ...
```

Lưu vào: `docs/testing/bugs-tim-thay.md` (tạo file này nếu chưa có — không cần công cụ quản lý bug phức tạp cho đồ án cá nhân).

## 5. Khi nào chuyển việc qua cho agent

Nếu lỗi bạn thấy là do **code sai** (không phải do bạn hiểu nhầm cách dùng) → copy nguyên khối ghi lỗi ở mục 4, dán cho agent kèm câu: *"Sửa lỗi này, viết thêm test để không lặp lại."* Agent sẽ theo `AGENT-TESTING-GUIDE.md` để xử lý.

## 6. Lưu ý thật

File này chỉ có tác dụng nếu bạn **thực sự làm từng bước**, không phải đọc rồi bỏ qua. Với dự án đồ án 1 người + agent, không cần UAT với "người dùng thật" hay quy trình 5 giai đoạn kiểu doanh nghiệp — mục 1–5 trên là đủ cho quy mô này.
