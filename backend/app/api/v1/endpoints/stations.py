import asyncio
import json
import math
from datetime import timedelta, timezone
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_optional_current_user, require_roles
from app.core.database import get_db
from app.core.datetime_utils import get_vn_now, to_vn_time
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.services.event_broadcaster import sse_broadcaster
from app.schemas.station import (
    StationCreate,
    StationDistanceResponse,
    StationGridItem,
    StationResponse,
    StationTreeItem,
    StationUpdate,
)
from app.services.station_service import (
    atomic_reactivate_station,
    atomic_soft_delete_station,
    calculate_haversine_distance,
    enrich_station_response,
    get_accessible_station_ids,
    get_station_grid,
    get_station_tree,
    verify_station_ownership,
)
from app.simulator.charging_simulator import simulator_manager

router = APIRouter(prefix="/stations", tags=["Quản lý Trạm sạc (Stations)"])


@router.get(
    "/owners",
    response_model=List[Dict[str, Any]],
    summary="Lấy danh sách các chủ trạm sạc (Dành riêng cho Quản trị viên)",
)
def list_station_owners(
    current_user: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    """Admin lấy danh sách tài khoản Chủ trạm sạc (Role: OPERATOR) để gán cho trạm."""
    owners = (
        db.query(User).filter(User.role == "OPERATOR", User.is_active.is_(True)).all()
    )
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name or u.username,
            "email": u.email,
        }
        for u in owners
    ]


