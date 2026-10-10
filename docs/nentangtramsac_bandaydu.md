

Dưới đây là toàn bộ nội dung chi tiết từ 7 bảng tính (sheet) trong tệp **Nền tảng vận hành trạm sạc xe điện (CSMS).xlsx**:

## **1\. Sheet: Thông tin**

| Trường | Giá trị |
| :---- | :---- |
| **Tên dự án** | Nền tảng vận hành trạm sạc xe điện (CSMS) |
| **Độ dài sprint** | 1 tuần |
| **Ngày làm việc / sprint** | 5 |
| **Đơn vị ước lượng** | story point (Fibonacci) |
| **Product Goal** | Đơn vị vận hành mạng lưới trạm sạc nắm được mọi phiên sạc theo thời gian thực qua giao thức OCPP, tính đúng tiền theo biểu giá nhiều khung, không để trạm vượt công suất, và đối soát được doanh thu khớp với số kWh đã cấp |
| **Kinh nghiệm team** | thực tập / mới ra trường |
| **Quen Scrum** | mới áp dụng |
| **Ràng buộc tuân thủ** | có — thanh toán trực tuyến (chỉ dùng sandbox) và dữ liệu cá nhân tài xế gồm vị trí và lịch sử di chuyển (Nghị định 13/2023/NĐ-CP) |

## **2\. Sheet: Sprints**

| Sprint | Từ ngày | Đến ngày | Sprint Goal | Capacity (SP) | Đã xếp (SP) |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **1** | *(trống)* | *(trống)* | Chủ trạm khai báo được trạm và trụ trên môi trường staging chạy thật | 12 | 12 |
| **2** | *(trống)* | *(trống)* | Trụ ảo nối vào hệ thống được xác thực, và vận hành viên thấy đúng trạng thái mọi trụ kể cả khi kết nối chập chờn | 20 | 20 |
| **3** | *(trống)* | *(trống)* | Một phiên sạc chạy trọn vẹn từ lúc cắm tới lúc rút với số kWh đúng, dù trụ có mất kết nối giữa chừng | 20 | 20 |
| **4** | *(trống)* | *(trống)* | Phiên sạc ra đúng số tiền theo biểu giá nhiều khung giờ và tài xế đọc được vì sao ra số đó | 20 | 20 |
| **5** | *(trống)* | *(trống)* | Tài xế nạp ví và tiền tự trừ khi sạc xong, số dư không sai một đồng | 20 | 20 |
| **6** | *(trống)* | *(trống)* | Trạm không bao giờ vượt hạn mức công suất dù nhiều xe cùng sạc | 20 | 19 |
| **7** | *(trống)* | *(trống)* | Tài xế tìm được trạm còn trống, đặt được chỗ, và chỗ đã đặt chắc chắn là của họ | 20 | 19 |
| **8** | *(trống)* | *(trống)* | Cuối kỳ, doanh thu đối soát khớp với số kWh đã cấp và chia được cho từng đối tác | 20 | 20 |

## **3\. Sheet: Epics**

| ID | Title | Tier | Priority | Status | Story | AC | Deps | NFR | Owner |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **E-01** | Hạ tầng, CI/CD và môi trường | Ready | Must | Todo | Môi trường chạy được từ ngày đầu: khung dự án, cơ sở dữ liệu, pipeline CI, triển khai staging bằng Docker, và bộ trụ ảo chạy chung với ứng dụng. Dự án này cần chạy nhiều trụ ảo cùng lúc nên môi trường phải dựng bằng container ngay từ đầu; không có DevOps nên việc này nằm trong sprint 1, không để tới lúc cần. | Mọi thành viên chạy được dự án và 20 trụ ảo bằng một lệnh; mỗi lần merge vào nhánh chính thì staging tự cập nhật; CI chặn merge khi kịch bản trụ ảo thất bại | không | bí mật nạp từ biến môi trường, không nằm trong mã nguồn | cả team |
| **E-02** | Tài khoản, đối tác và phân quyền | Ready | Must | Todo | Năm vai trò dùng chung hệ thống nhưng thấy dữ liệu khác nhau. Đặc biệt: chủ trạm chỉ được thấy trạm của mình, không thấy doanh thu của đối tác khác. Quản trị viên tạo tài khoản và gán vai trò, không cho tự đăng ký vai trò. | Chủ trạm A gọi API xem doanh thu trạm của chủ trạm B thì bị từ chối ở máy chủ; không route nào mở mà chưa khai quyền | E-01 | mật khẩu hash bằng argon2id; không log mật khẩu và token | cả team |
| **E-03** | Trạm sạc, trụ và đầu nối | Ready | Must | Todo | Cây dữ liệu ba tầng: một trạm có nhiều trụ, một trụ có nhiều đầu nối. Mã định danh trụ phải khớp với mã trụ dùng khi kết nối OCPP, nếu không trụ thật sẽ không nối được. Trạm có trạng thái hoạt động để chủ trạm tạm ngừng khi bảo trì. | Đăng ký trạm có trụ và đầu nối; mã trụ là duy nhất trên toàn hệ thống; trạm tạm ngừng không nhận phiên mới | E-02 | mã trụ không được đổi sau khi đã có phiên sạc, vì phiên cũ tham chiếu tới nó | cả team |
| **E-04** | Kết nối OCPP và phiên sạc | Ready | Must | Todo | Lõi kỹ thuật của cả dự án. Trụ sạc là client chủ động mở kết nối WebSocket tới hệ thống, rồi hai bên trao đổi tin nhắn OCPP 1.6J suốt vòng đời phiên sạc: khởi động, nhịp tim, trạng thái đầu nối, xác thực thẻ, bắt đầu, số đo, kết thúc, và các lệnh từ máy chủ xuống trụ. Kết nối hay đứt, tin nhắn hay tới muộn hoặc tới hai lần — hệ thống phải đúng trong mọi trường hợp đó. | Chạy 20 trụ ảo, ngắt kết nối ngẫu nhiên giữa phiên rồi nối lại, thì mọi phiên đều kết thúc với số kWh đúng và không phiên nào bị nhân đôi | E-03 | một tin nhắn xử lý hai lần phải cho kết quả giống hệt xử lý một lần | cả team |
| **E-05** | Biểu giá và tính tiền | Next | Must | Todo | Phần khó âm thầm nhất của dự án. Một phiên sạc kéo dài có thể cắt qua nhiều khung giờ với đơn giá khác nhau, cộng thêm phí chiếm trụ tính theo phút sau khi sạc xong mà xe chưa rút. Tiền phải đúng tới từng đồng và giải thích được từng đoạn. Sprint 4 làm trọn: khai báo biểu giá, chia đoạn, hoá đơn. | Bộ ca kiểm thử có đáp án tính tay đều khớp, gồm cả phiên cắt qua ranh giới khung giờ, phiên qua nửa đêm và phiên có phí chiếm trụ | E-04 | làm tròn tiền theo quy tắc thống nhất, khai báo rõ ở một chỗ duy nhất | chưa phân |
| **E-06** | Ví và thanh toán | Next | Must | Todo | Tài xế nạp tiền vào ví, hệ thống trừ tự động khi phiên kết thúc. Ví không đủ tiền thì không cho bắt đầu phiên mới. Webhook nạp tiền gửi lại nhiều lần chỉ được ghi nhận một. Mọi biến động số dư là một dòng sổ cái chỉ ghi thêm; số dư là tổng của sổ. Chưa có sandbox thanh toán thì đi bằng đường nạp tay (S-36). | Số dư ví luôn khớp tổng nạp trừ tổng tiêu, không sai một đồng, kể cả khi webhook gửi lại và khi hai phiên kết thúc cùng lúc | E-05 | không lưu thông tin thẻ; mọi biến động số dư ghi nhật ký không sửa được | chưa phân |
| **E-07** | Đặt chỗ trụ sạc | Later | Should | Todo | Tài xế đặt trước một trụ trong khoảng thời gian; hệ thống gửi ReserveNow xuống trụ để trụ chỉ nhận đúng thẻ đã đặt. Hai người đặt cùng trụ cùng lúc thì chỉ một người thành công. Giữ chỗ quá giờ không tới thì huỷ và tính phí. | Bắn nhiều yêu cầu đặt chỗ đồng thời vào cùng một trụ thì đúng một yêu cầu thành công, và trụ ảo từ chối thẻ khác trong lúc đang giữ chỗ | E-06 | đặt chỗ hết hạn được nhả kể cả khi tiến trình nền vừa khởi động lại | chưa phân |
| **E-08** | Phân bổ công suất | Later | Must | Todo | Trạm có tổng công suất giới hạn, nhỏ hơn tổng công suất danh định của các trụ cộng lại. Khi nhiều xe cùng sạc, hệ thống phải chia công suất động và gửi giới hạn xuống từng trụ bằng SetChargingProfile. Simulator phải kiểm sớm xem có tôn trọng hồ sơ sạc không, xem R-08. | Mô phỏng 8 xe vào trạm 100 kW thì tổng công suất cấp không bao giờ vượt 100 kW, và khi một xe rời đi thì xe còn lại được cấp thêm trong vòng 30 giây | E-04 | chia lại công suất phải xong trong vài giây, không để trụ chờ lâu | chưa phân |
| **E-09** | Đối soát và chia doanh thu | Later | Must | Todo | Chủ trạm xem doanh thu và sản lượng kWh; kế toán đối chiếu tổng kWh đã cấp với tổng tiền đã thu, chốt kỳ, và chia doanh thu cho đối tác theo tỉ lệ hợp đồng. Báo cáo đọc từ hoá đơn và sổ cái đã chốt, không tính lại từ số đo thô. | Tổng kWh nhân đơn giá theo từng đoạn bằng tổng tiền đã thu trong kỳ, chênh lệch bằng 0 hoặc được liệt kê từng phiên có lý do | E-06 | báo cáo đọc từ dữ liệu đã chốt, không tính lại từ số đo thô mỗi lần mở | chưa phân |
| **E-10** | Giám sát vận hành và bảo vệ dữ liệu cá nhân | Ready | Must | Todo | Nhật ký thao tác trên trụ, phiên và ví; cảnh báo trụ hỏng; bảng sức khoẻ hệ thống; và nghĩa vụ xoá dữ liệu cá nhân. Lịch sử sạc cho biết tài xế đã ở đâu vào lúc nào — đây là dữ liệu vị trí, nhạy cảm hơn dữ liệu giao dịch thông thường. | Truy được ai làm gì trên một phiên sạc hay một giao dịch ví; xoá được dữ liệu cá nhân mà không phá sổ sách kế toán | E-04 | nhật ký chỉ ghi thêm, không sửa và không xoá được từ giao diện | cả team |
| **E-11** | Ứng dụng tài xế | Ready | Must | Todo | Mặt tài xế của hệ thống, chạy trên trình duyệt điện thoại: tìm trạm còn đầu nối rảnh, bắt đầu phiên từ ứng dụng, theo dõi phiên đang sạc, xem lịch sử, nhận thông báo. Không làm app native và không làm định tuyến bản đồ. | Tài xế đi hết hành trình tìm trạm → bắt đầu sạc → theo dõi → kết thúc → xem hoá đơn trên điện thoại mà không cần ai ở trạm hỗ trợ | E-04 | mọi màn hình dùng được ở chiều rộng 360px | cả team |

## **4\. Sheet: Backlog**

| ID | Type | Parent | Title | Tier | Priority | SP | Sprint | Status | Thuộc epic | Story | AC | Deps | NFR | Owner |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **S-01** | Story | E-01 | Khung ứng dụng chạy được trên staging | Ready | Must | 3 | 1.0 | Todo | Hạ tầng, CI/CD và môi trường | Là thành viên phát triển tôi muốn có khung ứng dụng chạy được trên staging để mọi story sau đều có chỗ chạy thật thay vì chỉ chạy trên máy cá nhân | Giả sử máy chủ staging đã sẵn sàng, Khi merge vào nhánh chính, Thì pipeline build, chạy test và triển khai tự động, và trang chủ trả về HTTP 200 |  |  |  |

Giả sử một bài test thất bại, Khi pipeline chạy, Thì dừng lại và không triển khai

Giả sử thành viên mới lấy mã nguồn về, Khi chạy lệnh khởi động ghi trong README, Thì ứng dụng và cơ sở dữ liệu chạy được trên máy cá nhân

Giả sử triển khai thất bại giữa chừng, Khi kiểm tra staging, Thì phiên bản cũ vẫn đang chạy | không | bí mật nạp từ biến môi trường; log không in chuỗi kết nối cơ sở dữ liệu | cả team |  
| **S-26** | Story | E-01 | Bộ trụ ảo chạy trong docker-compose và trong CI | Ready | Should | 2 | 3.0 | Todo | Hạ tầng, CI/CD và môi trường | Là thành viên phát triển tôi muốn bật 20 trụ ảo bằng một lệnh và CI tự chạy chúng để mỗi lần sửa mã còn biết có phá vỡ bảo đảm về phiên sạc không, thay vì tin vào lời "trên máy tôi chạy được" | Giả sử đã có docker-compose.yml từ T-01, Khi chạy lệnh khởi động kèm số trụ, Thì đúng số trụ ảo đó nối vào hệ thống và hiện trên màn hình theo dõi

Giả sử một pull request sửa mã xử lý tin nhắn OCPP, Khi CI chạy, Thì kịch bản trụ ảo chạy trọn và pull request bị chặn nếu kịch bản thất bại

Giả sử simulator được cập nhật phiên bản, Khi đổi thẻ phiên bản trong compose, Thì mọi thứ khác không phải sửa | S-21 | kịch bản trụ ảo trong CI chạy xong dưới 5 phút; simulator ghim phiên bản cụ thể | cả team |  
| **S-62** | Story | E-01 | Sao lưu cơ sở dữ liệu hằng ngày và khôi phục được | Later | Should | 3 | *(trống)* | Todo | Hạ tầng, CI/CD và môi trường | Là quản trị hệ thống tôi muốn có bản sao lưu mỗi ngày và đã từng khôi phục thử để mất máy chủ không đồng nghĩa mất lịch sử phiên và số dư ví | Có bản sao lưu mỗi đêm và một lần khôi phục thử thành công lên môi trường trống. Chưa refine — tier Later | S-41 | chưa refine — cần chốt nơi lưu bản sao và thời gian giữ; bản sao chứa dữ liệu cá nhân nên phải mã hoá | chưa phân |  
| **S-02** | Story | E-02 | Đăng nhập bằng email và mật khẩu, khoá tạm khi sai nhiều lần | Ready | Must | 2 | 1.0 | Todo | Tài khoản, đối tác và phân quyền | Là người dùng của hệ thống tôi muốn đăng nhập bằng email và mật khẩu để vào được phần việc của mình mà kẻ đoán mật khẩu không vào được | Giả sử thông tin đúng, Khi đăng nhập, Thì tạo phiên đăng nhập và chuyển tới trang chính của vai trò đó

