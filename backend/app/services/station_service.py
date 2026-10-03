import math
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.websocket import ws_manager
from app.models.station import ChargingPoint, Station
from app.models.user import User
from app.schemas.station import (
    ChargingPointResponse,
    ConnectorResponse,
    StationResponse,
)


def calculate_haversine_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Tính khoảng cách đường chim bay giữa 2 tọa độ GPS (km) theo công thức Haversine."""
    R = 6371.0  # Bán kính Trái Đất (km)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def get_accessible_station_ids(user: User, db: Session) -> List[int]:
    """
    Trả về danh sách ID các trạm sạc mà user có quyền truy cập / quản lý / xem báo cáo:
    - ADMIN: Toàn bộ trạm sạc active (kể cả trạm chưa gán chủ operator_id=None).
    - OPERATOR (Chủ trạm): Chỉ các trạm active có operator_id == user.id.
    - CUSTOMER (Tài xế) hoặc khác: Trả về danh sách rỗng.
    """
    if user.role == "ADMIN":
        stations = db.query(Station.id).filter(Station.is_active.is_(True)).all()
        return [s[0] for s in stations]
    elif user.role == "OPERATOR":
        stations = (
            db.query(Station.id)
            .filter(Station.is_active.is_(True), Station.operator_id == user.id)
            .all()
        )
        return [s[0] for s in stations]
    return []


def assert_station_accessible(station_id: int, user: User, db: Session) -> Station:
    """
    Kiểm tra quyền truy cập trên một trạm cụ thể:
    - Nếu không tìm thấy trạm -> 404 NOT FOUND.
    - Nếu user là OPERATOR và station.operator_id != user.id -> 403 FORBIDDEN.
    - Nếu user là CUSTOMER -> 403 FORBIDDEN.
    - Hợp lệ -> Trả về đối tượng Station.
    """
    station = (
        db.query(Station)
        .filter(Station.id == station_id, Station.is_active.is_(True))
        .first()
    )
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy trạm sạc.",
        )
    if user.role == "ADMIN":
        return station
    if user.role == "OPERATOR":
        if station.operator_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thao tác trên trạm sạc này.",
            )
        return station
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Quyền hạn không đủ để truy cập trạm sạc này.",
    )


def verify_station_ownership(station: Station, user: User) -> None:
    """Kiểm tra quyền sở hữu trạm (IDOR Guard): Admin có toàn quyền, Operator chỉ sở hữu trạm của mình."""
    if user.role != "ADMIN":
        if station.operator_id is None or station.operator_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thao tác trên trạm sạc này.",
            )


def verify_charger_ownership(charger: ChargingPoint, user: User) -> None:
    """Kiểm tra quyền sở hữu trụ sạc thông qua trạm cha (IDOR Guard cấp Charger)."""
    if user.role != "ADMIN":
        if (
            not charger.station
            or charger.station.operator_id is None
            or charger.station.operator_id != user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thao tác trên trụ sạc này.",
            )


def enrich_charger_response(charger: ChargingPoint) -> ChargingPointResponse:
    """Tính toán chỉ số công suất cổng và cờ chia sẻ tải (Charger vs Connectors)."""
    connectors_resp = [
        ConnectorResponse.model_validate(c) for c in charger.connectors if c.is_active
    ]
    total_connector_power = round(sum(c.max_power_kw for c in connectors_resp), 2)
    is_power_sharing = charger.power_sharing_enabled and (
        total_connector_power > charger.max_power_kw
    )

    resp = ChargingPointResponse.model_validate(charger)
    resp.connectors = connectors_resp
    resp.total_connector_power_kw = total_connector_power
    resp.is_power_sharing = is_power_sharing

    if getattr(charger, "station", None):
        resp.station_name = charger.station.name

    try:
        from app.simulator.charging_simulator import simulator_manager

        current_kw = 0.0
        active_sid = None
        active_soc = None
        conn_ids = {c.id for c in charger.connectors}
        for sid, sim in simulator_manager.active_simulators.items():
            if sim.connector_id in conn_ids:
                current_kw += getattr(sim, "power_kw", 0.0)
                active_sid = sid
                active_soc = getattr(sim, "current_soc", 0.0)
        resp.current_power_kw = round(current_kw, 2)
        resp.active_session_id = active_sid
        resp.active_session_soc = active_soc
    except Exception:
        resp.current_power_kw = 0.0

    return resp


def enrich_station_response(station: Station) -> StationResponse:
    """Tính toán chỉ số Oversubscription tại cấp Trạm (Station vs Chargers)."""
    chargers_resp = [
        enrich_charger_response(cp) for cp in station.charging_points if cp.is_active
    ]
    total_installed_power = round(sum(cp.max_power_kw for cp in chargers_resp), 2)
    oversubscription_ratio = (
        round(total_installed_power / station.total_grid_capacity_kw, 2)
        if station.total_grid_capacity_kw > 0
        else 0.0
    )
    is_oversubscribed = total_installed_power > station.total_grid_capacity_kw

    resp = StationResponse.model_validate(station)
    resp.charging_points = chargers_resp
    resp.total_installed_power_kw = total_installed_power
    resp.oversubscription_ratio = oversubscription_ratio
    resp.is_oversubscribed = is_oversubscribed
    return resp


def atomic_soft_delete_station(db: Session, station: Station) -> None:
    """
    Xóa mềm trạm sạc nguyên tử:
    - Gán is_active=False cho Station, ChargingPoint, Connector.
    - Chuyển status sang MAINTENANCE/UNAVAILABLE.
    - Toàn bộ bọc trong 1 Transaction duy nhất, rollback sạch nếu có lỗi.
    """
    try:
        station.is_active = False
        station.status = "MAINTENANCE"
        for cp in station.charging_points:
            cp.is_active = False
            cp.status = "UNAVAILABLE"
            for conn in cp.connectors:
                conn.is_active = False
                conn.status = "UNAVAILABLE"
        db.commit()
        db.refresh(station)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi xóa mềm trạm sạc: {exc!s}",
        ) from exc


def atomic_reactivate_station(db: Session, station: Station) -> None:
    """
    Phục hồi trạm sạc nguyên tử sau Soft-Delete:
    - Gán is_active=True cho Station, ChargingPoint, Connector.
    - Chuyển status về ACTIVE/AVAILABLE.
    - Toàn bộ bọc trong 1 Transaction duy nhất, rollback sạch nếu có lỗi.
    """
    try:
        station.is_active = True
        station.status = "ACTIVE"
        for cp in station.charging_points:
            cp.is_active = True
            cp.status = "AVAILABLE"
            for conn in cp.connectors:
                conn.is_active = True
                conn.status = "AVAILABLE"
        db.commit()
        db.refresh(station)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi phục hồi trạm sạc: {exc!s}",
        ) from exc


def atomic_soft_delete_charger(db: Session, charger: ChargingPoint) -> None:
    """Xóa mềm trụ sạc nguyên tử: Cascade gán is_active=False cho các súng sạc."""
    try:
        charger.is_active = False
        charger.status = "UNAVAILABLE"
        for conn in charger.connectors:
            conn.is_active = False
            conn.status = "UNAVAILABLE"
        db.commit()
        db.refresh(charger)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi xóa mềm trụ sạc: {exc!s}",
        ) from exc


def atomic_reactivate_charger(db: Session, charger: ChargingPoint) -> None:
    """Phục hồi trụ sạc nguyên tử: Cascade gán is_active=True cho các súng sạc."""
    try:
        charger.is_active = True
        charger.status = "AVAILABLE"
        for conn in charger.connectors:
            conn.is_active = True
            conn.status = "AVAILABLE"
        db.commit()
        db.refresh(charger)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi phục hồi trụ sạc: {exc!s}",
        ) from exc


async def broadcast_status_change(
    entity_type: str, entity_id: int, new_status: str, extra: dict | None = None
) -> None:
    """Phát sóng sự kiện thay đổi trạng thái qua WebSocket Hub."""
    payload = {
        "event": "STATUS_CHANGED",
        "entity_type": entity_type,
        "id": entity_id,
        "status": new_status,
        **(extra or {}),
    }
    await ws_manager.broadcast(payload)
