# BƯỚC 06: MODULE QUẢN LÝ HẠ TẦNG TRẠM, TRỤ & CỔNG SẠC (STATION & ASSET MANAGEMENT)

> **TÍNH CHẤT TÀI LIỆU:** Đây là một **Prompt / Nhiệm vụ thực thi độc lập (Self-contained Spec)**. Bất kỳ AI hoặc lập trình viên nào khi đọc tài liệu này đều có đầy đủ 100% bối cảnh, yêu cầu và tiêu chuẩn nghiệm thu để thực hiện mà không cần tra cứu thêm.
>
> **RANH GIỚI TÀI LIỆU:**
>
> - `docs/plans/Buoc-06-...md`: Tài liệu KẾ HOẠCH & CHECKLIST thực thi (nơi bạn đang đọc).
> - Hồ sơ CSDL liên kết: [`docs/SDLC/KT1/02_Database_Design_ERD.md`](../SDLC/KT1/02_Database_Design_ERD.md) (đã cập nhật đồng bộ các cột mới và ràng buộc).
> - Mã nguồn được sinh trực tiếp vào thư mục `backend/app/` (models, schemas, services, endpoints, tests).

---

## 1. Mục tiêu bước 6

- Xây dựng hoàn chỉnh phân hệ quản lý tài sản phần cứng trạm sạc xe điện theo mô hình phân cấp 3 tầng thực tế:
  $$\text{Trạm sạc (Station)} \longrightarrow \text{Trụ sạc / EVSE (ChargingPoint)} \longrightarrow \text{Cổng/Súng sạc (Connector: CCS2, Type 2)}$$
- **Triệt tiêu mâu thuẫn trạng thái**: Tách bạch tuyệt đối giữa **Trạng thái tồn tại logic (`is_active: bool`)** để hỗ trợ Soft-Delete/Reactivate và **Trạng thái vận hành thiết bị (`status: str`)** theo máy trạng thái phần cứng (Station chỉ gồm 2 giá trị vận hành: `ACTIVE`, `MAINTENANCE`; không có `INACTIVE`).
- Cung cấp tính toán chỉ số Quá tải công suất nguồn lưới (**Oversubscription**) ở cả 2 cấp:
  + Cấp Trạm (Station vs Chargers): So sánh `total_grid_capacity_kw` với $\sum \text{ChargingPoint.max_power_kw}$.
  + Cấp Trụ (Charger vs Connectors): So sánh `ChargingPoint.max_power_kw` với $\sum \text{Connector.max_power_kw}$ kèm cờ `power_sharing_enabled: bool`.
- Triển khai thuật toán tìm trạm gần nhất bằng công thức **Haversine** (Python thuần tại Service Layer) kết hợp lọc thô **Bounding Box** tại CSDL và hỗ trợ **Phân trang (`skip`, `limit`)**.
- Kiểm soát phân quyền đa người thuê chặt chẽ (**Multi-tenant Ownership & IDOR Protection**) ở cả cấp Station và cấp Charger (bao gồm cả endpoint `PATCH /chargers/{id}/status`).
- Thiết lập đường phục hồi rõ ràng qua endpoint chuyên biệt `POST /reactivate` và bảo đảm **Cascade Atomicity** trong 1 Database Transaction duy nhất.

---

## 2. Nội dung công việc chi tiết

### 2.1. Models & Quan hệ thực thể (`app/models/station.py`)

*(Đã đồng bộ 100% với [`docs/SDLC/KT1/02_Database_Design_ERD.md`](../SDLC/KT1/02_Database_Design_ERD.md))*

1. **`Station` (`stations`)**:
   - `id`: Integer, PK.
   - `operator_id`: Integer, FK `users.id` (Chỉ role `OPERATOR` hoặc `ADMIN`), Index, Not Null.
   - `name`: String(100), Not Null.
   - `address`: String(255), Not Null.
   - `latitude`: Float, Not Null.
   - `longitude`: Float, Not Null.
   - `total_grid_capacity_kw`: Float, Not Null (Công suất nguồn cấp từ điện lực, ví dụ 150.0 kW).
   - `operating_hours`: String(50), default "24/7".
   - `status`: String(20), default "ACTIVE" (Chỉ gồm 2 giá trị vận hành: `ACTIVE`, `MAINTENANCE` - đã xóa `INACTIVE`).
   - `is_active`: Boolean, default True (Cờ trạng thái tồn tại logic / Soft Delete).
   - `created_at`: DateTime(timezone=True), server_default=func.now().
   - `updated_at`: DateTime(timezone=True), onupdate=func.now().
   - Quan hệ: `charging_points = relationship("ChargingPoint", back_populates="station", cascade="all, delete-orphan")`.

