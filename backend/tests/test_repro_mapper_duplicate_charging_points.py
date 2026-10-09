"""Kiểm tra registry model có thể cấu hình mapper và khởi tạo trạm."""

from sqlalchemy.orm import configure_mappers

import app.models  # noqa: F401  -- đăng ký toàn bộ model vào SQLAlchemy registry
from app.models.station import Station


def test_registered_models_allow_station_mapper_initialization():
    """Mapper của các model đã đăng ký phải cấu hình được trước khi tạo trạm."""
    configure_mappers()

    station = Station(name="Test", address="Addr")
    assert station.id is None
