# BƯỚC 06: MODULE QUẢN LÝ HẠ TẦNG TRẠM, TRỤ & CỔNG SẠC (STATION & ASSET MANAGEMENT)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
> - `docs/plans/Buoc-06-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, services, endpoints).

---

## 1. Mục tiêu bước 6
- Xây dựng hoàn chỉnh phân hệ quản lý tài sản phần cứng trạm sạc: Trạm sạc (`Station`), Trụ sạc (`ChargingPoint / EVSE`), Cổng/Súng sạc (`Connector`).
- Cung cấp API cho CPO quản lý danh mục, cấu hình công suất nguồn trạm (`total_grid_capacity_kw`) và theo dõi trạng thái trụ sạc theo thời gian thực.
- Cung cấp API tìm kiếm trạm sạc công khai cho khách hàng lái xe điện (lọc theo vị trí, loại cổng CCS2/Type 2, trạng thái rảnh).

---

## 2. Nội dung công việc chi tiết

### 2.1. Models & Quan hệ thực thể
- `Station`: `id`, `name`, `address`, `latitude`, `longitude`, `total_grid_capacity_kw`, `operating_hours`, `status`.
- `ChargingPoint`: `id`, `station_id`, `code`, `vendor`, `model`, `max_power_kw`, `firmware_version`, `status` (`AVAILABLE`, `PREPARING`, `CHARGING`, `FAULTED`, `UNAVAILABLE`).
- `Connector`: `id`, `charging_point_id`, `connector_number`, `connector_type` (`CCS2`, `TYPE_2`, `CHADEMO`), `max_power_kw`, `status`.

### 2.2. Services & Endpoints
- `app/services/station_service.py`:
  - CRUD Trạm sạc, Trụ sạc, Cổng sạc.
  - Cập nhật trạng thái trụ sạc và phát sự kiện cập nhật qua WebSocket.
- `app/api/v1/endpoints/stations.py`:
  - `GET /api/v1/stations`: Lấy danh sách trạm sạc (hỗ trợ tìm kiếm, lọc theo cổng, trạng thái).
  - `GET /api/v1/stations/{id}`: Chi tiết trạm sạc và danh sách trụ/cổng sạc con.
  - `POST /api/v1/stations`: Tạo mới trạm sạc (dành cho Admin / Operator).
  - `PUT /api/v1/stations/{id}`: Cập nhật thông tin trạm sạc.
- `app/api/v1/endpoints/chargers.py`:
  - CRUD Trụ sạc và Cổng sạc.
  - `PATCH /api/v1/chargers/{id}/status`: Cập nhật trạng thái trụ sạc.

---

## 3. Cấu trúc file cần sinh
```text
backend/
├── app/
│   ├── models/
│   │   ├── station.py                 # Station, ChargingPoint, Connector
│   ├── schemas/
│   │   └── station.py                 # Schemas cho Station, Charger, Connector
│   ├── services/
│   │   └── station_service.py         # Business logic quản lý hạ tầng trạm
│   └── api/v1/endpoints/
│       ├── stations.py                # Router trạm sạc
│       └── chargers.py                # Router trụ sạc & cổng sạc
```

---

## 4. Bảng kiểm tra thực hiện & Trạng thái (Execution Checklist)

> **Quy ước trạng thái ô:** ⬜ Chưa bắt đầu · 🔄 Đang thực hiện · ✅ Hoàn thành · ⚠️ Cần xem xét

| Hạng mục kiểm tra | Trạng thái | Đánh giá thực tế & Nguyên nhân trạng thái |
|---|:---:|---|
| **1. Models Station, ChargingPoint, Connector** | ⬜ Chưa bắt đầu | Cần cấu hình quan hệ phân cấp: Station -> ChargingPoint -> Connector. |
| **2. Quản lý công suất nguồn trạm (`grid_capacity_kw`)** | ⬜ Chưa bắt đầu | Tham số quan trọng làm đầu vào cho thuật toán điều phối tải AI / Heuristic. |
| **3. Nghiệp vụ hạ tầng (`station_service.py`)** | ⬜ Chưa bắt đầu | Tách biệt hoàn toàn nghiệp vụ khỏi tầng router theo quy chuẩn kiến trúc. |
| **4. Endpoints CRUD `/stations` và `/chargers`** | ⬜ Chưa bắt đầu | Cung cấp API quản lý danh sách trạm, bộ lọc theo thành phố, công suất. |
| **5. Cập nhật tiến độ vào `docs/plans/TIEN-DO.md`** | ✅ Hoàn thành | Đã ghi nhận đúng tiến độ (Đạt 0% - Chưa bắt đầu). |
