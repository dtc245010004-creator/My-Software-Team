"""Seed riêng các trụ OCPP ảo có mã SIM-; không sửa dữ liệu seed chính."""

import os
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.models.id_tag import IdTag
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User

STATION_NAME = "Trạm kiểm thử OCPP ảo"
TAG_CODE = "SIM-DEMO-TAG"


def seed_simulator_charge_points(count: int) -> list[str]:
    if count < 1 or count > 999:
        raise ValueError("SIMULATOR_CHARGE_POINT_COUNT phải nằm trong khoảng 1..999.")

    db = SessionLocal()
    try:
        station = db.query(Station).filter(Station.name == STATION_NAME).first()
        if station is None:
            station = Station(
                name=STATION_NAME,
                address="Môi trường kiểm thử nội bộ",
                total_grid_capacity_kw=max(500.0, count * 22.0),
                is_active=True,
            )
            db.add(station)
            db.flush()

        user = db.query(User).filter(User.username == "ocpp_simulator").first()
        if user is None:
            user = User(
                username="ocpp_simulator",
                email="ocpp-simulator@example.invalid",
                password_hash="not-used-by-ocpp-simulator",
                full_name="Tài khoản trụ ảo",
                role="CUSTOMER",
            )
            db.add(user)
            db.flush()

        tag = db.query(IdTag).filter(IdTag.code == TAG_CODE).first()
        if tag is None:
            db.add(
                IdTag(
                    code=TAG_CODE,
                    user_id=user.id,
                    status="active",
                    expiry_date=datetime.now(timezone.utc) + timedelta(days=3650),
                )
            )

        codes = [f"SIM-{index:03d}" for index in range(1, count + 1)]
        for code in codes:
            point = db.query(ChargingPoint).filter(ChargingPoint.code == code).first()
            if point is None:
                point = ChargingPoint(
                    station_id=station.id,
                    code=code,
                    charge_point_id=code,
                    vendor="CSMS Simulator",
                    model="Virtual OCPP 1.6J",
                    max_power_kw=22.0,
                    is_active=True,
                    status="Offline",
                )
                db.add(point)
                db.flush()
            elif point.station_id != station.id:
                raise RuntimeError(f"Mã {code} đã thuộc một trạm khác; không ghi đè dữ liệu đó.")

            connector = (
                db.query(Connector)
                .filter(
                    Connector.charge_point_id == point.id,
                    Connector.connector_id == 1,
                )
                .first()
            )
            if connector is None:
                db.add(
                    Connector(
                        charge_point_id=point.id,
                        connector_id=1,
                        connector_number=1,
                        connector_type="Type 2",
                        max_power_kw=22.0,
                        status="Available",
                        ocpp_status="Available",
                        is_active=True,
                    )
                )

        # Chỉ dọn mã SIM do seeder này quản lý và chỉ khi chưa có phiên gắn với chúng.
        extras = (
            db.query(ChargingPoint)
            .filter(
                ChargingPoint.station_id == station.id,
                ChargingPoint.code.like("SIM-%"),
                ~ChargingPoint.code.in_(codes),
            )
            .all()
        )
        from app.models.session import ChargingSession

        for point in extras:
            connector_ids = [item.id for item in point.connectors]
            if connector_ids and db.query(ChargingSession).filter(
                ChargingSession.connector_id.in_(connector_ids)
            ).first():
                raise RuntimeError(
                    f"Không thể giảm số trụ: {point.code} đang được tham chiếu bởi phiên sạc."
                )
            db.delete(point)

        db.commit()
        return codes
    except Exception:  # noqa: BLE001 - rollback rồi giữ nguyên lỗi gốc
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    count = int(os.getenv("SIMULATOR_CHARGE_POINT_COUNT", "20"))
    seeded = seed_simulator_charge_points(count)
    print(f"Đã chuẩn bị {len(seeded)} trụ ảo: {seeded[0]}…{seeded[-1]}", flush=True)