@router.get(
    "",
    response_model=List[Union[StationDistanceResponse, StationResponse]],
    summary="Tìm kiếm, lọc danh sách trạm sạc (Hỗ trợ định vị Haversine & Phân trang)",
)
def list_stations(
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số lượng bản ghi tối đa"),
    status_filter: Optional[str] = Query(
        None, alias="status", description="Lọc theo status: ACTIVE, MAINTENANCE"
    ),
    connector_type: Optional[str] = Query(
        None, description="Lọc theo chuẩn sạc: CCS2, TYPE_2, CHADEMO"
    ),
    user_lat: Optional[float] = Query(
        None, ge=-90.0, le=90.0, description="Vĩ độ người dùng để tính khoảng cách"
    ),
    user_lon: Optional[float] = Query(
        None, ge=-180.0, le=180.0, description="Kinh độ người dùng để tính khoảng cách"
    ),
    radius_km: Optional[float] = Query(
        None, gt=0, description="Bán kính tìm kiếm xung quanh (km)"
    ),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    API tìm kiếm danh sách trạm sạc:
    - Chủ trạm (OPERATOR): Chỉ thấy các trạm do chính mình sở hữu (operator_id == current_user.id).
    - Quản trị viên (ADMIN): Thấy toàn bộ trạm trong hệ thống (kể cả trạm chưa gán chủ).
    - Khách / Tài xế (CUSTOMER): Thấy toàn bộ trạm active công khai để tìm kiếm và cắm sạc.
    """
    query = db.query(Station).filter(Station.is_active)

    # Phân quyền: Chủ trạm chỉ thấy các trạm do mình sở hữu
    if current_user and current_user.role == "OPERATOR":
        query = query.filter(Station.operator_id == current_user.id)

    if status_filter:
        query = query.filter(Station.status == status_filter.upper())

    if connector_type:
        query = (
            query.join(Station.charging_points)
            .join(ChargingPoint.connectors)
            .filter(
                Connector.connector_type == connector_type.upper(),
                Connector.is_active,
                ChargingPoint.is_active,
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
            if st.latitude is not None and st.longitude is not None:
                dist = calculate_haversine_distance(
                    user_lat, user_lon, st.latitude, st.longitude
                )
                if radius_km is None or dist <= radius_km:
                    enriched = enrich_station_response(st)
                    dist_item = StationDistanceResponse.model_validate(enriched)
                    dist_item.distance_km = dist
                    results.append(dist_item)

        # Sắp xếp theo khoảng cách tăng dần và áp dụng phân trang
        results.sort(
            key=lambda x: x.distance_km if x.distance_km is not None else 999999.0
        )
        return results[skip : skip + limit]

    # Không truyền GPS -> Phân trang thông thường
    stations = query.offset(skip).limit(limit).all()
    return [enrich_station_response(st) for st in stations]


@router.get(
    "/metrics/live",
    response_model=Dict[str, Any],
    summary="Lấy số liệu vận hành mạng lưới thời gian thực (Live Dashboard Metrics)",
)
def get_live_dashboard_metrics(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm cụ thể"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    Truy xuất số liệu vận hành thời gian thực từ bộ nhớ RAM (Simulator) và CSDL:
    - Nếu Chủ trạm (OPERATOR): Chỉ tính toán trên các trạm do mình sở hữu.
    - Nếu truyền station_id: Kiểm tra quyền sở hữu, ngoài phạm vi -> 403 Forbidden.
    - Hạn mức: An toàn 95% công suất thiết kế, kèm chi tiết từng trạm.
    """
    if current_user and current_user.role == "OPERATOR":
        accessible_ids = get_accessible_station_ids(current_user, db)
    else:
        accessible_ids = [
            station_id
            for (station_id,) in db.query(Station.id)
            .filter(Station.is_active.is_(True))
            .all()
        ]

    if station_id is not None:
        if current_user and station_id not in accessible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập số liệu trạm sạc này.",
            )
        target_station_ids = [station_id]
    else:
        target_station_ids = accessible_ids

    stations = (
        db.query(Station)
        .filter(Station.id.in_(target_station_ids), Station.is_active)
        .all()
        if target_station_ids
        else []
    )
    chargers = (
        db.query(ChargingPoint)
        .filter(
            ChargingPoint.station_id.in_(target_station_ids),
            ChargingPoint.is_active,
        )
        .all()
        if target_station_ids
        else []
    )
    charger_ids_set = {c.id for c in chargers}

    # Map connector_id -> charger_id
    connectors = (
        db.query(Connector.id, Connector.charging_point_id)
        .filter(Connector.charging_point_id.in_(charger_ids_set))
        .all()
        if charger_ids_set
        else []
    )
    conn_to_charger = {c[0]: c[1] for c in connectors}

    # Lọc simulators chỉ thuộc target chargers
    active_sims = list(simulator_manager.active_simulators.values())
    filtered_active_sims = [s for s in active_sims if s.connector_id in conn_to_charger]
    live_power_kw = round(sum(s.power_kw for s in filtered_active_sims), 1)

    charging_charger_ids = set()
    for s in filtered_active_sims:
        ch_id = conn_to_charger.get(s.connector_id)
        if ch_id:
            charging_charger_ids.add(ch_id)

    db_active_sessions = (
        db.query(ChargingSession).filter(ChargingSession.status == "ACTIVE").all()
    )
    for sess in db_active_sessions:
        if sess.connector_id in conn_to_charger:
            ch_id = conn_to_charger[sess.connector_id]
            charging_charger_ids.add(ch_id)

    total_chargers = len(chargers)
    charging_count = len(charging_charger_ids)
    faulted_count = len([c for c in chargers if c.status in ("FAULTED", "UNAVAILABLE")])
    available_count = max(0, total_chargers - charging_count - faulted_count)
    total_grid_kw = round(sum(st.total_grid_capacity_kw or 0.0 for st in stations), 1)
    safe_limit_kw = round(
        sum((st.total_grid_capacity_kw or 0.0) * 0.95 for st in stations), 1
    )

    # Thống kê chi tiết theo từng trạm
    stations_detail = []
    has_overload_station = False
    for st in stations:
        st_ch_ids = {c.id for c in chargers if c.station_id == st.id}
        st_sims = [
            s
            for s in filtered_active_sims
            if conn_to_charger.get(s.connector_id) in st_ch_ids
        ]
        st_power = round(sum(s.power_kw for s in st_sims), 1)
        st_limit = round((st.total_grid_capacity_kw or 0.0) * 0.95, 1)
        is_over = st_power > st_limit
        if is_over:
            has_overload_station = True
        stations_detail.append(
            {
                "station_id": st.id,
                "station_name": st.name,
                "grid_capacity_kw": st.total_grid_capacity_kw,
                "safe_limit_kw": st_limit,
                "active_power_kw": st_power,
                "is_over_limit": is_over,
                "chargers_count": len(st_ch_ids),
            }
        )

    chargers_status = []
    for c in chargers:
        st_status = "CHARGING" if c.id in charging_charger_ids else c.status
        chargers_status.append(
            {
                "id": c.id,
                "station_id": c.station_id,
                "code": c.code,
                "vendor": c.vendor,
                "model": c.model,
                "max_power_kw": c.max_power_kw,
                "status": st_status,
            }
        )

    return {
        "total_stations": len(stations),
        "total_chargers": total_chargers,
        "charging_chargers_count": charging_count,
        "available_chargers_count": available_count,
        "faulted_chargers_count": faulted_count,
        "total_grid_capacity_kw": total_grid_kw,
        "safe_limit_kw": safe_limit_kw,
        "active_power_kw": live_power_kw,
        "active_sessions_count": len(filtered_active_sims),
        "chargers": chargers_status,
        "stations_detail": stations_detail,
        "has_overload_station": has_overload_station,
        "empty_state": len(stations) == 0,
    }


