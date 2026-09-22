# BƯỚC 09: MODULE AI: ĐIỀU PHỐI TẢI, BẢO TRÌ & FALLBACK HEURISTIC (AI ENGINE)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-09-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/services/` (`ai_service.py`, `fallback_service.py`).
> - Sản phẩm bàn giao: `docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md`.

---

## 1. Mục tiêu bước 9
- Tích hợp **Google Gemini API** giải quyết 3 bài toán AI thực tế trong vận hành trạm sạc xe điện:
  1. **Smart Charging & Load Balancing**: Phân bổ động công suất sạc nhằm không vượt quá công suất nguồn trạm (`total_grid_capacity_kw`).
  2. **Predictive Maintenance**: Phân tích dữ liệu lịch sử telemetry (nhiệt độ tiếp điểm, sụt áp, tần suất ngắt sớm) để phát hiện trụ sạc suy hao và đưa ra cảnh báo bảo dưỡng.
  3. **Dynamic Pricing & AI Advisor**: Gợi ý điều chỉnh biểu giá TOU và trợ lý giải đáp dữ liệu vận hành.
- Xây dựng **Fallback Heuristic Engine**: Tự động kích hoạt khi mất kết nối mạng hoặc hết hạn ngạch Gemini API, bảo đảm hệ thống web luôn hoạt động 100%.

---

## 2. Nội dung công việc chi tiết

### 2.1. Tích hợp Google Gemini & Kỹ thuật Prompt Grounding
- `app/services/ai_service.py`:
  - Khởi tạo Gemini client với `GEMINI_API_KEY`.
  - Prompt Engineering chống ảo giác: Chỉ cung cấp số liệu thực tế được tổng hợp từ CSDL (tổng công suất trạm, danh sách xe đang sạc, lịch sử nhiệt độ 30 ngày).
  - Yêu cầu cấu trúc đầu ra dạng JSON chặt chẽ kèm nhận xét tiếng Việt.

### 2.2. Thuật toán Smart Charging & Load Balancing
- Bài toán: Trạm có công suất lưới cấp $P_{\text{grid}} = 150\text{ kW}$. Có 3 xe đang sạc yêu cầu lần lượt $120\text{ kW}$, $60\text{ kW}$, $30\text{ kW}$ (Tổng cầu $= 210\text{ kW} > 150\text{ kW}$).
- AI & Heuristic phân bổ:
  - Tính toán hệ số ưu tiên dựa trên: Dung lượng pin còn lại (xe có pin thấp ưu tiên sạc nhanh trước), công suất sạc tối đa của xe.
  - Phân bổ lại: Xe 1 nhận $80\text{ kW}$, Xe 2 nhận $45\text{ kW}$, Xe 3 nhận $25\text{ kW}$ (Tổng $= 150\text{ kW}$, an toàn 100%).

### 2.3. Predictive Maintenance (Bảo trì dự đoán)
- Phân tích telemetry:
  - Nếu nhiệt độ trung bình của súng sạc tăng $> 15\%$ so với mức chuẩn hoặc có $> 2$ lần ngắt khẩn cấp trong tuần $\rightarrow$ Gán mức độ rủi ro `HIGH` / `CRITICAL`.
  - Sinh khuyến nghị kỹ thuật: "Vệ sinh tiếp điểm cổng sạc số 1 trụ CP02 trước ngày X".

### 2.4. Heuristic Fallback Engine
- `app/services/fallback_service.py`:
  - Kích hoạt khi `ai_service.py` gặp exception (`google.api_core.exceptions`, lỗi mạng, timeout).
  - Triển khai thuật toán Heuristic:
    - Smart Charging: Phân bổ tỷ lệ chuẩn (Proportional Fair Sharing: $P_i = P_{\text{grid}} \times \frac{Req_i}{\sum Req}$).
    - Maintenance: Quét theo ngưỡng cứng (Rule-based: nhiệt độ $> 65^\circ\text{C}$ cảnh báo vàng, $> 75^\circ\text{C}$ cảnh báo đỏ).

---

## 3. Cấu trúc file cần sinh
```text
backend/
├── app/
│   ├── services/
│   │   ├── ai_service.py              # Gọi Gemini API, prompt grounding
│   │   └── fallback_service.py        # Heuristic rules khi AI offline
│   └── api/v1/endpoints/
│       └── ai.py                      # API /smart-charging, /predictive-maintenance, /ask
```

---

## 4. Checklist thực hiện
- [ ] Cài đặt `ai_service.py` tích hợp Google Gemini API.
- [ ] Cài đặt `fallback_service.py` với thuật toán chia tải và cảnh báo ngưỡng cứng.
- [ ] Cài đặt API Endpoints `/api/v1/ai/...`.
- [ ] Soạn tài liệu bàn giao `docs/SDLC/KT3/01_AI_Integration_and_Prompt_Evaluation.md`.
- [ ] Cập nhật trạng thái Bước 09 trong `docs/plans/TIEN-DO.md`.
