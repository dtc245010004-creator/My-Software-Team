"""Kiểm thử bổ sung cho Task T-10: Schema, Migration, Constraints & Index."""

import os
import tempfile
import uuid
from typing import Generator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.station import ChargingPoint, Connector, Station


def _create_station(db_session: Session, name: str = "Trạm T-10") -> Station:
    station = Station(
        name=name,
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100.0,
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()
    db_session.refresh(station)
    return station


def test_t10_alembic_migration_upgrade_downgrade_cycle() -> None:
    """T-10 AC 1: Migration hai chiều.

    File migration hỗ trợ đầy đủ cả chiều tiến (up) và lùi (down/rollback)
    mà không làm hỏng cấu trúc dữ liệu: upgrade head -> downgrade -1 -> upgrade head.
    """
    temp_db_path = os.path.join(tempfile.gettempdir(), f"alembic_cycle_{uuid.uuid4().hex}.db")
    orig_url = settings.DATABASE_URL
    try:
        settings.DATABASE_URL = f"sqlite:///{temp_db_path}"
        alembic_cfg = Config()
        alembic_cfg.set_main_option("script_location", "alembic")
        alembic_cfg.set_main_option("version_path_separator", "os")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

        # 1. Tiến lên head
        command.upgrade(alembic_cfg, "head")

        # 2. Lùi 1 bước (-1)
        command.downgrade(alembic_cfg, "-1")

        # 3. Tiến lại lên head
        command.upgrade(alembic_cfg, "head")
    finally:
        settings.DATABASE_URL = orig_url
        if os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except OSError:
                pass


def test_t10_charging_point_code_unique_constraint_db_level(db_session: Session) -> None:
    """T-10 AC 2: Ràng buộc toàn vẹn dữ liệu cấp Database (UNIQUE).

    Cơ sở dữ liệu từ chối (báo lỗi IntegrityError) nếu cố tình chèn hai bản ghi
    charging_points có cùng giá trị code.
    """
    station = _create_station(db_session, "Trạm Unique Test")

    cp1 = ChargingPoint(
        station_id=station.id,
        code="CP-UNIQUE-01",
        max_power_kw=60.0,
    )
    db_session.add(cp1)
    db_session.commit()

    # Cố tình chèn bản ghi thứ 2 cùng code
    cp2 = ChargingPoint(
        station_id=station.id,
        code="CP-UNIQUE-01",
        max_power_kw=50.0,
    )
    db_session.add(cp2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


@pytest.mark.parametrize("invalid_number", [0, -1, -5])
def test_t10_connector_number_positive_constraint(db_session: Session, invalid_number: int) -> None:
    """T-10 AC 3: Tuân thủ chuẩn OCPP - connector_number bắt đầu từ 1.

    Chèn connector có connector_number = 0 hoặc âm bị cơ sở dữ liệu từ chối (IntegrityError).
    """
    station = _create_station(db_session, f"Trạm Connector Positive {invalid_number}")
    cp = ChargingPoint(station_id=station.id, code=f"CP-CONN-{invalid_number}", max_power_kw=60.0)
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=invalid_number,
        connector_type="CCS2",
        max_power_kw=60.0,
    )
    db_session.add(conn)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_t10_duplicate_connector_number_on_same_charging_point(db_session: Session) -> None:
    """T-10 AC 3 & Ràng buộc Unique cặp: Không thể có hai connector cùng số trên một trụ.

    Cố tình chèn hai connector cùng (charging_point_id, connector_number) bị từ chối (IntegrityError).
    """
    station = _create_station(db_session, "Trạm Duplicate Connector")
    cp = ChargingPoint(station_id=station.id, code="CP-DUP-CONN", max_power_kw=60.0)
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
    )
    db_session.add(conn1)
    db_session.commit()

    # Chèn connector thứ 2 cùng số 1 trên cùng trụ cp
    conn2 = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="TYPE_2",
        max_power_kw=22.0,
    )
    db_session.add(conn2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_t10_charging_point_code_indexed(db_session: Session) -> None:
    """T-10 Mô tả chi tiết: Cột code bắt buộc UNIQUE và phải được đánh chỉ mục (INDEX).

    Dùng sqlalchemy.inspect để xác nhận cột code của charging_points có index.
    """
    inspector = inspect(db_session.bind)
    indexes = inspector.get_indexes("charging_points")

    code_indexed = any(
        "code" in idx.get("column_names", [])
        for idx in indexes
    )
    assert code_indexed, f"Cột 'code' của bảng charging_points chưa được đánh index! Danh sách index hiện tại: {indexes}"
