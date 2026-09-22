 Điểm cần xem lại / rủi ro
  
  1. Gọi Gemini API theo nhịp telemetry (2–5 giây) là không khả thi. Mục 4.1 nói AI "phân bổ động" nhưng nếu
  gọi API ngoài mỗi vài giây cho mỗi trạm, độ trễ mạng + rate limit sẽ phá luồng realtime. Nên tách rõ:
  heuristic chạy tức thời mỗi tick (đã có sẵn, dùng luôn cho vòng lặp WebSocket), còn Gemini chỉ gọi định kỳ
  (vd. mỗi 1–5 phút, hoặc khi có sự kiện ngưỡng) để sinh khuyến nghị/giải trình cho CPO xem. Hiện tài liệu
  không phân biệt rạch ròi hai tốc độ này.
  
  2. Ranh giới "AI" vs "rule-based" chưa rõ, dễ bị hội đồng bắt bẻ. Predictive Maintenance dùng "T > 70°C ⟹
  Warning" — đây là rule-based thuần túy, không phải AI. Nếu muốn giữ nhãn "AI" cho phần này, cần Gemini phân
  tích chuỗi thời gian (trend, không chỉ ngưỡng tức thời) và sinh giải trình ngôn ngữ tự nhiên; còn ngưỡng cứng
  nên gọi thẳng là "rule-based fallback" để tránh overclaim khi bảo vệ.
  
  3. WebSocket auth chưa được đề cập. Auth JWT qua REST không tự động bảo vệ WebSocket. Nếu truyền token qua
  query string (/ws/telemetry?token=...), token dễ lọt vào log server/proxy. Cần quyết định: xác thực qua
  subprotocol header, hay xác thực HTTP trước khi upgrade connection.
  
  4. Cô lập dữ liệu giữa các CPO chưa nói tới. Có nhiều operator quản nhiều Station — nhưng chưa thấy ràng buộc
  "operator A không được thấy/sửa trạm của operator B" ở tầng service hay DB (ownership check). Đây là lỗ hổng
  phân quyền điển hình nếu không được đặc tả từ đầu.
  
  5. Đường dẫn tuyệt đối Windows hardcode trong GEMINI.md (E:\Nền tảng vận hành trạm sạc xe điện\). Nếu clone
  sang máy khác, hệ điều hành khác, hoặc chạy CI, quy tắc "mở phiên phải làm việc tại path này" sẽ gãy. Nên
  dùng đường dẫn tương đối hoặc biến môi trường.
  
  6. Nạp tiền vào ví chưa rõ nguồn. Tài liệu nói "nạp tiền, xem biến động số dư" nhưng không đề cập cổng thanh
  toán thật hay chỉ giả lập số dư (admin cộng tay / nút demo "nạp tiền ảo"). Với đồ án môn học có thể chấp nhận
  giả lập, nhưng nên ghi rõ trong đặc tả để tránh hội đồng hỏi "tiền thật vào bằng cách nào".
  
  7. "OCPP 1.6J" bị nhắc tên nhưng chưa rõ mức độ tuân thủ. Nếu chỉ lấy cảm hứng cấu trúc trạng thái
  (Available/Preparing/Charging...) mà không thực sự implement message format chuẩn OCPP (BootNotification,
  StartTransaction, MeterValues JSON schema), nên gọi là "mô phỏng lấy cảm hứng từ OCPP" thay vì "chuẩn OCPP
  1.6J" — tránh bị hỏi sâu về giao thức thật.
  
  8. Idle fee cần cơ chế phát hiện rõ ràng. Phí chiếm chỗ sau khi đầy pin — hệ thống có cảm biến rút súng
  không, hay chỉ dựa vào driver tự bấm "kết thúc"? Nếu chỉ dựa vào simulator giả lập, cần định nghĩa rõ sự kiện
  nào kích hoạt tính idle fee.
  
  9. Giai đoạn 0.3/0.4 trong roadmap đang "🔄" nhưng chưa thấy TIEN-DO.md để đối chiếu — nên đảm bảo hai file
  này đồng bộ ngay từ đầu, đúng như nguyên tắc chính GEMINI.md đã đặt ra.
  
  Đề nghị bổ sung
  Thêm một file đặc tả riêng cho WebSocket protocol (message schema, auth flow, reconnect strategy) — hiện chưa
  có, dù đây là phần kỹ thuật khó nhất của hệ thống.
  Thêm bảng phân biệt AI thật vs Heuristic cho từng tính năng (Smart Charging / Predictive Maintenance /
  Pricing) để lúc bảo vệ đồ án trả lời rành mạch.
  Cân nhắc thêm một use case về multi-station overload — vd. nếu 2 trạm cùng CPO chia sẻ một nguồn lưới điện
  khu vực, logic load balancing hiện tại (theo total_grid_capacity của từng trạm) có đủ không?Nhìn chung, khung
  kiến trúc và tài liệu hóa (GEMINI.md, roadmap phân tầng) thuộc loại chỉn chu hơn mức trung bình của một đồ án
  môn học — vấn đề chính không phải là "thiếu ý tưởng" mà là độ chi tiết kỹ thuật ở các điểm nhạy cảm (WS auth,
  tốc độ gọi AI, ranh giới AI/rule-based) cần được siết lại trước khi bắt tay code Giai đoạn 2 trở đi. (không
  cần thay đổi file/nội dung ta đang thảo luận)
