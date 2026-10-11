import hashlib
import hmac
import logging
from decimal import Decimal

import pytest

from app.core.config import settings
from app.models.payment import TopupOrder
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction


def compute_signature(order_code: str, status: str, secret: str = "") -> str:
    """Hàm tiện ích sinh chữ ký HMAC-SHA256 theo chuẩn format: order_code|status."""
    secret_key = (secret or settings.PAYMENT_WEBHOOK_SECRET).encode("utf-8")
    data = f"{order_code}|{status}".encode("utf-8")
    return hmac.new(secret_key, data, hashlib.sha256).hexdigest()


@pytest.fixture
def driver_and_wallet_s39(db_session):
    """Fixture tạo tài xế và ví tiền 50,000 VND cho S-39."""
    user = User(
        username="driver_s39_sandbox",
        email="driver_s39@test.com",
        password_hash="hashed_pw",
        role="DRIVER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    wallet = Wallet(
        user_id=user.id,
        balance=Decimal("50000.00"),
        is_debt_locked=False,
        is_reconcile_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()
    db_session.refresh(wallet)

    return {"user": user, "wallet": wallet}


def test_webhook_replay_attack_5_times_increases_balance_once(
    client, db_session, driver_and_wallet_s39
):
    """
    SCRUM-270 / AC: Idempotency (Gửi lại 5 lần chỉ ghi nhận 1 lần).
    Gửi cùng một bản tin Webhook SUCCESS 5 lần:
    - Cả 5 lần đều trả HTTP 200 OK.
    - Tiền ví chỉ cộng đúng 1 lần (50k -> 150k với đơn 100k).
    - Sổ cái Ledger (WalletTransaction) chỉ sinh ra đúng 1 bản ghi Append-Only (S-41).
    """
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_REPLAY_5X",
        amount=Decimal("100000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    sig = compute_signature(order.order_code, "SUCCESS")
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Paid via Sandbox Bank",
        "signature": sig,
    }

    # Bắn liên tiếp 5 lần webhook
    responses = []
    for _ in range(5):
        resp = client.post("/api/v1/payments/webhook", json=payload)
        responses.append(resp)

    # 1. Cả 5 lần đều phải thành công (HTTP 200)
    for i, resp in enumerate(responses):
        assert resp.status_code == 200, f"Request {i+1} failed with {resp.status_code}"
        assert resp.json()["status"] == "SUCCESS"

    # Lần đầu báo processed, các lần sau báo Already processed
    assert responses[0].json()["message"] == "Webhook processed successfully"
    for resp in responses[1:]:
        assert resp.json()["message"] == "Already processed"

    # 2. Kiểm tra số dư ví: Chỉ tăng 1 lần từ 50,000 lên 150,000
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("150000.00")

    # 3. Kiểm tra sổ cái WalletTransaction: Chỉ có đúng 1 bản ghi
    txs = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .all()
    )
    assert len(txs) == 1
    assert txs[0].amount == Decimal("100000.00")
    assert txs[0].transaction_type == "TOPUP"
    assert order.order_code in txs[0].note

    # 4. Kiểm tra trạng thái đơn hàng
    db_session.refresh(order)
    assert order.status == "SUCCESS"


def test_webhook_invalid_signature_returns_401_and_logs_ip(
    client, db_session, driver_and_wallet_s39, caplog
):
    """
    SCRUM-271 / SCRUM-273 / AC: Sai chữ ký bị từ chối với HTTP 401 Unauthorized,
    số dư ví không đổi, ghi log cảnh báo kèm IP.
    """
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_TAMPERED",
        amount=Decimal("200000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    attacker_ip = "198.51.100.99"
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Fake transaction",
        "signature": "forged_hmac_signature_abcdef123456",
    }

    with caplog.at_level(logging.WARNING, logger="ev_csms.payments"):
        resp = client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"X-Forwarded-For": attacker_ip},
        )

    # 1. Trả HTTP 401
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid signature"

    # 2. Số dư không đổi (vẫn 50,000 VND)
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("50000.00")

    # 3. Đơn vẫn PENDING
    db_session.refresh(order)
    assert order.status == "PENDING"

    # 4. Không có transaction nào được tạo
    tx_count = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .count()
    )
    assert tx_count == 0

    # 5. Log cảnh báo có IP kẻ tấn công
    assert attacker_ip in caplog.text
    assert "Webhook invalid signature" in caplog.text


