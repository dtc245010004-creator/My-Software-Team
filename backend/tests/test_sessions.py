import asyncio
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, get_password_hash
from app.models.meter_value import MeterValue
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.services.session_service import (
    remote_start_charging_session,
    remote_stop_charging_session,
    start_charging_session,
    stop_charging_session,
)


@pytest.fixture
def session_env(db_session):
    """Fixture tạo môi trường trạm, trụ, cổng, biểu giá và tài xế."""
    cpo = User(
        username="cpo_sess",
        email="cpo_sess@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver_normal = User(
        username="driver_sess_normal",
        email="driver_normal@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    driver_normal_2 = User(
        username="driver_sess_normal_2",
        email="driver_normal_2@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    driver_debt = User(
        username="driver_sess_debt",
        email="driver_debt@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([cpo, driver_normal, driver_normal_2, driver_debt])
    db_session.commit()

    # Ví tiền
    w_normal = Wallet(
        user_id=driver_normal.id, balance=Decimal("100000.00"), is_debt_locked=False
    )
    w_normal_2 = Wallet(
        user_id=driver_normal_2.id, balance=Decimal("100000.00"), is_debt_locked=False
    )
    w_debt = Wallet(
        user_id=driver_debt.id, balance=Decimal("-50000.00"), is_debt_locked=True
    )
    db_session.add_all([w_normal, w_normal_2, w_debt])

    # Hạ tầng
    st = Station(
        operator_id=cpo.id,
        name="Trạm Test Session",
        address="100 Đường Điện Lực",
        latitude=10.0,
        longitude=106.0,
        total_grid_capacity_kw=100.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-SESS-01",
        vendor="ABB",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    conn2 = Connector(
        charging_point_id=cp.id,
        connector_number=2,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([conn1, conn2])

    # Biểu giá TOU
    tariff = Tariff(
        station_id=st.id,
        name="Biểu Giá Chuẩn Session",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2000.00"),
        is_active=True,
    )
    db_session.add(tariff)
    db_session.commit()

    return {
        "cpo": cpo,
        "driver_normal": driver_normal,
        "driver_normal_2": driver_normal_2,
        "driver_debt": driver_debt,
        "conn1": conn1,
        "conn2": conn2,
        "tariff": tariff,
    }


class TestSessionLifecycle:
    """Kiểm thử vòng đời phiên sạc và khóa rơ-le cổng sạc."""

    def test_start_session_available_connector_success(self, db_session, session_env):
        """1. Bắt đầu sạc thành công: cổng chuyển CHARGING, phiên sạc ACTIVE."""
        driver = session_env["driver_normal"]
        conn = session_env["conn1"]

        session = start_charging_session(
            db=db_session,
            user=driver,
            connector_id=conn.id,
        )

        assert session.status == "ACTIVE"
        assert session.user_id == driver.id
        assert session.connector_id == conn.id

        # Kiểm tra cổng sạc vật lý đã bị khóa độc quyền
        db_session.refresh(conn)
        assert conn.status == "CHARGING"

    def test_start_session_charging_conflict_fails(self, db_session, session_env):
        """2. Khóa cổng độc quyền: Cổng đang CHARGING -> Chặn người thứ 2 với HTTP 409 Conflict."""
        driver1 = session_env["driver_normal"]
        driver2 = session_env["driver_normal_2"]
        conn = session_env["conn1"]

        # Phiên 1 bắt đầu thành công với driver 1
        start_charging_session(db=db_session, user=driver1, connector_id=conn.id)

        # Tài xế thứ 2 cố gắng cắm cùng cổng đó -> 409 Conflict
        with pytest.raises(HTTPException) as exc_info:
            start_charging_session(db=db_session, user=driver2, connector_id=conn.id)

        assert exc_info.value.status_code == 409
        assert "đang được sử dụng" in exc_info.value.detail.lower()

    def test_start_session_debt_locked_forbidden(self, db_session, session_env):
        """3. Tài khoản nợ tiền hoặc bị khóa nợ -> Chặn khởi động phiên mới (HTTP 402)."""
        driver_debt = session_env["driver_debt"]
        conn = session_env["conn2"]

        with pytest.raises(HTTPException) as exc_info:
            start_charging_session(
                db=db_session, user=driver_debt, connector_id=conn.id
            )

        assert exc_info.value.status_code == 402
        assert "vui lòng nạp tiền" in exc_info.value.detail.lower()

    def test_stop_session_settles_and_frees_connector(self, db_session, session_env):
        """4. Dừng sạc: Chốt kWh, trừ tiền ví ACID, giải phóng cổng sạc về AVAILABLE."""
        driver = session_env["driver_normal"]
        conn = session_env["conn2"]

        # Start session
        session = start_charging_session(
            db=db_session, user=driver, connector_id=conn.id
        )

        # Stop session với 15.0 kWh
        stopped_session = stop_charging_session(
            db=db_session,
            user=driver,
            session_id=session.id,
            meter_stop_kwh=Decimal("15.00"),
            stop_reason="USER_STOPPED",
        )

        assert stopped_session.status == "COMPLETED"
        assert stopped_session.total_kwh == Decimal("15.00")
        assert stopped_session.total_amount > Decimal("0.00")

        # Cổng sạc được giải phóng
        db_session.refresh(conn)
        assert conn.status == "AVAILABLE"

        # Ví tiền đã bị trừ
        w = db_session.query(Wallet).filter(Wallet.user_id == driver.id).first()
        assert w.balance < Decimal("100000.00")

    def test_stop_session_idempotency(self, db_session, session_env):
        """5. Tính lũy đẳng (Idempotency): Gọi stop_session lần thứ 2 không tính cước đúp."""
        driver = session_env["driver_normal"]
        conn = session_env["conn2"]

        session = start_charging_session(
            db=db_session, user=driver, connector_id=conn.id
        )
        stopped_1 = stop_charging_session(
            db=db_session,
            user=driver,
            session_id=session.id,
            meter_stop_kwh=Decimal("10.00"),
        )
        amt_1 = stopped_1.total_amount

        # Gọi lại lần 2
        stopped_2 = stop_charging_session(
            db=db_session,
            user=driver,
            session_id=session.id,
            meter_stop_kwh=Decimal("10.00"),
        )
        assert stopped_2.total_amount == amt_1

    def test_remote_stop_session_success(self, db_session, session_env):
        """S-23 / T-49: Vận hành viên dừng phiên từ xa thành công (stop_reason='Remote', status='COMPLETED')."""
        driver = session_env["driver_normal"]
        cpo = session_env["cpo"]
        conn = session_env["conn2"]

        session = start_charging_session(
            db=db_session, user=driver, connector_id=conn.id
        )
        assert session.status == "ACTIVE"

        # Vận hành viên gửi lệnh dừng từ xa
        remote_stopped = remote_stop_charging_session(
            db=db_session,
            user=cpo,
            session_id=session.id,
        )

        assert remote_stopped.status == "COMPLETED"
        assert remote_stopped.stop_reason == "Remote"
        assert remote_stopped.total_kwh > Decimal("0.00")
        assert remote_stopped.total_amount > Decimal("0.00")

        # Cổng sạc được giải phóng về AVAILABLE
        db_session.refresh(conn)
        assert conn.status == "AVAILABLE"

    def test_remote_stop_session_3_error_cases(self, db_session, session_env):
        """S-23 / T-49: Ba ca lỗi của S-23 hiển thị đúng 3 thông báo lỗi khác nhau."""
        driver = session_env["driver_normal"]
        cpo = session_env["cpo"]
        conn = session_env["conn2"]

        session = start_charging_session(
            db=db_session, user=driver, connector_id=conn.id
        )

        # Ca 1: Trụ ngoại tuyến (Offline)
        with pytest.raises(HTTPException) as exc_offline:
            remote_stop_charging_session(
                db=db_session,
                user=cpo,
                session_id=session.id,
                simulate_condition="OFFLINE",
            )
        assert exc_offline.value.status_code == 400
        assert "ngoại tuyến" in exc_offline.value.detail.lower()

        # Ca 2: Trụ từ chối (Rejected)
        with pytest.raises(HTTPException) as exc_rejected:
            remote_stop_charging_session(
                db=db_session,
                user=cpo,
                session_id=session.id,
                simulate_condition="REJECTED",
            )
        assert exc_rejected.value.status_code == 409
        assert "từ chối" in exc_rejected.value.detail.lower()

        # Ca 3: Hết thời gian chờ (Timeout)
        with pytest.raises(HTTPException) as exc_timeout:
            remote_stop_charging_session(
                db=db_session,
                user=cpo,
                session_id=session.id,
                simulate_condition="TIMEOUT",
            )
        assert exc_timeout.value.status_code == 504
        assert "hết thời gian" in exc_timeout.value.detail.lower() or "timeout" in exc_timeout.value.detail.lower()

        # Phiên sạc vẫn giữ nguyên trạng thái ACTIVE
        db_session.refresh(session)
        assert session.status == "ACTIVE"
        assert session.needs_review is True

    def test_remote_stop_session_nfr_rbac(self, db_session, session_env):
        """S-23 / T-49 NFR: Chỉ vai trò vận hành viên và quản trị mới được gửi lệnh dừng từ xa."""
        driver = session_env["driver_normal"]
        conn = session_env["conn2"]

        session = start_charging_session(
            db=db_session, user=driver, connector_id=conn.id
        )

        # Tài xế (CUSTOMER) bị từ chối 403 Forbidden
        with pytest.raises(HTTPException) as exc_customer:
            remote_stop_charging_session(
                db=db_session,
                user=driver,
                session_id=session.id,
            )
        assert exc_customer.value.status_code == 403
        assert "vận hành viên và quản trị" in exc_customer.value.detail.lower()


def test_current_session_returns_only_callers_latest_meter_value(
    client, db_session, session_env
):
    driver = session_env["driver_normal"]
    other_driver = session_env["driver_normal_2"]
    first_session = ChargingSession(
        user_id=driver.id,
        connector_id=session_env["conn1"].id,
        tariff_id=session_env["tariff"].id,
        applied_price_per_kwh=Decimal("3000.00"),
        meter_start_kwh=Decimal("0.00"),
        status="CHARGING",
    )
    other_session = ChargingSession(
        user_id=other_driver.id,
        connector_id=session_env["conn2"].id,
        tariff_id=session_env["tariff"].id,
        applied_price_per_kwh=Decimal("3000.00"),
        meter_start_kwh=Decimal("0.00"),
        status="CHARGING",
    )
    db_session.add_all([first_session, other_session])
    db_session.flush()
    recorded_at = datetime.now(timezone.utc)
    db_session.add(
        MeterValue(
            session_id=first_session.id,
            measurand="Energy.Active.Import.Register",
            value=Decimal("15000"),
            unit="Wh",
            recorded_at=recorded_at,
        )
    )
    db_session.commit()

    token = create_access_token({"sub": str(driver.id), "role": driver.role})
    response = client.get(
        "/api/v1/sessions/current",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == first_session.id
    assert Decimal(response.json()["latest_kwh"]) == Decimal("15")
    assert response.json()["latest_meter_at"] is not None


def test_remote_start_persists_request_before_fast_start_transaction(
    db_session, session_env, monkeypatch
):
    from sqlalchemy.orm import sessionmaker

    from app.models.id_tag import IdTag
    from app.models.remote_start_request import RemoteStartRequest
    from app.ocpp import dispatcher, gateway
    from app.ocpp.handlers.start_transaction import handle_start_transaction

    connector = session_env["conn1"]
    charging_point_code = connector.charging_point.code
    monkeypatch.setattr(
        gateway, "active_ocpp_connections", {charging_point_code: object()}
    )

    async def accept_and_start(code, action, payload, timeout_seconds):
        assert code == charging_point_code
        assert action == "RemoteStartTransaction"
        with sessionmaker(bind=db_session.get_bind())() as charger_db:
            tag = charger_db.query(IdTag).filter_by(code=payload["idTag"]).first()
            pending = (
                charger_db.query(RemoteStartRequest)
                .filter_by(connector_id=connector.id, id_tag=payload["idTag"])
                .first()
            )
            assert tag is not None
            assert pending is not None
            assert pending.status == "PENDING"
            cp = (
                charger_db.query(ChargingPoint)
                .filter_by(id=connector.charging_point_id)
                .first()
            )
            start_result = handle_start_transaction(
                charger_db,
                cp,
                {
                    "connectorId": payload["connectorId"],
                    "idTag": payload["idTag"],
                    "meterStart": 0,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
            assert start_result["idTagInfo"]["status"] == "Accepted"
        return {"status": "Accepted"}

    monkeypatch.setattr(dispatcher, "send_call_and_wait", accept_and_start)
    request = asyncio.run(
        remote_start_charging_session(
            db=db_session,
            user=session_env["driver_normal"],
            connector_id=connector.id,
        )
    )

    assert request.status == "STARTED"
    assert request.transaction_id is not None