Giả sử sai mật khẩu, Khi đăng nhập, Thì báo lỗi chung "email hoặc mật khẩu không đúng", không tiết lộ email có tồn tại hay không

Giả sử nhập sai mật khẩu 5 lần liên tiếp, Khi thử lần thứ 6, Thì khoá đăng nhập 15 phút kể cả khi nhập đúng

Giả sử phiên đăng nhập đã hết hạn, Khi gọi API bất kỳ, Thì trả về 401 và chuyển về trang đăng nhập | S-01 | mật khẩu hash bằng argon2id; đếm lần sai theo tài khoản và theo IP | cả team |  
| **S-03** | Story | E-02 | Mỗi vai trò chỉ thấy và thao tác được phần việc của mình | Ready | Must | 2 | 1.0 | Todo | Tài khoản, đối tác và phân quyền | Là chủ trạm tôi muốn dữ liệu trạm và doanh thu của mình không lọt sang đối tác khác để yên tâm đưa trạm lên nền tảng dùng chung | Giả sử tài khoản có vai trò chủ trạm, Khi mở danh sách trạm, Thì chỉ thấy trạm thuộc sở hữu của mình

Giả sử chủ trạm A gọi thẳng API xem trạm của chủ trạm B bằng công cụ dòng lệnh, Khi máy chủ nhận yêu cầu, Thì trả về 403 và ghi nhật ký lần thử đó

Giả sử tài khoản tài xế gọi API dành cho vận hành viên, Khi máy chủ nhận yêu cầu, Thì trả về 403

Giả sử một route mới được thêm mà chưa khai báo quyền, Khi gọi tới, Thì bị từ chối mặc định | S-02 | lọc theo quyền sở hữu ở tầng truy vấn, không lọc ở giao diện | cả team |  
| **S-61** | Story | E-02 | Quản trị viên quản lý tài khoản và gán vai trò | Later | Should | 3 | *(trống)* | Todo | Tài khoản, đối tác và phân quyền | Là quản trị hệ thống tôi muốn tạo, khoá tài khoản và gán vai trò để nhân sự mới vào việc được và người nghỉ không còn vào được | Tạo tài khoản kèm vai trò, khoá tài khoản làm phiên đang mở hết hiệu lực, đổi vai trò có hiệu lực ở lần gọi API kế tiếp. Chưa refine — tier Later | S-03 | chưa refine — cần chốt có cho một tài khoản nhiều vai trò không | chưa phân |  
| **S-04** | Story | E-03 | Chủ trạm tạo và sửa thông tin trạm sạc | Ready | Must | 2 | 1.0 | Todo | Trạm sạc, trụ và đầu nối | Là chủ trạm tôi muốn khai báo trạm với tên, địa chỉ và toạ độ để tài xế tìm thấy trạm và hệ thống biết trạm này thuộc về ai | Giả sử đã đăng nhập bằng vai trò chủ trạm, Khi tạo trạm với tên, địa chỉ và toạ độ hợp lệ, Thì trạm được lưu ở trạng thái chưa hoạt động và gắn với tài khoản của tôi

Giả sử toạ độ nằm ngoài dải hợp lệ, Khi lưu, Thì báo lỗi ngay tại ô toạ độ và không tạo bản ghi

Giả sử trạm đã có, Khi sửa tên hoặc địa chỉ, Thì thay đổi hiện ngay trong danh sách trạm của tôi

Giả sử tôi bấm lưu hai lần liên tiếp, Khi máy chủ xử lý, Thì chỉ tạo một trạm | S-03 | toạ độ lưu ở dạng số thực đủ độ chính xác để tìm trạm gần ở S-47 | cả team |  
| **S-05** | Story | E-03 | Chủ trạm thêm trụ và đầu nối vào trạm, mã trụ là duy nhất | Ready | Must | 1 | 1.0 | Todo | Trạm sạc, trụ và đầu nối | Là chủ trạm tôi muốn khai báo từng trụ với mã định danh và số đầu nối để trụ thật cắm điện xong là nối vào được hệ thống bằng đúng mã đó | Giả sử trạm đã tồn tại, Khi thêm một trụ có mã chưa dùng và số đầu nối từ 1 tới 4, Thì trụ được tạo kèm đúng số đầu nối, mỗi đầu nối ở trạng thái chưa rõ

Giả sử nhập mã trụ đã tồn tại ở bất kỳ trạm nào, Khi lưu, Thì bị chặn kèm thông báo mã đã được dùng

Giả sử trụ đã có phiên sạc, Khi sửa mã định danh của nó, Thì bị chặn kèm lý do | S-04 | ràng buộc unique nằm ở cơ sở dữ liệu, không chỉ kiểm ở form | cả team |  
| **S-66** | Story | E-03 | Chủ trạm đưa trạm vào hoạt động hoặc tạm ngừng | Later | Should | 2 | *(trống)* | Todo | Trạm sạc, trụ và đầu nối | Là chủ trạm tôi muốn bật trạm khi đã lắp xong và tạm ngừng khi bảo trì để tài xế không tới một trạm đang sửa | Trạm tạm ngừng không hiện trong tìm kiếm của tài xế và trụ của nó từ chối phiên mới; phiên đang chạy vẫn kết thúc bình thường. Chưa refine — tier Later | S-47 | chưa refine — cần chốt có cho tạm ngừng từng trụ riêng lẻ không | chưa phân |  
| **K-01** | Spike | E-04 | Trụ sạc ảo nối được vào máy chủ WebSocket tối giản | Ready | Must | 2 | 1.0 | Todo | Kết nối OCPP và phiên sạc | Spike timebox 2 ngày cho 2 người, có người hướng dẫn ngồi cùng buổi đầu. Tải đặc tả OCPP 1.6J, chạy thử một simulator mã nguồn mở, nối nó vào một máy chủ WebSocket tối giản, và ghi lại chuỗi tin nhắn thật của một phiên sạc từ lúc trụ khởi động tới lúc rút súng. Chỉ đọc phần đặc tả của 8 tin nhắn: BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, MeterValues, StopTransaction, Reset. Kết quả quyết định cấu trúc bảng và cách xử lý tin nhắn ở S-06 tới S-21. | Đầu ra là một tài liệu ngắn có: simulator đã chọn kèm lý do, bản ghi chuỗi tin nhắn của một phiên hoàn chỉnh, và danh sách trường dữ liệu của từng tin nhắn mà hệ thống phải lưu | S-01 | không viết mã sản phẩm trong spike; kết quả là kiến thức và mã thử vứt đi được | cả team |  
| **S-06** | Story | E-04 | Trụ đã đăng ký kết nối được qua WebSocket, trụ lạ bị từ chối | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn chỉ những trụ đã đăng ký mới kết nối được vào hệ thống để không ai cắm một thiết bị lạ vào và bơm dữ liệu giả | Giả sử trụ có mã đã đăng ký ở S-05, Khi trụ mở kết nối WebSocket tới đường dẫn chứa mã đó, Thì kết nối được chấp nhận và giữ mở

Giả sử trụ dùng mã không có trong hệ thống, Khi mở kết nối, Thì kết nối bị đóng ngay và một dòng nhật ký ghi mã lạ kèm địa chỉ IP

Giả sử trụ yêu cầu giao thức con khác ocpp1.6, Khi bắt tay WebSocket, Thì bị từ chối

Giả sử trụ thuộc trạm đang tạm ngừng, Khi mở kết nối, Thì vẫn được chấp nhận để báo trạng thái, nhưng không được bắt đầu phiên | S-05, K-01 | mã trụ nằm trong đường dẫn WebSocket phải được kiểm tra, không tin dữ liệu trong thân tin nhắn | cả team |  
| **S-07** | Story | E-04 | Hệ thống đọc và ghi đúng ba loại khung tin nhắn OCPP | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là thành viên phát triển tôi muốn một bộ đọc và ghi khung tin nhắn dùng chung để mọi handler sau chỉ lo nghiệp vụ, không ai phải tự phân tích mảng JSON lần nữa | Giả sử trụ gửi khung CALL hợp lệ, Khi hệ thống nhận, Thì tách được mã tin nhắn, tên hành động và tải, rồi chuyển tới đúng handler theo tên hành động

Giả sử trụ gửi khung sai định dạng hoặc thiếu trường, Khi hệ thống nhận, Thì trả về khung CALLERROR với mã lỗi đúng chuẩn thay vì đóng kết nối

Giả sử trụ gửi tên hành động hệ thống chưa hỗ trợ, Khi hệ thống nhận, Thì trả về CALLERROR mã NotImplemented và ghi log

Giả sử hệ thống gửi CALL xuống trụ, Khi trụ trả CALLRESULT, Thì câu trả lời được khớp đúng với lời gọi theo mã tin nhắn | S-06 | mã tin nhắn của mỗi lời gọi từ máy chủ phải là duy nhất và được lưu để khớp với câu trả lời | cả team |  
| **S-08** | Story | E-04 | Trụ khởi động được chấp nhận qua BootNotification | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn biết trụ vừa bật lên là loại gì, chạy firmware nào để khi trụ lỗi tôi biết mình đang xử lý thiết bị nào | Giả sử trụ đã đăng ký, Khi gửi BootNotification kèm nhà sản xuất và mẫu trụ, Thì hệ thống lưu thông tin đó, trả về Accepted kèm giờ máy chủ và khoảng nhịp tim, và đánh dấu trụ trực tuyến

Giả sử trụ thuộc trạm bị khoá bởi quản trị viên, Khi gửi BootNotification, Thì trả về Rejected và trụ không được coi là trực tuyến

Giả sử trụ gửi BootNotification lần thứ hai trong cùng kết nối, Khi hệ thống nhận, Thì cập nhật thông tin và không tạo bản ghi trụ mới

Giả sử trụ gửi tin nhắn khác trước khi được chấp nhận, Khi hệ thống nhận, Thì trả về CALLERROR mã SecurityError | S-07 | khoảng nhịp tim là tham số cấu hình, không ghi cứng | cả team |  
| **S-09** | Story | E-04 | Trụ báo nhịp tim và thời điểm liên lạc cuối được cập nhật | Ready | Must | 1 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn biết trụ còn liên lạc lần cuối lúc nào để phân biệt trụ đang rảnh với trụ đã chết | Giả sử trụ đang trực tuyến, Khi trụ gửi Heartbeat, Thì cột thời điểm liên lạc cuối đổi và hệ thống trả về giờ hiện tại của máy chủ

Giả sử trụ gửi bất kỳ tin nhắn nào khác, Khi hệ thống nhận, Thì thời điểm liên lạc cuối cũng được cập nhật, không chỉ với Heartbeat

Giả sử đồng hồ của trụ lệch nhiều giờ, Khi trụ gửi Heartbeat, Thì hệ thống vẫn ghi theo giờ máy chủ, không theo giờ trụ | S-08 | chỉ cập nhật một cột, không đọc-sửa-ghi cả bản ghi vì 50 trụ gửi đồng thời | cả team |  
| **S-10** | Story | E-04 | Trụ báo trạng thái từng đầu nối qua StatusNotification | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn biết ngay khi một đầu nối chuyển sang bận, rảnh hay lỗi để không phải ra tận trạm mới biết trụ hỏng | Giả sử trụ gửi StatusNotification báo đầu nối số 1 chuyển sang Charging, Khi hệ thống nhận, Thì trạng thái đầu nối đó đổi trong bảng connectors

Giả sử trụ báo đầu nối lỗi kèm errorCode và vendorErrorCode, Khi hệ thống nhận, Thì lưu mã lỗi và thời điểm để tra cứu sau

Giả sử trụ gửi trạng thái cho connectorId 0, Khi hệ thống nhận, Thì hiểu là trạng thái của cả trụ, không phải một đầu nối

Giả sử trụ gửi trạng thái cho đầu nối không tồn tại trong khai báo, Khi hệ thống nhận, Thì ghi cảnh báo và bỏ qua, không tạo đầu nối mới | S-09 | cập nhật trạng thái không được khoá bảng lâu, vì 50 trụ gửi đồng thời | cả team |  
| **S-11** | Story | E-04 | Vận hành viên xem trạng thái mọi trụ trên một màn hình tự cập nhật | Ready | Must | 3 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn thấy toàn bộ trạm và trụ cùng trạng thái trên một màn hình để phát hiện trụ hỏng mà không phải bấm vào từng cái | Giả sử có 20 trụ đang kết nối, Khi mở màn hình theo dõi, Thì thấy đủ 20 trụ kèm trạng thái từng đầu nối, tải xong dưới 2 giây

Giả sử một đầu nối đổi trạng thái, Khi tôi đang mở màn hình, Thì trạng thái trên màn hình đổi theo trong 1 giây mà tôi không cần tải lại trang

Giả sử một trụ đang ngoại tuyến, Khi xem màn hình, Thì trụ đó hiện rõ là ngoại tuyến kèm thời điểm liên lạc cuối

Giả sử tôi là chủ trạm chứ không phải vận hành viên, Khi mở màn hình, Thì chỉ thấy trụ thuộc trạm của mình

Giả sử kết nối đẩy dữ liệu bị đứt, Khi trình duyệt phát hiện, Thì tự nối lại và tải lại trạng thái đầy đủ | S-10 | lấy trạng thái toàn mạng lưới trong một truy vấn, không gọi một lần cho mỗi trụ | cả team |  
| **S-12** | Story | E-04 | Trụ quá hạn nhịp tim bị đánh dấu ngoại tuyến | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn trụ không còn liên lạc tự chuyển sang ngoại tuyến để màn hình không hiện "rảnh" cho một trụ đã mất điện | Giả sử trụ không gửi tin nhắn nào quá hai lần khoảng nhịp tim đã hẹn, Khi job kiểm tra chạy, Thì trụ chuyển sang ngoại tuyến và mọi đầu nối của nó hiện trạng thái không rõ

Giả sử trụ ngoại tuyến gửi lại nhịp tim, Khi hệ thống nhận, Thì trụ trở lại trực tuyến và đầu nối chờ StatusNotification kế tiếp để có trạng thái thật

Giả sử job kiểm tra không chạy vì tiến trình vừa khởi động lại, Khi mở màn hình, Thì trạng thái ngoại tuyến vẫn đúng vì suy từ thời điểm liên lạc cuối | S-09 | trạng thái ngoại tuyến phải suy ra từ thời điểm liên lạc cuối, không phụ thuộc việc tiến trình kiểm tra có đang chạy hay không | cả team |  
| **S-13** | Story | E-04 | Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng | Ready | Must | 1 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn một trụ chỉ có đúng một kết nối sống để tin nhắn không bị xử lý hai lần khi trụ tự nối lại sau khi rớt mạng | Giả sử trụ đã có kết nối đang mở, Khi cùng mã đó mở kết nối thứ hai, Thì kết nối cũ bị đóng và kết nối mới được dùng

