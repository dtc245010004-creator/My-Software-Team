"""Acceptance tests for S-57 driver data erasure and anonymization."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import inspect, text

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.data_erasure_request import DataErasureRequest
from app.models.id_tag import IdTag
from app.models.ocpp_message import OcppMessage
from app.models.orphan_message import OrphanMessage
from app.models.payment import TopupOrder
from app.models.remote_start_request import RemoteStartRequest
from app.models.session import ChargingSession
from app.models.session_billing_segment import SessionBillingSegment
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services import data_erasure_service


def _user(db_session, name: str, role: str = "CUSTOMER") -> User:
    user = User(
        username=name,
        email=f"{name}@s57.test",
        password_hash="test-only-password-hash",
        full_name=f"Name for {name}",
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _headers(user: User) -> dict[str, str]:
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def _wallet(db_session, user: User, balance: str = "0.00") -> Wallet:
    wallet = Wallet(
        user_id=user.id,
        balance=Decimal(balance),
        is_debt_locked=False,
        is_reconcile_locked=False,
    )
    db_session.add(wallet)
    db_session.flush()
    return wallet


def _charging_point_and_connector(db_session, suffix: str = "1"):
    station = Station(name=f"Station {suffix}", address=f"Address {suffix}")
    db_session.add(station)
    db_session.flush()
    point = ChargingPoint(
        station_id=station.id,
        code=f"CP-{suffix}",
        max_power_kw=22,
        is_active=True,
    )
    db_session.add(point)
    db_session.flush()
    connector = Connector(
        charge_point_id=point.id,
        connector_id=1,
        connector_type="CCS2",
        status="AVAILABLE",
        ocpp_status="Available",
        is_active=True,
    )
    db_session.add(connector)
    db_session.flush()
    return station, point, connector


def _pending_request(client, user: User) -> DataErasureRequest:
    response = client.post(
        "/api/v1/me/data-erasure-requests", headers=_headers(user)
    )
    assert response.status_code == 201, response.text
    return DataErasureRequest(**response.json())


def _seed_completed_data(db_session, user: User):
    wallet = _wallet(db_session, user)
    _station, _point, connector = _charging_point_and_connector(db_session, str(user.id))
    tag = IdTag(code=f"PRIVATE-TAG-{user.id}", user_id=user.id, status="active")
    db_session.add(tag)
    db_session.flush()

    sessions = []
    for segment_index in (1, 2):
        charging_session = ChargingSession(
            user_id=user.id,
            connector_id=connector.id,
            id_tag=tag.code,
            status="COMPLETED",
            start_time=datetime(2026, 10, segment_index, 8, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, segment_index, 9, tzinfo=timezone.utc),
            total_kwh=Decimal("3.250"),
            total_amount=Decimal("6500.00"),
            applied_price_per_kwh=Decimal("2000.00"),
        )
        db_session.add(charging_session)
        db_session.flush()
        db_session.add(
            SessionBillingSegment(
                session_id=charging_session.id,
                segment_index=1,
                segment_date=datetime(2026, 10, segment_index).date(),
                start_at=charging_session.start_time,
                end_at=charging_session.end_time,
                kwh=Decimal("3.2500"),
                price_per_kwh=Decimal("2000.00"),
                amount=Decimal("6500.00"),
                tariff_id=None,
            )
        )
        sessions.append(charging_session)

    db_session.add(
        TopupOrder(
            user_id=user.id,
            order_code=f"ORDER-S57-{user.id}",
            amount=Decimal("10000.00"),
            status="SUCCESS",
            failure_reason=f"failed for {user.email}",
        )
    )
    db_session.add(
        RemoteStartRequest(
            user_id=user.id,
            connector_id=connector.id,
            id_tag=tag.code,
            status="STARTED",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
        )
    )
    db_session.add(
        OcppMessage(
            charge_point_code=f"CP-{user.id}",
            message_id=f"message-{user.id}",
            action="StartTransaction",
            response_payload=f'{{"idTag":"{tag.code}"}}',
        )
    )
    db_session.add(
        OrphanMessage(
            charge_point_code=f"CP-{user.id}",
            action="StartTransaction",
            payload=f'{{"idTag":"{tag.code}","email":"{user.email}"}}',
        )
    )
    db_session.add(
        WalletTransaction(
            wallet_id=wallet.id,
            amount=Decimal("0.00"),
            transaction_type="REFUND",
            balance_before=Decimal("0.00"),
            balance_after=Decimal("0.00"),
            note="ledger row kept unchanged",
        )
    )
    db_session.commit()
    return wallet, sessions, tag.code


def test_driver_can_create_and_view_only_own_request(client, db_session):
    driver_a = _user(db_session, "s57_driver_a")
    driver_b = _user(db_session, "s57_driver_b")
    db_session.commit()

    response = client.post(
        "/api/v1/me/data-erasure-requests",
        headers=_headers(driver_a),
        json={"user_id": driver_b.id},
    )
    assert response.status_code == 201
    assert response.json()["user_id"] == driver_a.id
    duplicate = client.post(
        "/api/v1/me/data-erasure-requests", headers=_headers(driver_a)
    )
    assert duplicate.status_code == 409
    assert client.get(
        "/api/v1/me/data-erasure-requests", headers=_headers(driver_b)
    ).json() == []
    own = client.get("/api/v1/me/data-erasure-requests", headers=_headers(driver_a))
    assert [item["id"] for item in own.json()] == [response.json()["id"]]

    audit = db_session.query(AuditLog).filter_by(action="DATA_ERASURE_REQUESTED").one()
    assert audit.data == {
        "actor_id": driver_a.id,
        "driver_id": driver_a.id,
        "request_id": response.json()["id"],
        "status": "SUCCESS",
        "reason": "Tài xế gửi yêu cầu ẩn danh hóa.",
    }
    duplicate_audit = (
        db_session.query(AuditLog)
        .filter_by(action="DATA_ERASURE_REQUEST_DUPLICATE")
        .one()
    )
    assert duplicate_audit.data["actor_id"] == driver_a.id
    assert duplicate_audit.data["driver_id"] == driver_a.id
    assert "admin_id" not in duplicate_audit.data
    assert duplicate_audit.data["reason"] == "Đã có yêu cầu đang chờ duyệt."


def test_admin_approval_anonymizes_identity_and_preserves_financial_history(
    client, db_session
):
    admin = _user(db_session, "s57_admin_approve", "ADMIN")
    driver = _user(db_session, "private_driver_s57")
    original = {
        "username": driver.username,
        "email": driver.email,
        "full_name": driver.full_name,
    }
    wallet, sessions, original_tag = _seed_completed_data(db_session, driver)
    request = _pending_request(client, driver)
    db_session.commit()

    session_snapshot = [
        (row.total_amount, row.total_kwh, row.start_time, row.end_time)
        for row in sessions
    ]
    segment_snapshot = [
        (row.kwh, row.price_per_kwh, row.amount)
        for row in db_session.query(SessionBillingSegment)
        .join(ChargingSession)
        .filter(ChargingSession.id.in_([row.id for row in sessions]))
        .order_by(SessionBillingSegment.id)
    ]
    ledger_rows = db_session.query(WalletTransaction).filter_by(wallet_id=wallet.id).all()
    ledger_snapshot = [(row.id, row.amount, row.balance_after, row.note) for row in ledger_rows]

    response = client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/approve",
        headers=_headers(admin),
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "COMPLETED"

    db_session.expire_all()
    stored_driver = db_session.get(User, driver.id)
    assert stored_driver is not None
    assert stored_driver.username != original["username"]
    assert stored_driver.email != original["email"]
    assert stored_driver.full_name == "Người dùng đã xoá"
    assert stored_driver.is_active is False
    assert stored_driver.data_erased_at is not None
    assert client.get("/api/v1/auth/me", headers=_headers(driver)).status_code == 403
    assert client.patch(
        f"/api/v1/admin/users/{driver.id}/enable", headers=_headers(admin)
    ).status_code == 409

    stored_sessions = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.id.in_([row.id for row in sessions]))
        .order_by(ChargingSession.id)
        .all()
    )
    assert [row.driver_id for row in stored_sessions] == [None, None]
    assert all(row.id_tag != original_tag for row in stored_sessions)
    assert len({row.id_tag for row in stored_sessions}) == 1
    assert [
        (row.total_amount, row.total_kwh, row.start_time, row.end_time)
        for row in stored_sessions
    ] == session_snapshot
    assert sum((row.total_amount or Decimal("0.00") for row in stored_sessions), Decimal("0.00")) == sum(
        (amount or Decimal("0.00") for amount, *_ in session_snapshot), Decimal("0.00")
    )
    assert [
        (row.kwh, row.price_per_kwh, row.amount)
        for row in db_session.query(SessionBillingSegment)
        .join(ChargingSession)
        .filter(ChargingSession.id.in_([row.id for row in sessions]))
        .order_by(SessionBillingSegment.id)
    ] == segment_snapshot

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("0.00")
    assert [
        (row.id, row.amount, row.balance_after, row.note)
        for row in db_session.query(WalletTransaction)
        .filter_by(wallet_id=wallet.id)
        .order_by(WalletTransaction.id)
    ] == ledger_snapshot
    assert sum(
        (row.amount for row in db_session.query(WalletTransaction).filter_by(wallet_id=wallet.id)),
        Decimal("0.00"),
    ) == Decimal("0.00")
    assert db_session.query(IdTag).filter_by(user_id=driver.id).count() == 0
    assert db_session.query(RemoteStartRequest).filter_by(user_id=driver.id).count() == 0
    assert db_session.query(TopupOrder).filter_by(user_id=driver.id).one().amount == Decimal("10000.00")

    private_values = list(original.values()) + [original_tag]
    for table in inspect(db_session.get_bind()).get_table_names():
        columns = inspect(db_session.get_bind()).get_columns(table)
        textual = [
            column["name"]
            for column in columns
            if any(
                name in str(column["type"]).upper()
                for name in ("CHAR", "TEXT", "JSON")
            )
        ]
        if not textual:
            continue
        selected_columns = ", ".join(f'"{column}"' for column in textual)
        rows = db_session.execute(
            text(f'SELECT {selected_columns} FROM "{table}"')
        ).all()
        for row in rows:
            for value in row:
                if isinstance(value, str):
                    assert not any(private in value for private in private_values)

    audits = db_session.query(AuditLog).filter(AuditLog.action.like("DATA_ERASURE_%")).all()
    actions = [row.action for row in audits]
    assert actions.count("DATA_ERASURE_REQUESTED") == 1
    assert actions.count("DATA_ERASURE_APPROVED") == 1
    assert actions.count("DATA_ERASURE_COMPLETED") == 1
    assert all(
        not any(private in str(row.data) for private in private_values)
        for row in audits
    )

    repeated = client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/approve",
        headers=_headers(admin),
    )
    assert repeated.status_code == 200
    assert repeated.json()["status"] == "COMPLETED"
    assert db_session.query(AuditLog).filter_by(action="DATA_ERASURE_COMPLETED").count() == 1


@pytest.mark.parametrize(
    ("blocker", "expected_fragment"),
    [
        ("positive", "số dư dương"),
        ("negative", "số dư âm"),
        ("active", "đang sạc"),
        ("abnormal", "bất thường"),
        ("needs_review", "bất thường"),
        ("is_abnormal", "bất thường"),
        ("pending_topup", "nạp tiền đang chờ"),
        ("reconcile_locked", "khóa đối soát"),
    ],
)
def test_approval_blockers_leave_driver_data_unchanged(
    client, db_session, blocker, expected_fragment
):
    admin = _user(db_session, f"s57_admin_{blocker}", "ADMIN")
    driver = _user(db_session, f"s57_driver_{blocker}")
    wallet = _wallet(
        db_session,
        driver,
        "100.00" if blocker == "positive" else "-100.00" if blocker == "negative" else "0.00",
    )
    if blocker == "reconcile_locked":
        wallet.is_reconcile_locked = True
    if blocker in {"active", "abnormal"}:
        _station, _point, connector = _charging_point_and_connector(db_session, blocker)
        db_session.add(
            ChargingSession(
                user_id=driver.id,
                connector_id=connector.id,
                status="CHARGING" if blocker == "active" else "ABNORMAL",
                id_tag=f"tag-{blocker}",
                total_amount=Decimal("0.00"),
                total_kwh=Decimal("0.000"),
            )
        )
    if blocker in {"needs_review", "is_abnormal"}:
        _station, _point, connector = _charging_point_and_connector(db_session, blocker)
        db_session.add(
            ChargingSession(
                user_id=driver.id,
                connector_id=connector.id,
                status="COMPLETED",
                needs_review=blocker == "needs_review",
                is_abnormal=blocker == "is_abnormal",
                total_amount=Decimal("0.00"),
                total_kwh=Decimal("0.000"),
            )
        )
    if blocker == "pending_topup":
        db_session.add(
            TopupOrder(
                user_id=driver.id,
                order_code=f"S57-PENDING-{driver.id}",
                amount=Decimal("15000.00"),
                status="PENDING",
            )
        )
    db_session.commit()
    request = _pending_request(client, driver)
    original_identity = (driver.username, driver.email, driver.full_name, driver.is_active)
    response = client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/approve",
        headers=_headers(admin),
    )
    assert response.status_code == 409
    assert expected_fragment in response.json()["detail"]
    db_session.refresh(driver)
    db_session.refresh(wallet)
    stored_request = db_session.get(DataErasureRequest, request.id)
    assert stored_request.status == "PENDING"
    assert stored_request.block_reason == response.json()["detail"]
    assert (driver.username, driver.email, driver.full_name, driver.is_active) == original_identity
    assert wallet.balance == (Decimal("100.00") if blocker == "positive" else Decimal("-100.00") if blocker == "negative" else Decimal("0.00"))
    blocked_audit = db_session.query(AuditLog).filter_by(action="DATA_ERASURE_APPROVAL_BLOCKED").one()
    assert blocked_audit.data["status"] == "FAILED"


def test_rejection_requires_reason_and_preserves_account(client, db_session):
    admin = _user(db_session, "s57_admin_reject", "ADMIN")
    driver = _user(db_session, "s57_driver_reject")
    _wallet(db_session, driver)
    db_session.commit()
    request = _pending_request(client, driver)

    empty = client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/reject",
        headers=_headers(admin),
        json={"reason": "   "},
    )
    assert empty.status_code == 422
    rejected = client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/reject",
        headers=_headers(admin),
        json={"reason": "Cần xác nhận phạm vi dữ liệu trước"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "REJECTED"
    assert rejected.json()["reject_reason"] == "Cần xác nhận phạm vi dữ liệu trước"
    db_session.refresh(driver)
    assert driver.is_active is True
    assert driver.email == "s57_driver_reject@s57.test"
    visible = client.get(
        "/api/v1/me/data-erasure-requests", headers=_headers(driver)
    )
    assert visible.json()[0]["reject_reason"] == "Cần xác nhận phạm vi dữ liệu trước"
    assert db_session.query(AuditLog).filter_by(action="DATA_ERASURE_REJECTED").count() == 1


@pytest.mark.parametrize("role", ["CUSTOMER", "OPERATOR", "ACCOUNTANT"])
def test_non_admin_cannot_list_approve_or_reject(client, db_session, role):
    _user(db_session, f"s57_admin_rbac_{role}", "ADMIN")
    driver = _user(db_session, f"s57_driver_rbac_{role}")
    actor = driver if role == "CUSTOMER" else _user(db_session, f"s57_{role.lower()}", role)
    _wallet(db_session, driver)
    db_session.commit()
    request = _pending_request(client, driver)

    assert client.get(
        "/api/v1/admin/data-erasure-requests", headers=_headers(actor)
    ).status_code == 403
    assert client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/approve",
        headers=_headers(actor),
    ).status_code == 403
    assert client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/reject",
        headers=_headers(actor),
        json={"reason": "not admin"},
    ).status_code == 403
    assert client.get("/api/v1/admin/data-erasure-requests").status_code == 401
    assert db_session.query(DataErasureRequest).filter_by(id=request.id).one().status == "PENDING"


def test_anonymization_failure_rolls_back_and_writes_failed_audit(
    client, db_session, monkeypatch
):
    admin = _user(db_session, "s57_admin_rollback", "ADMIN")
    driver = _user(db_session, "s57_driver_rollback")
    _wallet(db_session, driver)
    db_session.commit()
    request = _pending_request(client, driver)
    original = (driver.username, driver.email, driver.full_name)

    def fail_after_partial_change(session, user):
        user.email = "partial-change@invalid.test"
        session.flush()
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(data_erasure_service, "_anonymize_user_data", fail_after_partial_change)
    response = client.post(
        f"/api/v1/admin/data-erasure-requests/{request.id}/approve",
        headers=_headers(admin),
    )
    assert response.status_code == 500
    db_session.expire_all()
    assert (db_session.get(User, driver.id).username, db_session.get(User, driver.id).email, db_session.get(User, driver.id).full_name) == original
    assert db_session.get(DataErasureRequest, request.id).status == "PENDING"
    assert db_session.query(AuditLog).filter_by(action="DATA_ERASURE_COMPLETED").count() == 0
    failure = db_session.query(AuditLog).filter_by(action="DATA_ERASURE_FAILED").one()
    assert failure.data["status"] == "FAILED"
    assert failure.data["driver_id"] == driver.id


def test_pending_request_is_private_to_authenticated_customer(client, db_session):
    driver = _user(db_session, "s57_auth_driver")
    operator = _user(db_session, "s57_auth_operator", "OPERATOR")
    _wallet(db_session, driver)
    db_session.commit()
    response = client.post(
        "/api/v1/me/data-erasure-requests", headers=_headers(driver)
    )
    assert response.status_code == 201
    assert client.post(
        "/api/v1/me/data-erasure-requests", headers=_headers(operator)
    ).status_code == 403
    assert client.get("/api/v1/me/data-erasure-requests").status_code == 401
