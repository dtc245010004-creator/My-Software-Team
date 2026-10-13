"""Các phép tính công khai phục vụ tìm kiếm trạm cho tài xế."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.datetime_utils import get_vn_now, to_vn_time
from app.models.station import ChargingPoint, Connector, Station
from app.services.pricing_engine import (
    get_tariff_rate_at_time,
    resolve_tariff_for_date,
)
from app.services.session_service import get_effective_tariffs_for_stations


def _charging_point_availability(
    charging_point: ChargingPoint, now_utc: datetime
) -> tuple[bool, str | None]:
    """Trả về tình trạng liên lạc của trụ theo cùng ngưỡng quét heartbeat."""
    status_value = (charging_point.status or "").casefold()
    if status_value == "offline":
        return False, "Offline"
    if status_value in {"unavailable", "faulted", "maintenance"}:
        return False, "Unavailable"

    last_seen_at = charging_point.last_seen_at
    if last_seen_at is None:
        return False, "Offline"
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
    if now_utc - last_seen_at.astimezone(timezone.utc) > timedelta(
        seconds=2 * settings.HEARTBEAT_INTERVAL_SECONDS
    ):
        return False, "Offline"
    return True, None


def is_connector_available(
    connector: Connector,
    charging_point: ChargingPoint,
    *,
    now: datetime | None = None,
) -> bool:
    """Một đầu nối chỉ rảnh khi cổng, trụ, heartbeat và hai trạng thái đều hợp lệ."""
    if not connector.is_active or not charging_point.is_active:
        return False
    now_utc = (now or get_vn_now()).astimezone(timezone.utc)
    point_is_online, _ = _charging_point_availability(charging_point, now_utc)
    return (
        point_is_online
        and connector.ocpp_status == "Available"
        and (connector.status or "").upper() == "AVAILABLE"
    )


def build_public_connector_summary(
    station: Station,
    *,
    connector_type: str | None = None,
    now: datetime | None = None,
) -> dict:
    """Đếm đầu nối và tạo danh sách trạng thái đã loại bỏ dữ liệu định danh nội bộ.

    Tổng số gồm đầu nối đang hoạt động thuộc trụ đang hoạt động; trụ ngoại tuyến
    vẫn nằm trong mẫu số nhưng các cổng của nó không được tính là rảnh.
    """
    now_vn = to_vn_time(now or get_vn_now())
    now_utc = now_vn.astimezone(timezone.utc)
    selected_type = _normalize_connector_type(connector_type)
    total = 0
    available = 0
    types: set[str] = set()
    public_connectors: list[dict] = []

    for charging_point in station.charging_points:
        if not charging_point.is_active:
            continue
        is_online, point_unavailable_status = _charging_point_availability(
            charging_point, now_utc
        )
        for connector in charging_point.connectors:
            if not connector.is_active:
                continue
            normalized_type = _normalize_connector_type(
                connector.connector_type or connector.type or "UNKNOWN"
            )
            if selected_type and normalized_type != selected_type:
                continue

            total += 1
            free = is_connector_available(connector, charging_point, now=now_vn)
            available += int(free)
            types.add(normalized_type)
            status = (
                point_unavailable_status
                or connector.ocpp_status
                or _internal_connector_status(connector.status)
            )
            public_connectors.append(
                {
                    "connector_number": connector.connector_number
                    or connector.connector_id,
                    "connector_type": normalized_type,
                    "max_power_kw": connector.max_power_kw or connector.max_kw,
                    "status": status,
                }
            )

    return {
        "connectors_available": available,
        "connectors_total": total,
        "connector_types": sorted(types),
        "connectors": public_connectors,
    }


def get_current_station_prices(
    db: Session,
    station_ids: list[int],
    *,
    at_time: datetime | None = None,
) -> dict[int, Decimal]:
    """Lấy giá TOU đang áp dụng cho một nhóm trạm, không truy vấn theo từng trạm."""
    if not station_ids:
        return {}
    current_time = to_vn_time(at_time or get_vn_now())
    tariffs = get_effective_tariffs_for_stations(
        db,
        station_ids,
        at_time=current_time,
        load_periods=True,
    )
    prices: dict[int, Decimal] = {}
    for station_id in station_ids:
        tariff = tariffs.get(station_id)
        if tariff is None:
            continue
        day_slots = resolve_tariff_for_date(tariff, current_time.date())
        prices[station_id] = get_tariff_rate_at_time(day_slots, current_time.time())
    return prices


def _normalize_connector_type(value: str | None) -> str:
    if not value:
        return ""
    normalized = value.strip().upper().replace(" ", "_")
    return "TYPE_2" if normalized == "TYPE2" else normalized


def _internal_connector_status(value: str | None) -> str:
    normalized = (value or "UNKNOWN").upper()
    return {
        "AVAILABLE": "Available",
        "RESERVED": "Reserved",
        "OCCUPIED": "Occupied",
        "FAULTED": "Faulted",
        "UNAVAILABLE": "Unavailable",
    }.get(normalized, normalized.title())
