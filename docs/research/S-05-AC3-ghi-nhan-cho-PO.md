# Ghi nhận gửi PO — S-05 AC3 chưa đạt được trong Sprint 1

> **Loại tài liệu**: Biên bản tham vấn kỹ thuật cho Product Owner (Technical Advisory & Scope Adjustment Note)  
> **Tham chiếu chuẩn mực**: `taicautruc.md` Mục 2.5 số 26  
> **Người gửi**: Tech Lead / Nhóm Phát triển  
> **Người nhận**: Product Owner (PO) & Scrum Master  
> **Thời điểm lập**: 29/09/2026

---

## AC3 yêu cầu gì

Trong tài liệu đặc tả User Story S-05 (*"Chủ trạm thêm trụ và đầu nối vào trạm, mã trụ là duy nhất"*), tiêu chí chấp nhận số 3 (AC3) được quy định như sau:
> *"AC3: Trụ sạc sau khi được thêm vào hệ thống phải có khả năng thiết lập kết nối truyền thông 2 chiều với máy chủ CSMS qua giao thức tiêu chuẩn công nghiệp OCPP 1.6J, cho phép máy chủ đọc được trạng thái trực tiếp của trụ và phát lệnh điều khiển từ xa."*

---

## Vì sao chưa đạt

Nhóm phát triển trân trọng báo cáo tới Product Owner các lý do khách quan và chủ quan khiến AC3 **chưa thể đạt được 100% trên môi trường thực tế** trong phạm vi Giai đoạn 1:
1. **Rào cản thiết bị phần cứng vật lý**: Toàn bộ đội ngũ kỹ thuật hiện không có thiết bị trụ sạc xe điện thật để cắm dây thử nghiệm tại chỗ. Việc ghép nối phần cứng thật đòi hỏi không gian thử nghiệm công nghiệp và nguồn điện 3 pha công suất cao.
2. **Độ phức tạp của máy chủ OCPP chuyên dụng**: Việc xây dựng một máy chủ WebSocket OCPP đạt chứng nhận tuân thủ (OCPP Compliance) cần khối lượng công việc lớn (khoảng 3–4 tuần kỹ sư), vượt quá thời lượng và ngân sách của Sprint 1 (vốn tập trung vào việc quản trị tài sản CPO và ví tiền ACID).
3. **Hiện trạng thay thế trong Giai đoạn 1**: Nhóm đã phát triển bộ mô phỏng phần mềm nội tại (`backend/app/simulator/charging_simulator.py`), cho phép sinh dữ liệu telemetry, mô phỏng quá trình sạc CC/CV, ngắt khi quá nhiệt và khôi phục sự cố sập nguồn. Bộ mô phỏng này đáp ứng tốt nhu cầu demo giao diện và kiểm thử luồng trừ tiền ví, nhưng **không thay thế được kết nối với trụ sạc thật**.

---

## Đề xuất

Để đảm bảo tiến độ chung của toàn dự án và duy trì tính minh bạch về chất lượng, nhóm phát triển trân trọng đề xuất với Product Owner:
* **Phương án 1 (Khuyến nghị)**: **Tạm thời chấp nhận nghiệm thu có điều kiện (Conditional Acceptance) cho Story S-05**.
  * Coi các tiêu chí AC1 (Tạo trụ), AC2 (Mã trụ duy nhất) và AC4 (Quản lý đầu nối) là **HOÀN THÀNH**.
  * Tách riêng tiêu chí AC3 thành một User Story kỹ thuật mới cho Giai đoạn tiếp theo (ví dụ: `S-11: Tích hợp máy chủ WebSocket OCPP 1.6J kết nối thiết bị trạm`).
* **Phương án 2**: Duy trì trạng thái `IN_PROGRESS` cho Story S-05 và không tính điểm Story Points cho đến khi hoàn thành xong cả máy chủ OCPP thật.

---

## Cần PO xác nhận

Nhóm phát triển đề nghị Product Owner phản hồi và phê duyệt chính thức bằng văn bản về 2 nội dung:
1. **Lựa chọn phương án**: PO đồng ý với Phương án 1 (Tách việc và nghiệm thu có điều kiện) hay yêu cầu giữ nguyên trạng thái chưa hoàn thành?
2. **Kế hoạch tài nguyên phần cứng**: Xác nhận thời điểm và ngân sách cho việc thuê/mượn thiết bị trạm sạc thực tế (hoặc thiết bị kiểm thử OCPP Hardware Test Kit) để phục vụ nghiệm thu giai đoạn cuối.