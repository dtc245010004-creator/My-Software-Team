from datetime import datetime, timedelta, timezone
import math
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.datetime_utils import get_vn_now, to_vn_time
from app.models.session import ChargingSession
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
from app.simulator.charging_simulator import simulator_manager

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
    "/metrics/live",
    response_model=Dict[str, Any],
    summary="Lấy số liệu vận hành mạng lưới thời gian thực (Live Dashboard Metrics)",
)
def get_live_dashboard_metrics(db: Session = Depends(get_db)):
    """
    Truy xuất số liệu vận hành thời gian thực từ bộ nhớ RAM (Simulator) và CSDL:
    - Tổng số trạm, tổng số trụ, tổng công suất lưới.
    - Số trụ sạc đang cấp nguồn (CHARGING) thực tế.
    - Công suất tiêu thụ tức thời thực tế (kW) lấy trực tiếp từ các phiên sạc đang chạy.
    - Số trụ sẵn sàng (AVAILABLE) và số trụ cảnh báo lỗi/bảo trì.
    """
    stations = db.query(Station).filter(Station.is_active == True).all()
    chargers = db.query(ChargingPoint).filter(ChargingPoint.is_active == True).all()

    # Tra cứu simulator đang chạy thực tế trong RAM
    active_sims = list(simulator_manager.active_simulators.values())
    live_power_kw = round(sum(s.power_kw for s in active_sims), 1)

    # Tập hợp các ID trụ sạc đang thực sự có phiên sạc chạy
    charging_charger_ids = set()
    for s in active_sims:
        conn = db.query(Connector).filter(Connector.id == s.connector_id).first()
        if conn and conn.charging_point_id:
            charging_charger_ids.add(conn.charging_point_id)

    # Kiểm tra bổ sung nếu có session ACTIVE trong DB
    db_active_sessions = db.query(ChargingSession).filter(ChargingSession.status == "ACTIVE").all()
    for sess in db_active_sessions:
        conn = db.query(Connector).filter(Connector.id == sess.connector_id).first()
        if conn and conn.charging_point_id:
            charging_charger_ids.add(conn.charging_point_id)

    total_chargers = len(chargers)
    charging_count = len(charging_charger_ids)
    faulted_count = len([c for c in chargers if c.status in ("FAULTED", "UNAVAILABLE")])
    available_count = max(0, total_chargers - charging_count - faulted_count)
    total_grid_kw = round(sum(st.total_grid_capacity_kw or 0.0 for st in stations), 1)

    # Danh sách chi tiết trạng thái từng trụ cho Live Bay Status
    chargers_status = []
    for c in chargers:
        st_status = "CHARGING" if c.id in charging_charger_ids else c.status
        chargers_status.append({
            "id": c.id,
            "station_id": c.station_id,
            "code": c.code,
            "vendor": c.vendor,
            "model": c.model,
            "max_power_kw": c.max_power_kw,
            "status": st_status,
        })

    return {
        "total_stations": len(stations),
        "total_chargers": total_chargers,
        "charging_chargers_count": charging_count,
        "available_chargers_count": available_count,
        "faulted_chargers_count": faulted_count,
        "total_grid_capacity_kw": total_grid_kw,
        "active_power_kw": live_power_kw,
        "active_sessions_count": len(active_sims),
        "chargers": chargers_status,
    }


@router.get(
    "/metrics/load-profile",
    response_model=List[Dict[str, Any]],
    summary="Đo đếm đồ thị phụ tải lưới 24 giờ thực tế từ phiên sạc và công suất live",
)
def get_grid_load_profile(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm cụ thể"),
    db: Session = Depends(get_db),
):
    """
    Tính toán đồ thị phụ tải lưới 24 giờ từ dữ liệu thực tế:
    - Gom nhóm các phiên sạc trong ngày hôm nay (hoặc 24h gần nhất).
    - Tích hợp công suất tức thời của các phiên sạc đang chạy trong RAM vào khung giờ hiện tại.
    - Gắn nhãn TOU linh hoạt (PEAK, NORMAL, OFFPEAK).
    """
    vn_now = get_vn_now()
    current_hour = vn_now.hour

    # Lấy các phiên sạc thực tế phát sinh trong ngày hôm nay (từ 00:00 hôm nay theo giờ VN)
    today_start_vn = vn_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_vn.astimezone(timezone.utc).replace(tzinfo=None)
    query = db.query(ChargingSession).filter(ChargingSession.start_time >= today_start_utc)
    if station_id:
        query = query.join(ChargingSession.connector).join(Connector.charging_point).filter(ChargingPoint.station_id == station_id)
    recent_sessions = query.all()

    # Khung giờ 12 mốc (cách nhau 2 tiếng: 00:00, 02:00, ..., 22:00)
    time_slots = [
        ("00:00", 0, 2),
        ("02:00", 2, 4),
        ("04:00", 4, 6),
        ("06:00", 6, 8),
        ("08:00", 8, 10),
        ("10:00", 10, 12),
        ("12:00", 12, 14),
        ("14:00", 14, 16),
        ("16:00", 16, 18),
        ("18:00", 18, 20),
        ("20:00", 20, 22),
        ("22:00", 22, 24),
    ]

    # Tính tổng công suất tức thời hiện tại từ simulator
    live_sim_power = sum(s.power_kw for s in simulator_manager.active_simulators.values())

    load_profile = []
    for slot_label, start_h, end_h in time_slots:
        # Lọc các session bắt đầu trong khung giờ này (theo giờ Việt Nam)
        slot_kwh = sum(
            float(s.total_kwh or 0.0)
            for s in recent_sessions
            if s.start_time and start_h <= to_vn_time(s.start_time).hour < end_h
        )
        # Ước tính công suất trung bình trong slot (kWh / 2h)
        est_kw = round(slot_kwh / 2.0, 1)

        # Nếu khung giờ này bao gồm giờ hiện tại, lấy max với công suất live
        is_current_slot = start_h <= current_hour < end_h
        if is_current_slot and live_sim_power > 0:
            est_kw = round(max(est_kw, live_sim_power), 1)

        # Xác định priceSlot TOU
        if (start_h >= 10 and end_h <= 12) or (start_h >= 18 and end_h <= 20):
            price_slot = "PEAK"
        elif start_h >= 22 or end_h <= 4:
            price_slot = "OFFPEAK"
        else:
            price_slot = "NORMAL"

        load_profile.append({
            "time": slot_label,
            "loadKw": est_kw,
            "priceSlot": price_slot,
            "isLive": is_current_slot,
        })

    return load_profile


