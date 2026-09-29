# Mục lục & Thứ tự tra cứu tài liệu Phác thảo ban đầu (`phacthaobandau/`)

Thư mục `phacthaobandau/` lưu trữ toàn bộ hồ sơ thiết kế, quy chuẩn vận hành, lộ trình kỹ thuật và kết quả theo dõi phát triển của **Nền tảng vận hành trạm sạc xe điện (EV CSMS)**.

---

## 📌 Sơ đồ cấu trúc & Thứ tự đọc khuyến nghị

Để nắm bắt toàn diện dự án theo đúng trình tự logic, khuyến nghị tiếp cận tài liệu theo 5 nhóm thứ tự sau:

```text
phacthaobandau/
├── 00_MUC_LUC_TAI_LIEU.md                        <-- [BẮT ĐẦU TẠI ĐÂY] Sơ đồ & Chỉ mục điều hướng
├── README.md                                     <-- Bản sao điều hướng nhanh
│
├── [THỨ TỰ 1] QUY CHUẨN VẬN HÀNH & NGUYÊN TẮC AI
│   ├── GEMINI.md                                 <-- Quy tắc ứng xử AI Gemini, 3 luật bảo toàn, ranh giới kiến trúc
│   ├── CLAUDE.md                                 <-- Quy ước vận hành AI Claude đồng bộ
│   └── HUONGDAN.md                               <-- Sổ tay hướng dẫn mở/đóng phiên & đồng bộ trạng thái
│
├── [THỨ TỰ 2] LỘ TRÌNH CHIẾN LƯỢC & THIẾT KẾ HỆ THỐNG
│   ├── MASTER-ROADMAP.md                         <-- Bức tranh tổng thể 8 giai đoạn toàn diện của nền tảng
│   ├── implementation_plan.md                    <-- Kế hoạch kiến trúc kỹ thuật & phân tích yêu cầu
│   └── codebase-map.md                           <-- Bản đồ tra cứu mã nguồn và vai trò từng file
│
├── [THỨ TỰ 3] KẾ HOẠCH TRIỂN KHAI KỸ THUẬT CHI TIẾT (11 BƯỚC)
│   └── plans/
│       ├── TIEN-DO.md                            <-- [Nguồn sự thật trạng thái] Bảng theo dõi tiến độ 11 bước
│       ├── Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md
│       ├── Buoc-02-Thiet-ke-CSDL-va-So-do-ERD.md
│       ├── Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md
│       ├── Buoc-04-Cau-truc-Backend-Cau-hinh-va-Database-Session.md
│       ├── Buoc-05-Xac-thuc-Dang-nhap-va-Phan-quyen-RBAC.md
│       ├── Buoc-06-Module-Quan-ly-Ha-tang-Tram-Tru-va-Cong-sac.md
│       ├── Buoc-07-Module-Bieu-gia-Vi-dien-tu-va-Phien-sac-ACID.md
│       ├── Buoc-08-Module-Gia-lap-Tram-sac-Simulator-va-Telemetry.md
│       ├── Buoc-09-Module-AI-Dieu-phoi-tai-Bao-tri-va-Fallback.md
│       ├── Buoc-10-Xay-dung-Frontend-Web-React-Tailwind-Charts.md
│       └── Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md
│
├── [THỨ TỰ 4] HỒ SƠ ĐÁNH GIÁ MÔN HỌC THEO VÒNG ĐỜI SDLC
│   └── SDLC/
│       ├── KT1/                                  <-- Mốc KT1: SRS, Use Cases, ERD Database & Wireframes
│       │   ├── README.md
│       │   ├── 01_SRS_and_UseCases.md
│       │   ├── 02_Database_Design_ERD.md
│       │   ├── 03_AI_Architecture_and_Prompts.md
│       │   └── 04_Wireframes.md
│       ├── KT2/                                  <-- Mốc KT2: Core Backend, Simulator & Giao dịch ACID
│       │   ├── README.md
│       │   ├── 02_Transaction_Design_and_Wallet_ACID.md
│       │   └── 03_Simulator_and_Telemetry_Design.md
│       ├── KT3/                                  <-- Mốc KT3: AI Gemini + Fallback & Web Frontend
│       │   ├── README.md
│       │   ├── 01_AI_Integration_and_Prompt_Evaluation.md
│       │   └── 02_Frontend_Architecture_and_UI_Guide.md
│       └── final/                                <-- Mốc Cuối kỳ: Báo cáo kỹ thuật, Demo Script & Slides
│           ├── README.md
│           ├── 01_Final_Technical_Report.md
│           ├── 02_User_Guide_and_Demo_Script.md
│           └── 03_Presentation_Slides.md
│
└── [THỨ TỰ 5] THƯ VIỆN ẢNH CHỤP MINH CHỨNG HỆ THỐNG
    └── screenshots/
        ├── README.md                             <-- Danh mục và mô tả chi tiết 18 ảnh chụp màn hình
        └── *.png (18 ảnh chụp giao diện Admin, CPO, Driver, Simulator, AI Advisor...)
```