Giả sử kết nối cũ đã chết nhưng máy chủ chưa phát hiện, Khi kết nối mới tới, Thì kết nối mới vẫn được chấp nhận ngay, không chờ hết thời gian chờ

Giả sử kết nối mới tới đúng lúc kết nối cũ đang xử lý dở một tin nhắn, Khi xử lý xong, Thì câu trả lời không bị gửi vào kết nối mới | S-06 | bảng kết nối đang mở sống trong bộ nhớ tiến trình là chấp nhận được vì chỉ chạy một tiến trình; ghi rõ giới hạn này trong README | cả team |  
| **S-14** | Story | E-04 | Tin nhắn trùng mã nhận lại đúng câu trả lời cũ, không xử lý hai lần | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là kế toán đối soát tôi muốn một tin nhắn trụ gửi lại vì mất mạng chỉ được xử lý một lần để phiên sạc và số đo không bị nhân đôi | Giả sử trụ gửi lại cùng một tin nhắn với cùng mã tin nhắn, Khi hệ thống nhận lần thứ hai, Thì trả về đúng câu trả lời cũ và không chạy lại handler

Giả sử tiến trình khởi động lại giữa hai lần gửi, Khi lần thứ hai tới, Thì vẫn nhận ra là trùng vì mã được lưu ở cơ sở dữ liệu

Giả sử hai tin nhắn khác nội dung nhưng trùng mã, Khi hệ thống nhận, Thì trả về câu trả lời của tin đầu và ghi cảnh báo

Giả sử bản ghi mã tin nhắn đã quá 7 ngày, Khi job dọn chạy, Thì bản ghi bị xoá và bảng không phình vô hạn | S-08 | chống trùng dựa trên khoá lưu ở cơ sở dữ liệu, không dựa vào biến trong bộ nhớ tiến trình | cả team |  
| **S-15** | Story | E-04 | Trụ xác thực thẻ tài xế qua Authorize | Ready | Must | 2 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là chủ trạm tôi muốn trụ chỉ cho sạc khi thẻ của tài xế hợp lệ để người không có tài khoản không sạc chùa được | Giả sử thẻ đã gắn với một tài xế đang hoạt động, Khi trụ gửi Authorize với mã thẻ đó, Thì trả về Accepted

Giả sử thẻ bị khoá, Khi trụ gửi Authorize, Thì trả về Blocked

Giả sử thẻ đã quá hạn dùng, Khi trụ gửi Authorize, Thì trả về Expired

Giả sử mã thẻ không có trong hệ thống, Khi trụ gửi Authorize, Thì trả về Invalid và ghi nhật ký lần thử

Giả sử trụ thuộc trạm tạm ngừng, Khi trụ gửi Authorize với thẻ hợp lệ, Thì trả về Blocked | S-08 | mã thẻ là dữ liệu định danh — không ghi nguyên văn vào log, chỉ ghi bốn ký tự cuối | cả team |  
| **S-16** | Story | E-04 | Vận hành viên khởi động lại trụ từ xa bằng Reset | Ready | Should | 1 | 2.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn khởi động lại một trụ đang treo từ màn hình theo dõi để không phải cử người ra tận trạm rút điện | Giả sử trụ đang trực tuyến, Khi tôi bấm khởi động lại và chọn kiểu mềm, Thì hệ thống gửi Reset và hiện xác nhận Accepted từ trụ trong 5 giây

Giả sử trụ đang ngoại tuyến, Khi tôi bấm khởi động lại, Thì nhận thông báo trụ đang ngoại tuyến ngay, không treo chờ

Giả sử trụ không trả lời trong 30 giây, Khi hết thời gian chờ, Thì hiện lỗi hết thời gian và lời gọi bị huỷ | S-11 | đây là lệnh đầu tiên đi từ máy chủ xuống trụ — cơ chế chờ câu trả lời phải viết chung để S-23, S-24 dùng lại | cả team |  
| **S-17** | Story | E-04 | Phiên sạc bắt đầu khi trụ gửi StartTransaction | Ready | Must | 2 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là tài xế tôi muốn quẹt thẻ và cắm súng là phiên sạc bắt đầu để không phải thao tác gì thêm ở trụ | Giả sử thẻ hợp lệ và đầu nối rảnh, Khi trụ gửi StartTransaction kèm số đo đầu, Thì hệ thống tạo phiên ở trạng thái đang sạc, lưu số đo đầu và thời điểm, trả về transactionId do hệ thống cấp cùng Accepted

Giả sử thẻ bị khoá hoặc không tồn tại, Khi trụ gửi StartTransaction, Thì vẫn trả về transactionId nhưng idTagInfo là Blocked/Invalid theo đặc tả, và phiên được đánh dấu cần xem xét

Giả sử đầu nối đó đang có phiên chưa đóng, Khi trụ gửi StartTransaction mới, Thì phiên cũ bị đóng với lý do bất thường rồi phiên mới được tạo, và có cảnh báo

Giả sử trụ gửi lại StartTransaction cùng mã tin nhắn, Khi hệ thống nhận, Thì trả về cùng transactionId cũ theo S-14 | S-15, S-14 | transactionId là số nguyên tăng dần do cơ sở dữ liệu cấp, không dùng thời gian | cả team |  
| **S-18** | Story | E-04 | Phiên sạc kết thúc khi trụ gửi StopTransaction và chốt số kWh | Ready | Must | 2 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là tài xế tôi muốn rút súng là phiên kết thúc và số điện được chốt để tôi biết mình đã sạc bao nhiêu | Giả sử phiên đang sạc, Khi trụ gửi StopTransaction kèm số đo cuối và lý do, Thì phiên chuyển sang đã kết thúc, lưu số đo cuối, thời điểm và lý do, số kWh bằng hiệu số đo cuối trừ số đo đầu chia 1000

Giả sử số đo cuối nhỏ hơn số đo đầu, Khi hệ thống nhận, Thì phiên được đánh dấu cần xem xét với số kWh để trống, không ghi số âm

Giả sử StopTransaction mang transactionId không tồn tại, Khi hệ thống nhận, Thì trả về CALLRESULT theo đặc tả nhưng ghi cảnh báo và lưu tin nhắn vào bảng chờ đối chiếu

Giả sử StopTransaction kèm danh sách số đo trong transactionData, Khi hệ thống nhận, Thì các số đo đó được lưu như MeterValues | S-17 | số kWh của phiên tính bằng hiệu số đo cuối trừ số đo đầu, không cộng dồn từng lần báo | cả team |  
| **S-19** | Story | E-04 | Số đo điện năng được ghi liên tục qua MeterValues | Ready | Must | 2 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là tài xế tôi muốn thấy số điện đã nạp tăng dần trong lúc sạc để biết khi nào đủ để đi tiếp | Giả sử phiên đang sạc, Khi trụ gửi MeterValues có đại lượng Energy.Active.Import.Register, Thì giá trị và mốc thời gian được lưu gắn với phiên

Giả sử MeterValues kèm nhiều đại lượng khác như dòng điện, công suất, Khi hệ thống nhận, Thì chỉ lưu các đại lượng đã biết, bỏ qua phần còn lại không báo lỗi

Giả sử MeterValues tới cho đầu nối không có phiên đang chạy, Khi hệ thống nhận, Thì lưu vào bảng chờ đối chiếu và không tạo phiên

Giả sử trụ gửi số đo mỗi 10 giây cho 20 trụ, Khi hệ thống ghi, Thì thời gian trả lời trụ vẫn dưới 200ms | S-18 | lưu số đo không được làm chậm việc trả lời trụ | cả team |  
| **S-20** | Story | E-04 | Số đo lùi hoặc trùng mốc thời gian bị bỏ qua | Ready | Must | 1 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là kế toán đối soát tôi muốn số đo của một phiên chỉ tăng theo thời gian để hoá đơn không bị tính lùi khi trụ gửi lại dữ liệu cũ | Giả sử số đo mới có mốc thời gian cũ hơn số đo đã lưu của cùng phiên, Khi hệ thống nhận, Thì bỏ qua và ghi cảnh báo, không ghi đè số đo mới hơn

Giả sử số đo mới có mốc thời gian trùng và giá trị trùng với số đo đã lưu, Khi hệ thống nhận, Thì bỏ qua không cảnh báo

Giả sử số đo mới có mốc thời gian mới hơn nhưng giá trị nhỏ hơn số đo đã lưu, Khi hệ thống nhận, Thì lưu nhưng đánh dấu phiên cần xem xét | S-19 | so sánh theo mốc thời gian trong tin nhắn, không theo thời điểm máy chủ nhận được | cả team |  
| **S-21** | Story | E-04 | Phiên đang dở được khôi phục đúng khi trụ nối lại | Ready | Must | 3 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn phiên sạc không bị mất hay nhân đôi khi trụ rớt mạng giữa chừng để khách vẫn được tính đúng số điện đã sạc | Giả sử trụ mất kết nối giữa lúc đang sạc, Khi trụ nối lại và gửi StatusNotification báo đầu nối vẫn Charging, Thì hệ thống giữ nguyên phiên đó thay vì tạo phiên mới

Giả sử trụ mất kết nối rồi phiên kết thúc ở phía trụ khi đang ngoại tuyến, Khi trụ nối lại và gửi StopTransaction tới muộn với đúng transactionId, Thì hệ thống vẫn ghi nhận và tính đúng số kWh

Giả sử trụ nối lại và gửi MeterValues dồn của khoảng thời gian mất mạng, Khi hệ thống nhận, Thì các số đo được lưu theo đúng mốc thời gian trong tin nhắn

Giả sử 20 trụ ảo bị ngắt–nối ngẫu nhiên nhiều lần trong phiên, Khi mọi phiên kết thúc, Thì không phiên nào bị mất, bị nhân đôi, hay sai số kWh

Giả sử trụ nối lại nhưng báo đầu nối đã Available mà hệ thống còn phiên mở, Khi hệ thống nhận, Thì phiên được đánh dấu cần xem xét chứ không tự đóng với số kWh đoán | S-20, S-13 | khớp phiên theo transactionId do hệ thống cấp, không khớp theo thời gian | cả team |  
| **S-23** | Story | E-04 | Vận hành viên dừng phiên sạc từ xa bằng RemoteStopTransaction | Ready | Must | 2 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn dừng một phiên sạc từ xa để xử lý khi trụ có sự cố hoặc khách bỏ xe quá lâu | Giả sử phiên đang sạc và trụ trực tuyến, Khi tôi bấm dừng, Thì hệ thống gửi RemoteStopTransaction, trụ trả Accepted, và phiên chỉ được đóng khi trụ gửi StopTransaction thật với lý do Remote

Giả sử trụ trả Rejected, Khi hệ thống nhận, Thì phiên vẫn đang sạc và tôi thấy thông báo trụ từ chối

Giả sử trụ ngoại tuyến, Khi tôi bấm dừng, Thì báo lỗi ngay chứ không treo, và phiên không đổi trạng thái

Giả sử trụ trả Accepted nhưng không gửi StopTransaction trong 2 phút, Khi hết thời gian, Thì phiên được đánh dấu cần xem xét | S-18, S-16 | phiên dừng bằng lệnh vẫn chốt tiền như phiên dừng bình thường | cả team |  
| **S-25** | Story | E-04 | Phiên không có tin kết thúc quá lâu bị đánh dấu bất thường | Ready | Must | 1 | 3.0 | Todo | Kết nối OCPP và phiên sạc | Là kế toán đối soát tôi muốn phiên treo được lôi ra danh sách riêng để không có phiên nào âm thầm chạy mãi và không bao giờ được tính tiền | Giả sử phiên đang sạc mà trụ ngoại tuyến quá ngưỡng cấu hình, Khi job kiểm tra chạy, Thì phiên chuyển sang bất thường và hiện trong danh sách phiên bất thường

Giả sử phiên bất thường sau đó nhận StopTransaction muộn, Khi hệ thống nhận, Thì phiên đóng bình thường và rời khỏi danh sách

Giả sử vận hành viên đóng tay một phiên bất thường, Khi lưu, Thì phải nhập lý do và số kWh lấy theo số đo cuối cùng đã có | S-21 | ngưỡng thời gian là tham số cấu hình, mặc định 6 giờ | cả team |  
| **S-60** | Story | E-04 | Vận hành viên đổi cấu hình trụ từ xa bằng ChangeConfiguration | Later | Should | 3 | *(trống)* | Todo | Kết nối OCPP và phiên sạc | Là vận hành viên tôi muốn đổi khoảng nhịp tim và chu kỳ gửi số đo của trụ từ xa để không phải ra trạm mỗi khi muốn trụ báo dày hơn hay thưa hơn | Đổi được HeartbeatInterval và MeterValueSampleInterval qua ChangeConfiguration, trụ trả Accepted, và có thể đọc lại bằng GetConfiguration để đối chiếu. Chưa refine — tier Later | S-16 | chưa refine — cần chốt danh sách khoá cấu hình được phép đổi; trụ trả RebootRequired thì phải hỏi người dùng có khởi động lại không | chưa phân |  
| **S-28** | Story | E-05 | Chủ trạm khai báo biểu giá theo kWh và phí chiếm trụ theo phút | Next | Must | 3 | 4.0 | Todo | Biểu giá và tính tiền | Là chủ trạm tôi muốn đặt giá điện theo kWh và phí chiếm trụ theo phút cho trạm của mình để khách trả đúng phần điện đã dùng và không bỏ xe chiếm trụ sau khi sạc xong | Giả sử tôi là chủ trạm, Khi khai báo đơn giá theo kWh và phí theo phút kèm thời gian ân hạn, Thì biểu giá được lưu và gắn với trạm

Giả sử phiên đã sạc xong mà trụ báo đầu nối Finishing hoặc SuspendedEV quá thời gian ân hạn, Khi tính tiền, Thì phí chiếm trụ được tính từ hết ân hạn tới lúc rút súng

Giả sử đơn giá âm hoặc thời gian ân hạn âm, Khi lưu, Thì bị chặn ngay tại ô nhập

Chưa refine đầy đủ — tier Next, SP thô | S-18, S-04 | tiền lưu bằng số nguyên đồng, không dùng số thực | chưa phân |  
| **S-29** | Story | E-05 | Biểu giá có nhiều khung giờ trong ngày, không chồng lấn và phủ kín 24 giờ | Next | Must | 3 | 4.0 | Todo | Biểu giá và tính tiền | Là chủ trạm tôi muốn đặt đơn giá khác nhau theo khung giờ cao điểm và thấp điểm để khuyến khích khách sạc ban đêm | Giả sử tôi khai ba khung giờ 00:00–06:00, 06:00–22:00, 22:00–24:00 với ba đơn giá, Khi lưu, Thì biểu giá được chấp nhận

