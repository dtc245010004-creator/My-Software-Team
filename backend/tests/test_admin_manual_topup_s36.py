from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import create_access_token, get_password_hash
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction


@pytest.fixture
def s36_setup(db_session):
    admin = User(
        username="admin_s36",
        email="admin_s36@evcsms.vn",
        password_hash=get_password_hash("AdminPass123"),
        role="ADMIN",
        is_active=True,
    )
    driver = User(
        username="driver_s36",
        email="driver_s36@evcsms.vn",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    operator = User(
        username="operator_s36",
        email="operator_s36@evcsms.vn",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([admin, driver, operator])
    db_session.commit()

    wallet = Wallet(
        user_id=driver.id,
        balance=Decimal("50000.00"),
        is_debt_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id)})
    driver_token = create_access_token({"sub": str(driver.id)})
    op_token = create_access_token({"sub": str(operator.id)})

    return {
        "admin": admin,
        "driver": driver,
        "operator": operator,
        "wallet": wallet,
        "admin_headers": {"Authorization": f"Bearer {admin_token}"},
        "driver_headers": {"Authorization": f"Bearer {driver_token}"},
        "op_headers": {"Authorization": f"Bearer {op_token}"},
    }


def test_admin_manual_topup_success(client, db_session, s36_setup):
    """SCRUM-246, 248, 249: Nạp tay thành công, số dư tăng, có sổ cái và audit log."""
    setup = s36_setup
    payload = {
        "driver_id": setup["driver"].id,
        "amount": 100000.00,
        "receipt_code": "pt-2026-001",
        "note": "Nạp tiền mặt tại quầy CSMS",
    }
    response = client.post(
        "/api/v1/wallet/admin/topup",
        json=payload,
        headers=setup["admin_headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert float(data["new_balance"]) == 150000.00
    assert data["receipt_code"] == "PT-2026-001"
    assert data["wallet_id"] == setup["wallet"].id
    assert "transaction_id" in data

    # Kiểm tra sổ cái WalletTransaction
    tx = db_session.query(WalletTransaction).filter(WalletTransaction.id == data["transaction_id"]).first()
    assert tx is not None
    assert tx.amount == Decimal("100000.00")
    assert tx.balance_before == Decimal("50000.00")
    assert tx.balance_after == Decimal("150000.00")
    assert tx.reference_type == "MANUAL_TOPUP"
    assert tx.receipt_code == "PT-2026-001"
    assert tx.created_by_id == setup["admin"].id

    # Kiểm tra AuditLog thành công
    audit = db_session.query(AuditLog).filter(
        AuditLog.action == "ADMIN_MANUAL_TOPUP",
        AuditLog.user_id == setup["admin"].id,
    ).first()
    assert audit is not None
    assert audit.data["status"] == "SUCCESS"
    assert audit.data["receipt_code"] == "PT-2026-001"
    assert audit.data["amount"] == "100000.00"


def test_admin_manual_topup_by_wallet_id(client, db_session, s36_setup):
    """Nạp bằng wallet_id thay vì driver_id."""
    setup = s36_setup
    payload = {
        "wallet_id": setup["wallet"].id,
        "amount": 20000.00,
        "receipt_code": "pt-wallet-id",
    }
    response = client.post(
        "/api/v1/wallet/admin/topup",
        json=payload,
        headers=setup["admin_headers"],
    )
    assert response.status_code == 200
    assert float(response.json()["new_balance"]) == 70000.00


def test_admin_manual_topup_zero_or_negative_amount(client, s36_setup):
    """SCRUM-251: Số tiền <= 0 bị từ chối với 422."""
    setup = s36_setup
    # Số tiền = 0
    res_zero = client.post(
        "/api/v1/wallet/admin/topup",
        json={
            "driver_id": setup["driver"].id,
            "amount": 0,
            "receipt_code": "PT-ZERO",
        },
        headers=setup["admin_headers"],
    )
    assert res_zero.status_code == 422

    # Số tiền âm
    res_neg = client.post(
        "/api/v1/wallet/admin/topup",
        json={
            "driver_id": setup["driver"].id,
            "amount": -50000,
            "receipt_code": "PT-NEG",
        },
        headers=setup["admin_headers"],
    )
    assert res_neg.status_code == 422


def test_admin_manual_topup_driver_or_wallet_not_found(client, s36_setup):
    """SCRUM-251: Ví hoặc tài xế không tồn tại -> 404."""
    setup = s36_setup
    res = client.post(
        "/api/v1/wallet/admin/topup",
        json={
            "driver_id": 999999,
            "amount": 50000,
            "receipt_code": "PT-NOTFOUND",
        },
        headers=setup["admin_headers"],
    )
    assert res.status_code == 404


def test_admin_manual_topup_missing_target_driver_and_wallet(client, s36_setup):
    """SCRUM-251: Không cung cấp cả driver_id lẫn wallet_id -> 422."""
    setup = s36_setup
    res = client.post(
        "/api/v1/wallet/admin/topup",
        json={
            "amount": 50000,
            "receipt_code": "PT-NO-TARGET",
        },
        headers=setup["admin_headers"],
    )
    assert res.status_code == 422


def test_admin_manual_topup_duplicate_receipt_code_returns_409(client, db_session, s36_setup):
    """SCRUM-247: Trùng receipt_code trả về 409 Conflict, số dư không đổi."""
    setup = s36_setup
    payload = {
        "driver_id": setup["driver"].id,
        "amount": 50000,
        "receipt_code": "PT-DUP-001",
    }
    # Lần 1 thành công
    res1 = client.post(
        "/api/v1/wallet/admin/topup",
        json=payload,
        headers=setup["admin_headers"],
    )
    assert res1.status_code == 200

    balance_after_first = setup["wallet"].balance

    # Lần 2 với receipt_code giống hệt (kể cả chữ thường chữ hoa)
    payload2 = {
        "driver_id": setup["driver"].id,
        "amount": 100000,
        "receipt_code": "pt-dup-001",
    }
    res2 = client.post(
        "/api/v1/wallet/admin/topup",
        json=payload2,
        headers=setup["admin_headers"],
    )
    assert res2.status_code == 409
    assert "đã được sử dụng" in res2.json()["detail"] or "đã tồn tại" in res2.json()["detail"]

    # Số dư không thay đổi
    db_session.refresh(setup["wallet"])
    assert setup["wallet"].balance == balance_after_first

    # Kiểm tra audit log thất bại được ghi
    audit_fail = db_session.query(AuditLog).filter(
        AuditLog.action == "ADMIN_MANUAL_TOPUP_FAILED",
        AuditLog.user_id == setup["admin"].id,
    ).first()
    assert audit_fail is not None
    assert audit_fail.data["status"] == "FAILED"


def test_admin_manual_topup_rbac_permissions(client, s36_setup):
    """SCRUM-250: Phân quyền - Chưa login 401, không phải Admin (Tài xế/Operator) 403."""
    setup = s36_setup
    payload = {
        "driver_id": setup["driver"].id,
        "amount": 50000,
        "receipt_code": "PT-RBAC-001",
    }
    # 1. Chưa đăng nhập (không header) -> 401
    res_no_auth = client.post("/api/v1/wallet/admin/topup", json=payload)
    assert res_no_auth.status_code == 401

    # 2. Tài xế (CUSTOMER) gọi -> 403
    res_driver = client.post(
        "/api/v1/wallet/admin/topup",
        json=payload,
        headers=setup["driver_headers"],
    )
    assert res_driver.status_code == 403

    # 3. Chủ trạm (OPERATOR) gọi -> 403
    res_op = client.post(
        "/api/v1/wallet/admin/topup",
        json=payload,
        headers=setup["op_headers"],
    )
    assert res_op.status_code == 403


def test_admin_manual_topup_rollback_on_failure(client, db_session, s36_setup):
    """SCRUM-251: Lỗi giữa chừng rollback toàn bộ, số dư và sổ cái không bị lệch."""
    setup = s36_setup
    payload = {
        "driver_id": setup["driver"].id,
        "amount": 50000,
        "receipt_code": "PT-ROLLBACK-001",
    }
    initial_balance = setup["wallet"].balance

    with patch.object(db_session, "commit", side_effect=SQLAlchemyError("DB Crash Simulation")):
        # Do client dùng Session riêng qua dependency override, ta patch ở level service hoặc SessionLocal
        pass

    # Giả lập lỗi ở bước commit của route
    with patch("app.services.wallet_service.ghi_nhat_ky", side_effect=SQLAlchemyError("Audit Crash")):
        # Ghi audit gặp lỗi trong transaction -> 500 và rollback
        res = client.post(
            "/api/v1/wallet/admin/topup",
            json=payload,
            headers=setup["admin_headers"],
        )
        assert res.status_code == 500

    # Khẳng định số dư không đổi
    db_session.refresh(setup["wallet"])
    assert setup["wallet"].balance == initial_balance

    # Không sinh ra sổ cái nào cho PT-ROLLBACK-001
    tx = db_session.query(WalletTransaction).filter(
        WalletTransaction.receipt_code == "PT-ROLLBACK-001"
    ).first()
    assert tx is None
