from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import event, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import create_access_token, get_password_hash
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services import scheduler_service
from app.services.demo_account_service import ensure_demo_accounts
from app.services.session_service import start_charging_session
from app.services.wallet_service import (
    deduct_charging_fee,
    post_ledger_entry,
    reconcile_wallet_ledger,
    topup_wallet,
)


def _create_user_and_wallet(db_session, *, role="CUSTOMER", balance="0.00"):
    user = User(
        username=f"ledger_{role.lower()}_{id(db_session)}_{balance.replace('.', '_')}",
        email=f"ledger_{role.lower()}_{id(db_session)}_{balance.replace('.', '_')}@test.com",
        password_hash=get_password_hash("Pass1234"),
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    wallet = Wallet(
        user_id=user.id,
        balance=Decimal(balance),
        is_debt_locked=False,
        is_reconcile_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()
    return user.id, wallet.id


@pytest.fixture
def wallet_users(db_session):
    user_1_id, wallet_1_id = _create_user_and_wallet(
        db_session, role="CUSTOMER", balance="100000.00"
    )
    user_2_id, wallet_2_id = _create_user_and_wallet(
        db_session, role="CUSTOMER", balance="20000.00"
    )
    return {
        "u1": db_session.get(User, user_1_id),
        "u2": db_session.get(User, user_2_id),
        "w1": db_session.get(Wallet, wallet_1_id),
        "w2": db_session.get(Wallet, wallet_2_id),
    }


def test_topup_and_charge_only_append_rows_and_sum_to_balance(
    db_session, wallet_users
):
    wallet = wallet_users["w1"]
    wallet.balance = Decimal("0.00")
    db_session.commit()
    wallet_id = wallet.id
    initial_rows = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet_id)
        .all()
    )
    initial_snapshot = [
        (row.id, row.amount, row.transaction_type, row.balance_after, row.note)
        for row in initial_rows
    ]

    topup_wallet(db_session, wallet_users["u1"].id, Decimal("5000.00"))
    deduct_charging_fee(
        db_session, wallet_users["u1"].id, session_id=8101, amount=Decimal("1250.00")
    )
    db_session.commit()

    rows = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet_id)
        .order_by(WalletTransaction.id)
        .all()
    )
    assert len(rows) == len(initial_snapshot) + 2
    assert [
        (row.id, row.amount, row.transaction_type, row.balance_after, row.note)
        for row in rows[: len(initial_snapshot)]
    ] == initial_snapshot
    assert sum((row.amount for row in rows), Decimal("0.00")) == rows[-1].balance_after
    assert rows[-1].amount == Decimal("-1250.00")


def test_duplicate_reference_for_same_charge_is_idempotent(db_session, wallet_users):
    user_id = wallet_users["u1"].id
    wallet_id = wallet_users["w1"].id
    first = deduct_charging_fee(db_session, user_id, 8102, Decimal("1000.00"))
    db_session.commit()
    second = deduct_charging_fee(db_session, user_id, 8102, Decimal("1000.00"))
    db_session.commit()

    assert first[0].balance == second[0].balance == Decimal("99000.00")
    assert (
        db_session.query(WalletTransaction)
        .filter_by(wallet_id=wallet_id, reference_id="session_8102", transaction_type="CHARGE_FEE")
        .count()
        == 1
    )


def test_duplicate_reference_with_different_amount_is_rejected(db_session, wallet_users):
    user_id = wallet_users["u1"].id
    wallet_id = wallet_users["w1"].id
    deduct_charging_fee(db_session, user_id, 8104, Decimal("1000.00"))
    db_session.commit()

    with pytest.raises(HTTPException) as error:
        deduct_charging_fee(db_session, user_id, 8104, Decimal("1200.00"))
    assert error.value.status_code == 409
    db_session.rollback()
    assert (
        db_session.query(WalletTransaction)
        .filter_by(wallet_id=wallet_id, reference_id="session_8104", transaction_type="CHARGE_FEE")
        .count()
        == 1
    )