Giả sử hai khung giờ chồng lấn hoặc còn khoảng trống trong ngày, Khi lưu, Thì bị chặn kèm chỉ rõ khoảng nào bị chồng hoặc hở

Giả sử một khung giờ bắt đầu sau nửa đêm của ngày hôm trước như 22:00–02:00, Khi lưu, Thì được tách thành hai đoạn nội bộ để mọi khung đều nằm trong một ngày

Chưa refine đầy đủ — tier Next, SP thô | S-28 | kiểm phủ kín 24 giờ ở máy chủ, không tin giao diện | chưa phân |  
| **S-30** | Story | E-05 | Phiên cắt qua nhiều khung giờ được chia đoạn và tính đúng từng đoạn | Next | Must | 5 | 4.0 | Todo | Biểu giá và tính tiền | Là tài xế tôi muốn tiền được tính đúng theo giờ tôi thực sự sạc để không bị tính giá cao điểm cho phần sạc ban đêm | Giả sử phiên bắt đầu 21:30 và kết thúc 23:30 với khung giá đổi lúc 22:00, Khi tính tiền, Thì phiên được chia thành hai đoạn và số kWh của mỗi đoạn lấy theo số đo gần ranh giới nhất, nội suy tuyến tính nếu không có số đo đúng mốc

Giả sử phiên nằm trọn trong một khung, Khi tính tiền, Thì chỉ có một đoạn và tổng bằng kWh nhân đơn giá

Giả sử tổng các đoạn sau làm tròn lệch với tổng tính trên cả phiên, Khi tính tiền, Thì làm tròn ở từng đoạn rồi cộng, và quy tắc đó ghi rõ trên hoá đơn

Chưa refine đầy đủ — tier Next, SP thô | S-29, S-19 | thuật toán chia đoạn là hàm thuần, không đọc cơ sở dữ liệu, để test theo bảng | chưa phân |  
| **S-31** | Story | E-05 | Phiên qua nửa đêm tính đúng sang biểu giá ngày hôm sau | Next | Must | 2 | 4.0 | Todo | Biểu giá và tính tiền | Là kế toán đối soát tôi muốn phiên kéo dài qua 0 giờ áp đúng biểu giá của từng ngày để báo cáo theo ngày không bị lệch | Giả sử phiên từ 23:00 tới 01:00, Khi tính tiền, Thì phần trước 0 giờ tính theo biểu giá ngày hôm trước và phần sau tính theo ngày hôm sau, kể cả khi hai ngày có biểu giá khác nhau

Giả sử phiên kéo dài hơn 24 giờ, Khi tính tiền, Thì mỗi ngày là một nhóm đoạn riêng và hoá đơn nhóm theo ngày

Chưa refine đầy đủ — tier Next, SP thô | S-30 | mọi phép chia theo ngày dùng múi giờ của trạm, không dùng UTC | chưa phân |  
| **S-32** | Story | E-05 | Bộ ca kiểm thử tính tiền có đáp án tính tay | Next | Should | 2 | 4.0 | Todo | Biểu giá và tính tiền | Là kế toán đối soát tôi muốn xem được bảng ca kiểm thử với đáp án tính tay để tin bộ tính tiền vì nó khớp với số tôi tự tính, không phải vì nó khớp với chính nó | Giả sử bảng ca kiểm thử có ít nhất 12 ca gồm phiên một khung, cắt ranh giới, qua nửa đêm, có phí chiếm trụ, số đo thưa, Khi chạy bộ test, Thì mọi ca khớp đáp án tính tay từng đồng

Giả sử một ca sai, Khi test chạy, Thì thông báo nêu rõ ca nào, đoạn nào, chênh bao nhiêu

Chưa refine đầy đủ — tier Next, SP thô | S-31 | đáp án tính tay lưu trong tệp riêng có tên người tính và ngày, không sinh bằng mã | chưa phân |  
| **S-33** | Story | E-05 | Tài xế xem hoá đơn có diễn giải từng đoạn giá | Next | Must | 3 | 4.0 | Todo | Biểu giá và tính tiền | Là tài xế tôi muốn thấy tiền được tính ra sao để tin vào con số thay vì phải chấp nhận một tổng số không giải thích | Giả sử phiên đã kết thúc, Khi mở hoá đơn, Thì thấy từng đoạn kèm khoảng thời gian, số kWh, đơn giá, thành tiền, dòng phí chiếm trụ nếu có, và tổng cộng

Giả sử biểu giá đã đổi sau phiên, Khi mở lại hoá đơn, Thì vẫn hiện đúng đơn giá tại thời điểm sạc

Giả sử phiên đang ở trạng thái cần xem xét, Khi mở hoá đơn, Thì thấy thông báo đang chờ xử lý thay vì một số tiền tạm

Chưa refine đầy đủ — tier Next, SP thô | S-30, S-22 | hoá đơn lưu thành bản ghi bất biến khi phiên kết thúc, không tính lại mỗi lần mở | chưa phân |  
| **S-34** | Story | E-05 | Đổi biểu giá không làm đổi tiền của phiên đã kết thúc | Next | Should | 2 | 4.0 | Todo | Biểu giá và tính tiền | Là chủ trạm tôi muốn đổi biểu giá từ một ngày trong tương lai để khách đang sạc hôm nay không bị đổi giá giữa chừng | Giả sử tôi tạo biểu giá mới có hiệu lực từ ngày mai, Khi lưu, Thì phiên hôm nay vẫn tính theo biểu giá cũ và phiên ngày mai theo biểu giá mới

Giả sử tôi cố đặt ngày hiệu lực trong quá khứ, Khi lưu, Thì bị chặn

Chưa refine đầy đủ — tier Next, SP thô | S-33 | biểu giá cũ không bị xoá, chỉ hết hiệu lực; mọi hoá đơn tham chiếu tới phiên bản biểu giá cụ thể | chưa phân |  
| **S-65** | Story | E-05 | Gói thuê bao tháng với biểu giá riêng | Later | Could | 3 | *(trống)* | Todo | Biểu giá và tính tiền | Là tài xế đi nhiều tôi muốn mua gói tháng để được đơn giá thấp hơn để tiết kiệm khi sạc thường xuyên | Tài xế có gói còn hạn được áp biểu giá của gói thay vì biểu giá trạm, và hoá đơn ghi rõ đang áp gói nào. Chưa refine — tier Later | S-34, S-37 | chưa refine — cần chốt gói áp cho mọi trạm hay từng chủ trạm, và cách chia doanh thu gói cho đối tác | chưa phân |  
| **S-35** | Story | E-06 | Tài xế nạp tiền vào ví qua cổng thanh toán sandbox | Next | Must | 5 | 5.0 | Todo | Ví và thanh toán | Là tài xế tôi muốn nạp tiền vào ví bằng cổng thanh toán để sạc xong là trừ luôn, không phải thao tác thanh toán mỗi lần | Giả sử tôi chọn số tiền nạp hợp lệ, Khi bấm nạp, Thì hệ thống tạo giao dịch chờ và chuyển tôi sang trang cổng sandbox

Giả sử cổng gửi webhook xác nhận thành công, Khi hệ thống nhận và kiểm chữ ký đúng, Thì số dư tăng đúng số tiền và giao dịch chuyển sang thành công

Giả sử tôi quay về ứng dụng trước khi webhook tới, Khi mở ví, Thì thấy giao dịch đang chờ, số dư chưa tăng, và số dư tự cập nhật khi webhook tới

Giả sử cổng báo thất bại hoặc tôi huỷ, Khi hệ thống nhận, Thì số dư không đổi và giao dịch ghi lý do

Chưa refine đầy đủ — tier Next, SP thô; cổng cụ thể chốt khi có tài khoản sandbox, xem R-02 | S-33 | số dư chỉ tăng khi có webhook đã kiểm chữ ký, không tăng theo trang quay về | chưa phân |  
| **S-36** | Story | E-06 | Quản trị viên nạp tay vào ví khi chưa có cổng thanh toán | Next | Should | 2 | 5.0 | Todo | Ví và thanh toán | Là quản trị hệ thống tôi muốn cộng tiền vào ví tài xế theo phiếu thu để toàn bộ luồng trừ ví và đối soát vẫn chạy được trong lúc chờ tài khoản sandbox | Giả sử tôi nhập số tiền và mã phiếu thu, Khi xác nhận, Thì số dư tăng và sổ cái ghi một dòng có loại nạp tay kèm người thực hiện và mã phiếu

Giả sử nhập lại cùng mã phiếu thu, Khi xác nhận, Thì bị chặn vì mã đã dùng

Chưa refine đầy đủ — tier Next, SP thô | S-41 | chỉ vai trò quản trị có quyền; mọi lần nạp tay hiện trong nhật ký S-56 | chưa phân |  
| **S-37** | Story | E-06 | Ví bị trừ tự động khi phiên kết thúc, có bản ghi giao dịch | Next | Must | 3 | 5.0 | Todo | Ví và thanh toán | Là tài xế tôi muốn tiền tự trừ khi sạc xong để rút súng là đi được ngay | Giả sử phiên kết thúc và hoá đơn đã lập, Khi hệ thống xử lý, Thì ví bị trừ đúng tổng hoá đơn và sổ cái có một dòng tham chiếu tới phiên

Giả sử hai phiên của cùng tài xế kết thúc cùng lúc, Khi hệ thống xử lý, Thì cả hai đều được trừ và số dư cuối bằng số dư đầu trừ tổng hai hoá đơn

Giả sử ví không đủ tiền cho phiên vừa xong, Khi hệ thống xử lý, Thì vẫn trừ để số dư âm và tài khoản bị đánh dấu nợ cho tới khi nạp bù

Chưa refine đầy đủ — tier Next, SP thô | S-33, S-41 | trừ ví và lập hoá đơn nằm trong một giao dịch; một phiên không bao giờ bị trừ hai lần | chưa phân |  
| **S-38** | Story | E-06 | Ví dưới ngưỡng tối thiểu thì trụ từ chối bắt đầu phiên mới | Next | Should | 2 | 5.0 | Todo | Ví và thanh toán | Là chủ trạm tôi muốn chặn phiên mới khi ví khách không đủ tiền để không bị nợ khó đòi | Giả sử số dư dưới ngưỡng tối thiểu cấu hình được, Khi trụ gửi Authorize hoặc tài xế bấm bắt đầu trên ứng dụng, Thì trả về Blocked và ứng dụng hiện lý do cùng nút nạp tiền

Giả sử số dư vừa đủ ngưỡng, Khi bắt đầu phiên, Thì được chấp nhận

Chưa refine đầy đủ — tier Next, SP thô | S-37, S-24 | ngưỡng là tham số cấu hình toàn hệ thống, mặc định bằng tiền của 5 kWh theo giá cao nhất | chưa phân |  
| **S-39** | Story | E-06 | Webhook nạp ví gửi lại nhiều lần chỉ ghi nhận một, sai chữ ký bị từ chối | Next | Must | 3 | 5.0 | Todo | Ví và thanh toán | Là kế toán đối soát tôi muốn một lần nạp chỉ vào ví một lần để sổ sách không sai | Giả sử cổng gửi lại cùng webhook 5 lần, Khi hệ thống nhận, Thì số dư chỉ tăng một lần và năm lần đều trả về thành công cho cổng

Giả sử webhook có chữ ký sai hoặc thiếu, Khi hệ thống nhận, Thì trả về 401, không đổi số dư, và ghi nhật ký kèm IP

Giả sử webhook tới cho giao dịch không tồn tại, Khi hệ thống nhận, Thì trả về 404 và ghi cảnh báo

Chưa refine đầy đủ — tier Next, SP thô | S-35 | chống trùng theo mã giao dịch của cổng, lưu ở cơ sở dữ liệu — cùng nguyên tắc với S-14 | chưa phân |  
| **S-40** | Story | E-06 | Tài xế xem số dư và lịch sử giao dịch ví | Next | Should | 2 | 5.0 | Todo | Ví và thanh toán | Là tài xế tôi muốn xem số dư và từng lần nạp, từng lần trừ để đối chiếu với hoá đơn khi thấy số dư khác mình nghĩ | Giả sử tôi mở ví, Khi trang tải, Thì thấy số dư hiện tại và danh sách giao dịch mới nhất trước, mỗi dòng có loại, số tiền, thời điểm và liên kết tới phiên hoặc lần nạp

Giả sử tôi gọi API ví bằng mã tài xế khác, Khi máy chủ nhận, Thì trả về 403

Chưa refine đầy đủ — tier Next, SP thô | S-37 | phân trang 50 dòng | chưa phân |  
| **S-41** | Story | E-06 | Số dư ví luôn khớp sổ cái chỉ ghi thêm | Next | Must | 3 | 5.0 | Todo | Ví và thanh toán | Là kế toán đối soát tôi muốn mọi biến động số dư là một dòng sổ cái không sửa được và số dư suy ra từ sổ để không bao giờ có con số nào không giải thích được | Giả sử có bất kỳ thao tác nạp hay trừ nào, Khi hệ thống ghi, Thì chỉ chèn một dòng vào bảng sổ cái, không cập nhật tại chỗ

Giả sử job kiểm định chạy, Khi so tổng sổ cái với số dư đang hiển thị của từng ví, Thì mọi ví khớp; ví lệch được báo và khoá giao dịch mới cho tới khi người xử lý

Giả sử hai giao dịch ghi đồng thời vào cùng ví, Khi cả hai hoàn tất, Thì không dòng nào bị mất