@router.get(
    "/metrics/load-profile",
    response_model=List[Dict[str, Any]],
    summary="Đo đếm đồ thị phụ tải lưới 24 giờ thực tế từ phiên sạc và công suất live",
)
def get_grid_load_profile(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm cụ thể"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    Tính toán đồ thị phụ tải lưới 24 giờ từ dữ liệu thực tế:
    - Gom nhóm các phiên sạc trong ngày hôm nay (hoặc 24h gần nhất).
    - Tích hợp công suất tức thời của các phiên sạc đang chạy trong RAM vào khung giờ hiện tại.
    - Gắn nhãn TOU linh hoạt (PEAK, NORMAL, OFFPEAK).
    - Phân quyền: Chủ trạm chỉ được xem số liệu các trạm của mình (chặn 403 nếu chọn trạm khác).
    """
    vn_now = get_vn_now()
    current_hour = vn_now.hour

    # Phân quyền phạm vi trạm
    target_station_ids: Optional[List[int]] = None
    if current_user and current_user.role == "OPERATOR":
        accessible_ids = get_accessible_station_ids(current_user, db)
        if station_id is not None:
            if station_id not in accessible_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập số liệu trạm sạc này.",
                )
            target_station_ids = [station_id]
        else:
            target_station_ids = accessible_ids
    elif station_id is not None:
        target_station_ids = [station_id]

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

    # Nếu phạm vi trạm trống (Chủ trạm chưa có trạm nào) -> trả về biểu đồ rỗng
    if target_station_ids is not None and len(target_station_ids) == 0:
        return [
            {
                "time": slot_label,
                "loadKw": 0.0,
                "priceSlot": "PEAK"
                if ((start_h >= 10 and end_h <= 12) or (start_h >= 18 and end_h <= 20))
                else ("OFFPEAK" if (start_h >= 22 or end_h <= 4) else "NORMAL"),
                "isLive": start_h <= current_hour < end_h,
            }
            for slot_label, start_h, end_h in time_slots
        ]

    # Lấy các phiên sạc thực tế phát sinh trong ngày hôm nay (từ 00:00 hôm nay theo giờ VN)
    today_start_vn = vn_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_vn.astimezone(timezone.utc).replace(tzinfo=None)
    query = db.query(ChargingSession).filter(
        ChargingSession.start_time >= today_start_utc
    )
    if target_station_ids is not None:
        query = (
            query.join(ChargingSession.connector)
            .join(Connector.charging_point)
            .filter(ChargingPoint.station_id.in_(target_station_ids))
        )
    recent_sessions = query.all()

    # Tính tổng công suất tức thời hiện tại từ simulator thuộc phạm vi
    active_sims = list(simulator_manager.active_simulators.values())
    if target_station_ids is not None:
        conn_ids = [s.connector_id for s in active_sims]
        allowed_conn_ids = set(
            cid
            for (cid,) in db.query(Connector.id)
            .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
            .filter(
                ChargingPoint.station_id.in_(target_station_ids),
                Connector.id.in_(conn_ids),
            )
            .all()
        )
        live_sim_power = sum(
            s.power_kw for s in active_sims if s.connector_id in allowed_conn_ids
        )
    else:
        live_sim_power = sum(s.power_kw for s in active_sims)

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

        load_profile.append(
            {
                "time": slot_label,
                "loadKw": est_kw,
                "priceSlot": price_slot,
                "isLive": is_current_slot,
            }
        )

    return load_profile


@router.get(
    "/metrics/load-profile-timeline",
    response_model=List[Dict[str, Any]],
    summary="Đo đếm phụ tải lưới chi tiết 1440 phút (24 Giờ Equalizer)",
)
def get_grid_load_profile_timeline(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm cụ thể"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    Trả về đúng 1440 điểm (từ 00:00 đến 23:59) phục vụ biểu đồ mật độ cao dạng Equalizer:
    - Mỗi điểm: { "time": "HH:MM", "powerKw": float, "isPlaceholder": bool, "noData": bool }
    - powerKw: Công suất trung bình mỗi phút (kW) dựa trên điện năng thực tế tiêu thụ (P_avg = ΔkWh * 60), bảo toàn 100% năng lượng.
    - Phút tương lai (sau thời điểm hiện tại): isPlaceholder = True, noData = False, powerKw = 0.0
    - Phút quá khứ đã có log trong DB (hoặc phút hiện tại có live power): isPlaceholder = False, noData = False, powerKw = value
    - Phút quá khứ chưa có dữ liệu trong DB (trước thời điểm ghi log): isPlaceholder = True, noData = True, powerKw = 0.0
    - Phân quyền: Chủ trạm chỉ được xem số liệu các trạm của mình (chặn 403 nếu chọn trạm khác).
    """
    from app.models.station import StationPowerMetric

    vn_now = get_vn_now()
    vn_today_start = vn_now.replace(hour=0, minute=0, second=0, microsecond=0)
    vn_current_minute_floor = vn_now.replace(second=0, microsecond=0)

    today_start_utc = vn_today_start.astimezone(timezone.utc).replace(tzinfo=None)
    now_utc = vn_now.astimezone(timezone.utc).replace(tzinfo=None)

    # Phân quyền phạm vi trạm
    target_station_ids: Optional[List[int]] = None
    if current_user and current_user.role == "OPERATOR":
        accessible_ids = get_accessible_station_ids(current_user, db)
        if station_id is not None:
            if station_id not in accessible_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập số liệu trạm sạc này.",
                )
            target_station_ids = [station_id]
        else:
            target_station_ids = accessible_ids
    elif station_id is not None:
        target_station_ids = [station_id]

    # Nếu phạm vi trạm trống (Chủ trạm chưa có trạm nào) -> trả về placeholder rỗng
    if target_station_ids is not None and len(target_station_ids) == 0:
        return [
            {
                "time": (vn_today_start + timedelta(minutes=i)).strftime("%H:%M"),
                "powerKw": 0.0,
                "isPlaceholder": True,
                "noData": (vn_today_start + timedelta(minutes=i))
                < vn_current_minute_floor,
            }
            for i in range(1440)
        ]

    # 1. Truy vấn toàn bộ log của ngày hôm nay từ CSDL (tính theo ngày Việt Nam)
    query = db.query(StationPowerMetric).filter(
        StationPowerMetric.timestamp >= today_start_utc,
        StationPowerMetric.timestamp <= now_utc,
    )
    if target_station_ids is not None:
        query = query.filter(StationPowerMetric.station_id.in_(target_station_ids))

    db_metrics = query.all()

    # Gom nhóm theo mốc phút theo giờ Việt Nam: timestamp_str -> power_kw
    recorded_power_map: Dict[str, float] = {}
    for m in db_metrics:
        m_vn = to_vn_time(m.timestamp)
        t_key = m_vn.strftime("%H:%M")
        recorded_power_map[t_key] = round(
            recorded_power_map.get(t_key, 0.0) + float(m.power_kw), 2
        )

    # 2. Lấy công suất live từ RAM Simulator cho phút hiện tại
    active_sims = list(simulator_manager.active_simulators.values())
    live_power_now = 0.0
    if active_sims:
        if target_station_ids is not None:
            conn_ids = [s.connector_id for s in active_sims]
            allowed_conn_ids = set(
                cid
                for (cid,) in db.query(Connector.id)
                .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
                .filter(
                    ChargingPoint.station_id.in_(target_station_ids),
                    Connector.id.in_(conn_ids),
                )
                .all()
            )
            live_power_now = sum(
                s.power_kw for s in active_sims if s.connector_id in allowed_conn_ids
            )
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
            timeline.append(
                {
                    "time": time_str,
                    "powerKw": 0.0,
                    "isPlaceholder": True,
                    "noData": False,
                }
            )
        elif slot_time == vn_current_minute_floor:
            # Phút hiện tại: lấy max giữa live power từ RAM và giá trị đã lưu
            current_kw = max(live_power_now, recorded_power_map.get(time_str, 0.0))
            timeline.append(
                {
                    "time": time_str,
                    "powerKw": current_kw,
                    "isPlaceholder": False,
                    "noData": False,
                }
            )
        else:
            # Quá khứ: Đã qua
            if time_str in recorded_power_map:
                timeline.append(
                    {
                        "time": time_str,
                        "powerKw": recorded_power_map[time_str],
                        "isPlaceholder": False,
                        "noData": False,
                    }
                )
            else:
                # Quá khứ chưa từng ghi log (tính năng mới triển khai)
                timeline.append(
                    {
                        "time": time_str,
                        "powerKw": 0.0,
                        "isPlaceholder": True,
                        "noData": True,
                    }
                )

    return timeline