def test_webhook_missing_signature_returns_401(
    client, db_session, driver_and_wallet_s39, caplog
):
    """
    SCRUM-272 / AC: Bản tin thiếu chữ ký bị từ chối ngay với HTTP 401 Unauthorized.
    """
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_NO_SIG",
        amount=Decimal("50000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    caller_ip = "192.0.2.1"
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Missing signature payload",
        "signature": None,
    }

    with caplog.at_level(logging.WARNING, logger="ev_csms.payments"):
        resp = client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"X-Forwarded-For": caller_ip},
        )

    # 1. Phản hồi 401
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing signature"

    # 2. Số dư ví giữ nguyên
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("50000.00")

    # 3. Log warning có IP
    assert caller_ip in caplog.text
    assert "Webhook missing signature" in caplog.text


def test_webhook_order_not_found_returns_404_and_logs_ip(
    client, db_session, caplog
):
    """
    SCRUM-273 / AC: Webhook gửi mã đơn không tồn tại trong DB -> Trả HTTP 404 Not Found,
    ghi log cảnh báo kèm IP.
    """
    fake_order_code = "ORDER_NON_EXISTENT_9999"
    sig = compute_signature(fake_order_code, "SUCCESS")

    mystery_ip = "203.0.113.88"
    payload = {
        "order_code": fake_order_code,
        "status": "SUCCESS",
        "message": "Ghost order",
        "signature": sig,
    }

    with caplog.at_level(logging.WARNING, logger="ev_csms.payments"):
        resp = client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"X-Forwarded-For": mystery_ip},
        )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Order not found"

    # Kiểm tra log
    assert mystery_ip in caplog.text
    assert fake_order_code in caplog.text
    assert "Webhook order not found" in caplog.text


def test_wallet_webhook_alias_endpoint_works(
    client, db_session, driver_and_wallet_s39
):
    """
    SCRUM-269 / Tương thích router: Endpoint /api/v1/wallet/webhook hoạt động
    chuẩn hóa như /api/v1/payments/webhook.
    """
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_WALLET_ALIAS",
        amount=Decimal("70000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    sig = compute_signature(order.order_code, "SUCCESS")
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Topup via alias",
        "signature": sig,
    }

    # Gọi qua /api/v1/wallet/webhook
    resp1 = client.post("/api/v1/wallet/webhook", json=payload)
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "SUCCESS"

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("120000.00")  # 50k + 70k

    # Gửi lại lần 2 qua alias (Idempotency)
    resp2 = client.post("/api/v1/wallet/webhook", json=payload)
    assert resp2.status_code == 200
    assert resp2.json()["message"] == "Already processed"

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("120000.00")  # Không cộng thêm


def test_webhook_failed_status_updates_order_without_changing_balance(
    client, db_session, driver_and_wallet_s39
):
    """
    Bản tin FAILED hoặc CANCELLED: Cập nhật trạng thái đơn hàng và lý do lỗi,
    nhưng tuyệt đối không thay đổi số dư ví.
    """
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_FAILED_STATUS",
        amount=Decimal("80000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    sig = compute_signature(order.order_code, "FAILED")
    payload = {
        "order_code": order.order_code,
        "status": "FAILED",
        "message": "Card expired or payment refused",
        "signature": sig,
    }

    resp = client.post("/api/v1/payments/webhook", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "FAILED"

    # Kiểm tra đơn hàng được ghi nhận lỗi
    db_session.refresh(order)
    assert order.status == "FAILED"
    assert order.failure_reason == "Card expired or payment refused"

    # Số dư ví giữ nguyên
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("50000.00")