Chưa refine đầy đủ — tier Next, SP thô | S-25 | bảng sổ cái chỉ có quyền chèn và đọc từ ứng dụng, giống audit\_logs ở T-57 | chưa phân |  
| **S-48** | Story | E-07 | Tài xế đặt chỗ một trụ trong khoảng thời gian | Later | Should | 5 | 7.0 | Todo | Đặt chỗ trụ sạc | Là tài xế tôi muốn đặt trước một trụ để đi tới nơi là có chỗ sạc, không phải chờ | Chọn trụ và giờ tới trong vòng 2 giờ tới; hệ thống gửi ReserveNow với thẻ của tôi và hạn giữ, trụ trả Accepted thì chỗ được giữ và đầu nối hiện Reserved; trụ trả Occupied hoặc Rejected thì báo ngay. Chưa refine — tier Later | S-47, S-38 | chưa refine — cần chốt độ dài giữ chỗ tối đa và có thu phí đặt trước không | chưa phân |  
| **S-49** | Story | E-07 | Hai tài xế đặt cùng trụ cùng lúc thì chỉ một người thành công | Later | Should | 3 | 7.0 | Todo | Đặt chỗ trụ sạc | Là tài xế tôi muốn chắc chắn chỗ mình đặt là của mình để không tới nơi mới biết trụ đã có người | Nhiều yêu cầu đặt chỗ đồng thời vào cùng trụ và cùng khoảng thời gian thì đúng một thành công nhờ ràng buộc ở cơ sở dữ liệu, các yêu cầu còn lại nhận thông báo trụ đã được đặt kèm gợi ý trụ khác. Chưa refine — tier Later | S-48 | chưa refine — bảo đảm chống trùng phải nằm ở tầng cơ sở dữ liệu, cùng nguyên tắc với S-14, không dựa vào khoá trong bộ nhớ | chưa phân |  
| **S-50** | Story | E-07 | Giữ chỗ quá giờ không tới thì bị huỷ và tính phí | Later | Could | 3 | 7.0 | Todo | Đặt chỗ trụ sạc | Là chủ trạm tôi muốn thu phí khi khách đặt chỗ rồi không tới để trụ không bị giữ vô ích | Quá hạn giữ mà chưa bắt đầu phiên thì đặt chỗ chuyển sang quá hạn, trụ nhận CancelReservation và mở lại, ví bị trừ phí không đến theo cấu hình của trạm và có dòng sổ cái. Chưa refine — tier Later | S-49 | chưa refine — cần chốt mức phí và có miễn phí lần đầu không | chưa phân |  
| **S-51** | Story | E-07 | Tài xế huỷ chỗ đã đặt và trụ mở lại cho người khác | Later | Could | 3 | 7.0 | Todo | Đặt chỗ trụ sạc | Là tài xế tôi muốn huỷ chỗ khi đổi kế hoạch để không bị tính phí không đến | Huỷ trước hạn thì hệ thống gửi CancelReservation, đầu nối về Available, không tính phí; huỷ sau khi đã quá hạn thì không được vì đã tính phí. Chưa refine — tier Later | S-50 | chưa refine — cần chốt có cho huỷ miễn phí tới sát giờ không | chưa phân |  
| **S-42** | Story | E-08 | Chủ trạm đặt hạn mức công suất cho trạm | Later | Must | 3 | 6.0 | Todo | Phân bổ công suất | Là chủ trạm tôi muốn khai báo công suất tối đa của trạm và công suất danh định của từng trụ để hệ thống biết ranh giới cần giữ | Khai được hạn mức trạm tính bằng kW và công suất danh định từng đầu nối; tổng danh định lớn hơn hạn mức được cho phép và hiện cảnh báo trạm đang quá đăng ký. Chưa refine — tier Later | S-05 | chưa refine — cần chốt đơn vị nhập là kW hay A theo pha | chưa phân |  
| **S-43** | Story | E-08 | Tổng công suất cấp cho các trụ đang sạc không vượt hạn mức trạm | Later | Must | 5 | 6.0 | Todo | Phân bổ công suất | Là chủ trạm tôi muốn trạm không bao giờ vượt công suất cho phép để không bị nhảy cầu dao và không bị phạt tiền điện công suất | Khi một phiên bắt đầu làm tổng danh định các phiên đang chạy vượt hạn mức, hệ thống gửi SetChargingProfile xuống các trụ để tổng giới hạn bằng hoặc dưới hạn mức, chia đều theo số phiên; trụ trả Rejected thì phiên đó bị dừng và có cảnh báo. Chưa refine — tier Later | S-42, S-17 | chưa refine — cần chốt cách chia: chia đều, ưu tiên xe sắp đầy, hay ưu tiên theo hạng khách; simulator phải tôn trọng hồ sơ sạc (R-08) | chưa phân |  
| **S-44** | Story | E-08 | Công suất được chia lại khi có xe vào hoặc rời trạm | Later | Should | 5 | 6.0 | Todo | Phân bổ công suất | Là tài xế tôi muốn được cấp thêm công suất khi xe khác rút ra để sạc nhanh hơn khi trạm vắng | Xe rời trạm hoặc phiên chuyển sang SuspendedEV thì trong 30 giây các phiên còn lại nhận hồ sơ sạc mới với giới hạn cao hơn; không gửi hồ sơ mới nếu giới hạn không đổi. Chưa refine — tier Later | S-43 | chưa refine — cần chốt tần suất chia lại tối thiểu để không gửi lệnh liên tục xuống trụ | chưa phân |  
| **S-45** | Story | E-08 | Chủ trạm đặt hạn mức công suất theo khung giờ | Later | Could | 3 | 6.0 | Todo | Phân bổ công suất | Là chủ trạm tôi muốn hạ hạn mức công suất vào giờ cao điểm của lưới điện để giảm chi phí tiền điện | Khai được hạn mức khác nhau theo khung giờ; tới ranh giới khung thì các phiên đang chạy nhận hồ sơ sạc mới theo hạn mức mới. Chưa refine — tier Later | S-44, S-29 | chưa refine — cần chốt xử lý khi hạn mức hạ xuống lúc số phiên đang chạy đã vượt | chưa phân |  
| **S-52** | Story | E-09 | Chủ trạm xem doanh thu và sản lượng kWh theo kỳ, theo từng trụ | Later | Must | 3 | 8.0 | Todo | Đối soát và chia doanh thu | Là chủ trạm tôi muốn biết trạm của mình bán được bao nhiêu điện và thu bao nhiêu tiền theo ngày, tuần, tháng để quyết định có đầu tư thêm trụ không | Bảng theo kỳ tự chọn có số phiên, tổng kWh, tổng tiền, phí chiếm trụ, chia theo từng trụ; chỉ thấy trạm của mình. Chưa refine — tier Later | S-37 | chưa refine — cần chốt kỳ mặc định và có cần biểu đồ không | chưa phân |  
| **S-53** | Story | E-09 | Kế toán đối soát tổng kWh đã cấp với tổng tiền đã thu | Later | Must | 5 | 8.0 | Todo | Đối soát và chia doanh thu | Là kế toán đối soát tôi muốn kiểm tra tiền thu khớp với điện đã bán trong kỳ để phát hiện phiên tính sai hoặc thất thoát | Báo cáo kỳ liệt kê phiên có kWh mà không có hoá đơn, có hoá đơn mà không có dòng sổ cái, hoặc tiền hoá đơn lệch với tính lại từ biểu giá; tổng chênh lệch và danh sách phiên cần xem xét hiện ở đầu báo cáo. Chưa refine — tier Later | S-52, S-41 | chưa refine — cần chốt ngưỡng chênh lệch coi là chấp nhận được do làm tròn | chưa phân |  
| **S-54** | Story | E-09 | Chia doanh thu cho đối tác theo tỉ lệ hợp đồng | Later | Should | 3 | 8.0 | Todo | Đối soát và chia doanh thu | Là kế toán đối soát tôi muốn tính phần doanh thu của từng chủ trạm để chi trả đúng hợp đồng | Mỗi chủ trạm có tỉ lệ chia khai trong hồ sơ đối tác; cuối kỳ hệ thống tính số tiền phải trả cho từng đối tác từ doanh thu đã đối soát và lập bảng kê. Chưa refine — tier Later | S-53 | chưa refine — cần chốt cách xử lý khi tỉ lệ hợp đồng đổi giữa kỳ và phần phí chiếm trụ có chia không | chưa phân |  
| **S-55** | Story | E-09 | Kỳ đối soát được chốt và khoá | Later | Should | 3 | 8.0 | Todo | Đối soát và chia doanh thu | Là kế toán đối soát tôi muốn chốt kỳ sau khi đối soát xong để không ai sửa được phiên hay hoá đơn của kỳ đã báo cáo | Chốt kỳ làm mọi phiên, hoá đơn và dòng sổ cái trong kỳ trở thành chỉ đọc; phiên bất thường chưa xử lý thì không cho chốt; mở lại kỳ cần vai trò quản trị và được ghi nhật ký. Chưa refine — tier Later | S-53 | chưa refine — cần chốt kỳ theo tháng dương lịch hay theo hợp đồng | chưa phân |  
| **S-58** | Story | E-09 | Xuất báo cáo doanh thu và đối soát ra tệp CSV | Later | Could | 2 | *(trống)* | Todo | Đối soát và chia doanh thu | Là kế toán đối soát tôi muốn tải báo cáo dạng CSV để đưa vào phần mềm kế toán đang dùng | Xuất được báo cáo S-52 và S-53 ra CSV có mã hoá UTF-8 kèm BOM để mở đúng tiếng Việt trong Excel. Chưa refine — tier Later | S-53 | chưa refine — cần chốt danh sách cột theo phần mềm kế toán đích | chưa phân |  
| **S-27** | Story | E-10 | Mọi lệnh điều khiển từ xa được ghi nhật ký kèm người thực hiện | Ready | Should | 1 | 3.0 | Todo | Giám sát vận hành và bảo vệ dữ liệu cá nhân | Là quản trị hệ thống tôi muốn biết ai đã khởi động lại trụ hay dừng phiên nào lúc nào để trả lời được khi chủ trạm hỏi vì sao khách của họ bị ngắt sạc | Giả sử vận hành viên gửi Reset hoặc RemoteStopTransaction, Khi lệnh được gửi, Thì có một dòng nhật ký ghi người, lệnh, trụ hoặc phiên, thời điểm, và kết quả trụ trả về

Giả sử quản trị viên mở trang nhật ký, Khi lọc theo trụ hoặc theo người trong một khoảng thời gian, Thì thấy đúng các dòng liên quan

Giả sử ai đó cố sửa hoặc xoá một dòng nhật ký qua API, Khi máy chủ nhận, Thì trả về 405 | S-23 | bảng nhật ký chỉ có quyền chèn và đọc từ ứng dụng | cả team |  
| **S-46** | Story | E-10 | Cảnh báo khi trụ ngoại tuyến quá lâu hoặc báo lỗi liên tục | Later | Should | 3 | 6.0 | Todo | Giám sát vận hành và bảo vệ dữ liệu cá nhân | Là vận hành viên tôi muốn được báo khi trụ hỏng để cử người đi sửa trước khi khách phàn nàn | Trụ ngoại tuyến quá ngưỡng hoặc có quá số lần lỗi trong connector\_errors trong khoảng thời gian cấu hình thì sinh một cảnh báo hiện ở đầu màn hình theo dõi và gửi email; cùng một trụ không tạo cảnh báo mới cho tới khi cảnh báo cũ được đóng. Chưa refine — tier Later | S-12, S-10 | chưa refine — cần chốt ngưỡng và kênh nhận ngoài email | chưa phân |  
| **S-56** | Story | E-10 | Nhật ký thao tác trên giao dịch ví truy được ai làm gì | Later | Should | 3 | 8.0 | Todo | Giám sát vận hành và bảo vệ dữ liệu cá nhân | Là quản trị hệ thống tôi muốn truy được ai đã nạp tay, ai đã điều chỉnh ví nào lúc nào để điều tra khi có khiếu nại về số dư | Mọi nạp tay, điều chỉnh, mở khoá ví đều có dòng trong audit\_logs với người, số tiền, lý do; trang nhật ký S-27 lọc thêm được theo tài xế. Chưa refine — tier Later | S-27, S-36 | chưa refine — cần chốt thời gian lưu nhật ký theo yêu cầu kế toán | chưa phân |  
| **S-57** | Story | E-10 | Tài xế yêu cầu xoá dữ liệu cá nhân và lịch sử di chuyển | Later | Must | 3 | 8.0 | Todo | Giám sát vận hành và bảo vệ dữ liệu cá nhân | Là tài xế tôi muốn yêu cầu xoá thông tin cá nhân và lịch sử sạc của mình để thực hiện quyền theo Nghị định 13/2023/NĐ-CP | Sau khi yêu cầu được duyệt, không truy được tài xế đã sạc ở đâu lúc nào — phiên và hoá đơn được ẩn danh hoá thay vì xoá — nhưng số liệu doanh thu tổng hợp và sổ cái vẫn nguyên; ví còn số dư dương thì phải xử lý hoàn tiền trước. Chưa refine — tier Later | S-55 | chưa refine — cần người có thẩm quyền xác nhận phạm vi dữ liệu phải xoá và dữ liệu phải giữ theo luật kế toán. **Skill không đưa tư vấn pháp lý** | chưa phân |  
| **S-63** | Story | E-10 | Bảng sức khoẻ hệ thống: trụ trực tuyến, phiên đang chạy, lỗi gần đây | Later | Could | 3 | *(trống)* | Todo | Giám sát vận hành và bảo vệ dữ liệu cá nhân | Là quản trị hệ thống tôi muốn một trang tổng quan số trụ trực tuyến, số phiên đang chạy, số tin nhắn lỗi 5 phút qua và độ trễ trả lời trụ để biết hệ thống có ổn trước khi có người gọi báo | Trang tự cập nhật mỗi 30 giây với bốn con số trên và biểu đồ 24 giờ gần nhất. Chưa refine — tier Later | S-46 | chưa refine — cần chốt có xuất số liệu cho công cụ giám sát ngoài không | chưa phân |  
| **S-22** | Story | E-11 | Tài xế xem phiên đang sạc của mình cập nhật theo thời gian thực | Ready | Must | 2 | 3.0 | Todo | Ứng dụng tài xế | Là tài xế tôi muốn thấy số điện đã nạp và thời gian đã sạc tăng dần trên điện thoại để đi uống cà phê mà vẫn biết khi nào nên quay lại | Giả sử tôi có một phiên đang sạc, Khi mở ứng dụng, Thì thấy ngay trụ, thời điểm bắt đầu, số kWh mới nhất và thời gian đã sạc

Giả sử trụ gửi số đo mới, Khi tôi đang mở màn hình, Thì số kWh đổi trong 2 giây mà không cần tải lại

Giả sử tôi không có phiên nào đang sạc, Khi mở ứng dụng, Thì thấy thông báo không có phiên và lối tắt tới tìm trạm

Giả sử tôi gọi API phiên bằng mã phiên của tài xế khác, Khi máy chủ nhận, Thì trả về 403 | S-19 | phiên tra theo tài xế đang đăng nhập, không nhận mã phiên từ trình duyệt làm nguồn sự thật | cả team |  
| **S-24** | Story | E-11 | Tài xế bắt đầu phiên từ ứng dụng bằng RemoteStartTransaction | Ready | Should | 2 | 3.0 | Todo | Ứng dụng tài xế | Là tài xế tôi muốn bấm bắt đầu sạc trên điện thoại sau khi cắm súng để không cần mang thẻ | Giả sử đầu nối đang rảnh và tôi đã cắm súng, Khi bấm bắt đầu sạc, Thì hệ thống gửi RemoteStartTransaction với thẻ ảo của tôi, trụ trả Accepted, và phiên xuất hiện khi trụ gửi StartTransaction

Giả sử trụ trả Rejected, Khi hệ thống nhận, Thì tôi thấy thông báo trụ từ chối và gợi ý kiểm tra súng đã cắm chưa