@router.get(
    "/tree",
    response_model=list[StationTreeItem],
    summary="Lấy cây trạm–trụ–đầu nối đã lọc theo quyền (T-23)",
    description=(
        "Trả về danh sách StationTreeItem bao gồm 3 tầng: "
        "Station -> ChargingPoint -> Connector. "
        "Admin/Operator tổng thấy toàn bộ trạm chưa xóa mềm; "
        "Chủ trạm chỉ thấy trạm do chính mình sở hữu (operator_id == current_user.id)."
    ),
)
def list_station_tree(
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
) -> list[StationTreeItem]:
    """API lấy cây trạm–trụ–đầu nối đã lọc theo quyền sở hữu (RBAC)."""
    return get_station_tree(db, current_user)


@router.get(
    "/grid",
    response_model=list[StationGridItem],
    summary="Lấy danh sách trạm và trụ dạng lưới (Grid View) theo quyền (T-24)",
    description=(
        "Trả về danh sách trạm kèm tổng hợp trạng thái các cổng sạc "
        "(available, charging, faulted, unavailable) và danh sách thẻ trụ. "
        "Admin thấy toàn bộ hệ thống; Operator chỉ thấy trạm do mình quản lý."
    ),
)
def list_station_grid(
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
) -> list[StationGridItem]:
    """API lấy dữ liệu giám sát trạm/trụ dạng lưới (Grid View)."""
    return get_station_grid(db, current_user)