---

## 📋 Chi tiết các tài liệu theo nhóm

### 1. Nhóm Quy chuẩn & Vận hành (Rules & Operations)
| Tên file | Mục đích sử dụng |
| :--- | :--- |
| [`GEMINI.md`](GEMINI.md) | Hệ quy tắc hành vi bắt buộc cho AI: Luật suy nghĩ trước khi code, luật bảo toàn số dư ví (No Negative Balance), an toàn ngắt sạc khẩn cấp, cơ chế Heuristic Fallback khi AI offline. |
| [`CLAUDE.md`](CLAUDE.md) | Quy ước mã nguồn và quy chuẩn phối hợp dành cho Claude Agent, đồng bộ với `GEMINI.md`. |
| [`HUONGDAN.md`](HUONGDAN.md) | Cẩm nang hướng dẫn mở phiên làm việc, chạy test, cập nhật trạng thái và bảo đảm đồng bộ tài liệu sau mỗi phiên code. |

### 2. Nhóm Lộ trình & Thiết kế Hệ thống (Roadmap & Architecture)
| Tên file | Mục đích sử dụng |
| :--- | :--- |
| [`MASTER-ROADMAP.md`](MASTER-ROADMAP.md) | La bàn định hướng 8 giai đoạn toàn dự án: từ kiến trúc nền tảng, quản lý hạ tầng trạm sạc, biểu giá TOU, ví tiền ACID, bộ giả lập Simulator đến AI thông minh và đóng gói bảo vệ. |
| [`implementation_plan.md`](implementation_plan.md) | Hồ sơ phân tích yêu cầu kỹ thuật, giải pháp công nghệ, ranh giới thiết kế backend/frontend và các tiêu chuẩn kiểm thử tự động. |
| [`codebase-map.md`](codebase-map.md) | Bản đồ cấu trúc thư mục toàn diện: định danh và vai trò của từng file mã nguồn trong toàn bộ kho mã. |

### 3. Nhóm Kế hoạch 11 bước Triển khai (`plans/`)
- [`plans/TIEN-DO.md`](plans/TIEN-DO.md): **Nguồn sự thật tối cao về tiến độ dự án** (Đã hoàn thành 11/11 bước, 83/83 test cases passed).
- Kế hoạch chi tiết từ [`Buoc-01`](plans/Buoc-01-Dac-ta-yeu-cau-va-Phan-tich-nghiep-vu.md) đến [`Buoc-11`](plans/Buoc-11-Bo-Test-Tu-dong-Seed-Data-va-Dong-goi.md).

### 4. Nhóm Hồ sơ Đánh giá SDLC (`SDLC/`)
- **Mốc KT1** ([`SDLC/KT1/`](SDLC/KT1/README.md)): Đặc tả yêu cầu phần mềm (SRS), Thiết kế CSDL quan hệ (ERD), Kiến trúc tích hợp AI và Wireframe giao diện người dùng.
- **Mốc KT2** ([`SDLC/KT2/`](SDLC/KT2/README.md)): Hiện thực hóa Core Backend, Thiết kế giao dịch ví điện tử & phiên sạc ACID, Kiến trúc bộ giả lập sạc và Telemetry thời gian thực.
- **Mốc KT3** ([`SDLC/KT3/`](SDLC/KT3/README.md)): Tích hợp AI Gemini, đánh giá Prompt & Heuristic Fallback Engine, Kiến trúc Web Frontend React + Tailwind CSS.
- **Mốc Cuối kỳ** ([`SDLC/final/`](SDLC/final/README.md)): Báo cáo kỹ thuật tổng kết 11 bước, Sổ tay vận hành 1-click & Kịch bản demo 15 phút, Đề cương 15 slide bảo vệ trước hội đồng.

### 5. Nhóm Ảnh chụp Minh chứng Giao diện (`screenshots/`)
- [`screenshots/README.md`](screenshots/README.md): Bộ sưu tập 18 ảnh chụp thực tế toàn bộ các màn hình chức năng của hệ thống (Dashboard CPO, Quản lý trạm/trụ/cổng, Simulator, AI Smart Charging, AI Predictive Maintenance, AI Dynamic Pricing, Driver Portal, Quản trị Admin...).