Giả sử đầu nối đang bận hoặc đang được đặt chỗ bởi người khác, Khi bấm bắt đầu, Thì bị chặn ngay ở máy chủ, không gửi lệnh xuống trụ

Giả sử trụ trả Accepted nhưng không gửi StartTransaction trong 60 giây, Khi hết thời gian, Thì tôi thấy thông báo chưa bắt đầu được và có thể thử lại | S-17, S-16 | mỗi tài xế có một thẻ ảo trong id\_tags để đi chung đường xác thực với thẻ vật lý | cả team |  
| **S-47** | Story | E-11 | Tài xế tìm trạm gần và thấy đầu nối nào đang rảnh | Later | Should | 5 | 7.0 | Todo | Ứng dụng tài xế | Là tài xế tôi muốn tìm trạm gần vị trí của mình và biết trạm nào còn đầu nối rảnh để không lái tới một trạm đang kín chỗ | Danh sách trạm đang hoạt động sắp theo khoảng cách từ vị trí trình duyệt cung cấp, mỗi trạm hiện số đầu nối rảnh trên tổng số, loại đầu nối, và đơn giá hiện tại; không có vị trí thì cho tìm theo tên hoặc địa chỉ. Chưa refine — tier Later | S-22, S-29 | chưa refine — không làm định tuyến bản đồ; cần chốt có nhúng bản đồ tĩnh không | chưa phân |  
| **S-59** | Story | E-11 | Tài xế nhận thông báo khi phiên kết thúc hoặc bị dừng | Later | Should | 3 | *(trống)* | Todo | Ứng dụng tài xế | Là tài xế tôi muốn được báo khi sạc xong hoặc bị vận hành viên dừng để quay lại lấy xe trước khi bị tính phí chiếm trụ | Phiên kết thúc, bị dừng từ xa, hoặc bắt đầu tính phí chiếm trụ thì tài xế nhận thông báo trong ứng dụng và email kèm số kWh và tiền tạm tính. Chưa refine — tier Later | S-37 | chưa refine — cần chốt có làm thông báo đẩy trình duyệt không | chưa phân |  
| **S-64** | Story | E-11 | Tài xế xem lịch sử phiên sạc của mình | Later | Should | 3 | *(trống)* | Todo | Ứng dụng tài xế | Là tài xế tôi muốn xem lại các phiên đã sạc kèm hoá đơn để đối chiếu chi tiêu theo tháng | Danh sách phiên đã kết thúc mới nhất trước, mỗi dòng có trạm, thời gian, kWh, tiền, và mở được hoá đơn S-33; lọc theo tháng. Chưa refine — tier Later | S-33 | chưa refine — cần chốt có cho tải hoá đơn PDF không | chưa phân |

## **5\. Sheet: Tasks**