async def _station_event_generator(user: User, limit: Optional[int] = None):
    queue = await sse_broadcaster.subscribe(user)
    try:
        # Gửi sự kiện khởi tạo kết nối (phục vụ test và client handshake)
        yield f"data: {json.dumps({'event': 'connected', 'user_id': user.id})}\n\n"
        count = 0
        if limit is not None and limit <= 1:
            return

        while True:
            payload = await queue.get()
            yield f"data: {json.dumps(payload)}\n\n"
            count += 1
            if limit is not None and count >= limit:
                break
    except (asyncio.CancelledError, GeneratorExit):
        pass
    finally:
        await sse_broadcaster.unsubscribe(queue)


@router.get(
    "/events",
    summary="Kênh SSE đẩy trạng thái trạm/trụ/đầu nối theo thời gian thực",
)
async def get_station_events(
    limit: Optional[int] = Query(None, description="Giới hạn số message rồi ngắt (dùng cho test)"),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
):
    return StreamingResponse(
        _station_event_generator(current_user, limit),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/stream",
    summary="Alias của kênh SSE /events",
)
async def get_station_stream(
    limit: Optional[int] = Query(None, description="Giới hạn số message rồi ngắt (dùng cho test)"),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
):
    return StreamingResponse(
        _station_event_generator(current_user, limit),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/{station_id}",
    response_model=StationResponse,
    summary="Xem thông tin chi tiết trạm sạc cùng các trụ và cổng sạc",
)
def get_station(
    station_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc."
        )
    if current_user and current_user.role == "OPERATOR":
        if station.operator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập trạm sạc này.",
            )
    return enrich_station_response(station)


@router.post(
    "",
    response_model=StationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo trạm sạc mới (Chỉ dành cho ADMIN)",
)
def create_station(
    station_in: StationCreate,
    current_user: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    """
    Tạo trạm sạc mới:
    - Bắt buộc vai trò ADMIN.
    - Cho phép gán operator_id theo station_in (hoặc None nếu để trạm tự do).
    """
    new_station = Station(
        operator_id=station_in.operator_id,
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
    """Cập nhật trạm sạc: Kiểm tra quyền sở hữu (Owner hoặc Admin). Chỉ Admin được đổi chủ trạm, công suất lưới, địa chỉ. Chủ trạm chỉ được cập nhật operating_hours."""
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc."
        )

    verify_station_ownership(station, current_user)

    update_data = station_in.model_dump(exclude_unset=True)

    if current_user.role != "ADMIN":
        # Chặn thay đổi công suất lưới nếu không phải ADMIN
        if (
            "total_grid_capacity_kw" in update_data
            and update_data["total_grid_capacity_kw"]
            != station.total_grid_capacity_kw
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên (Admin) mới có quyền thay đổi công suất nguồn lưới (total_grid_capacity_kw).",
            )
        # Chặn thay đổi chủ trạm nếu không phải ADMIN
        if "operator_id" in update_data and update_data["operator_id"] != station.operator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên (Admin) mới có quyền gán hoặc thay đổi Chủ trạm.",
            )
        update_data.pop("operator_id", None)

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc."
        )

    verify_station_ownership(station, current_user)
    atomic_soft_delete_station(db, station)
    return {
        "message": f"Đã xóa mềm trạm sạc '{station.name}' và toàn bộ thiết bị liên kết thành công."
    }


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc."
        )

    verify_station_ownership(station, current_user)
    atomic_reactivate_station(db, station)
    return enrich_station_response(station)
