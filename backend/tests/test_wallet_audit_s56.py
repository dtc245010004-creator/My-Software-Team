"""Kiểm thử audit nạp tay, đối soát và lọc nhật ký ví cho S-56."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services.wallet_service import reconcile_wallet_ledger


def _user(db_session, username: str, role: str) -> User:
    user = User(
        username=username,
        email=f"{username}@s56.test",
        password_hash="test-only-hash",
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _wallet(db_session, driver: User, balance: Decimal = Decimal("0.00")) -> Wallet:
    wallet = Wallet(
        user_id=driver.id,
        balance=balance,
        is_debt_locked=False,
        is_reconcile_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()
    return wallet


def _headers(user: User) -> dict[str, str]:
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def _write_wallet_log(
    db_session,
    *,
    actor: User,
    driver: User,
    wallet: Wallet,
    action: str = "WalletTestAction",
    created_at: datetime | None = None,
) -> AuditLog:
    row = AuditLog(
        user_id=actor.id,
        action=action,
        object_type="wallet",
        object_id=str(wallet.id),
        data={
            "admin_id": actor.id,
            "driver_id": driver.id,
            "wallet_id": wallet.id,
            "status": "SUCCESS",
        },
        created_at=created_at,
    )
    db_session.add(row)
    db_session.commit()
    return row


def test_manual_topup_success_audits_actor_target_amount_and_reason(
    client, db_session
):
    admin = _user(db_session, "s56_admin_topup", "ADMIN")
    driver = _user(db_session, "s56_driver_topup", "CUSTOMER")
    wallet = _wallet(db_session, driver, Decimal("100.00"))

    response = client.post(
        "/api/v1/wallet/admin/topup",
        headers=_headers(admin),
        json={
            "driver_id": driver.id,
            "amount": "75.50",
            "receipt_code": "s56-receipt-1",
            "note": "Nạp tiền mặt theo biên nhận tại quầy",
        },
    )

    assert response.status_code == 200
    db_session.refresh(wallet)
    audit_rows = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == "ADMIN_MANUAL_TOPUP",
            AuditLog.object_id == str(wallet.id),
        )
        .all()
    )
    assert len(audit_rows) == 1
    data = audit_rows[0].data
    assert audit_rows[0].user_id == admin.id
    assert data["admin_id"] == admin.id
    assert data["driver_id"] == driver.id
    assert data["wallet_id"] == wallet.id
    assert data["amount"] == "75.50"
    assert data["reason"] == "Nạp tiền mặt theo biên nhận tại quầy"
    assert data["receipt_code"] == "S56-RECEIPT-1"
    assert data["status"] == "SUCCESS"
    assert data["balance_before"] == "100.00"
    assert data["balance_after"] == "175.50"
    assert data["ip"]
    assert wallet.balance == Decimal("175.50")


def test_driver_topup_audits_with_balance_and_ledger_transaction(
    client, db_session
):
    driver = _user(db_session, "s56_driver_self_topup", "CUSTOMER")
    wallet = _wallet(db_session, driver)

    response = client.post(
        "/api/v1/wallet/topup",
        headers=_headers(driver),
        json={"amount": "42.00", "note": "Nạp ví từ trang ví"},
    )

    assert response.status_code == 200
    db_session.refresh(wallet)
    transaction = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .one()
    )
    audit = (
        db_session.query(AuditLog)
        .filter_by(action="WalletTopup", object_id=str(wallet.id))
        .one()
    )
    assert wallet.balance == Decimal("42.00")
    assert transaction.amount == Decimal("42.00")
    assert audit.user_id == driver.id
    assert audit.data["actor_id"] == driver.id
    assert audit.data["actor_type"] == "USER"
    assert audit.data["admin_id"] is None
    assert audit.data["driver_id"] == driver.id
    assert audit.data["wallet_id"] == wallet.id
    assert audit.data["amount"] == "42.00"
    assert audit.data["reason"] == "Nạp ví từ trang ví"
    assert audit.data["status"] == "SUCCESS"
    assert audit.data["ip"]


def test_duplicate_manual_topup_logs_failure_without_success_or_balance_change(
    client, db_session
):
    admin = _user(db_session, "s56_admin_duplicate", "ADMIN")
    driver = _user(db_session, "s56_driver_duplicate", "CUSTOMER")
    wallet = _wallet(db_session, driver, Decimal("100.00"))
    headers = _headers(admin)
    first = client.post(
        "/api/v1/wallet/admin/topup",
        headers=headers,
        json={
            "driver_id": driver.id,
            "amount": "50.00",
            "receipt_code": "s56-duplicate",
            "note": "Lần nạp hợp lệ",
        },
    )
    assert first.status_code == 200
    db_session.refresh(wallet)
    balance_after_success = wallet.balance
    transaction_count = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .count()
    )

    duplicate = client.post(
        "/api/v1/wallet/admin/topup",
        headers=headers,
        json={
            "driver_id": driver.id,
            "amount": "75.00",
            "receipt_code": "S56-DUPLICATE",
            "note": "Yêu cầu bị trùng phiếu",
        },
    )

    assert duplicate.status_code == 409
    db_session.refresh(wallet)
    assert wallet.balance == balance_after_success
    assert (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .count()
        == transaction_count
    )
    assert (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == "ADMIN_MANUAL_TOPUP",
            AuditLog.object_id == str(wallet.id),
            AuditLog.data["status"].as_string() == "SUCCESS",
        )
        .count()
        == 1
    )
    failed = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == "ADMIN_MANUAL_TOPUP_FAILED",
            AuditLog.object_id == str(wallet.id),
        )
        .one()
    )
    assert failed.data["admin_id"] == admin.id
    assert failed.data["driver_id"] == driver.id
    assert failed.data["wallet_id"] == wallet.id
    assert failed.data["amount"] == "75.00"
    assert failed.data["reason"] == "Yêu cầu bị trùng phiếu"
    assert "đã tồn tại" in failed.data["failure_reason"]
    assert failed.data["status"] == "FAILED"


def test_unlock_audit_includes_admin_driver_wallet_reason_and_ip(client, db_session):
    admin = _user(db_session, "s56_admin_unlock", "ADMIN")
    driver = _user(db_session, "s56_driver_unlock", "CUSTOMER")
    wallet = _wallet(db_session, driver)
    wallet.is_reconcile_locked = True
    db_session.commit()

    response = client.post(
        f"/api/v1/wallet/admin/{wallet.id}/reconciliation/unlock",
        headers=_headers(admin),
        json={"reason": "Đã xác minh tổng sổ cái và số dư khớp"},
    )

    assert response.status_code == 200
    audit = (
        db_session.query(AuditLog)
        .filter_by(
            action="WalletReconciliationUnlocked", object_id=str(wallet.id)
        )
        .one()
    )
    assert audit.user_id == admin.id
    assert audit.data["admin_id"] == admin.id
    assert audit.data["driver_id"] == driver.id
    assert audit.data["wallet_id"] == wallet.id
    assert audit.data["reason"] == "Đã xác minh tổng sổ cái và số dư khớp"
    assert audit.data["status"] == "SUCCESS"
    assert audit.data["ip"]


@pytest.mark.parametrize("reason", ["", "   ", "\t  \n"])
def test_unlock_rejects_empty_or_whitespace_reason_without_success_audit(
    client, db_session, reason
):
    admin = _user(db_session, f"s56_admin_blank_{len(reason)}", "ADMIN")
    driver = _user(db_session, f"s56_driver_blank_{len(reason)}", "CUSTOMER")
    wallet = _wallet(db_session, driver)
    wallet.is_reconcile_locked = True
    db_session.commit()

    response = client.post(
        f"/api/v1/wallet/admin/{wallet.id}/reconciliation/unlock",
        headers=_headers(admin),
        json={"reason": reason},
    )

    assert response.status_code == 422
    assert (
        db_session.query(AuditLog)
        .filter_by(
            action="WalletReconciliationUnlocked", object_id=str(wallet.id)
        )
        .count()
        == 0
    )
    assert db_session.get(Wallet, wallet.id).is_reconcile_locked is True


def test_unlock_still_mismatched_wallet_has_no_success_audit(client, db_session):
    admin = _user(db_session, "s56_admin_mismatch_unlock", "ADMIN")
    driver = _user(db_session, "s56_driver_mismatch_unlock", "CUSTOMER")
    wallet = _wallet(db_session, driver, Decimal("25.00"))
    wallet.is_reconcile_locked = True
    db_session.commit()

    response = client.post(
        f"/api/v1/wallet/admin/{wallet.id}/reconciliation/unlock",
        headers=_headers(admin),
        json={"reason": "Đang thử mở khóa ví lệch"},
    )

    assert response.status_code == 409
    assert db_session.get(Wallet, wallet.id).is_reconcile_locked is True
    assert (
        db_session.query(AuditLog)
        .filter_by(
            action="WalletReconciliationUnlocked", object_id=str(wallet.id)
        )
        .count()
        == 0
    )


def test_reconciliation_lock_writes_audit_with_wallet_owner(db_session):
    driver = _user(db_session, "s56_driver_reconcile", "CUSTOMER")
    wallet = _wallet(db_session, driver, Decimal("13.25"))

    result = reconcile_wallet_ledger(db_session)

    db_session.refresh(wallet)
    lock_audit = (
        db_session.query(AuditLog)
        .filter_by(
            action="WalletReconciliationLocked", object_id=str(wallet.id)
        )
        .one()
    )
    assert result["mismatched"] == 1
    assert wallet.is_reconcile_locked is True
    assert lock_audit.user_id is None
    assert lock_audit.data["admin_id"] is None
    assert lock_audit.data["actor_type"] == "SYSTEM"
    assert lock_audit.data["driver_id"] == driver.id
    assert lock_audit.data["wallet_id"] == wallet.id
    assert "không khớp" in lock_audit.data["reason"]
    assert lock_audit.data["status"] == "SUCCESS"


def test_audit_logs_filter_by_driver_and_time_aliases(client, db_session):
    admin = _user(db_session, "s56_admin_filter", "ADMIN")
    driver_a = _user(db_session, "s56_driver_filter_a", "CUSTOMER")
    driver_b = _user(db_session, "s56_driver_filter_b", "CUSTOMER")
    wallet_a = _wallet(db_session, driver_a)
    wallet_b = _wallet(db_session, driver_b)
    recent_time = datetime.now(timezone.utc)
    _write_wallet_log(
        db_session,
        actor=admin,
        driver=driver_a,
        wallet=wallet_a,
        action="DriverARecent",
        created_at=recent_time,
    )
    _write_wallet_log(
        db_session,
        actor=admin,
        driver=driver_a,
        wallet=wallet_a,
        action="DriverAOld",
        created_at=recent_time - timedelta(days=30),
    )
    _write_wallet_log(
        db_session,
        actor=admin,
        driver=driver_b,
        wallet=wallet_b,
        action="DriverBRecent",
        created_at=recent_time,
    )

    response = client.get(
        "/api/v1/audit-logs",
        headers=_headers(admin),
        params={
            "driver_id": driver_a.id,
            "user_id": admin.id,
            "from": (recent_time - timedelta(minutes=1)).isoformat(),
            "to": (recent_time + timedelta(minutes=1)).isoformat(),
            "page": 1,
            "limit": 10,
        },
    )
    assert response.status_code == 200
    assert [row["action"] for row in response.json()["items"]] == ["DriverARecent"]

    missing_driver = client.get(
        "/api/v1/audit-logs?driver_id=999999", headers=_headers(admin)
    )
    assert missing_driver.status_code == 200
    assert missing_driver.json()["items"] == []
    assert missing_driver.json()["total"] == 0


def test_audit_log_roles_hide_wallet_events_from_operator_and_customer(
    client, db_session
):
    admin = _user(db_session, "s56_admin_roles", "ADMIN")
    accountant = _user(db_session, "s56_accountant_roles", "ACCOUNTANT")
    operator = _user(db_session, "s56_operator_roles", "OPERATOR")
    driver = _user(db_session, "s56_driver_roles", "CUSTOMER")
    wallet = _wallet(db_session, driver)
    _write_wallet_log(
        db_session,
        actor=admin,
        driver=driver,
        wallet=wallet,
        action="SensitiveWalletAudit",
    )

    admin_response = client.get("/api/v1/audit-logs", headers=_headers(admin))
    accountant_response = client.get(
        "/api/v1/audit-logs", headers=_headers(accountant)
    )
    operator_response = client.get(
        "/api/v1/audit-logs", headers=_headers(operator)
    )
    customer_response = client.get(
        "/api/v1/audit-logs", headers=_headers(driver)
    )

    assert admin_response.status_code == accountant_response.status_code == 200
    assert any(row["action"] == "SensitiveWalletAudit" for row in admin_response.json()["items"])
    assert any(
        row["action"] == "SensitiveWalletAudit"
        for row in accountant_response.json()["items"]
    )
    assert operator_response.status_code == 200
    assert all(row["object_type"] != "wallet" for row in operator_response.json()["items"])
    assert customer_response.status_code == 403