2. **`ChargingPoint` (`charging_points`)**:
   - `id`: Integer, PK.
   - `station_id`: Integer, FK `stations.id`, Index, Not Null.
   - `code`: String(50), Unique, Index, Not Null (Mã định danh trụ sạc EVSE ID, ví dụ `HN-ST01-CP01`).
   - `vendor`: String(50), Nullable (Hãng sản xuất: ABB, Schneider, Star Charge...).
   - `model`: String(50), Nullable.
   - `max_power_kw`: Float, Not Null (Công suất tối đa của trụ, ví dụ 60.0 kW).
   - `firmware_version`: String(50), Nullable.
   - `status`: String(20), default "AVAILABLE" (`AVAILABLE`, `PREPARING`, `CHARGING`, `FAULTED`, `UNAVAILABLE`).
   - `power_sharing_enabled`: Boolean, default True (Bật/tắt tính năng chia sẻ tải động giữa các súng sạc).
   - `is_active`: Boolean, default True (Cờ trạng thái tồn tại logic / Soft Delete).
   - `created_at`: DateTime(timezone=True), server_default=func.now().
   - Quan hệ: `station`, `connectors = relationship("Connector", back_populates="charging_point", cascade="all, delete-orphan")`.

3. **`Connector` (`connectors`)**:
   - `id`: Integer, PK.
   - `charging_point_id`: Integer, FK `charging_points.id`, Index, Not Null.
   - `connector_number`: Integer, Not Null (Súng số 1, số 2...).
   - `connector_type`: String(20), Not Null (`CCS2`, `TYPE_2`, `CHADEMO`).
   - `max_power_kw`: Float, Not Null (Công suất tối đa cổng hỗ trợ, ví dụ 60.0 kW).
   - `status`: String(20), default "AVAILABLE" (`AVAILABLE`, `OCCUPIED`, `CHARGING`, `FAULTED`, `UNAVAILABLE`).
   - `is_active`: Boolean, default True (Cờ trạng thái tồn tại logic / Soft Delete).
   - Ràng buộc CSDL: `UniqueConstraint("charging_point_id", "connector_number", name="uq_charger_connector_number")`.

---

### 2.2. Schemas (`app/schemas/station.py`)

- `ConnectorCreate`, `ConnectorResponse`.
- `ChargingPointCreate`, `ChargingPointUpdate`, `ChargingPointStatusUpdate`, `ChargingPointResponse` (tính toán `total_connector_power_kw`, `power_sharing_enabled: bool`).
- `StationCreate`, `StationUpdate`, `StationResponse` (tính toán `total_installed_power_kw`, `oversubscription_ratio: float`, `is_oversubscribed: bool`).
- `StationDistanceResponse` (kế thừa `StationResponse` kèm `distance_km: float`).
- Hỗ trợ tham số phân trang chuẩn: `skip: int = 0, limit: int = 50`.

---

### 2.3. Dịch vụ Nghiệp vụ (`app/services/station_service.py`)

- **Bảo vệ quyền sở hữu đa CPO (IDOR Protection)**:
  + `verify_station_ownership(station: Station, user: User)`: Ném HTTP 403 nếu user không phải Admin và không sở hữu trạm.
  + `verify_charger_ownership(charger: ChargingPoint, user: User)`: Nạp trạm cha `charger.station` và kiểm tra quyền sở hữu tương tự.
- **Tính khoảng cách Haversine & Bounding Box**:
  Hàm `calculate_haversine_distance(lat1, lon1, lat2, lon2) -> float` và logic lọc SQL `latitude/longitude BETWEEN ...`.
- **Nguyên tử hóa Cascade Soft-Delete & Reactivate (Cascade Atomicity)**:
  + **Cam kết kỹ thuật**: Toàn bộ thao tác cập nhật cascade (`Station` + `ChargingPoint` + `Connector`) khi Soft-Delete (`is_active = False`) hoặc Reactivate (`is_active = True`) **bắt buộc nằm trọn trong 1 Database Transaction duy nhất**.
  + Xử lý qua khối `try / commit / except / rollback`: Bất kỳ lỗi nào phát sinh ở cấp con $\rightarrow$ Rollback toàn bộ, tuyệt đối không để xảy ra trạng thái nửa trạm bị xóa, nửa trụ còn hoạt động.
- **Phát sự kiện thời gian thực**:
  Gọi `ws_manager.broadcast()` khi trạng thái cổng/trụ thay đổi (`STATUS_CHANGED`).

---

### 2.4. Endpoints API

