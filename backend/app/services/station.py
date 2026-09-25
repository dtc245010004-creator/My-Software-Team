from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.station import Station


def validate_coordinates(latitude: Any, longitude: Any) -> None:
    """Kiểm tra tính hợp lệ của tọa độ vĩ độ và kinh độ.
    
    AC 2: Latitude trong [-90, 90], Longitude trong [-180, 180].
    """
    if latitude is not None:
        try:
            lat = float(latitude)
        except (ValueError, TypeError):
            raise ValueError("Latitude phải là số thực hợp lệ")
        if lat < -90.0 or lat > 90.0:
            raise ValueError("Latitude phải nằm trong khoảng [-90, 90]")

    if longitude is not None:
        try:
            lng = float(longitude)
        except (ValueError, TypeError):
            raise ValueError("Longitude phải là số thực hợp lệ")
        if lng < -180.0 or lng > 180.0:
            raise ValueError("Longitude phải nằm trong khoảng [-180, 180]")


def get_stations(session: Session, user: Any) -> list[Station]:
    """Lấy danh sách các trạm sạc thuộc sở hữu của user (hoặc tất cả nếu là admin)."""
    role_names = getattr(user, "role_names", [])
    if not role_names and hasattr(user, "roles"):
        role_names = [role.name for role in (user.roles or [])]

    if "admin" in role_names or getattr(user, "is_superuser", False):
        return session.query(Station).all()

    return session.query(Station).filter(Station.owner_id == user.id).all()


def create_station(session: Session, station_data: dict | Any, user: Any) -> Station:
    """Xử lý nghiệp vụ tạo trạm sạc mới gắn với chủ trạm (owner_id).
    
    - AC 1: Khởi tạo is_active = False, gắn với tài khoản user.id.
    - AC 2: Báo lỗi nếu toạ độ nằm ngoài dải hợp lệ.
    - AC 4: Chống trùng lặp trạm cùng tên của cùng một chủ trạm.
    """
    data = (
        station_data
        if isinstance(station_data, dict)
        else station_data.model_dump(exclude_unset=True)
    )

    name = data.get("name")
    address = data.get("address")
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    validate_coordinates(latitude, longitude)

    # Kiểm tra trước để đảm bảo Idempotency (AC 4)
    existing = (
        session.query(Station)
        .filter(Station.name == name, Station.owner_id == user.id)
        .first()
    )
    if existing:
        raise ValueError("Trạm sạc với tên này đã tồn tại cho tài khoản của bạn")

    now = datetime.now(timezone.utc)
    station = Station(
        name=name,
        address=address,
        latitude=float(latitude) if latitude is not None else None,
        longitude=float(longitude) if longitude is not None else None,
        is_active=False,  # AC 1: mặc định chưa hoạt động
        owner_id=user.id,
        created_at=now,
        updated_at=now,
    )

    try:
        session.add(station)
        session.commit()
        session.refresh(station)
        return station
    except IntegrityError:
        session.rollback()
        raise ValueError("Trạm sạc với tên này đã tồn tại cho tài khoản của bạn")


def update_station(
    session: Session, station_id: int, station_data: dict | Any, user: Any
) -> Station:
    """Xử lý nghiệp vụ cập nhật thông tin trạm sạc.
    
    - AC 3: Sửa tên/địa chỉ, kiểm tra quyền sở hữu của user.
    """
    station = (
        session.query(Station)
        .filter(Station.id == station_id, Station.owner_id == user.id)
        .first()
    )
    if not station:
        raise ValueError("Không tìm thấy trạm hoặc bạn không có quyền chỉnh sửa trạm này")

    data = (
        station_data
        if isinstance(station_data, dict)
        else station_data.model_dump(exclude_unset=True)
    )

    validate_coordinates(data.get("latitude"), data.get("longitude"))

    if "name" in data and data["name"] is not None:
        station.name = data["name"]
    if "address" in data and data["address"] is not None:
        station.address = data["address"]
    if "latitude" in data and data["latitude"] is not None:
        station.latitude = float(data["latitude"])
    if "longitude" in data and data["longitude"] is not None:
        station.longitude = float(data["longitude"])

    station.updated_at = datetime.now(timezone.utc)

    try:
        session.commit()
        session.refresh(station)
        return station
    except IntegrityError:
        session.rollback()
        raise ValueError("Tên trạm sạc đã bị trùng với một trạm khác của bạn")