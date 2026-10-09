"""Tái hiện lỗi mapper: 2 class cùng map bảng charging_points.

Lỗi gốc (pytest_last.txt):
  sqlalchemy.exc.ArgumentError: Could not locate any simple equality expressions
  involving locally mapped foreign key columns for primary join condition
  'charging_points.station_id = stations.id' on relationship ChargingPoint.station.

Chạy: pytest tests/test_repro_mapper_duplicate_charging_points.py -v
"""
from app.core.database import Base
from app.models.station import Station, ChargingPoint
from app.models.charge_point import ChargePoint  # noqa: F401  -- class trùng bảng


def test_two_classes_mapping_same_table_breaks_station_init():
    """Hai class map cùng bảng charging_points gây lỗi mapper khi init Station."""
    # Khi cả ChargingPoint + ChargePoint cùng registered, SQLAlchemy không
    # xác định được FK của bảng charging_points, dẫn tới ArgumentError
    # khi gọi Station() lần đầu.
    s = Station(name="Test", address="Addr")
    assert s.id is None