@router.get(
    "/metrics/load-profile-timeline",
    response_model=List[Dict[str, Any]],
    summary="Đo đếm phụ tải lưới chi tiết 1440 phút (24 Giờ Equalizer)",
)
def get_grid_load_profile_timeline(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm cụ thể"),
    db: Session = Depends(get_db),
):
    """
    Trả về đúng 1440 điểm (từ 00:00 đến 23:59) phục vụ biểu đồ mật độ cao dạng Equalizer:
    - Mỗi điểm: { "time": "HH:MM", "powerKw": float, "isPlaceholder": bool, "noData": bool }
    - powerKw: Công suất trung bình mỗi phút (kW) dựa trên điện năng thực tế tiêu thụ (P_avg = ΔkWh * 60), bảo toàn 100% năng lượng.
    - Phút tương lai (sau thời điểm hiện tại): isPlaceholder = True, noData = False, powerKw = 0.0
    - Phút quá khứ đã có log trong DB (hoặc phút hiện tại có live power): isPlaceholder = False, noData = False, powerKw = value
    - Phút quá khứ chưa có dữ liệu trong DB (trước thời điểm ghi log): isPlaceholder = True, noData = True, powerKw = 0.0
    """
    from app.models.station import StationPowerMetric

    vn_now = get_vn_now()
    vn_today_start = vn_now.replace(hour=0, minute=0, second=0, microsecond=0)
    vn_current_minute_floor = vn_now.replace(second=0, microsecond=0)

    today_start_utc = vn_today_start.astimezone(timezone.utc).replace(tzinfo=None)
    now_utc = vn_now.astimezone(timezone.utc).replace(tzinfo=None)

    # 1. Truy vấn toàn bộ log của ngày hôm nay từ CSDL (tính theo ngày Việt Nam)
    query = db.query(StationPowerMetric).filter(
        StationPowerMetric.timestamp >= today_start_utc,
        StationPowerMetric.timestamp <= now_utc,
    )
    if station_id:
        query = query.filter(StationPowerMetric.station_id == station_id)

    db_metrics = query.all()

    # Gom nhóm theo mốc phút theo giờ Việt Nam: timestamp_str -> power_kw
    recorded_power_map: Dict[str, float] = {}
    for m in db_metrics:
        m_vn = to_vn_time(m.timestamp)
        t_key = m_vn.strftime("%H:%M")
        recorded_power_map[t_key] = round(recorded_power_map.get(t_key, 0.0) + float(m.power_kw), 2)

    # 2. Lấy công suất live từ RAM Simulator cho phút hiện tại
    active_sims = list(simulator_manager.active_simulators.values())
    live_power_now = 0.0
    if active_sims:
        if station_id:
            conn_ids = [s.connector_id for s in active_sims]
            st_conn_ids = set(
                cid for (cid,) in db.query(Connector.id)
                .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
                .filter(ChargingPoint.station_id == station_id, Connector.id.in_(conn_ids))
                .all()
            )
            live_power_now = sum(s.power_kw for s in active_sims if s.connector_id in st_conn_ids)
        else:
            live_power_now = sum(s.power_kw for s in active_sims)
    live_power_now = round(live_power_now, 2)

    # 3. Tạo đủ 1440 điểm (từ 00:00 đến 23:59 theo giờ VN)
    timeline: List[Dict[str, Any]] = []
    for minute_idx in range(1440):
        slot_time = vn_today_start + timedelta(minutes=minute_idx)
        time_str = slot_time.strftime("%H:%M")

        if slot_time > vn_current_minute_floor:
            # Tương lai: Chưa tới
            timeline.append({
                "time": time_str,
                "powerKw": 0.0,
                "isPlaceholder": True,
                "noData": False,
            })
        elif slot_time == vn_current_minute_floor:
            # Phút hiện tại: lấy max giữa live power từ RAM và giá trị đã lưu
            current_kw = max(live_power_now, recorded_power_map.get(time_str, 0.0))
            timeline.append({
                "time": time_str,
                "powerKw": current_kw,
                "isPlaceholder": False,
                "noData": False,
            })
        else:
            # Quá khứ: Đã qua
            if time_str in recorded_power_map:
                timeline.append({
                    "time": time_str,
                    "powerKw": recorded_power_map[time_str],
                    "isPlaceholder": False,
                    "noData": False,
                })
            else:
                # Quá khứ chưa từng ghi log (tính năng mới triển khai)
                timeline.append({
                    "time": time_str,
                    "powerKw": 0.0,
                    "isPlaceholder": True,
                    "noData": True,
                })

    return timeline


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