| ID | Parent | Title | Sprint | Status | Story | AC | Deps | NFR | Owner |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **T-01** | S-01 | Dựng khung dự án và kết nối cơ sở dữ liệu | 1 | Todo | Khởi tạo dự án, cấu hình kết nối PostgreSQL, chạy được migration đầu tiên. Viết docker-compose.yml gồm ứng dụng và cơ sở dữ liệu để cả team dùng chung một cấu hình. Migration này là mẫu đặt tên bảng và cột cho mọi migration sau — đặt tên theo snake\_case, khoá chính id, cột thời gian created\_at/updated\_at. | Chạy docker compose up rồi khởi động ứng dụng thì kết nối được cơ sở dữ liệu, migration chạy sạch và chạy lùi được | không | chuỗi kết nối đọc từ biến môi trường | cả team |
| **T-02** | S-01 | Pipeline CI chạy build, lint, test | 1 | Todo | Cấu hình CI chạy build, lint, test trên mỗi push và mỗi pull request. Tạo sẵn một test đơn vị rỗng làm chỗ cho test sau bám vào. | Push commit cố ý sai lint thì pipeline đỏ và chặn merge; commit sạch thì xanh dưới 5 phút | T-01 | pipeline chạy xong dưới 5 phút để không làm chậm nhịp sprint 1 tuần | cả team |
| **T-03** | S-01 | Triển khai tự động lên staging bằng Docker | 1 | Todo | Đóng gói ứng dụng thành image, đẩy lên máy chủ riêng, chạy bằng Docker. Nối vào pipeline ở T-02 sau bước test. Viết bước kiểm sức khoẻ: gọi trang chủ, không trả 200 thì giữ container cũ. | Merge vào nhánh chính thì staging chạy phiên bản mới trong 10 phút, không cần thao tác tay; triển khai hỏng thì phiên bản cũ còn nguyên | T-02 | triển khai thất bại thì giữ nguyên phiên bản cũ | cả team |
| **T-55** | S-26 | Dịch vụ trụ ảo trong docker-compose với số lượng cấu hình được | 3 | Todo | Thêm dịch vụ simulator đã chọn ở K-01 vào docker-compose.yml, nhận biến môi trường số trụ và địa chỉ máy chủ. Mỗi trụ ảo dùng một mã đã seed sẵn trong bảng charge\_points. | Chạy với số trụ 20 thì màn hình theo dõi hiện 20 trụ trực tuyến trong vòng 1 phút | T-46 | mã trụ ảo seed tách khỏi dữ liệu thật bằng tiền tố riêng | cả team |
| **T-56** | S-26 | Bước CI chạy kịch bản 20 trụ ảo và chặn merge khi thất bại | 3 | Todo | Thêm bước vào pipeline ở T-02: dựng ứng dụng và trụ ảo, chạy kịch bản ngắt–nối ở T-46, đọc kết quả. Chạy sau bước test đơn vị để không tốn thời gian khi test đơn vị đã đỏ. | Cố ý làm sai phần khôi phục phiên thì pull request bị chặn kèm log nêu phiên nào sai | T-55 | log kết quả ghi mã phiên và số kWh mong đợi so với thực tế | cả team |
| **T-04** | S-02 | Bảng users, roles kèm migration và seed năm vai trò | 1 | Todo | Thêm bảng users, roles, bảng nối user\_roles. Seed sẵn năm vai trò: tài xế, chủ trạm, vận hành viên, kế toán, quản trị. Đặt tên cột theo mẫu migration ở T-01. | Migration tiến và lùi được; users.email có ràng buộc unique; sau seed có đúng năm dòng trong roles | T-01 | cột mật khẩu đủ dài cho hash argon2id | cả team |
| **T-05** | S-02 | Form đăng nhập, tạo phiên, đếm lần sai và khoá tạm | 1 | Todo | Form đăng nhập, kiểm tra thông tin, tạo phiên đăng nhập bằng cookie httpOnly. Lưu số lần sai và thời điểm khoá vào bảng users, không lưu trong bộ nhớ tiến trình. Bố cục form này là mẫu cho mọi form sau. | Đăng nhập đúng thì vào trang chính; sai 5 lần thì lần thứ 6 bị khoá 15 phút; khởi động lại ứng dụng thì khoá vẫn còn | T-04 | thông báo lỗi không tiết lộ email có tồn tại hay không | cả team |
| **T-06** | S-03 | Middleware kiểm vai trò, mặc định từ chối route chưa khai quyền | 1 | Todo | Một lớp middleware kiểm vai trò trước khi vào handler, thay vì rải lệnh if trong từng handler. Route khai báo vai trò được phép bằng một khai báo ngắn cạnh định nghĩa route; không khai thì chặn. | Gọi route chưa khai quyền bằng tài khoản quản trị vẫn nhận 403; khai quyền xong thì đúng vai trò mới qua được | T-05 | mặc định là từ chối — route mới không khai báo quyền thì bị chặn | cả team |
| **T-07** | S-03 | Lọc theo quyền sở hữu ở tầng truy vấn và test 403 bằng curl | 1 | Todo | Viết hàm truy vấn dùng chung nhận tài khoản hiện tại và tự thêm điều kiện chủ sở hữu vào mọi truy vấn trạm. Viết test gọi API bằng hai tài khoản chủ trạm khác nhau. Xem cách T-06 lấy tài khoản hiện tại để dùng lại. | Chủ trạm A gọi API trạm của B bằng curl nhận 403 và có một dòng nhật ký; test tự động phủ ca này | T-06 | điều kiện sở hữu nằm trong một hàm duy nhất, không chép tay vào từng truy vấn | cả team |
| **T-08** | S-04 | Bảng stations kèm migration và liên kết chủ sở hữu | 1 | Todo | Thêm bảng stations có khoá ngoại tới users làm chủ sở hữu, cột trạng thái hoạt động, toạ độ kiểu số thực. Theo mẫu migration ở T-04. | Migration tiến và lùi được; xoá tài khoản chủ trạm còn trạm thì bị chặn bởi khoá ngoại | T-04 | có chỉ mục trên cột chủ sở hữu vì mọi truy vấn của chủ trạm lọc theo cột này | cả team |
| **T-09** | S-04 | Màn hình tạo, sửa và danh sách trạm của chủ trạm | 1 | Todo | Form tạo/sửa trạm và danh sách trạm của tôi. Dùng lại bố cục form và cách hiện lỗi tại ô của form đăng nhập T-05. Danh sách gọi qua hàm truy vấn có lọc sở hữu ở T-07. | Tạo, sửa, xem danh sách trạm đều chạy; lỗi nhập liệu hiện ngay tại ô sai; nút lưu bị vô hiệu trong lúc đang gửi | T-08 | form gửi đi phải chặn bấm hai lần liên tiếp | cả team |
| **T-10** | S-05 | Bảng charge\_points, connectors kèm migration và ràng buộc unique | 1 | Todo | Hai bảng con của stations theo quan hệ cha–con hai tầng. charge\_points.code unique toàn hệ thống và có chỉ mục vì mọi kết nối OCPP tra cứu theo cột này. Theo mẫu T-08. | Migration tiến và lùi được; chèn hai trụ cùng code thì cơ sở dữ liệu từ chối | T-08 | connectors có cột số thứ tự khớp với connectorId trong tin nhắn OCPP, bắt đầu từ 1 | cả team |
| **T-11** | S-05 | Form thêm trụ kèm số đầu nối, chặn mã trùng ngay tại ô nhập | 1 | Todo | Form thêm trụ trong trang chi tiết trạm, kiểm mã trùng bằng một lời gọi API khi rời ô nhập, và kiểm lại ở máy chủ khi lưu. Bố cục theo T-09. | Nhập mã đã có thì ô nhập báo đỏ trước khi bấm lưu; lách qua giao diện gửi thẳng API thì máy chủ vẫn từ chối | T-10 | không tin kết quả kiểm ở trình duyệt, máy chủ là nơi quyết | cả team |
| **T-12** | S-06 | Endpoint WebSocket đọc mã trụ từ đường dẫn và tra bảng charge\_points | 2 | Todo | Mở endpoint WebSocket dạng /ocpp/, lấy mã trụ từ đường dẫn, tra cứu trong bảng charge\_points ở T-10, chấp nhận nếu có. Xem bản ghi chuỗi tin nhắn từ K-01 để biết simulator nối vào đường dẫn nào và khai giao thức con gì. | Trụ ảo nối vào bằng mã hợp lệ thì kết nối mở và giữ được ít nhất 10 phút không tự đứt | T-10 | giữ được ít nhất 50 kết nối đồng thời trên staging | cả team |
| **T-13** | S-06 | Đóng kết nối của mã lạ và ghi nhật ký lần thử | 2 | Todo | Nhánh từ chối của T-12: mã không có trong bảng thì đóng kết nối với mã đóng chuẩn và ghi log ở mức cảnh báo kèm mã lạ và IP. Không trả về lý do chi tiết cho phía trụ. | Nối trụ ảo với mã bịa thì kết nối đóng trong 1 giây và log có đúng một dòng cảnh báo | T-12 | không log toàn bộ header của yêu cầu, chỉ log mã và IP | cả team |
| **T-14** | S-07 | Hàm đọc và ghi khung CALL, CALLRESULT, CALLERROR | 2 | Todo | OCPP 1.6J gói mỗi tin nhắn thành một mảng JSON: \[2, mã, hành động, tải\] cho CALL, \[3, mã, tải\] cho CALLRESULT, \[4, mã, mã lỗi, mô tả, chi tiết\] cho CALLERROR. Viết một module thuần, không phụ thuộc WebSocket, gồm hàm đọc và hàm ghi cho ba loại. Bản ghi ở K-01 là dữ liệu mẫu cho test. | Đọc đúng mọi khung trong bản ghi K-01; ghi rồi đọc lại cho ra cùng giá trị | T-13 | module thuần, test được không cần mở kết nối | cả team |
| **T-15** | S-07 | Bộ test khung sai định dạng trả về CALLERROR đúng mã lỗi | 2 | Todo | Viết test cho các ca: không phải mảng, thiếu phần tử, loại khung lạ, tải không phải đối tượng, hành động chưa hỗ trợ. Mỗi ca đối chiếu mã lỗi với bảng mã lỗi trong đặc tả (FormationViolation, ProtocolError, NotImplemented). Đây là mẫu viết test theo bảng dữ liệu cho các handler sau. | Cả năm ca đều trả về CALLERROR đúng mã và kết nối vẫn mở sau đó | T-14 | test chạy trong CI ở T-02 | cả team |
| **T-16** | S-08 | Handler BootNotification lưu nhà sản xuất, mẫu trụ, phiên bản firmware | 2 | Todo | Handler đầu tiên viết theo khung ở T-14; cấu trúc file của nó là mẫu cho mọi handler sau. Đọc các trường chargePointVendor, chargePointModel, firmwareVersion và lưu vào charge\_points. Thêm cột bằng migration mới theo mẫu T-10. | Trụ ảo gửi BootNotification thì ba cột trên có dữ liệu và cột trạng thái chuyển sang trực tuyến | T-15 | trường thiếu thì lưu rỗng, không từ chối tin nhắn | cả team |
| **T-17** | S-08 | Trả về trạng thái chấp nhận hoặc từ chối kèm khoảng nhịp tim cấu hình được | 2 | Todo | Phần trả lời của T-16: quyết định Accepted/Rejected theo trạng thái trụ và trạm, đọc khoảng nhịp tim từ cấu hình, chặn mọi tin nhắn khác cho tới khi trụ được chấp nhận. | Trụ ảo nhận Accepted kèm interval bằng giá trị cấu hình; đổi cấu hình rồi khởi động lại ứng dụng thì giá trị mới được dùng | T-16 | giờ máy chủ trong câu trả lời ở múi giờ UTC theo đặc tả | cả team |
| **T-18** | S-09 | Handler Heartbeat cập nhật một cột last\_seen\_at và trả giờ máy chủ | 2 | Todo | Handler theo mẫu T-16. Cập nhật charge\_points.last\_seen\_at bằng một câu UPDATE đúng một cột. Gọi cùng hàm cập nhật đó từ khung ở T-14 cho mọi tin nhắn tới. | Trụ ảo gửi nhịp tim thì last\_seen\_at đổi; gửi StatusNotification cũng làm cột này đổi | T-17 | không khoá bản ghi lâu hơn một câu lệnh | cả team |
| **T-19** | S-09 | Test nhịp tim với trụ ảo đặt sai giờ hệ thống | 2 | Todo | Chạy trụ ảo trong container có biến môi trường múi giờ lệch, gửi nhịp tim, kiểm last\_seen\_at ghi theo giờ máy chủ cơ sở dữ liệu. Đây là bằng chứng cho AC thứ ba của S-09 và là chỗ team học vì sao phải so thời gian ở một nơi. | last\_seen\_at chênh với now() của cơ sở dữ liệu dưới 2 giây dù trụ ảo báo giờ lệch 5 tiếng | T-18 | test chạy được trong CI | cả team |
| **T-20** | S-10 | Ánh xạ trạng thái OCPP sang trạng thái nội bộ của bảng connectors | 2 | Todo | Bảng ánh xạ 9 trạng thái của đặc tả (Available, Preparing, Charging, SuspendedEV, SuspendedEVSE, Finishing, Reserved, Unavailable, Faulted) sang bốn trạng thái nội bộ: rảnh, bận, đặt chỗ, lỗi. Đặt bảng ánh xạ ở một module riêng để màn hình và báo cáo dùng chung. Handler theo mẫu T-16. | Đổi trạng thái trên trụ ảo thì bảng connectors đổi theo trong vòng 1 giây; trạng thái lạ chưa biết lưu nguyên văn vào cột riêng | T-19 | trạng thái lạ không làm sập luồng xử lý | cả team |
| **T-21** | S-10 | Lưu mã lỗi và thời điểm vào bảng connector\_errors | 2 | Todo | Bảng mới connector\_errors chỉ ghi thêm: đầu nối, mã lỗi, mã lỗi nhà sản xuất, thời điểm. Ghi mỗi khi errorCode khác NoError. Migration theo mẫu T-10. | Trụ ảo báo Faulted kèm mã lỗi thì có một dòng mới; báo Available sau đó không xoá dòng cũ | T-20 | có chỉ mục theo đầu nối và thời điểm để S-46 đếm lỗi theo khoảng thời gian | cả team |
| **T-22** | S-10 | Bỏ qua đầu nối chưa khai báo kèm cảnh báo, không tạo mới | 2 | Todo | Nhánh lỗi của T-20: connectorId lớn hơn số đầu nối đã khai ở S-05 thì ghi cảnh báo kèm mã trụ và số đầu nối, trả CALLRESULT rỗng theo đặc tả, không chèn bản ghi. | Trụ ảo khai 2 đầu nối gửi trạng thái cho đầu nối 3 thì bảng connectors vẫn 2 dòng và log có cảnh báo | T-21 | cảnh báo gom theo trụ, không lặp mỗi giây | cả team |
| **T-23** | S-11 | Truy vấn một lần trả về cây trạm–trụ–đầu nối đã lọc theo quyền | 2 | Todo | Một truy vấn nối ba bảng, trả về cây ba tầng, đi qua hàm lọc sở hữu ở T-07. Đo thời gian chạy với 50 trụ và 200 đầu nối bằng dữ liệu seed trước khi coi là xong. | Trả về đúng cây ba tầng; chạy dưới 200ms với 50 trụ; chủ trạm chỉ nhận trạm của mình | T-22 | không dùng vòng lặp gọi truy vấn con cho từng trụ | cả team |
| **T-24** | S-11 | Màn hình theo dõi dạng lưới, mỗi ô một trụ, nhãn chữ kèm màu | 2 | Todo | Lưới trạm → trụ → đầu nối. Trạng thái phân biệt bằng nhãn chữ kèm màu, không chỉ màu. Trụ ngoại tuyến hiện thời điểm liên lạc cuối. Bố cục trang theo T-09. | 20 trụ hiện đủ trên một màn hình máy tính không cần cuộn ngang; người mù màu vẫn đọc được trạng thái | T-23 | trạng thái phân biệt không chỉ bằng màu, thêm nhãn chữ | cả team |
| **T-25** | S-11 | Kênh đẩy trạng thái xuống trình duyệt khi đầu nối đổi | 2 | Todo | Khi T-20 đổi trạng thái đầu nối, phát một sự kiện nội bộ; một endpoint Server-Sent Events đẩy sự kiện đó xuống các trình duyệt đang mở màn hình, đã lọc theo quyền. Trình duyệt tự nối lại khi đứt và gọi lại truy vấn T-23. | Đổi trạng thái trên trụ ảo thì màn hình đổi trong 1 giây; tắt rồi bật lại máy chủ thì màn hình tự khôi phục không cần tải lại | T-24 | không đẩy sự kiện của trạm này tới trình duyệt của chủ trạm khác | cả team |
| **T-26** | S-12 | Job nền quét last\_seen\_at quá hai chu kỳ và đổi trạng thái | 2 | Todo | Job chạy mỗi phút, so last\_seen\_at với now() của cơ sở dữ liệu, đổi trạng thái trụ quá hạn. Chạy lặp nhiều lần không gây tác dụng phụ. Đây là job nền đầu tiên của dự án — cách đăng ký và ghi log của nó là mẫu cho T-31, T-53. | Dừng trụ ảo thì sau hai chu kỳ nhịp tim trụ chuyển sang ngoại tuyến; chạy job hai lần liên tiếp không đổi gì thêm | T-25 | truy vấn xác định ngoại tuyến so sánh thời gian ở máy chủ cơ sở dữ liệu | cả team |
| **T-27** | S-12 | Test dừng trụ ảo rồi bật lại, trạng thái đi đúng hai chiều | 2 | Todo | Kịch bản tự động: bật trụ ảo, chờ trực tuyến, dừng container, chờ quá hai chu kỳ, kiểm ngoại tuyến, bật lại, kiểm trực tuyến và đầu nối có trạng thái thật sau StatusNotification. | Kịch bản chạy xanh ba lần liên tiếp trên staging | T-26 | khoảng nhịp tim trong test đặt ngắn (5 giây) để test không kéo dài | cả team |
| **T-28** | S-13 | Bảng kết nối đang mở trong bộ nhớ, thay thế khi trùng mã | 2 | Todo | Một cấu trúc ánh xạ mã trụ → kết nối đang mở, gắn vào T-12. Kết nối mới cùng mã thì đóng cái cũ trước rồi thay thế. Mọi lệnh máy chủ gửi xuống trụ (T-34, T-49) tra ở đây. | Mở hai trụ ảo cùng mã thì kết nối đầu nhận khung đóng và bảng chỉ còn một mục | T-13 | thao tác thay thế phải nguyên tử trong tiến trình | cả team |
| **T-29** | S-13 | Test mở hai trụ ảo cùng mã, kết nối đầu nhận khung đóng | 2 | Todo | Test tích hợp theo mẫu T-27: hai simulator cùng mã nối liên tiếp, kiểm kết nối đầu bị đóng với mã đóng chuẩn và tin nhắn của kết nối hai vẫn được xử lý. | Test xanh trong CI; log ghi rõ kết nối nào bị thay | T-28 | test không phụ thuộc thứ tự chạy với test khác | cả team |
| **T-30** | S-14 | Bảng ocpp\_messages lưu mã tin nhắn và câu trả lời đã gửi | 2 | Todo | Bảng ocpp\_messages khoá theo cặp (mã trụ, mã tin nhắn), lưu tên hành động, câu trả lời đã gửi, thời điểm. Chèn vào khung ở T-14 một bước tra bảng trước khi gọi handler. Migration theo mẫu T-10. | Gửi lại cùng tin nhắn 5 lần thì chỉ có một bản ghi phiên và năm lần đều nhận cùng câu trả lời | T-17 | tra bảng và gọi handler nằm trong cùng một giao dịch để hai tin tới đồng thời không cùng lọt | cả team |
| **T-31** | S-14 | Job dọn bản ghi cũ hơn 7 ngày và test gửi lại 5 lần | 2 | Todo | Job nền theo mẫu T-26 xoá bản ghi ocpp\_messages quá 7 ngày. Test tích hợp theo mẫu T-29 cho ca gửi lại 5 lần và ca khởi động lại tiến trình giữa hai lần gửi. | Sau khi job chạy, không còn bản ghi quá 7 ngày; hai test xanh trong CI | T-30 | số ngày giữ là tham số cấu hình | cả team |
| **T-32** | S-15 | Bảng id\_tags gắn thẻ với tài xế, có trạng thái khoá và hạn dùng | 2 | Todo | Bảng id\_tags: mã thẻ unique, khoá ngoại tới users vai trò tài xế, trạng thái, hạn dùng. Seed mỗi tài xế thử nghiệm một thẻ. Migration theo mẫu T-10. | Migration tiến và lùi được; chèn hai thẻ cùng mã thì bị từ chối | T-04 | có chỉ mục theo mã thẻ vì mọi Authorize tra theo cột này | cả team |
| **T-33** | S-15 | Handler Authorize trả về Accepted, Blocked, Expired hoặc Invalid | 2 | Todo | Handler theo mẫu T-16, tra bảng T-32 và trạng thái trạm, trả idTagInfo đúng cấu trúc đặc tả. Test theo bảng dữ liệu như T-15 cho năm ca của AC. | Năm ca của S-15 đều đúng trên trụ ảo; log chỉ hiện bốn ký tự cuối của thẻ | T-32 | không tiết lộ lý do chi tiết ngoài bốn trạng thái chuẩn | cả team |
| **T-34** | S-16 | Gửi CALL từ máy chủ tới trụ và khớp CALLRESULT theo mã tin nhắn | 2 | Todo | Hàm dùng chung: sinh mã tin nhắn duy nhất, ghi khung CALL bằng T-14, gửi qua kết nối tra ở T-28, chờ CALLRESULT có cùng mã với thời gian chờ cấu hình được. Dùng cho Reset trước, sau này cho mọi lệnh khác. | Gọi Reset trên trụ ảo nhận đúng CALLRESULT; trụ không trả lời thì hàm trả lỗi hết thời gian sau đúng số giây cấu hình | T-28 | một lời gọi đang chờ không chặn việc xử lý tin nhắn khác trên cùng kết nối | cả team |
| **T-35** | S-16 | Nút khởi động lại trên màn hình theo dõi, báo lỗi khi trụ ngoại tuyến | 2 | Todo | Nút trên ô trụ ở T-24, hộp chọn kiểu mềm/cứng, gọi API dùng T-34. Trụ ngoại tuyến thì API trả lỗi ngay không gọi xuống trụ. Ghi một dòng nhật ký thao tác — bảng nhật ký sẽ chuẩn hoá ở T-57, tạm ghi log ứng dụng. | Bấm nút trên trụ ảo trực tuyến thì trụ khởi động lại và ô trụ chuyển ngoại tuyến rồi trực tuyến; trụ ngoại tuyến thì hiện thông báo ngay | T-34 | chỉ vai trò vận hành viên và quản trị thấy nút này | cả team |
| **T-36** | S-17 | Bảng charging\_sessions kèm migration, mã phiên do hệ thống cấp | 3 | Todo | Bảng charging\_sessions: khoá chính tự tăng làm transactionId, đầu nối, thẻ, tài xế, số đo đầu/cuối, thời điểm bắt đầu/kết thúc, trạng thái, lý do dừng. Migration theo mẫu T-10. Đây là bảng trung tâm — mọi story từ E-05 trở đi đọc nó. | Migration tiến và lùi được; hai phiên không thể cùng mở trên một đầu nối nhờ chỉ mục unique có điều kiện | T-32 | trạng thái phiên là enum rõ ràng: đang sạc, đã kết thúc, bất thường, cần xem xét | cả team |
| **T-37** | S-17 | Handler StartTransaction kiểm thẻ, tạo phiên, trả transactionId | 3 | Todo | Handler theo mẫu T-16, dùng lại hàm kiểm thẻ của T-33, chèn phiên vào T-36, xử lý ca đầu nối còn phiên mở. Đối chiếu trường của tin nhắn với bản ghi K-01. | Trụ ảo bắt đầu phiên thì bảng có dòng mới với số đo đầu đúng bằng giá trị trụ gửi; bốn ca của S-17 đều xanh | T-36 | toàn bộ xử lý nằm trong một giao dịch cơ sở dữ liệu | cả team |
| **T-38** | S-18 | Handler StopTransaction đóng phiên, lưu lý do dừng | 3 | Todo | Handler theo mẫu T-37. Tra phiên theo transactionId, cập nhật số đo cuối, thời điểm, lý do (Local, Remote, EVDisconnected, PowerLoss…), trạng thái. Ca transactionId lạ ghi vào bảng orphan\_messages. | Trụ ảo dừng phiên thì dòng phiên có đủ số đo cuối và lý do; transactionId bịa thì có dòng trong orphan\_messages | T-37 | phiên đã kết thúc nhận StopTransaction lần nữa thì không đổi gì | cả team |
| **T-39** | S-18 | Tính kWh bằng hiệu số đo cuối trừ số đo đầu, test với ba phiên mẫu | 3 | Todo | Hàm thuần tính kWh từ hai số đo Wh, xử lý ca số đo lùi. Test theo bảng dữ liệu với ba phiên mẫu tính tay: phiên thường, phiên số đo cuối nhỏ hơn số đo đầu, phiên số đo bằng nhau. Đặt hàm ở module riêng để E-05 dùng lại. | Ba ca đều ra đúng đáp án tính tay; ca lùi trả về không có giá trị thay vì số âm | T-38 | không làm tròn ở bước này — làm tròn chỉ xảy ra khi tính tiền | cả team |
| **T-40** | S-19 | Bảng meter\_values kèm migration và chỉ mục theo phiên | 3 | Todo | Bảng meter\_values: phiên, mốc thời gian, đại lượng, giá trị, đơn vị. Chỉ mục ghép (phiên, mốc thời gian). Migration theo mẫu T-36. | Migration tiến và lùi được; truy vấn số đo mới nhất của một phiên dùng chỉ mục | T-36 | đơn vị lưu nguyên văn từ tin nhắn (Wh hay kWh) để tính đúng khi đọc | cả team |
| **T-41** | S-19 | Handler MeterValues đọc đúng đại lượng Energy.Active.Import.Register | 3 | Todo | Handler theo mẫu T-37. Cấu trúc meterValue\[\].sampledValue\[\] lồng hai tầng — đối chiếu bản ghi K-01. Chỉ lưu Energy.Active.Import.Register, Power.Active.Import, Current.Import; đại lượng khác bỏ qua. Ghi qua một câu chèn hàng loạt. | Trụ ảo gửi số đo mỗi 10 giây thì bảng có dòng mới đúng nhịp; số đo tới cho đầu nối rảnh nằm ở orphan\_messages | T-40 | trả lời trụ trước, ghi bảng chờ đối chiếu sau | cả team |
| **T-42** | S-20 | So mốc thời gian với số đo mới nhất của phiên trước khi ghi | 3 | Todo | Chèn vào T-41 một bước đọc số đo mới nhất của phiên (dùng chỉ mục T-40) và áp ba quy tắc của S-20. Quy tắc viết thành hàm thuần để test theo bảng. | Ba quy tắc đều có test đơn vị xanh; chạy trên trụ ảo không làm chậm trả lời quá 200ms | T-41 | đọc và ghi trong cùng giao dịch để hai số đo tới đồng thời không cùng lọt | cả team |
| **T-43** | S-20 | Test gửi số đo lùi và số đo trùng, có cảnh báo trong log | 3 | Todo | Test tích hợp theo mẫu T-29: dùng simulator hoặc gửi khung tay qua WebSocket ba số đo theo thứ tự mới → cũ → trùng. Kiểm bảng và log. | Bảng chỉ có số đo mới; log có đúng một cảnh báo cho số đo lùi và không cảnh báo cho số đo trùng | T-42 | test chạy trong CI | cả team |
| **T-44** | S-21 | Khớp phiên đang chạy theo transactionId khi trụ nối lại | 3 | Todo | Khi trụ trở lại trực tuyến (T-26 chiều ngược), đọc phiên đang mở của từng đầu nối; StatusNotification Charging thì giữ, Available thì đánh dấu cần xem xét. Xem bản ghi K-01 để biết simulator báo gì sau khi nối lại. | Ngắt trụ ảo giữa phiên rồi nối lại thì phiên cũ tiếp tục, không sinh phiên thứ hai | T-42 | không đóng phiên tự động chỉ vì trụ ngoại tuyến | cả team |
| **T-45** | S-21 | Xử lý StopTransaction tới muộn sau khi trụ đã ngoại tuyến | 3 | Todo | Mở rộng T-38: phiên có trụ đang ngoại tuyến vẫn nhận StopTransaction khi trụ nối lại; transactionData dồn được lưu qua T-41 theo mốc thời gian trong tin nhắn. | Dừng trụ ảo khi đang sạc, kết thúc phiên ở phía trụ, bật lại — phiên trong hệ thống đóng đúng với số kWh khớp số đo trụ | T-44 | thời điểm kết thúc lấy từ tin nhắn, không lấy giờ máy chủ lúc nhận | cả team |
| **T-46** | S-21 | Kịch bản 20 trụ ảo ngắt–nối ngẫu nhiên giữa phiên, kiểm kWh cuối | 3 | Todo | Kịch bản tự động: bật 20 trụ ảo, mỗi trụ chạy một phiên, ngắt–nối ngẫu nhiên 1–3 lần mỗi phiên, cuối cùng so số kWh trong hệ thống với số đo simulator báo. In bảng đối chiếu. Đây là bằng chứng cho AC của S-21 và E-04, và là kịch bản T-56 đưa vào CI. | Chạy trên staging thì 20/20 phiên khớp; chạy lại ba lần vẫn đúng | T-45 | kịch bản có tham số số trụ và số lần ngắt để chạy nhanh trong CI | cả team |
| **T-49** | S-23 | Gửi RemoteStopTransaction và chờ trụ gửi StopTransaction thật | 3 | Todo | API dừng phiên dùng hàm gửi lệnh T-34, truyền transactionId. Không tự đóng phiên khi nhận Accepted; đặt một mốc chờ 2 phút, quá mốc thì đánh dấu cần xem xét qua job T-53. | Dừng phiên trên trụ ảo thì phiên đóng với lý do Remote và số kWh đúng; trụ ảo cấu hình từ chối thì phiên vẫn chạy | T-38, T-34 | lệnh dừng ghi nhật ký kèm người thực hiện qua hàm ở T-57 | cả team |
| **T-50** | S-23 | Nút dừng trên màn hình phiên, hết thời gian chờ thì báo lỗi rõ | 3 | Todo | Nút trên màn hình phiên đang chạy (dùng lại màn hình T-48 với quyền vận hành viên), trạng thái chờ có đồng hồ, ba thông báo khác nhau cho từ chối, ngoại tuyến, hết thời gian. | Ba ca lỗi của S-23 hiện đúng ba thông báo khác nhau; ca thành công thấy phiên chuyển sang đã kết thúc không cần tải lại | T-49 | chỉ vai trò vận hành viên và quản trị thấy nút này | cả team |
| **T-53** | S-25 | Job quét phiên đang chạy mà trụ ngoại tuyến quá ngưỡng cấu hình | 3 | Todo | Job nền theo mẫu T-26: tìm phiên đang sạc có trụ ngoại tuyến lâu hơn ngưỡng, hoặc phiên chờ StopTransaction sau lệnh dừng quá 2 phút (T-49), đổi sang bất thường. | Dừng trụ ảo giữa phiên, chỉnh ngưỡng xuống 1 phút, sau 2 phút phiên hiện trong danh sách bất thường | T-46 | job không đóng phiên, chỉ đánh dấu — đóng là quyết định của người | cả team |
| **T-54** | S-25 | Danh sách phiên bất thường trên màn hình vận hành | 3 | Todo | Trang danh sách phiên bất thường với nút đóng tay yêu cầu lý do. Bố cục theo T-24; đóng tay ghi nhật ký qua hàm T-57. | Phiên bất thường hiện đủ mã, trụ, thời điểm mất liên lạc, số đo cuối; đóng tay không có lý do thì bị chặn | T-53 | chỉ vai trò vận hành viên và kế toán vào được trang này | cả team |
| **T-57** | S-27 | Bảng audit\_logs chỉ ghi thêm, ghi từ một hàm dùng chung | 3 | Todo | Bảng audit\_logs: người, hành động, loại đối tượng, mã đối tượng, dữ liệu kèm dạng JSON, thời điểm. Một hàm ghi\_nhat\_ky dùng chung; thay chỗ log tạm ở T-35 và nối vào T-49, T-54. Migration theo mẫu T-36; cấp quyền cơ sở dữ liệu chỉ cho phép chèn và đọc. | Gửi Reset và dừng phiên thì có đúng hai dòng; câu UPDATE hoặc DELETE từ tài khoản ứng dụng bị cơ sở dữ liệu từ chối | T-50 | không ghi mã thẻ hay dữ liệu định danh vào cột JSON | cả team |
| **T-58** | S-27 | Màn hình tra nhật ký theo trụ, theo người, theo khoảng thời gian | 3 | Todo | Trang danh sách có ba bộ lọc và phân trang. Bố cục theo T-54. Chỉ vai trò quản trị và vận hành viên vào được. | Lọc theo trụ ảo vừa gửi Reset thấy đúng dòng đó; phân trang 50 dòng một trang | T-57 | truy vấn dùng chỉ mục theo thời điểm | cả team |
| **T-47** | S-22 | API phiên hiện tại của tài xế đang đăng nhập, kèm số kWh mới nhất | 3 | Todo | Endpoint trả về phiên đang sạc của tài xế hiện tại (qua thẻ ở T-32), kèm số đo mới nhất từ T-40. Đi qua middleware T-06 với vai trò tài xế. | Tài xế có phiên nhận đúng phiên của mình; không có phiên nhận 204; gọi bằng mã phiên người khác nhận 403 | T-42 | một truy vấn, không gọi hai lần | cả team |
| **T-48** | S-22 | Màn hình phiên đang sạc, số kWh tăng dần không cần tải lại | 3 | Todo | Màn hình điện thoại hiện trụ, thời gian, số kWh; nhận cập nhật qua kênh đẩy đã dựng ở T-25, lọc theo phiên của tài xế. Đây là màn hình đầu tiên phía tài xế — bố cục di động của nó là mẫu cho T-52 và các màn hình E-11 sau. | Trụ ảo gửi số đo thì màn hình đổi trong 2 giây; xoay ngang màn hình vẫn đọc được | T-47 | dùng được ở chiều rộng 360px | cả team |
| **T-51** | S-24 | API bắt đầu phiên kiểm đầu nối rảnh rồi gửi RemoteStartTransaction | 3 | Todo | Endpoint nhận mã đầu nối, kiểm trạng thái rảnh từ connectors, kiểm trạm đang hoạt động, gửi lệnh qua T-34 với thẻ ảo của tài xế. Lưu một bản ghi "đang chờ bắt đầu" có hạn 60 giây để T-52 hỏi trạng thái. | Đầu nối rảnh thì trụ ảo bắt đầu phiên; đầu nối bận thì API trả 409 và không có lệnh nào đi xuống trụ | T-37, T-34 | thẻ ảo được tạo cùng lúc tạo tài khoản tài xế | cả team |
| **T-52** | S-24 | Nút bắt đầu sạc trên màn hình trụ, xử lý trụ từ chối hoặc không trả lời | 3 | Todo | Màn hình chi tiết trụ với danh sách đầu nối và nút bắt đầu; trạng thái chờ tối đa 60 giây; ba thông báo cho từ chối, bận, hết thời gian. Bố cục theo T-48. | Bốn ca của S-24 đều đúng trên trụ ảo; thành công thì tự chuyển sang màn hình phiên T-48 | T-51, T-48 | nút bị vô hiệu trong lúc chờ để không gửi hai lệnh | cả team |

