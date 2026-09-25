import math
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.core.websocket import ws_manager
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.schemas.station import ChargingPointResponse, ConnectorResponse, StationResponse


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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


def verify_station_ownership(station: Station, user: User) -> None:
    """Kiểm tra quyền sở hữu trạm (IDOR Guard): Admin có toàn quyền, Operator chỉ sở hữu trạm của mình."""
    if user.role != "ADMIN" and station.operator_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thao tác trên trạm sạc này.",
        )


def verify_charger_ownership(charger: ChargingPoint, user: User) -> None:
    """Kiểm tra quyền sở hữu trụ sạc thông qua trạm cha (IDOR Guard cấp Charger)."""
    if user.role != "ADMIN" and charger.station.operator_id != user.id:
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
    is_power_sharing = (
        charger.power_sharing_enabled
        and (total_connector_power > charger.max_power_kw)
    )

    resp = ChargingPointResponse.model_validate(charger)
    resp.connectors = connectors_resp
    resp.total_connector_power_kw = total_connector_power
    resp.is_power_sharing = is_power_sharing
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
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi xóa mềm trạm sạc: {str(e)}",
        )


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
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi phục hồi trạm sạc: {str(e)}",
        )


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
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi xóa mềm trụ sạc: {str(e)}",
        )


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
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi phục hồi trụ sạc: {str(e)}",
        )


async def broadcast_status_change(entity_type: str, entity_id: int, new_status: str, extra: Optional[dict] = None) -> None:
    """Phát sóng sự kiện thay đổi trạng thái qua WebSocket Hub."""
    payload = {
        "event": "STATUS_CHANGED",
        "entity_type": entity_type,
        "id": entity_id,
        "status": new_status,
        **(extra or {}),
    }
    await ws_manager.broadcast(payload)
