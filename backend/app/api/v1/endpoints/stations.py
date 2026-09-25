import math
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.schemas.station import (
    StationCreate,
    StationDistanceResponse,
    StationResponse,
    StationUpdate,
)
from app.services.station_service import (
    atomic_reactivate_station,
    atomic_soft_delete_station,
    calculate_haversine_distance,
    enrich_station_response,
    verify_station_ownership,
)

router = APIRouter(prefix="/stations", tags=["Quản lý Trạm sạc (Stations)"])


@router.get(
    "",
    response_model=List[Union[StationDistanceResponse, StationResponse]],
    summary="Tìm kiếm, lọc danh sách trạm sạc (Hỗ trợ định vị Haversine & Phân trang)",
)
def list_stations(
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số lượng bản ghi tối đa"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo status: ACTIVE, MAINTENANCE"),
    connector_type: Optional[str] = Query(None, description="Lọc theo chuẩn sạc: CCS2, TYPE_2, CHADEMO"),
    user_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Vĩ độ người dùng để tính khoảng cách"),
    user_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Kinh độ người dùng để tính khoảng cách"),
    radius_km: Optional[float] = Query(None, gt=0, description="Bán kính tìm kiếm xung quanh (km)"),
    db: Session = Depends(get_db),
):
    """
    API tìm kiếm công khai dành cho cả khách vãng lai và tài xế:
    - Mặc định chỉ lấy trạm đang hoạt động logic (is_active == True).
    - Hỗ trợ lọc Bounding Box nhanh tại CSDL kết hợp tính khoảng cách Haversine chuẩn xác.
    - Hỗ trợ phân trang chuẩn qua skip & limit.
    """
    query = db.query(Station).filter(Station.is_active == True)

    if status_filter:
        query = query.filter(Station.status == status_filter.upper())

    if connector_type:
        query = (
            query.join(Station.charging_points)
            .join(ChargingPoint.connectors)
            .filter(
                Connector.connector_type == connector_type.upper(),
                Connector.is_active == True,
                ChargingPoint.is_active == True,
            )
            .distinct()
        )

    # Nếu có tọa độ GPS -> Lọc thô Bounding Box và tính khoảng cách Haversine
    if user_lat is not None and user_lon is not None:
        if radius_km:
            dlat = radius_km / 111.0
            cos_lat = math.cos(math.radians(user_lat))
            dlon = radius_km / (111.0 * cos_lat) if cos_lat != 0 else radius_km / 111.0
            query = query.filter(
                Station.latitude.between(user_lat - dlat, user_lat + dlat),
                Station.longitude.between(user_lon - dlon, user_lon + dlon),
            )

        stations = query.all()
        results: List[StationDistanceResponse] = []
        for st in stations:
            dist = calculate_haversine_distance(user_lat, user_lon, st.latitude, st.longitude)
            if radius_km is None or dist <= radius_km:
                enriched = enrich_station_response(st)
                dist_item = StationDistanceResponse.model_validate(enriched)
                dist_item.distance_km = dist
                results.append(dist_item)

        # Sắp xếp theo khoảng cách tăng dần và áp dụng phân trang
        results.sort(key=lambda x: x.distance_km if x.distance_km is not None else 999999.0)
        return results[skip : skip + limit]

    # Không truyền GPS -> Phân trang thông thường
    stations = query.offset(skip).limit(limit).all()
    return [enrich_station_response(st) for st in stations]


@router.get(
    "/{station_id}",
    response_model=StationResponse,
    summary="Xem thông tin chi tiết trạm sạc cùng các trụ và cổng sạc",
)
def get_station(station_id: int, db: Session = Depends(get_db)):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc.")
    return enrich_station_response(station)


@router.post(
    "",
    response_model=StationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo trạm sạc mới (Dành cho CPO / ADMIN)",
)
def create_station(
    station_in: StationCreate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """
    Tạo trạm sạc mới:
    - Bắt buộc vai trò ADMIN hoặc OPERATOR.
    - Tự động gắn operator_id = current_user.id.
    """
    new_station = Station(
        operator_id=current_user.id,
        name=station_in.name,
        address=station_in.address,
        latitude=station_in.latitude,
        longitude=station_in.longitude,
        total_grid_capacity_kw=station_in.total_grid_capacity_kw,
        operating_hours=station_in.operating_hours,
        status=station_in.status,
        is_active=True,
    )
    db.add(new_station)
    db.commit()
    db.refresh(new_station)
    return enrich_station_response(new_station)


@router.put(
    "/{station_id}",
    response_model=StationResponse,
    summary="Cập nhật cấu hình trạm sạc (Chặn IDOR)",
)
def update_station(
    station_id: int,
    station_in: StationUpdate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Cập nhật trạm sạc: Kiểm tra quyền sở hữu (Owner hoặc Admin)."""
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc.")

    verify_station_ownership(station, current_user)

    update_data = station_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(station, field, value)

    db.commit()
    db.refresh(station)
    return enrich_station_response(station)


@router.delete(
    "/{station_id}",
    summary="Xóa mềm trạm sạc (Cascade Atomicity Soft-Delete)",
)
def delete_station(
    station_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """
    Xóa mềm trạm sạc:
    - Kiểm tra quyền sở hữu (IDOR Guard).
    - Gán is_active = False cascade cho toàn bộ trụ và cổng trong 1 Transaction nguyên tử duy nhất.
    """
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc.")

    verify_station_ownership(station, current_user)
    atomic_soft_delete_station(db, station)
    return {"message": f"Đã xóa mềm trạm sạc '{station.name}' và toàn bộ thiết bị liên kết thành công."}


@router.post(
    "/{station_id}/reactivate",
    response_model=StationResponse,
    summary="Phục hồi hoạt động trạm sạc sau khi đã xóa mềm",
)
def reactivate_station(
    station_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """
    Phục hồi hoạt động trạm:
    - Kiểm tra quyền sở hữu (IDOR Guard).
    - Gán is_active = True cascade cho toàn bộ trụ và cổng trong 1 Transaction nguyên tử duy nhất.
    """
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc.")

    verify_station_ownership(station, current_user)
    atomic_reactivate_station(db, station)
    return enrich_station_response(station)