def test_central_ledger_entry_rejects_inconsistent_amount_sign(db_session, wallet_users):
    with pytest.raises(HTTPException) as error:
        post_ledger_entry(
            db_session,
            wallet_users["w1"].id,
            Decimal("10.00"),
            "CHARGE_FEE",
            reference_id="sign-check",
        )
    assert error.value.status_code == 422


def test_new_demo_wallet_balances_are_recorded_in_ledger(db_session):
    ensure_demo_accounts(db_session)

    wallets = db_session.query(Wallet).all()
    assert wallets
    for wallet in wallets:
        ledger_total = sum(
            (
                row.amount
                for row in db_session.query(WalletTransaction)
                .filter_by(wallet_id=wallet.id)
                .all()
            ),
            Decimal("0.00"),
        )
        assert wallet.balance == ledger_total


def test_reconcile_locked_wallet_cannot_start_a_new_session(db_session):
    user_id, _ = _create_user_and_wallet(
        db_session, balance="100000.00"
    )
    user = db_session.get(User, user_id)
    wallet = db_session.query(Wallet).filter_by(user_id=user_id).one()
    wallet.is_reconcile_locked = True
    db_session.commit()

    with pytest.raises(HTTPException) as error:
        start_charging_session(db_session, user, connector_id=-1)
    assert error.value.status_code == 423


def test_wallet_transaction_update_delete_and_wallet_cascade_are_blocked(
    db_session,
):
    user_id, wallet_id = _create_user_and_wallet(db_session)
    wallet = topup_wallet(db_session, user_id, Decimal("1000.00"))
    transaction = (
        db_session.query(WalletTransaction)
        .filter_by(wallet_id=wallet_id)
        .one()
    )
    transaction_id = transaction.id

    with pytest.raises(SQLAlchemyError):
        db_session.execute(
            text("UPDATE wallet_transactions SET note = 'tampered' WHERE id = :id"),
            {"id": transaction_id},
        )
        db_session.commit()
    db_session.rollback()

    with pytest.raises(SQLAlchemyError):
        db_session.execute(
            text("DELETE FROM wallet_transactions WHERE id = :id"),
            {"id": transaction_id},
        )
        db_session.commit()
    db_session.rollback()

    with pytest.raises(SQLAlchemyError):
        db_session.delete(wallet)
        db_session.commit()
    db_session.rollback()

    assert db_session.get(WalletTransaction, transaction_id).note == "Nạp tiền vào ví điện tử"


def test_concurrent_topups_keep_each_ledger_line_and_total(db_session):
    user_id, wallet_id = _create_user_and_wallet(db_session)
    barrier = Barrier(2)

    # Each worker owns a separate SQLAlchemy Session/connection.
    from app.core.database import SessionLocal

    def worker(amount: str) -> None:
        with SessionLocal() as db:
            barrier.wait(timeout=10)
            topup_wallet(db, user_id, Decimal(amount))

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(worker, value) for value in ("1250.00", "2500.00")]
        for future in futures:
            future.result(timeout=30)

    db_session.expire_all()
    wallet = db_session.get(Wallet, wallet_id)
    rows = (
        db_session.query(WalletTransaction)
        .filter_by(wallet_id=wallet_id)
        .all()
    )
    assert len(rows) == 2
    assert wallet.balance == Decimal("3750.00")
    assert sum((row.amount for row in rows), Decimal("0.00")) == wallet.balance


