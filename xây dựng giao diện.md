cơ bản ý nghĩ 

User chuyển hướng lần 1 → animation bắt đầu chạy (0% → 100%)
        ↓
User chuyển hướng lần 2 (khi đang ở ~33%)
        ↓
Không restart! Lấy vị trí hiện tại (33%) làm điểm xuất phát mới
        ↓
Animation mới tiếp tục chạy, đồng thời liên tục check:
"Mép nội dung mới đã đè tới mảnh nào của nội dung cũ chưa?"
        ↓
Mảnh nào bị đè tới → vỡ ngay tại đó (không phải vỡ hết cùng lúc)

Viết một hàm captureSnapshot(element) dùng html2canvas để chụp lại 
nội dung của 1 element DOM thành canvas.
Sau đó viết hàm sliceIntoGrid(sourceCanvas, cols, rows) cắt canvas đó 
thành lưới cols x rows mảnh nhỏ, mỗi mảnh là 1 canvas riêng, 
trả về mảng các mảnh kèm vị trí (x, y, width, height) tương ứng trên layout gốc.
Viết demo hiển thị thử: khi bấm nút, chụp nội dung hiện tại, cắt thành lưới 5x8, 
rồi hiển thị các mảnh đó ra màn hình (dùng absolute positioning) để tôi 
kiểm tra xem cắt có đúng, không bị lệch/méo hình so với nội dung gốc không.

Dựa trên hàm captureSnapshot và sliceIntoGrid đã có, viết hàm 
transitionContent(oldElement, newContentRenderFn) thực hiện:
1. Chụp snapshot nội dung hiện tại của oldElement.
2. Cắt thành lưới 5x8 mảnh, đặt overlay các mảnh này đè đúng vị trí 
   lên trên oldElement (z-index cao, position absolute/fixed).
3. Ngay sau khi overlay đã hiển thị, thay nội dung thật bên trong 
   oldElement bằng nội dung mới (gọi newContentRenderFn) — 
   nội dung mới phải hiện ra ngay lập tức, không chờ animation.
4. Dùng GSAP animate toàn bộ các mảnh trong overlay: bay về bên trái 
   (translateX âm), lệch dọc ngẫu nhiên nhẹ, xoay ngẫu nhiên nhẹ, 
   mờ dần (opacity về 0), có stagger nhẹ giữa các mảnh.
5. Sau khi animation xong, xoá overlay khỏi DOM.
Gắn hàm này vào nút "Chuyển trang" đã có ở Prompt 1 để test end-to-end.

Viết hệ thống đo velocity (tốc độ chuyển hướng) dựa trên khoảng cách 
di chuyển và thời gian giữa các sự kiện wheel/touchmove/hoặc click liên tiếp 
(tuỳ input mà tôi dùng để trigger chuyển trang).
Viết hàm mapVelocityToParams(velocity) trả về:
- duration: thời gian animation (velocity cao → duration ngắn)
- stagger: độ so le giữa các mảnh (velocity cao → stagger nhỏ, gần như đồng thời)
- distance: khoảng cách bay của mảnh (velocity cao → bay xa/mạnh hơn)
Dùng clamp/mapRange để giới hạn giá trị velocity trong khoảng hợp lý, 
tránh animation bị quá nhanh/quá chậm bất thường.
Tích hợp velocity này vào hàm transitionContent ở Prompt 3, 
thay các giá trị cố định (duration, stagger) bằng giá trị tính từ velocity.

Sửa lại transitionContent để nội dung mới không chỉ hiện ngay lập tức, 
mà trượt vào từ bên trái theo animation (translateX từ -100% về 0), 
tốc độ trượt cũng dựa theo velocity đã tính ở Prompt 4.
Trong lúc nội dung mới đang trượt vào, dùng callback onUpdate của GSAP 
để liên tục kiểm tra vị trí X hiện tại của mép nội dung mới.
Với mỗi mảnh trong overlay (từ Prompt 3), so sánh vị trí X của mảnh đó 
với vị trí mép nội dung mới: nếu mép nội dung mới đã vượt qua vị trí mảnh 
(và mảnh đó chưa vỡ), thì trigger animation vỡ CHỈ RIÊNG mảnh đó ngay lúc đó 
(không vỡ toàn bộ lưới cùng lúc như trước).
Đảm bảo mỗi mảnh chỉ vỡ đúng 1 lần dù onUpdate chạy nhiều lần mỗi giây 
(dùng flag/dataset đánh dấu mảnh đã vỡ).

Sửa lại toàn bộ hệ thống transition để cho phép ngắt giữa chừng:
Nếu người dùng trigger chuyển hướng mới trong khi animation transition 
trước đó CHƯA chạy xong, không được restart animation từ đầu hoặc 
kill đột ngột gây giật hình.
Thay vào đó: lấy vị trí/progress hiện tại của animation đang chạy dở 
(vị trí X hiện tại của nội dung mới đang trượt, danh sách mảnh đã vỡ/chưa vỡ), 
dùng chính các giá trị đó làm điểm xuất phát cho animation tiếp theo, 
sao cho chuyển động liền mạch không bị giật hay nhảy vị trí.
Dùng gsap.killTweensOf() kết hợp lưu lại giá trị hiện tại trước khi kill, 
hoặc dùng overwrite: "auto" của GSAP để xử lý việc này.
Viết demo cho phép bấm nút "chuyển hướng" liên tục thật nhanh nhiều lần 
để tôi test xem có bị giật, nhảy hình, hay lỗi gì không.

Giới hạn chuyển hướng liên tiếp (rate limit)

Thêm cơ chế giới hạn vào hệ thống transition đã có:
Đếm số lần người dùng trigger chuyển hướng liên tiếp trong khoảng thời gian ngắn 
(ví dụ dưới 400ms giữa các lần). Nếu đạt đến lần thứ 3 liên tiếp:
1. Ngay lập tức cho TOÀN BỘ mảnh trong overlay vỡ ra cùng lúc 
   (bỏ qua logic vỡ theo ranh giới đang dùng ở các lần trước).
2. Khoá không nhận thêm bất kỳ sự kiện chuyển hướng nào trong lúc animation 
   vỡ toàn bộ đang chạy.
3. Sau khi animation vỡ toàn bộ hoàn tất, mở khoá lại và reset bộ đếm về 0 
   để người dùng có thể chuyển hướng bình thường tiếp.
Nếu người dùng dừng chuyển hướng đủ lâu (quá 400ms không trigger gì) 
mà chưa đạt tới lần thứ 3, reset bộ đếm về 0, không cần đợi đến lần thứ 3 
mới reset.
Viết demo cho phép bấm liên tục nhanh 3+ lần để kiểm tra cơ chế khoá 
có hoạt động đúng không.