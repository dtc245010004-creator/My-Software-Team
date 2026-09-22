# HƯỚNG DẪN KHẮC PHỤC & ĐỒNG BỘ MÃ NGUỒN (HUONGDANFIX.MD)
## Dự án: Nền tảng Vận hành Trạm sạc Xe điện Tích hợp AI (EV CSMS)

> **Mục đích tài liệu:** 
> 1. Ghi nhận chi tiết những gì **Hiếu (`hieudz1235`)** đã làm được trong Task S-01 (Khung ứng dụng chạy máy cá nhân).
> 2. Đối chiếu trực tiếp với sơ đồ kiến trúc [`sodo.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/sodo.md) và tài liệu trong `docs/`.
> 3. Cập nhật rà soát trạng thái các bước trong [`docs/plans/TIEN-DO.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/docs/plans/TIEN-DO.md): chỉ rõ cái gì đã hoàn thành, cái gì đang thực hiện, đã có gì và còn thiếu gì.
> 4. Cung cấp hướng dẫn kỹ thuật chi tiết từng bước (Step-by-step) để hoàn thiện khung ứng dụng đạt 100%.

---

# PHẦN I: TỔNG HỢP NHỮNG GÌ HIẾU ĐÃ LÀM ĐƯỢC (TASK S-01)

Theo đúng phạm vi **"Khung ứng dụng chạy được trên máy tính cá nhân (Local Runnable Framework)"**, Hiếu đã hoàn thành **85% khối lượng công việc** với các kết quả cụ thể:

### 1. Khung Frontend (`frontend/`):
- **Công nghệ cốt lõi:** Khởi tạo thành công khung dự án bằng **Vite + React 19** (`"react": "^19.2.8"`, `"vite": "^8.3.0"`).
- **Chạy local:** Khởi động thành công môi trường phát triển cục bộ qua `npm run dev` tại cổng mặc định `http://localhost:5173`.
- **Dọn dẹp template (Clean code):** Đã chủ động dọn sạch mã nguồn mẫu của Vite (xóa bỏ ảnh logo Vite/React, xóa nút bấm counter mẫu).
- **Giao diện khung Staging:** [`frontend/src/App.jsx`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/frontend/src/App.jsx) hiển thị đúng thông tin nhận diện dự án:
  *"Hệ thống Quản lý Trạm sạc EV - Phiên bản Staging - Task S-01 - Khung ứng dụng đã sẵn sàng!"*
- **Công cụ kiểm tra lỗi (Linter):** Cài đặt và cấu hình sẵn **Oxlint** (`.oxlintrc.json`, `"oxlint": "^1.81.0"`), cho phép chạy `npm run lint` để kiểm tra lỗi cú pháp siêu nhanh.
- **Tính toàn vẹn:** Mã nguồn build thành công không có lỗi cú pháp (đã được kiểm chứng tự động qua GitHub Actions).

### 2. Môi trường Cơ sở dữ liệu cục bộ ([`docker-compose.yml`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/docker-compose.yml)):
- Tạo sẵn container PostgreSQL 15 Alpine (`ev_charging_db`), mở cổng `5432:5432` kèm volume `postgres_data`.
- Giúp đồng đội khi kéo code về chỉ cần chạy lệnh `docker compose up -d` là có ngay database cục bộ sẵn sàng để kết nối.

### 3. Hướng dẫn chạy máy cá nhân ([`frontend/README.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/frontend/README.md)):
- Đã khởi tạo file hướng dẫn chạy local.

---

# PHẦN II: ĐỐI CHIẾU VỚI `sodo.md` VÀ CÁC TÀI LIỆU TRONG `docs/`

### 1. Đối chiếu với Sơ đồ Kiến trúc ([`sodo.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/sodo.md))
- **Về xương sống kiến trúc:** **HOÀN TOÀN ĐÚNG HƯỚNG**, không bị lệch bản chất (sử dụng React 19 + Vite ở Frontend và PostgreSQL ở tầng lưu trữ).
- **Các điểm lệch / thiếu chi tiết nhỏ:**
  1. *Styling:* `sodo.md` quy định dùng **Tailwind CSS**. Hiện tại Hiếu dùng CSS thuần (`App.css`, `index.css`), chưa cài Tailwind CSS.
  2. *Tên CSDL:* `sodo.md` & docs chuẩn quy định tên CSDL là `ev_csms_db`. Hiếu đặt là `ev_charging_system`.
  3. *Vite Proxy:* `sodo.md` quy định chuyển tiếp `/api` và `/ws` về backend port `8000`. File `frontend/vite.config.js` của Hiếu hiện để trống proxy.
  4. *Bảo mật CSDL:* `docker-compose.yml` đang hardcode password `secretpassword`, cần chuyển sang đọc từ file biến môi trường `.env`.

### 2. Đối chiếu với [`docs/MASTER-ROADMAP.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/docs/MASTER-ROADMAP.md) (Task 0.4)
- **Đã đạt:** Khởi tạo Frontend chạy được tại `localhost:5173`, có React 19 + Vite + Oxlint.
- **Còn thiếu:** Cài Tailwind CSS và cấu hình ESLint chạy song song cùng Oxlint.

### 3. Đối chiếu với [`docs/plans/Buoc-03...`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/docs/plans/Buoc-03-Cau-hinh-Moi-truong-Docker-va-CSDL.md)
- **Đã đạt:** Đã có file `docker-compose.yml` chạy PostgreSQL.
- **Còn thiếu:** File `.env.example` mẫu, đổi tên CSDL thành `ev_csms_db`.

---

# PHẦN III: RÀ SOÁT VÀ GHI NHẬN TRẠNG THÁI TIẾN ĐỘ (`TIEN-DO.MD`)