## **6\. Sheet: Rủi ro**

| ID | Rủi ro | Ảnh hưởng | Khả năng | Giảm thiểu | Chủ |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **R-01** | Đặc tả OCPP dài và lạ, team đọc cả tuần vẫn chưa viết được dòng nào | Cao | Cao | K-01 là spike timebox 2 ngày có người hướng dẫn, đầu ra cụ thể là bản ghi chuỗi tin nhắn thật. Chỉ đọc phần đặc tả của 8 tin nhắn liệt kê trong K-01, bỏ phần còn lại | cả team |
| **R-02** | **Chưa có tài khoản sandbox thanh toán**, S-35 ở Sprint 5 tắc | Cao | Cao | Nộp hồ sơ ngay ngày đầu Sprint 1\. S-36 nạp tay là đường dự phòng đã nằm sẵn trong Sprint 5 để luồng trừ ví và đối soát vẫn chạy | người phụ trách dự án |
| **R-03** | Team chống trùng tin nhắn và chống trùng đặt chỗ bằng biến trong bộ nhớ, khởi động lại là mất sạch | Cao | Trung bình | NFR của S-14, S-39, S-49 ghi rõ phải lưu ở cơ sở dữ liệu; T-31 có ca khởi động lại tiến trình giữa hai lần gửi để lộ lỗi này | cả team |
| **R-04** | Bộ tính tiền sai ở ca biên (qua nửa đêm, đúng ranh giới khung, số đo thưa) mà không ai phát hiện vì test viết theo chính mã | Cao | Cao | S-32 là story riêng: bộ ca kiểm thử với **đáp án tính tay** lưu trong tệp có tên người tính; thuật toán chia đoạn là hàm thuần (S-30) | cả team |
| **R-05** | Sprint 4–8 mới có SP thô; velocity thực sau Sprint 3 có thể khác xa 20 SP/sprint | Trung bình | Cao | Đo velocity 3 sprint đầu rồi tính lại toàn bộ kế hoạch; 25 SP đệm là chỗ cắt trước; story 5 SP tách nhỏ ở Refinement trước khi kéo vào | Scrum Master |
| **R-06** | Không có DevOps nên staging hỏng giữa sprint không ai sửa nhanh, và 20 trụ ảo làm máy chủ quá tải | Trung bình | Trung bình | E-01 xong ngay Sprint 1; triển khai thất bại thì giữ bản cũ (T-03); số trụ ảo là tham số, CI chạy ít trụ hơn staging (T-55) | cả team |
| **R-07** | Lịch sử sạc là dữ liệu vị trí, xử lý sai thành rủi ro pháp lý | Trung bình | Thấp | S-57 ghi rõ cần người có thẩm quyền xác nhận phạm vi; log không ghi mã thẻ (S-15); **skill không đưa tư vấn pháp lý** | người quyết sản phẩm |
| **R-08** | Simulator mã nguồn mở không tôn trọng SetChargingProfile, E-08 không kiểm chứng được bằng trụ ảo | Cao | Trung bình | Kiểm ngay trong K-01 xem simulator đã chọn có xử lý hồ sơ sạc không; nếu không thì chọn simulator khác trước Sprint 6 hoặc chấp nhận kiểm E-08 bằng log lệnh đã gửi thay vì công suất thật | cả team |
| **R-09** | 5 người mới cùng sửa module xử lý tin nhắn OCPP, xung đột merge và chờ review nuốt capacity | Trung bình | Cao | Mỗi handler một file theo mẫu T-16; chia story theo handler để hai người không cùng đụng một file; Daily Scrum nêu rõ ai chờ review của ai | Scrum Master |

## **7\. Sheet: DoD-DoR**

| Loại | Được phép chặn | Mục |
| :---- | :---- | :---- |
| **DoD** | — | Code review đã duyệt bởi ít nhất một thành viên khác |
| **DoD** | — | Unit test cho nhánh logic mới; độ phủ trên phần thay đổi không giảm |
| **DoD** | — | CI xanh: build, lint, typecheck, test, và kịch bản trụ ảo (từ Sprint 3\) |
| **DoD** | — | Không có secret trong mã nguồn; quét phụ thuộc sạch |
| **DoD** | — | AC pass trên staging với **trụ ảo chạy thật**, không chỉ bằng test đơn vị |
| **DoD** | — | Story chạm tiền: có bộ ca kiểm thử với đáp án tính tay |
| **DoD** | — | Story chạm tin nhắn OCPP: xử lý hai lần cho kết quả giống xử lý một lần |
| **DoD** | — | Story có job nền: chạy job hai lần liên tiếp không gây tác dụng phụ |
| **DoD** | — | Không log dữ liệu định danh cá nhân, mã thẻ, và không log thông tin thanh toán |
| **DoD** | — | README cập nhật nếu đổi hành vi công khai hoặc thêm biến môi trường |
| **DoR** | Có | Đủ nhỏ để Done trong 1 sprint |
| **DoR** | Có | Dependency ngoài đã có cam kết (tài khoản sandbox thanh toán, xem R-02) |
| **DoR** | Không | Có AC viết dạng Giả sử / Khi / Thì (hướng dẫn) |
| **DoR** | Không | Đã ước lượng story point và thay SP thô bằng SP đã cân nhắc (hướng dẫn) |
| **DoR** | Không | Story Ready đã có task con ≤ nửa ngày (hướng dẫn, theo profile thực tập) |
| **DoR** | Không | Team hiểu story nói gì mà không cần hỏi lại người viết (hướng dẫn) |

