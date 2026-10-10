import pytest
from app.models.payment import TopupOrder
from app.models.wallet import Wallet

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
        "signature": "test_valid_signature" # dùng signature pass check
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
        "signature": "test_valid_signature"
    }

    response = client.post("/api/v1/payments/webhook", json=payload_cancel)
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"

    db_session.refresh(order_cancel)
    assert order_cancel.status == "CANCELLED"
    assert order_cancel.failure_reason == "User cancelled payment"

    db_session.refresh(wallet)
    assert wallet.balance == 100000 # vẫn giữ nguyên
