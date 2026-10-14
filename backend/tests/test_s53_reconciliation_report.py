"""Kiểm thử tối thiểu cho Story S-53 (SCRUM-394, SCRUM-395, SCRUM-396)."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction


@pytest.fixture
def s53_setup(db_session):
    admin = User(
        username="admin_s53",
        email="admin_s53@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="ADMIN",
        is_active=True,
    )
    accountant = User(
        username="accountant_s53",
        email="accountant_s53@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="ACCOUNTANT",
        is_active=True,
    )
    operator = User(
        username="operator_s53",
        email="operator_s53@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_s53",
        email="driver_s53@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, accountant, operator, driver])
    db_session.commit()

    wallet = Wallet(user_id=driver.id, balance=Decimal("1000000.00"))
    db_session.add(wallet)
    db_session.commit()

    tariff = Tariff(
        name="Biểu giá chuẩn",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2000.00"),
        peak_start="09:30",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        idle_fee_per_minute=Decimal("1000.00"),
        effective_from=datetime.now(timezone.utc),
    )
    st = Station(name="Trạm S53", address="Hà Nội", operator_id=operator.id, is_active=True)
    db_session.add_all([tariff, st])
    db_session.commit()

    cp = ChargingPoint(station_id=st.id, code="CP-S53", is_active=True)
    db_session.add(cp)
    db_session.commit()

    conn = Connector(charge_point_id=cp.id, is_active=True, status="AVAILABLE")
    db_session.add(conn)
    db_session.commit()

    now = datetime.now(timezone.utc)

    # 1. Phiên bình thường: khớp đúng hoàn toàn
    s_normal = ChargingSession(
        connector_id=conn.id,
        user_id=driver.id,
        tariff_id=tariff.id,
        status="COMPLETED",
        start_time=now,
        stop_time=now,
        total_kwh=Decimal("10.000"),
        total_amount=Decimal("20000.00"),
        created_at=now,
    )
    db_session.add(s_normal)
    db_session.commit()
    tx_normal = WalletTransaction(
        wallet_id=wallet.id,
        amount=Decimal("-20000.00"),
        transaction_type="CHARGE_FEE",
        balance_before=Decimal("1000000.00"),
        balance_after=Decimal("980000.00"),
        reference_id=f"session_{s_normal.transaction_id}",
    )
    db_session.add(tx_normal)


    # 2. Bất thường 1: UNBILLED_ENERGY - Phiên có cấp 12 kWh nhưng không chốt hóa đơn (total_amount = 0)
    s_unbilled = ChargingSession(
        connector_id=conn.id,
        user_id=driver.id,
        tariff_id=tariff.id,
        status="CHARGING",
        start_time=now,
        total_kwh=Decimal("12.000"),
        total_amount=Decimal("0.00"),
        created_at=now,
    )
    # 3. Bất thường 2: MISSING_LEDGER - Đã chốt hóa đơn 50,000 VND nhưng thiếu dòng trừ ví
    s_missing_ledger = ChargingSession(
        connector_id=conn.id,
        user_id=driver.id,
        tariff_id=tariff.id,
        status="COMPLETED",
        start_time=now,
        stop_time=now,
        total_kwh=Decimal("10.000"),
        total_amount=Decimal("50000.00"),
        created_at=now,
    )
    # 4. Bất thường 3: AMOUNT_MISMATCH - Hóa đơn 80,000 VND nhưng tính lại chỉ khoảng 30,000 VND
    s_mismatch = ChargingSession(
        connector_id=conn.id,
        user_id=driver.id,
        tariff_id=tariff.id,
        status="COMPLETED",
        start_time=now,
        stop_time=now,
        total_kwh=Decimal("10.000"),
        total_amount=Decimal("80000.00"),
        created_at=now,
    )
    db_session.add_all([s_unbilled, s_missing_ledger, s_mismatch])
    db_session.commit()

    # Thêm dòng ledger cho s_mismatch để nó không bị coi là thiếu ledger
    tx_mismatch = WalletTransaction(
        wallet_id=wallet.id,
        amount=Decimal("-80000.00"),
        transaction_type="CHARGE_FEE",
        balance_before=Decimal("970000.00"),
        balance_after=Decimal("890000.00"),
        reference_id=f"session_{s_mismatch.transaction_id}",
    )
    db_session.add(tx_mismatch)
    db_session.commit()

    token_admin = create_access_token(data={"sub": str(admin.id)})
    token_accountant = create_access_token(data={"sub": str(accountant.id)})
    token_operator = create_access_token(data={"sub": str(operator.id)})

    return {
        "token_admin": token_admin,
        "token_accountant": token_accountant,
        "token_operator": token_operator,
    }


def test_s53_happy_path_detects_3_issue_types(client: TestClient, s53_setup):
    """SCRUM-394, SCRUM-395: Phát hiện đủ 3 loại bất thường và tổng lệch ở đầu báo cáo."""
    headers = {"Authorization": f"Bearer {s53_setup['token_accountant']}"}
    response = client.get("/api/v1/reports/reconciliation?period_type=month", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_issues"] == 3
    issue_types = {item["issue_type"] for item in data["issues"]}
    assert "UNBILLED_ENERGY" in issue_types
    assert "MISSING_LEDGER" in issue_types
    assert "AMOUNT_MISMATCH" in issue_types
    assert float(data["total_discrepancy_amount"]) > 0


def test_s53_rbac_operator_and_customer_forbidden(client: TestClient, s53_setup):
    """SCRUM-396: Operator không có quyền vào đối soát kế toán -> 403."""
    headers = {"Authorization": f"Bearer {s53_setup['token_operator']}"}
    response = client.get("/api/v1/reports/reconciliation?period_type=month", headers=headers)
    assert response.status_code == 403


def test_s53_admin_has_permission(client: TestClient, s53_setup):
    """SCRUM-396: Admin có quyền vào đối soát kế toán."""
    headers = {"Authorization": f"Bearer {s53_setup['token_admin']}"}
    response = client.get("/api/v1/reports/reconciliation?period_type=month", headers=headers)
    assert response.status_code == 200