def test_reconciliation_detects_and_locks_mismatch_blocks_new_transactions(
    db_session, wallet_users
):
    wallet = wallet_users["w1"]
    wallet_id = wallet.id
    selects = []

    def capture_select(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", capture_select)
    try:
        result = reconcile_wallet_ledger(db_session)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_select)

    db_session.refresh(wallet)
    assert result["mismatched"] >= 1
    assert len(selects) == 1
    assert wallet.is_reconcile_locked is True
    assert (
        db_session.query(AuditLog)
        .filter_by(action="WalletLedgerMismatchDetected", object_id=str(wallet_id))
        .count()
        == 1
    )
    with pytest.raises(HTTPException) as topup_error:
        topup_wallet(db_session, wallet_users["u1"].id, Decimal("1.00"))
    assert topup_error.value.status_code == 423
    with pytest.raises(HTTPException) as charge_error:
        deduct_charging_fee(
            db_session, wallet_users["u1"].id, session_id=8103, amount=Decimal("1.00")
        )
    assert charge_error.value.status_code == 423


def test_admin_can_unlock_only_reconciled_wallet_with_reason(client, db_session):
    admin_id, wallet_id = _create_user_and_wallet(db_session, role="ADMIN")
    topup_wallet(db_session, admin_id, Decimal("500.00"))
    wallet = db_session.get(Wallet, wallet_id)
    wallet.is_reconcile_locked = True
    db_session.commit()

    response = client.post(
        f"/api/v1/wallet/admin/{wallet_id}/reconciliation/unlock",
        headers={"Authorization": f"Bearer {create_access_token({'sub': str(admin_id)})}"},
        json={"reason": "Đã đối chiếu lại sổ cái"},
    )

    assert response.status_code == 200
    assert response.json()["is_reconcile_locked"] is False
    assert (
        db_session.query(AuditLog)
        .filter_by(action="WalletReconciliationUnlocked", object_id=str(wallet_id))
        .count()
        == 1
    )


def test_non_admin_cannot_unlock_wallet(client, db_session):
    driver_id, wallet_id = _create_user_and_wallet(db_session, role="CUSTOMER")
    topup_wallet(db_session, driver_id, Decimal("500.00"))
    wallet = db_session.get(Wallet, wallet_id)
    wallet.is_reconcile_locked = True
    db_session.commit()

    response = client.post(
        f"/api/v1/wallet/admin/{wallet_id}/reconciliation/unlock",
        headers={"Authorization": f"Bearer {create_access_token({'sub': str(driver_id)})}"},
        json={"reason": "Không có quyền"},
    )

    assert response.status_code == 403
    assert db_session.get(Wallet, wallet_id).is_reconcile_locked is True


def test_unlock_rejects_still_mismatched_wallet(client, db_session):
    admin_id, wallet_id = _create_user_and_wallet(
        db_session, role="ADMIN", balance="100.00"
    )
    wallet = db_session.get(Wallet, wallet_id)
    wallet.is_reconcile_locked = True
    db_session.commit()

    response = client.post(
        f"/api/v1/wallet/admin/{wallet_id}/reconciliation/unlock",
        headers={"Authorization": f"Bearer {create_access_token({'sub': str(admin_id)})}"},
        json={"reason": "Đang thử mở khóa"},
    )

    assert response.status_code == 409
    assert db_session.get(Wallet, wallet_id).is_reconcile_locked is True


def test_reconciliation_job_uses_configured_interval(monkeypatch):
    class FakeScheduler:
        running = False

        def __init__(self):
            self.jobs = []

        def add_job(self, func, trigger, **options):
            self.jobs.append((func, trigger, options))

        def start(self):
            self.running = True

    fake_scheduler = FakeScheduler()
    monkeypatch.setattr(scheduler_service, "scheduler", fake_scheduler)
    monkeypatch.setattr(scheduler_service.settings, "RECONCILE_INTERVAL_MINUTES", 9)

    scheduler_service.start_scheduler()

    wallet_job = next(job for job in fake_scheduler.jobs if job[2].get("id") == "reconcile_wallet_ledger")
    assert wallet_job[0] is scheduler_service.reconcile_wallet_ledger_job
    assert wallet_job[1] == "interval"
    assert wallet_job[2]["minutes"] == 9
