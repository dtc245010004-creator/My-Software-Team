"""Bộ kiểm thử toàn diện cho Epic E-09:
- S-54: Chia doanh thu cho đối tác theo tỉ lệ hợp đồng, bảo toàn tuyệt đối tổng tiền (Zero-Discrepancy Invariant).
- S-55: Chốt và khóa kỳ đối soát, kiểm tra phiên bất thường, khóa chỉ đọc Read-Only và mở lại kỳ bởi Admin.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.audit_log import AuditLog
from app.models.reconciliation import (
    PartnerRevenueShareConfig,
    PartnerSettlement,
    PeriodLockedException,
    ReconciliationPeriod,
)
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services.reconciliation_service import (
    calculate_partner_revenue_share,
    ensure_not_in_locked_period,
)


@pytest.fixture
def env_reconciliation(db_session):
    """Fixture tạo dữ liệu mẫu: Admin, Kế toán, 2 Đối tác trạm sạc, 1 Tài xế, các trạm sạc và ví."""
    admin = User(
        username="admin_e09",
        email="admin_e09@evcsms.vn",
        password_hash=get_password_hash("Pass1234"),
        role="ADMIN",
        is_active=True,
    )
    accountant = User(
        username="accountant_e09",
        email="accountant_e09@evcsms.vn",
        password_hash=get_password_hash("Pass1234"),
        role="ACCOUNTANT",
        is_active=True,
    )
    partner1 = User(
        username="partner1_e09",
        email="partner1@evcsms.vn",
        full_name="Công Ty TNHH Trạm Sạc Miền Nam",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    partner2 = User(
        username="partner2_e09",
        email="partner2@evcsms.vn",
        full_name="Công Ty CP Năng Lượng Xanh",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_e09",
        email="driver_e09@evcsms.vn",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, accountant, partner1, partner2, driver])
    db_session.commit()

    # Ví điện tử cho tài xế
    driver_wallet = Wallet(
        user_id=driver.id,
        balance=Decimal("2000000.00"),
        is_debt_locked=False,
    )
    db_session.add(driver_wallet)
    db_session.commit()

    # Trạm sạc 1 thuộc Partner 1
    station1 = Station(
        operator_id=partner1.id,
        name="Trạm Sạc Tân Bình",
        address="100 Hoàng Văn Thụ, Q.Tân Bình, TP.HCM",
        status="ACTIVE",
        is_active=True,
    )
    # Trạm sạc 2 thuộc Partner 2
    station2 = Station(
        operator_id=partner2.id,
        name="Trạm Sạc Quận 7",
        address="200 Nguyễn Lương Bằng, Q.7, TP.HCM",
        status="ACTIVE",
        is_active=True,
    )
    db_session.add_all([station1, station2])
    db_session.commit()

    # Trụ sạc và đầu nối cho Station 1
    cp1 = ChargingPoint(
        station_id=station1.id,
        code="CP-E09-01",
        vendor="ABB",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp1)
    db_session.commit()

    conn1 = Connector(
        charge_point_id=cp1.id,
        connector_number=1,
        connector_type="CCS2",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn1)

    # Trụ sạc và đầu nối cho Station 2
    cp2 = ChargingPoint(
        station_id=station2.id,
        code="CP-E09-02",
        vendor="StarCharge",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp2)
    db_session.commit()

    conn2 = Connector(
        charge_point_id=cp2.id,
        connector_number=1,
        connector_type="CCS2",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn2)
    db_session.commit()

    # Tokens
    token_admin = create_access_token({"sub": str(admin.id), "role": admin.role})
    token_acc = create_access_token({"sub": str(accountant.id), "role": accountant.role})
    token_p1 = create_access_token({"sub": str(partner1.id), "role": partner1.role})
    token_p2 = create_access_token({"sub": str(partner2.id), "role": partner2.role})
    token_driver = create_access_token({"sub": str(driver.id), "role": driver.role})

    return {
        "admin": admin,
        "accountant": accountant,
        "partner1": partner1,
        "partner2": partner2,
        "driver": driver,
        "driver_wallet": driver_wallet,
        "station1": station1,
        "station2": station2,
        "cp1": cp1,
        "cp2": cp2,
        "conn1": conn1,
        "conn2": conn2,
        "headers_admin": {"Authorization": f"Bearer {token_admin}"},
        "headers_acc": {"Authorization": f"Bearer {token_acc}"},
        "headers_p1": {"Authorization": f"Bearer {token_p1}"},
        "headers_p2": {"Authorization": f"Bearer {token_p2}"},
        "headers_driver": {"Authorization": f"Bearer {token_driver}"},
    }


# ===========================================================================
# S-54: CHIA DOANH THU & BẢO TOÀN TUYỆT ĐỐI TỔNG TIỀN (ZERO-DISCREPANCY)
# ===========================================================================


def test_s54_partner_revenue_share_hand_calculated_exact_vnd():
    """S-54: Kiểm thử với bộ số liệu đáp án tính tay chuẩn xác không lệch dù chỉ 1 đồng."""
    # Ca 1: Doanh thu 1.234.567 đ, tỉ lệ 73.5%
    # 1.234.567 * 73.5 / 100 = 907.406,745 đ -> làm tròn 907.407 đ
    # Nền tảng: 1.234.567 - 907.407 = 327.160 đ
    rev1 = 1234567
    payout1, retained1 = calculate_partner_revenue_share(rev1, Decimal("73.5"))
    assert payout1 == 907407
    assert retained1 == 327160
    assert payout1 + retained1 == rev1

    # Ca 2: Doanh thu 100.001 đ, tỉ lệ 33.33%
    # 100.001 * 33.33 / 100 = 33.330,3333 đ -> làm tròn 33.330 đ
    # Nền tảng: 100.001 - 33.330 = 66.671 đ
    rev2 = 100001
    payout2, retained2 = calculate_partner_revenue_share(rev2, Decimal("33.33"))
    assert payout2 == 33330
    assert retained2 == 66671
    assert payout2 + retained2 == rev2

    # Ca 3: Doanh thu 50.000 đ, tỉ lệ chẵn 80.0%
    rev3 = 50000
    payout3, retained3 = calculate_partner_revenue_share(rev3, Decimal("80.0"))
    assert payout3 == 40000
    assert retained3 == 10000
    assert payout3 + retained3 == rev3

    # Ca 4: Doanh thu 0 đ
    payout4, retained4 = calculate_partner_revenue_share(0, Decimal("70.0"))
    assert payout4 == 0
    assert retained4 == 0


def test_s54_configure_partner_revenue_share_api(client, db_session, env_reconciliation):
    """S-54: API cấu hình tỉ lệ chia doanh thu cho đối tác (ADMIN, ACCOUNTANT)."""
    p1 = env_reconciliation["partner1"]
    headers_acc = env_reconciliation["headers_acc"]
    headers_driver = env_reconciliation["headers_driver"]

    # 1. Kế toán cấu hình 75% cho Partner 1
    res = client.post(
        "/api/v1/reconciliation/partner-configs",
        json={
            "partner_id": p1.id,
            "share_percentage": "75.00",
            "include_idle_fee": True,
        },
        headers=headers_acc,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["partner_id"] == p1.id
    assert float(data["share_percentage"]) == 75.0
    assert data["include_idle_fee"] is True

    # 2. Tài xế (CUSTOMER) cố cấu hình -> Bị từ chối 403
    res_forbidden = client.post(
        "/api/v1/reconciliation/partner-configs",
        json={
            "partner_id": p1.id,
            "share_percentage": "80.00",
        },
        headers=headers_driver,
    )
    assert res_forbidden.status_code == 403


def test_s54_mid_period_contract_rate_change_and_idle_fee_toggle(client, db_session, env_reconciliation):
    """S-54: Xử lý đổi tỉ lệ hợp đồng giữa kỳ (nửa đầu kỳ 70%, nửa cuối kỳ 80%) và cờ bật/tắt chia phí chiếm trụ."""
    p1 = env_reconciliation["partner1"]
    conn1 = env_reconciliation["conn1"]
    headers_admin = env_reconciliation["headers_admin"]

    # Kỳ đối soát: 2026-10 (01/10 đến 31/10)
    start_dt = datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)
    mid_dt = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc)

    # Cấu hình 1: 01/10 -> 15/10: 70%, include_idle_fee = True
    cfg1 = PartnerRevenueShareConfig(
        partner_id=p1.id,
        share_percentage=Decimal("70.00"),
        include_idle_fee=True,
        effective_from=start_dt,
        effective_to=mid_dt,
    )
    # Cấu hình 2: 15/10 -> 31/10: 80%, include_idle_fee = False (không chia phí chiếm trụ)
    cfg2 = PartnerRevenueShareConfig(
        partner_id=p1.id,
        share_percentage=Decimal("80.00"),
        include_idle_fee=False,
        effective_from=mid_dt,
        effective_to=end_dt,
    )
    db_session.add_all([cfg1, cfg2])

    # Tạo kỳ đối soát
    period = ReconciliationPeriod(
        period_code="2026-10-TEST",
        name="Kỳ đối soát Test",
        period_type="month",
        start_date=start_dt,
        end_date=end_dt,
        status="OPEN",
    )
    db_session.add(period)
    db_session.commit()

    # Phiên 1 (rơi vào nửa đầu kỳ: 05/10): Tiền điện 100k, phí chiếm trụ 20k -> Tổng 120k. Cấu hình 70% + chia phí -> Chia trên 120k: 120k * 70% = 84k
    s1 = ChargingSession(
        connector_id=conn1.id,
        driver_id=env_reconciliation["driver"].id,
        status="COMPLETED",
        total_kwh=Decimal("30.000"),
        total_amount=Decimal("120000.00"),
        idle_amount=Decimal("20000.00"),
        start_time=datetime(2026, 10, 5, 8, 0, tzinfo=timezone.utc),
        stop_time=datetime(2026, 10, 5, 9, 0, tzinfo=timezone.utc),
        created_at=datetime(2026, 10, 5, 8, 0, tzinfo=timezone.utc),
    )
    db_session.add(s1)
    db_session.flush()

    # Dòng sổ cái cho phiên 1
    tx1 = WalletTransaction(
        wallet_id=env_reconciliation["driver_wallet"].id,
        amount=Decimal("-120000.00"),
        transaction_type="CHARGE_FEE",
        reference_id=f"session_{s1.transaction_id}",
        balance_after=Decimal("1880000.00"),
        created_at=datetime(2026, 10, 5, 9, 0, tzinfo=timezone.utc),
    )
    db_session.add(tx1)

    # Phiên 2 (rơi vào nửa cuối kỳ: 20/10): Tiền điện 100k, phí chiếm trụ 30k -> Tổng 130k. Cấu hình 80% + KHÔNG chia phí -> Chỉ chia trên 100k tiền điện: 100k * 80% = 80k
    s2 = ChargingSession(
        connector_id=conn1.id,
        driver_id=env_reconciliation["driver"].id,
        status="COMPLETED",
        total_kwh=Decimal("25.000"),
        total_amount=Decimal("130000.00"),
        idle_amount=Decimal("30000.00"),
        start_time=datetime(2026, 10, 20, 14, 0, tzinfo=timezone.utc),
        stop_time=datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc),
        created_at=datetime(2026, 10, 20, 14, 0, tzinfo=timezone.utc),
    )
    db_session.add(s2)
    db_session.flush()

    tx2 = WalletTransaction(
        wallet_id=env_reconciliation["driver_wallet"].id,
        amount=Decimal("-130000.00"),
        transaction_type="CHARGE_FEE",
        reference_id=f"session_{s2.transaction_id}",
        balance_after=Decimal("1750000.00"),
        created_at=datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc),
    )
    db_session.add(tx2)
    db_session.commit()

    # Chốt kỳ đối soát
    res_lock = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/lock",
        headers=headers_admin,
    )
    assert res_lock.status_code == 200
    lock_data = res_lock.json()
    assert lock_data["status"] == "LOCKED"

    # Kiểm tra bảng kê settlement
    settlements = client.get(
        f"/api/v1/reconciliation/periods/{period.id}/settlements",
        headers=headers_admin,
    ).json()
    assert len(settlements) == 1
    st = settlements[0]

    # Tổng doanh thu tính chia: Phiên 1 (120k) + Phiên 2 chỉ tính tiền điện (100k) = 220.000 đ
    assert st["reconciled_revenue"] == 220000
    # Tổng trả đối tác: Phiên 1 (120k * 70% = 84k) + Phiên 2 (100k * 80% = 80k) = 164.000 đ
    assert st["partner_payout_amount"] == 164000
    # Phần nền tảng giữ: 220k - 164k = 56.000 đ
    assert st["platform_retained_amount"] == 56000
    # Bất biến không lệch 1 đồng
    assert st["partner_payout_amount"] + st["platform_retained_amount"] == st["reconciled_revenue"]


# ===========================================================================
# S-55: CHỐT & KHÓA KỲ ĐỐI SOÁT, CHẶN BẤT THƯỜNG & KHÓA CHỈ ĐỌC READ-ONLY
# ===========================================================================


def test_s55_lock_period_blocked_when_abnormal_or_unreconciled_sessions_exist(
    client, db_session, env_reconciliation
):
    """S-55 AC 2: Chặn chốt kỳ khi còn phiên sạc bất thường (chưa kết thúc, thiếu dòng sổ cái, hoặc cờ ABNORMAL) kèm danh sách unresolved_sessions."""
    conn = env_reconciliation["conn1"]
    headers_acc = env_reconciliation["headers_acc"]
    driver = env_reconciliation["driver"]

    # Tạo kỳ đối soát Tháng 10
    period = ReconciliationPeriod(
        period_code="2026-10-ABNORMAL",
        name="Kỳ đối soát Bất Thường",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="OPEN",
    )
    db_session.add(period)
    db_session.commit()

    # 1. Phiên 1: Đang CHARGING chưa kết thúc
    s1 = ChargingSession(
        connector_id=conn.id,
        driver_id=driver.id,
        status="CHARGING",
        total_kwh=Decimal("10.000"),
        total_amount=Decimal("40000.00"),
        created_at=datetime(2026, 10, 5, 0, 0, tzinfo=timezone.utc),
    )
    # 2. Phiên 2: Đã COMPLETED nhưng thiếu dòng sổ cái WalletTransaction
    s2 = ChargingSession(
        connector_id=conn.id,
        driver_id=driver.id,
        status="COMPLETED",
        total_kwh=Decimal("15.000"),
        total_amount=Decimal("60000.00"),
        created_at=datetime(2026, 10, 10, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add_all([s1, s2])
    db_session.commit()

    # Thử chốt kỳ -> Bị chặn với HTTP 409
    res = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/lock",
        headers=headers_acc,
    )
    assert res.status_code == 409
    data = res.json()
    assert "bất thường chưa được xử lý" in data["detail"]
    assert "unresolved_sessions" in data
    unresolved = data["unresolved_sessions"]
    assert len(unresolved) >= 2
    session_ids = [u["session_id"] for u in unresolved]
    assert s1.transaction_id in session_ids
    assert s2.transaction_id in session_ids


def test_s55_lock_period_success_when_all_sessions_valid(
    client, db_session, env_reconciliation
):
    """S-55 AC 1 & S-54: Chốt kỳ thành công khi toàn bộ phiên hợp lệ, sinh bảng kê chi tiết cho nhiều đối tác."""
    conn1 = env_reconciliation["conn1"]
    conn2 = env_reconciliation["conn2"]
    p1 = env_reconciliation["partner1"]
    p2 = env_reconciliation["partner2"]
    driver = env_reconciliation["driver"]
    wallet = env_reconciliation["driver_wallet"]
    headers_acc = env_reconciliation["headers_acc"]

    # Tạo kỳ
    period = ReconciliationPeriod(
        period_code="2026-10-VALID",
        name="Kỳ đối soát Hợp Lệ",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="OPEN",
    )
    db_session.add(period)

    # Cấu hình tỉ lệ: Partner 1 = 70%, Partner 2 = 65%
    cfg1 = PartnerRevenueShareConfig(partner_id=p1.id, share_percentage=Decimal("70.00"))
    cfg2 = PartnerRevenueShareConfig(partner_id=p2.id, share_percentage=Decimal("65.00"))
    db_session.add_all([cfg1, cfg2])
    db_session.commit()

    # Phiên trạm 1 (Partner 1): 500.000 đ
    s1 = ChargingSession(
        connector_id=conn1.id,
        driver_id=driver.id,
        status="COMPLETED",
        total_kwh=Decimal("120.000"),
        total_amount=Decimal("500000.00"),
        idle_amount=Decimal("0.00"),
        created_at=datetime(2026, 10, 12, 10, 0, tzinfo=timezone.utc),
    )
    # Phiên trạm 2 (Partner 2): 800.000 đ
    s2 = ChargingSession(
        connector_id=conn2.id,
        driver_id=driver.id,
        status="COMPLETED",
        total_kwh=Decimal("200.000"),
        total_amount=Decimal("800000.00"),
        idle_amount=Decimal("0.00"),
        created_at=datetime(2026, 10, 18, 14, 0, tzinfo=timezone.utc),
    )
    db_session.add_all([s1, s2])
    db_session.flush()

    tx1 = WalletTransaction(
        wallet_id=wallet.id,
        amount=Decimal("-500000.00"),
        transaction_type="CHARGE_FEE",
        reference_id=f"session_{s1.transaction_id}",
        balance_after=Decimal("1500000.00"),
        created_at=datetime(2026, 10, 12, 11, 0, tzinfo=timezone.utc),
    )
    tx2 = WalletTransaction(
        wallet_id=wallet.id,
        amount=Decimal("-800000.00"),
        transaction_type="CHARGE_FEE",
        reference_id=f"session_{s2.transaction_id}",
        balance_after=Decimal("700000.00"),
        created_at=datetime(2026, 10, 18, 15, 0, tzinfo=timezone.utc),
    )
    db_session.add_all([tx1, tx2])
    db_session.commit()

    # Chốt kỳ đối soát
    res = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/lock",
        headers=headers_acc,
    )
    assert res.status_code == 200
    p_data = res.json()
    assert p_data["status"] == "LOCKED"
    assert p_data["total_reconciled_revenue"] == 1300000
    assert p_data["total_partner_payout"] + p_data["total_platform_retained"] == 1300000

    # Lấy bảng kê chia doanh thu
    settlements = client.get(
        f"/api/v1/reconciliation/periods/{period.id}/settlements",
        headers=headers_acc,
    ).json()
    assert len(settlements) == 2

    # Partner 1: 500k * 70% = 350k
    st1 = next(s for s in settlements if s["partner_id"] == p1.id)
    assert st1["reconciled_revenue"] == 500000
    assert st1["partner_payout_amount"] == 350000
    assert st1["platform_retained_amount"] == 150000
    assert st1["partner_payout_amount"] + st1["platform_retained_amount"] == 500000

    # Partner 2: 800k * 65% = 520k
    st2 = next(s for s in settlements if s["partner_id"] == p2.id)
    assert st2["reconciled_revenue"] == 800000
    assert st2["partner_payout_amount"] == 520000
    assert st2["platform_retained_amount"] == 280000
    assert st2["partner_payout_amount"] + st2["platform_retained_amount"] == 800000


def test_s55_locked_period_makes_sessions_invoices_and_ledger_readonly(
    client, db_session, env_reconciliation
):
    """S-55 AC 1: Kỳ đối soát đã LOCKED kích hoạt cơ chế khóa chỉ đọc (Read-only) đa tầng ngăn chặn mọi thao tác sửa đổi."""
    conn = env_reconciliation["conn1"]
    driver = env_reconciliation["driver"]
    wallet = env_reconciliation["driver_wallet"]
    headers_acc = env_reconciliation["headers_acc"]

    # Tạo kỳ và phiên hợp lệ
    period = ReconciliationPeriod(
        period_code="2026-10-LOCKGUARD",
        name="Kỳ đối soát Khóa Chặt",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="OPEN",
    )
    db_session.add(period)
    db_session.commit()

    s = ChargingSession(
        connector_id=conn.id,
        driver_id=driver.id,
        status="COMPLETED",
        total_kwh=Decimal("50.000"),
        total_amount=Decimal("200000.00"),
        idle_amount=Decimal("0.00"),
        created_at=datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc),
    )
    db_session.add(s)
    db_session.flush()

    tx = WalletTransaction(
        wallet_id=wallet.id,
        amount=Decimal("-200000.00"),
        transaction_type="CHARGE_FEE",
        reference_id=f"session_{s.transaction_id}",
        balance_after=Decimal("1800000.00"),
        created_at=datetime(2026, 10, 15, 11, 0, tzinfo=timezone.utc),
    )
    db_session.add(tx)
    db_session.commit()

    # Chốt kỳ thành công
    res_lock = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/lock",
        headers=headers_acc,
    )
    assert res_lock.status_code == 200

    # 1. Kiểm tra hàm guard ở tầng Service
    with pytest.raises(PeriodLockedException):
        ensure_not_in_locked_period(db_session, s.created_at)

    # 2. Kiểm tra ORM Event Listener: Thử sửa ChargingSession thuộc kỳ đã khóa
    s.total_amount = Decimal("250000.00")
    with pytest.raises(PeriodLockedException):
        db_session.commit()
    db_session.rollback()

    # 3. Kiểm tra ORM Event Listener: Thử xóa WalletTransaction thuộc kỳ đã khóa
    tx_to_del = db_session.query(WalletTransaction).filter(WalletTransaction.id == tx.id).first()
    db_session.delete(tx_to_del)
    with pytest.raises(PeriodLockedException):
        db_session.commit()
    db_session.rollback()


def test_s55_reopen_period_forbidden_for_non_admin(client, db_session, env_reconciliation):
    """S-55 AC 3: Chỉ Quản trị viên (ADMIN) mới được mở lại kỳ; Kế toán (ACCOUNTANT) và Đối tác (OPERATOR) bị chặn 403."""
    headers_acc = env_reconciliation["headers_acc"]
    headers_p1 = env_reconciliation["headers_p1"]

    period = ReconciliationPeriod(
        period_code="2026-10-REOPEN-TEST",
        name="Kỳ đối soát Reopen",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="LOCKED",
    )
    db_session.add(period)
    db_session.commit()

    # Kế toán gọi mở lại -> 403 Forbidden
    res_acc = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/reopen",
        json={"reason": "Mở lại để kế toán kiểm tra bổ sung"},
        headers=headers_acc,
    )
    assert res_acc.status_code == 403

    # Đối tác gọi mở lại -> 403 Forbidden
    res_op = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/reopen",
        json={"reason": "Mở lại để đối tác khiếu nại cước"},
        headers=headers_p1,
    )
    assert res_op.status_code == 403


def test_s55_reopen_period_by_admin_succeeds_and_writes_audit_log(
    client, db_session, env_reconciliation
):
    """S-55 AC 3: Admin mở lại kỳ đối soát thành công, chuyển trạng thái sang REOPENED và ghi đầy đủ audit_logs."""
    admin = env_reconciliation["admin"]
    headers_admin = env_reconciliation["headers_admin"]

    period = ReconciliationPeriod(
        period_code="2026-10-AUDIT-TEST",
        name="Kỳ đối soát Kiểm Toán",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="LOCKED",
    )
    db_session.add(period)
    db_session.commit()

    reason_text = "Phát hiện sai sót biểu giá trạm Tân Bình, mở lại để đối soát bổ sung"
    res = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/reopen",
        json={"reason": reason_text},
        headers=headers_admin,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "REOPENED"
    assert data["reopen_reason"] == reason_text
    assert data["reopened_by_id"] == admin.id

    # Kiểm tra bản ghi trong bảng audit_logs
    audit = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == "RECONCILIATION_PERIOD_REOPENED",
            AuditLog.object_id == str(period.id),
        )
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit is not None
    assert audit.user_id == admin.id
    assert audit.data["reason"] == reason_text
    assert audit.data["previous_status"] == "LOCKED"
    assert audit.data["new_status"] == "REOPENED"


def test_s55_reopen_period_requires_valid_reason(client, db_session, env_reconciliation):
    """S-55 AC 3: Mở lại kỳ đối soát bắt buộc phải có reason (ít nhất 5 ký tự)."""
    headers_admin = env_reconciliation["headers_admin"]

    period = ReconciliationPeriod(
        period_code="2026-10-REASON-REQ",
        name="Kỳ kiểm tra reason",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="LOCKED",
    )
    db_session.add(period)
    db_session.commit()

    # 1. Không truyền reason -> 422
    res_missing = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/reopen",
        json={},
        headers=headers_admin,
    )
    assert res_missing.status_code == 422

    # 2. Truyền reason ngắn hơn 5 ký tự -> 422
    res_short = client.post(
        f"/api/v1/reconciliation/periods/{period.id}/reopen",
        json={"reason": "abc"},
        headers=headers_admin,
    )
    assert res_short.status_code == 422


def test_s54_settlement_statement_multi_partner_exact_invariant():
    """S-54: Đảm bảo bất biến tổng tiền không lệch 1 đồng trên bảng kê nhiều đối tác với các tỉ lệ lẻ phức tạp."""
    test_cases = [
        (1234567, Decimal("73.5")),
        (100001, Decimal("33.33")),
        (9876543, Decimal("81.25")),
        (500005, Decimal("66.67")),
        (1, Decimal("50.00")),
        (9999999, Decimal("70.00")),
    ]

    total_rev = 0
    total_payout = 0
    total_retained = 0

    for rev, rate in test_cases:
        payout, retained = calculate_partner_revenue_share(rev, rate)
        # Bất biến từng dòng
        assert payout + retained == rev
        total_rev += rev
        total_payout += payout
        total_retained += retained

    # Bất biến toàn bảng kê
    assert total_payout + total_retained == total_rev


def test_s55_settlement_list_rbac_filter(client, db_session, env_reconciliation):
    """S-55: Đối tác (OPERATOR) chỉ xem được bảng kê của chính mình, Kế toán và Admin xem được tất cả."""
    p1 = env_reconciliation["partner1"]
    p2 = env_reconciliation["partner2"]
    headers_admin = env_reconciliation["headers_admin"]
    headers_p1 = env_reconciliation["headers_p1"]

    # Tạo kỳ đã khóa và có settlement cho cả 2 đối tác
    period = ReconciliationPeriod(
        period_code="2026-10-RBAC-VIEW",
        name="Kỳ test RBAC",
        period_type="month",
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        end_date=datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc),
        status="LOCKED",
    )
    db_session.add(period)
    db_session.flush()

    st1 = PartnerSettlement(
        period_id=period.id,
        partner_id=p1.id,
        reconciled_revenue=500000,
        share_percentage=Decimal("70.00"),
        partner_payout_amount=350000,
        platform_retained_amount=150000,
    )
    st2 = PartnerSettlement(
        period_id=period.id,
        partner_id=p2.id,
        reconciled_revenue=800000,
        share_percentage=Decimal("65.00"),
        partner_payout_amount=520000,
        platform_retained_amount=280000,
    )
    db_session.add_all([st1, st2])
    db_session.commit()

    # Admin xem -> cả 2 bản kê
    res_admin = client.get(
        f"/api/v1/reconciliation/periods/{period.id}/settlements",
        headers=headers_admin,
    )
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == 2

    # Partner 1 xem -> chỉ thấy bản kê của Partner 1
    res_p1 = client.get(
        f"/api/v1/reconciliation/periods/{period.id}/settlements",
        headers=headers_p1,
    )
    assert res_p1.status_code == 200
    p1_items = res_p1.json()
    assert len(p1_items) == 1
    assert p1_items[0]["partner_id"] == p1.id
