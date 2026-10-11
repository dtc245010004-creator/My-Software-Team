from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.audit_log import AuditLog
from app.models.id_tag import IdTag
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.ocpp.handlers.authorize import handle_authorize
from app.services.wallet_service import (
    topup_wallet,
    validate_wallet_balance_for_session,
)


@pytest.fixture
def env_s38(db_session):
    """Fixture tạo CPO, tài xế, trạm sạc, trụ sạc, thẻ RFID và ví cho S-38."""
    cpo = User(
        username="cpo_s38",
        email="cpo_s38@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_s38",
        email="driver_s38@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([cpo, driver])
    db_session.commit()

    wallet = Wallet(
        user_id=driver.id,
        balance=Decimal("0.00"),
        is_debt_locked=False,
        is_reconcile_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()

    st = Station(
        operator_id=cpo.id,
        name="Trạm Sạc S38",
        address="100 Đại Lộ Năng Lượng",
        latitude=10.8,
        longitude=106.7,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-S38-01",
        vendor="VinFast",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn)

    tariff = Tariff(
        station_id=st.id,
        name="Biểu giá S38",
        price_normal=Decimal("3850.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2500.00"),
        is_active=True,
        effective_from=datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add(tariff)

    id_tag = IdTag(
        code="RFID-S38-001",
        user_id=driver.id,
        status="active",
    )
    db_session.add(id_tag)
    db_session.commit()

    token = create_access_token({"sub": str(driver.id), "role": driver.role})

    return {
        "driver": driver,
        "wallet": wallet,
        "station": st,
        "cp": cp,
        "conn": conn,
        "id_tag": id_tag,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


def test_validate_wallet_balance_rule_shared(db_session, env_s38):
    """AC 3 (SCRUM-265): Quy tắc thẩm định dùng chung hoạt động chuẩn xác theo ngưỡng settings."""
    driver = env_s38["driver"]
    wallet = env_s38["wallet"]
    threshold = Decimal(str(settings.MIN_START_BALANCE))  # 50,000 VND

    # 1. Số dư 0 VND (< 50,000)
    is_valid, error_code, cur_bal, req_thresh = validate_wallet_balance_for_session(
        db_session, driver.id
    )
    assert is_valid is False
    assert error_code == "WALLET_INSUFFICIENT_BALANCE"
    assert cur_bal == Decimal("0.00")
    assert req_thresh == threshold

    # 2. Nạp thêm dưới ngưỡng (49,999 VND)
    topup_wallet(db_session, driver.id, Decimal("49999.00"))
    db_session.refresh(wallet)
    is_valid, error_code, cur_bal, _ = validate_wallet_balance_for_session(
        db_session, driver.id
    )
    assert is_valid is False
    assert error_code == "WALLET_INSUFFICIENT_BALANCE"
    assert cur_bal == Decimal("49999.00")

    # 3. Nạp vừa khít đủ ngưỡng (50,000 VND)
    topup_wallet(db_session, driver.id, Decimal("1.00"))
    db_session.refresh(wallet)
    is_valid, error_code, cur_bal, _ = validate_wallet_balance_for_session(
        db_session, driver.id
    )
    assert is_valid is True
    assert error_code == ""
    assert cur_bal == threshold


def test_authorize_ocpp_blocked_when_balance_below_threshold(db_session, env_s38):
    """AC 1: OCPP Authorize từ trụ sạc bị Blocked khi số dư ví dưới 50.000 VNĐ."""
    cp = env_s38["cp"]
    id_tag = env_s38["id_tag"]

    # Ban đầu ví 0 VND (< 50,000 VND)
    resp = handle_authorize(db_session, cp, {"idTag": id_tag.code})
    assert resp["idTagInfo"]["status"] == "Blocked"


def test_authorize_ocpp_accepted_when_balance_exact_or_above_threshold(
    db_session, env_s38
):
    """AC 2: OCPP Authorize trả về Accepted khi số dư ví >= ngưỡng tối thiểu."""
    driver = env_s38["driver"]
    cp = env_s38["cp"]
    id_tag = env_s38["id_tag"]

    # Nạp đúng 50.000 VND (vừa khớp ngưỡng)
    topup_wallet(db_session, driver.id, Decimal("50000.00"))

    resp = handle_authorize(db_session, cp, {"idTag": id_tag.code})
    assert resp["idTagInfo"]["status"] == "Accepted"

    # Nạp thêm thành 100.000 VND (> ngưỡng)
    topup_wallet(db_session, driver.id, Decimal("50000.00"))
    resp2 = handle_authorize(db_session, cp, {"idTag": id_tag.code})
    assert resp2["idTagInfo"]["status"] == "Accepted"


def test_api_start_session_rejected_when_balance_below_threshold(
    client, db_session, env_s38
):
    """AC 1: REST API /sessions/start trả về 400 và payload chuẩn hóa khi số dư thiếu."""
    driver = env_s38["driver"]
    conn = env_s38["conn"]
    headers = env_s38["headers"]

    # Nạp 15.000 VND (dưới ngưỡng 50.000 VND)
    topup_wallet(db_session, driver.id, Decimal("15000.00"))

    res = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": conn.id},
        headers=headers,
    )
    assert res.status_code == 400
    data = res.json()
    assert data["error_code"] == "WALLET_INSUFFICIENT_BALANCE"
    assert data["current_balance"] == 15000
    assert data["required_balance"] == 50000
    assert data["suggest_topup"] is True
    assert "không đủ hạn mức tối thiểu" in data["detail"]


def test_api_start_session_allowed_when_balance_exact_threshold(
    client, db_session, env_s38
):
    """AC 2: REST API /sessions/start cho phép bắt đầu phiên khi số dư vừa đủ 50.000 VNĐ."""
    driver = env_s38["driver"]
    conn = env_s38["conn"]
    headers = env_s38["headers"]

    # Nạp vừa khít 50.000 VND
    topup_wallet(db_session, driver.id, Decimal("50000.00"))

    res = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": conn.id},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["status"] == "ACTIVE"


def test_blocked_session_creates_audit_log(client, db_session, env_s38):
    """AC 4 (SCRUM-267): Ghi log kiểm toán SESSION_BLOCKED_INSUFFICIENT_BALANCE khi phiên bị chặn."""
    driver = env_s38["driver"]
    conn = env_s38["conn"]
    cp = env_s38["cp"]
    id_tag = env_s38["id_tag"]
    headers = env_s38["headers"]

    # 1. Bị chặn qua OCPP Authorize
    handle_authorize(db_session, cp, {"idTag": id_tag.code})

    audit_ocpp = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.user_id == driver.id,
            AuditLog.action == "SESSION_BLOCKED_INSUFFICIENT_BALANCE",
        )
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit_ocpp is not None
    assert audit_ocpp.data["required_threshold"] == "50000"
    assert audit_ocpp.data["charge_point_id"] == cp.id
    assert "Số dư ví dưới ngưỡng tối thiểu" in audit_ocpp.data["reason"]

    # 2. Bị chặn qua REST API Start
    client.post(
        "/api/v1/sessions/start",
        json={"connector_id": conn.id},
        headers=headers,
    )

    audit_api = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.user_id == driver.id,
            AuditLog.action == "SESSION_BLOCKED_INSUFFICIENT_BALANCE",
        )
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit_api is not None
    assert audit_api.data["current_balance"] == "0.00"
    assert audit_api.data["required_threshold"] == "50000"