1. **`app/api/v1/endpoints/stations.py`**:
   - `GET /api/v1/stations`: Tìm kiếm, lọc trạm công khai (`is_active=True`, filter: `connector_type`, `status`, `user_lat`, `user_lon`, `radius_km`, phân trang `skip: int = 0, limit: int = 50`).
   - `GET /api/v1/stations/{id}`: Xem chi tiết trạm và cây phân cấp trụ/cổng.
   - `POST /api/v1/stations`: Tạo trạm mới (Yêu cầu role `ADMIN` hoặc `OPERATOR`; tự động gắn `operator_id = current_user.id`).
   - `PUT /api/v1/stations/{id}`: Cập nhật thông tin trạm (Chặn IDOR: chỉ owner hoặc Admin).
   - `DELETE /api/v1/stations/{id}`: Xóa mềm trạm (Soft delete nguyên tử: `is_active = False` cascade xuống con).
   - `POST /api/v1/stations/{id}/reactivate`: Phục hồi hoạt động trạm sau soft-delete (`is_active = True` cascade xuống con).

2. **`app/api/v1/endpoints/chargers.py`**:
   - `POST /api/v1/stations/{station_id}/chargers`: Thêm trụ sạc mới vào trạm (Chặn IDOR cấp Station).
   - `GET /api/v1/chargers/{id}`: Xem chi tiết trụ sạc và các cổng sạc.
   - `PUT /api/v1/chargers/{id}`: Cập nhật cấu hình trụ sạc (Chặn IDOR cấp Charger).
   - `PATCH /api/v1/chargers/{id}/status`: Cập nhật trạng thái trụ sạc & broadcast WebSocket (Chặn IDOR cấp Charger).
   - `DELETE /api/v1/chargers/{id}`: Xóa mềm trụ sạc (Soft delete nguyên tử: `is_active = False` cascade xuống súng).
   - `POST /api/v1/chargers/{id}/reactivate`: Phục hồi trụ sạc (`is_active = True` cascade xuống súng).
   - `POST /api/v1/chargers/{id}/connectors`: Thêm cổng sạc mới vào trụ (Chặn IDOR).

---

## 3. Cấu trúc file thực hiện

```text
backend/
├── app/
│   ├── models/
│   │   └── station.py                 # Station, ChargingPoint, Connector models
│   ├── schemas/
│   │   └── station.py                 # Pydantic Schemas & Oversubscription models
│   ├── services/
│   │   └── station_service.py         # Haversine distance, IDOR guards, Atomic Soft-delete & Reactivate
│   └── api/v1/endpoints/
│       ├── stations.py                # Router trạm sạc & tìm kiếm theo vị trí
│       └── chargers.py                # Router trụ sạc & cổng sạc
└── tests/
    └── test_stations.py               # Bộ test tự động kiểm thử toàn diện Bước 06 (12+ test cases)
```

---

## 4. Checklist thực hiện (Definition of Done)

- [x] Cài đặt Models `Station`, `ChargingPoint`, `Connector` tách bạch `is_active` (xóa mềm) và `status` (Station: `ACTIVE`/`MAINTENANCE`, đã xóa `INACTIVE`).
- [x] Xác nhận đồng bộ 100% với `docs/SDLC/KT1/02_Database_Design_ERD.md` (Mermaid, Data Dictionary, DDL).
- [x] Thiết lập ràng buộc duy nhất: `ChargingPoint.code` (Unique toàn hệ thống) và `UniqueConstraint("charging_point_id", "connector_number")`.
- [x] Cài đặt Schemas `station.py` tính toán chỉ số Quá tải công suất (Oversubscription) ở cả cấp Station và cấp Charger kèm phân trang `skip/limit`.
- [x] Cài đặt `station_service.py` với thuật toán Haversine tính khoảng cách và hàm bảo vệ kiểm tra quyền sở hữu chống IDOR cấp Station và Charger.
- [x] Cài đặt Endpoints `/stations` và `/chargers` với cơ chế Soft-Delete (`is_active = False`) và Reactivate (`is_active = True`) bọc trong 1 Transaction nguyên tử duy nhất (Cascade Atomicity).
- [x] Tích hợp phát sự kiện WebSocket `STATUS_CHANGED` khi trạng thái trụ/cổng thay đổi.
- [x] Xây dựng bộ test tự động `backend/tests/test_stations.py` (12 test cases) phủ kín:
  1. Khách vãng lai xem danh sách trạm có phân trang (`skip`, `limit`) và tìm trạm gần nhất theo tọa độ Haversine.
  2. Driver (`CUSTOMER`) bị chặn HTTP 403 khi cố tạo/sửa/xóa trạm hoặc trụ.
  3. Operator tạo trạm $\rightarrow$ tự động gán `operator_id = current_user.id`.
  4. Chống IDOR cấp Station: Operator A cố sửa/xóa trạm của Operator B $\rightarrow$ HTTP 403.
  5. Chống IDOR cấp Charger (Create/Update): Operator A cố thêm/sửa charger trên trạm của Operator B $\rightarrow$ HTTP 403.
  6. **Chống IDOR trên PATCH `/chargers/{id}/status`**: Operator A cố thay đổi trạng thái charger thuộc trạm Operator B $\rightarrow$ HTTP 403.
  7. Admin có toàn quyền quản trị tài sản của mọi Operator.
  8. Thêm trụ vượt công suất trạm $\rightarrow$ không chặn cứng nhưng tính đúng `is_oversubscribed = True`.
  9. Ràng buộc trùng mã trụ `code` hoặc trùng số súng $\rightarrow$ HTTP 400 Bad Request.
  10. Soft-delete trạm/trụ $\rightarrow$ `is_active = False`, trạm biến mất khỏi API tìm kiếm công khai nhưng còn nguyên trong CSDL.
  11. **Phục hồi sau soft-delete (`POST /stations/{id}/reactivate`)**: Khôi phục trạm $\rightarrow$ `is_active = True` cascade xuống con và xuất hiện trở lại trong danh sách tìm kiếm công khai.
  12. Cập nhật trạng thái trụ sạc $\rightarrow$ phát thông điệp broadcast qua WebSocket.
