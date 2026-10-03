import math
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.core.websocket import ws_manager
from app.models.station import ChargingPoint, Station
from app.models.user import User
from app.schemas.station import (
    ChargerGridItem,
    ChargerTreeItem,
    ChargingPointResponse,
    ConnectorResponse,
    ConnectorStatusCount,
    ConnectorTreeItem,
    StationGridItem,
    StationResponse,
    StationTreeItem,
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
    except Exception:  # noqa: BLE001
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
    resp.owner_id = resp.operator_id
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


def get_station_tree(db: Session, user: User) -> list[StationTreeItem]:
    """Lấy cây trạm -> trụ -> đầu nối đã lọc theo quyền sở hữu (RBAC).

    - Admin / Operator (OPERATOR): thấy toàn bộ các trạm chưa soft-delete.
    - Chủ trạm (OPERATOR có operator_id trên trạm): chỉ thấy trạm của mình.
    - Sử dụng joinedload để nạp quan hệ ChargingPoint và Connector,
      tránh N+1 query.
    """
    role_names = getattr(user, "role_names", None)
    if role_names is None and hasattr(user, "roles"):
        role_names = [role.name for role in (user.roles or [])]

    is_admin_or_global_operator = (
        user.role == "ADMIN"
        or (role_names and any(r in ("admin", "operator", "van_hanh_vien") for r in role_names))
    )

    stmt = (
        db.query(Station)
        .options(
            joinedload(Station.charging_points)
            .joinedload(ChargingPoint.connectors)
        )
        .filter(Station.is_active.is_(True))
        .filter(Station.deleted_at.is_(None))
    )

    if not is_admin_or_global_operator:
        stmt = stmt.filter(Station.operator_id == user.id)

    stations = stmt.all()

    results: list[StationTreeItem] = []
    for station in stations:
        chargers: list[ChargerTreeItem] = []
        for cp in station.charging_points:
            connectors = [
                ConnectorTreeItem(
                    id=c.id,
                    connector_number=c.connector_number,
                    connector_type=c.connector_type or "",
                    status=c.status or "",
                    max_power_kw=c.max_power_kw or 0.0,
                    is_active=c.is_active,
                )
                for c in cp.connectors
                if c.is_active
            ]
            chargers.append(
                ChargerTreeItem(
                    id=cp.id,
                    code=cp.code or "",
                    vendor=cp.vendor or "",
                    model=cp.model,
                    status=cp.status or "",
                    max_power_kw=cp.max_power_kw or 0.0,
                    power_sharing_enabled=cp.power_sharing_enabled,
                    is_active=cp.is_active,
                    last_seen_at=cp.last_seen_at,
                    connectors=connectors,
                )
            )
        results.append(
            StationTreeItem(
                id=station.id,
                name=station.name,
                address=station.address,
                latitude=station.latitude,
                longitude=station.longitude,
                total_grid_capacity_kw=station.total_grid_capacity_kw or 0.0,
                is_active=station.is_active,
                chargers=chargers,
            )
        )
    return results


def classify_connector_status(raw_status: str | None) -> str:
    """Chuẩn hóa trạng thái đầu nối về 1 trong 4 nhóm:
    - 'available'
    - 'charging'
    - 'faulted'
    - 'unavailable'
    """
    if not raw_status:
        return "unavailable"
    s = str(raw_status).strip().lower()
    if s in ("available", "ready", "idle", "kha_dung"):
        return "available"
    if s in (
        "charging",
        "preparing",
        "finishing",
        "suspended_ev",
        "suspended_evse",
        "dang_sac",
    ):
        return "charging"
    if s in ("faulted", "error", "loi"):
        return "faulted"
    return "unavailable"


def get_station_grid(db: Session, user: User) -> list[StationGridItem]:
    """Lấy dữ liệu hiển thị dạng lưới (Grid View) theo quyền hạn (T-24).

    - Admin: Toàn bộ trạm sạc chưa xóa mềm.
    - Operator: Chỉ các trạm thuộc sở hữu (operator_id == user.id).
    - Sử dụng joinedload để tránh N+1 query.
    - Tổng hợp số lượng đầu nối theo từng trạng thái cho mỗi trụ và mỗi trạm.
    """
    role_names = getattr(user, "role_names", None)
    if role_names is None and hasattr(user, "roles"):
        role_names = [role.name for role in (user.roles or [])]

    is_admin_or_global_operator = (
        user.role == "ADMIN"
        or (
            role_names
            and any(r in ("admin", "operator", "van_hanh_vien") for r in role_names)
        )
    )

    stmt = (
        db.query(Station)
        .options(
            joinedload(Station.charging_points).joinedload(ChargingPoint.connectors)
        )
        .filter(Station.is_active.is_(True))
        .filter(Station.deleted_at.is_(None))
    )

    if not is_admin_or_global_operator:
        stmt = stmt.filter(Station.operator_id == user.id)

    stations = stmt.all()

    results: list[StationGridItem] = []
    for station in stations:
        chargers: list[ChargerGridItem] = []
        st_avail = 0
        st_charg = 0
        st_fault = 0
        st_unavail = 0

        # Lọc danh sách trụ active của trạm
        active_cps = [cp for cp in station.charging_points if cp.is_active]

        for cp in active_cps:
            cp_avail = 0
            cp_charg = 0
            cp_fault = 0
            cp_unavail = 0

            # Lọc danh sách đầu nối active của trụ
            active_conns = [c for c in cp.connectors if c.is_active]
            for conn in active_conns:
                cat = classify_connector_status(conn.status)
                if cat == "available":
                    cp_avail += 1
                elif cat == "charging":
                    cp_charg += 1
                elif cat == "faulted":
                    cp_fault += 1
                else:
                    cp_unavail += 1

            cp_total = cp_avail + cp_charg + cp_fault + cp_unavail
            st_avail += cp_avail
            st_charg += cp_charg
            st_fault += cp_fault
            st_unavail += cp_unavail

            chargers.append(
                ChargerGridItem(
                    id=cp.id,
                    station_id=station.id,
                    code=cp.code or "",
                    vendor=cp.vendor or "",
                    model=cp.model,
                    status=cp.status or "AVAILABLE",
                    max_power_kw=cp.max_power_kw or 0.0,
                    power_sharing_enabled=cp.power_sharing_enabled,
                    is_active=cp.is_active,
                    available_connectors=cp_avail,
                    charging_connectors=cp_charg,
                    faulted_connectors=cp_fault,
                    unavailable_connectors=cp_unavail,
                    total_connectors=cp_total,
                    connector_counts=ConnectorStatusCount(
                        available=cp_avail,
                        charging=cp_charg,
                        faulted=cp_fault,
                        unavailable=cp_unavail,
                        total=cp_total,
                    ),
                )
            )

        st_total = st_avail + st_charg + st_fault + st_unavail

        results.append(
            StationGridItem(
                id=station.id,
                name=station.name,
                address=station.address,
                latitude=station.latitude,
                longitude=station.longitude,
                total_grid_capacity_kw=station.total_grid_capacity_kw or 0.0,
                status=station.status or "ACTIVE",
                is_active=station.is_active,
                total_chargers=len(chargers),
                available_connectors=st_avail,
                charging_connectors=st_charg,
                faulted_connectors=st_fault,
                unavailable_connectors=st_unavail,
                total_connectors=st_total,
                connector_counts=ConnectorStatusCount(
                    available=st_avail,
                    charging=st_charg,
                    faulted=st_fault,
                    unavailable=st_unavail,
                    total=st_total,
                ),
                chargers=chargers,
            )
        )

    return results

