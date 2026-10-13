import hashlib
import hmac

from app.core.config import settings
from app.models.payment import TopupOrder
from app.models.wallet import Wallet


def compute_signature(order_code: str, status: str) -> str:
    secret_key = settings.PAYMENT_WEBHOOK_SECRET.encode("utf-8")
    data = f"{order_code}|{status}".encode("utf-8")
    return hmac.new(secret_key, data, hashlib.sha256).hexdigest()


def test_payment_webhook_failed_or_cancelled(client, db_session):
    # 1. Tạo user và wallet với số dư ban đầu
    from app.models.user import User
    user = User(
        username="test_driver",
        email="driver@test.com",
        password_hash="hashed",
        role="DRIVER"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    wallet = Wallet(user_id=user.id, balance=100000, is_debt_locked=False)
    db_session.add(wallet)
    db_session.commit()

    # 2. Tạo một TopupOrder PENDING
    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_123",
        amount=50000,
        status="PENDING"
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    # 3. Gửi Webhook trạng thái FAILED
    payload_failed = {
        "order_code": "ORDER_123",
        "status": "FAILED",
        "message": "User insufficient funds in bank",
        "signature": compute_signature("ORDER_123", "FAILED"),
    }

    response = client.post("/api/v1/payments/webhook", json=payload_failed)
    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"

    # 4. Kiểm tra trong DB
    db_session.refresh(order)
    assert order.status == "FAILED"
    assert order.failure_reason == "User insufficient funds in bank"

    # 5. Đảm bảo số dư ví không bị thay đổi
    db_session.refresh(wallet)
    assert wallet.balance == 100000

    # 6. Gửi Webhook trạng thái CANCELLED cho một order khác
    order_cancel = TopupOrder(
        user_id=user.id,
        order_code="ORDER_456",
        amount=20000,
        status="PENDING"
    )
    db_session.add(order_cancel)
    db_session.commit()
    db_session.refresh(order_cancel)

    payload_cancel = {
        "order_code": "ORDER_456",
        "status": "CANCELLED",
        "message": "User cancelled payment",
        "signature": compute_signature("ORDER_456", "CANCELLED"),
    }

    response = client.post("/api/v1/payments/webhook", json=payload_cancel)
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"

    db_session.refresh(order_cancel)
    assert order_cancel.status == "CANCELLED"
    assert order_cancel.failure_reason == "User cancelled payment"

    db_session.refresh(wallet)
    assert wallet.balance == 100000 # vẫn giữ nguyên

def test_payment_webhook_success_and_idempotency(client, db_session):
    # 1. Tạo user và wallet với số dư ban đầu
    from app.models.user import User
    from app.models.wallet import WalletTransaction
    user = User(
        username="driver_success",
        email="success@test.com",
        password_hash="hashed",
        role="DRIVER"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    wallet = Wallet(user_id=user.id, balance=100000, is_debt_locked=False)
    db_session.add(wallet)
    db_session.commit()
    db_session.refresh(wallet)
    
    # 2. Tạo một TopupOrder PENDING
    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_789",
        amount=50000,
        status="PENDING"
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    # 3. Gửi Webhook trạng thái SUCCESS lần 1
    payload_success = {
        "order_code": "ORDER_789",
        "status": "SUCCESS",
        "message": "Payment successful",
        "signature": compute_signature("ORDER_789", "SUCCESS"),
    }


    response = client.post("/api/v1/payments/webhook", json=payload_success)
    assert response.status_code == 200
    assert response.json()["status"] == "SUCCESS"

    # 4. Kiểm tra trong DB (trạng thái cập nhật, số dư tăng, có log giao dịch)
    db_session.refresh(order)
    assert order.status == "SUCCESS"

    db_session.refresh(wallet)
    assert wallet.balance == 150000 # 100k + 50k

    tx = db_session.query(WalletTransaction).filter(WalletTransaction.wallet_id == wallet.id).order_by(WalletTransaction.id.desc()).first()
    assert tx is not None
    assert tx.amount == 50000
    assert tx.transaction_type == "TOPUP"
    assert "ORDER_789" in tx.note

    # 5. Gửi Webhook trạng thái SUCCESS lần 2 (Idempotency check)
    response_retry = client.post("/api/v1/payments/webhook", json=payload_success)
    assert response_retry.status_code == 200
    assert response_retry.json()["status"] == "SUCCESS"

    # Kiểm tra số dư không tăng thêm
    db_session.refresh(wallet)
    assert wallet.balance == 150000 # vẫn là 150k

    # Đảm bảo không có thêm WalletTransaction mới được tạo
    tx_count = db_session.query(WalletTransaction).filter(WalletTransaction.wallet_id == wallet.id).count()
    assert tx_count == 1


def test_payment_webhook_hmac_signature_verification_success(client, db_session):
    from app.models.user import User

    user = User(
        username="driver_hmac_valid",
        email="hmac_valid@test.com",
        password_hash="hashed",
        role="DRIVER",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    wallet = Wallet(user_id=user.id, balance=50000, is_debt_locked=False)
    db_session.add(wallet)
    db_session.commit()

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_HMAC_OK",
        amount=30000,
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    # Tính toán chữ ký HMAC-SHA256 theo đúng secret PAYMENT_WEBHOOK_SECRET
    secret_key = settings.PAYMENT_WEBHOOK_SECRET.encode("utf-8")
    data = f"{order.order_code}|SUCCESS".encode("utf-8")
    valid_sig = hmac.new(secret_key, data, hashlib.sha256).hexdigest()

    payload = {
        "order_code": "ORDER_HMAC_OK",
        "status": "SUCCESS",
        "message": "Paid successfully",
        "signature": valid_sig,
    }

    response = client.post("/api/v1/payments/webhook", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "SUCCESS"

    db_session.refresh(order)
    assert order.status == "SUCCESS"
    db_session.refresh(wallet)
    assert wallet.balance == 80000


def test_payment_webhook_invalid_signature_rejected(client, db_session):
    payload = {
        "order_code": "ORDER_INVALID_SIG",
        "status": "SUCCESS",
        "message": "Tampered payment",
        "signature": "fake_or_tampered_signature_123456",
    }

    response = client.post("/api/v1/payments/webhook", json=payload)
    assert response.status_code in (400, 401)
    assert response.json()["detail"] == "Invalid signature"


def test_payment_webhook_custom_secret_dynamic_verification(
    client, db_session, monkeypatch
):
    from app.models.user import User

    # Kiểm tra việc đọc PAYMENT_WEBHOOK_SECRET động từ config
    monkeypatch.setattr(
        settings, "PAYMENT_WEBHOOK_SECRET", "custom_dynamic_webhook_secret_key"
    )

    user = User(
        username="driver_custom_secret",
        email="custom_secret@test.com",
        password_hash="hashed",
        role="DRIVER",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_CUSTOM_SECRET",
        amount=25000,
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    # Ký bằng secret mới
    secret_key = "custom_dynamic_webhook_secret_key".encode("utf-8")
    data = f"{order.order_code}|FAILED".encode("utf-8")
    valid_sig = hmac.new(secret_key, data, hashlib.sha256).hexdigest()

    # Thử ký bằng secret cũ (phải bị từ chối)
    old_secret_sig = hmac.new(
        b"sandbox_secret", data, hashlib.sha256
    ).hexdigest()
    res_rejected = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": "ORDER_CUSTOM_SECRET",
            "status": "FAILED",
            "signature": old_secret_sig,
        },
    )
    assert res_rejected.status_code in (400, 401)

    # Gửi với chữ ký hợp lệ từ secret mới
    res_accepted = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": "ORDER_CUSTOM_SECRET",
            "status": "FAILED",
            "message": "User failed",
            "signature": valid_sig,
        },
    )
    assert res_accepted.status_code == 200
    assert res_accepted.json()["status"] == "FAILED"