- [x] Chạy `pytest` đạt 100% pass (25/25 tests: 12 auth, 1 health, 12 stations).
- [x] Cập nhật trạng thái Bước 06 trong `docs/plans/TIEN-DO.md`, `docs/codebase-map.md` và `docs/MASTER-ROADMAP.md`.

---

## 5. 📝 Cập nhật thực tế so với kế hoạch ban đầu (2026-09-25)

Trong quá trình triển khai Bước 06, hệ thống đã chuẩn hóa các quyết định kỹ thuật và cấu trúc sau:

| # | Hạng mục điều chỉnh | So với mô tả ban đầu | Quyết định kỹ thuật / Lý do kiến trúc |
| :---: | --- | --- | --- |
| **1** | **Chuẩn hóa enum `Station.status`** | Ban đầu có `ACTIVE, INACTIVE, MAINTENANCE` | Loại bỏ hoàn toàn `INACTIVE` khỏi operational status. Trạng thái vận hành của trạm chỉ còn `ACTIVE` và `MAINTENANCE`. Việc bật/tắt/xóa trạm được đảm nhận độc quyền bởi cờ logic `is_active: bool`. |
| **2** | **Bổ sung `is_active` & `power_sharing_enabled`** | Ban đầu chưa có trong ERD gốc | Thêm `is_active` cho cả 3 bảng (`stations`, `charging_points`, `connectors`) và `power_sharing_enabled` cho `charging_points`. Đồng thời cập nhật đồng bộ hồ sơ `docs/SDLC/KT1/02_Database_Design_ERD.md` (Mermaid, Data Dictionary, DDL). |
| **3** | **Đường phục hồi chuyên biệt (`POST /reactivate`)** | Ban đầu chưa có cơ chế phục hồi sau soft-delete | Thêm các endpoint `POST /stations/{id}/reactivate` và `POST /chargers/{id}/reactivate` giúp khôi phục trạng thái hoạt động sạch sẽ, tách bạch khỏi các cập nhật PUT thông thường. |
| **4** | **Cam kết Cascade Atomicity** | Ban đầu chỉ mô tả cascade chung | Bọc toàn bộ quá trình cập nhật cascade `is_active` (Station $\rightarrow$ Chargers $\rightarrow$ Connectors) trong 1 Transaction duy nhất với `try / commit / except / rollback`, triệt tiêu trạng thái nửa xóa. |
| **5** | **Chống IDOR 2 cấp độ** | Ban đầu chỉ kiểm tra cơ bản | Kiểm soát quyền sở hữu đa CPO ở cả cấp Trạm (Station) và cấp Trụ (Charger), đặc biệt là endpoint `PATCH /chargers/{id}/status`. Operator không thể can thiệp vào tài sản của Operator khác (HTTP 403). |
| **6** | **Tính toán Oversubscription 2 cấp độ** | Ban đầu chỉ nêu chung | Cung cấp sẵn các trường tính toán: Cấp Trạm (`oversubscription_ratio`, `is_oversubscribed`) và Cấp Trụ (`total_connector_power_kw`, `is_power_sharing`) làm tiền đề cho AI Smart Charging (Bước 09). |
| **7** | **Định vị Haversine + Phân trang chuẩn** | Ban đầu chỉ ghi tìm kiếm chung | Tích hợp công thức Haversine chính xác kết hợp lọc thô Bounding Box và phân trang `skip/limit` trên `GET /stations`. |