Dưới đây là bảng ghi nhận tiến độ thực tế theo các bước liên quan trong [`docs/plans/TIEN-DO.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/docs/plans/TIEN-DO.md):

| Mã bước | Tên bước thực hiện | Trạng thái thực tế | Đã có gì (Deliverables đạt được) | Còn thiếu gì (Cần bổ sung) |
|:---:|---|:---:|---|---|
| **Bước 01** | Đặc tả Yêu cầu & Phân tích Nghiệp vụ | **Đang thực hiện (90%)** | • `nentang.md`, `Prompt.md`<br>• `sodo.md` (kiến trúc tổng thể, 2 vòng lặp)<br>• `phân công.md`, `test.md`, `huongdanfix.md` | Hoàn thiện tài liệu nộp mốc KT1: `docs/SDLC/KT1/01_SRS_and_UseCases.md`. |
| **Bước 02** | Thiết kế CSDL & Sơ đồ ERD | **Chưa bắt đầu** | Chưa có file | Bảng thiết kế ERD các thực thể (`Station`, `Charger`, `Session`, `Wallet`, `Tariff`) tại `docs/SDLC/KT1/02_Database_Design_ERD.md`. |
| **Bước 03** | Cấu hình Môi trường, Docker & CSDL | **Đang thực hiện (40%)** | • Đã có `docker-compose.yml` khởi chạy container PostgreSQL 15 cục bộ. | • Đổi tên DB thành `ev_csms_db`.<br>• Tạo file mẫu `.env.example`.<br>• `backend/requirements.txt` (sẽ do BE hoàn thiện). |
| **Bước 10** | Xây dựng Frontend Web (React 19 + Tailwind) | **Đang thực hiện (25%)** | • Khung ứng dụng `frontend/` chạy được qua `npm run dev`.<br>• React 19 + Vite.<br>• Công cụ Oxlint (`npm run lint`).<br>• Màn hình Staging cơ bản. | • Cài đặt `tailwindcss` + `postcss`.<br>• Cấu hình proxy trong `vite.config.js`.<br>• Hoàn thiện `frontend/README.md`.<br>• Dựng các trang nghiệp vụ (Dashboard, Simulator, Wallet...). |

---

# PHẦN IV: HƯỚNG DẪN KHẮC PHỤC CHI TIẾT TỪNG BƯỚC (STEP-BY-STEP FIX)

Chỉ cần thực hiện **5 bước nhanh** sau là toàn bộ mã nguồn của Hiếu sẽ khớp 100% với tài liệu đặc tả:

---

### Bước 1: Cài đặt Tailwind CSS vào `frontend/`
Mở terminal tại thư mục `frontend/` và cài đặt Tailwind CSS:
```bash
cd frontend
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
* Cập nhật file `frontend/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```
* Thêm 3 dòng sau vào đầu file `frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

### Bước 2: Cấu hình Proxy trong `frontend/vite.config.js`
Mở file [`frontend/vite.config.js`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/frontend/vite.config.js) và cập nhật thêm cấu hình `server.proxy`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
```

---

### Bước 3: Chuẩn hóa `docker-compose.yml` & Bảo mật
Cập nhật file [`docker-compose.yml`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/docker-compose.yml) ở thư mục gốc:
```yaml
version: '3.8'

services:
  postgres-db:
    image: postgres:16-alpine
    container_name: ev_charging_db
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-ev_csms_db}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

### Bước 4: Tạo file `.env.example` ở thư mục gốc
Tạo file `.env.example` để làm mẫu cấu hình môi trường cho các thành viên:
```env
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=ev_csms_db
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ev_csms_db

# Backend App Settings
PROJECT_NAME="EV Charging Station Management System"
VERSION="1.0.0"
API_V1_STR="/api/v1"
SECRET_KEY=supersecretkey_change_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
AI_MODEL_NAME=gemini-1.5-flash
```

---

### Bước 5: Hoàn thiện `frontend/README.md`
Cập nhật lại nội dung file [`frontend/README.md`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/frontend/README.md) đầy đủ và chuyên nghiệp:
```markdown
# Hệ thống Quản lý Trạm sạc Xe điện (EV CSMS) - Frontend

## Yêu cầu môi trường
- Node.js >= 18.0.0 (khuyên dùng Node 20 LTS)
- Docker Desktop (để chạy database cục bộ)

## Hướng dẫn cài đặt & Khởi chạy trên máy cá nhân

### 1. Khởi động Cơ sở dữ liệu cục bộ (PostgreSQL)
Tại thư mục gốc dự án:
```bash
docker compose up -d
```
*Thông tin kết nối CSDL:*
- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `ev_csms_db`
- **User:** `postgres`
- **Password:** `postgres`

### 2. Cài đặt và Khởi chạy ứng dụng Frontend
Di chuyển vào thư mục `frontend`:
```bash
cd frontend
npm install
npm run dev
```
Ứng dụng sẽ chạy tại địa chỉ: **`http://localhost:5173`**

### 3. Kiểm tra lỗi cú pháp (Linting)
Dự án tích hợp sẵn công cụ Oxlint siêu nhanh:
```bash
npm run lint
```

### 4. Build sản phẩm
```bash
npm run build
```
```

---

### Bước 6 (Dành cho Study332): Bổ sung Linting vào CI Workflow
Cập nhật file [`.github/workflows/main.yml`](file:///E:/Nền%20tảng%20vận%20hành%20trạm%20sạc%20xe%20điện/.github/workflows/main.yml) để chạy lệnh lint kiểm tra lỗi tự động:
```yaml
    - name: Run Frontend Lint
      run: |
        cd frontend
        npm run lint

    - name: Build Frontend
      run: |
        cd frontend
        npm run build
```
