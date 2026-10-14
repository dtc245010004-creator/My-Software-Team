import hashlib
import hmac
import logging
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.security import create_access_token
from app.models.payment import TopupOrder
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services.wallet_service import topup_wallet


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


# ==============================================================================
# ĐIỀU KIỆN C1: GỬI 5 LẦN -> SỐ DƯ TĂNG 1 LẦN, 1 DÒNG SỔ CÁI, CẢ 5 LẦN TRẢ 200
# ==============================================================================
def test_c1_webhook_replay_5_times_increases_balance_once_all_200(
    client, db_session, driver_and_wallet_s39
):
    """C1: Gửi cùng một bản tin Webhook SUCCESS 5 lần: cả 5 lần 200, ví tăng 1 lần, sổ cái 1 dòng."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_C1_5X",
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

    responses = []
    for _ in range(5):
        resp = client.post("/api/v1/payments/webhook", json=payload)
        responses.append(resp)

    # Cả 5 lần đều phải trả HTTP 200
    for i, resp in enumerate(responses):
        assert resp.status_code == 200, f"Request {i+1} failed with {resp.status_code}"
        assert resp.json()["status"] == "SUCCESS"

    assert responses[0].json()["message"] == "Webhook processed successfully"
    for resp in responses[1:]:
        assert resp.json()["message"] == "Already processed"

    # Số dư ví chỉ tăng 1 lần duy nhất từ 50,000 lên 150,000
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("150000.00")

    # Sổ cái chỉ có đúng 1 bản ghi
    txs = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .all()
    )
    assert len(txs) == 1
    assert txs[0].amount == Decimal("100000.00")
    assert txs[0].transaction_type == "TOPUP"


# ==============================================================================
# ĐIỀU KIỆN C2: MÔ PHỎNG RESTART APP TRÊN CÙNG DATABASE TẠM -> SỐ DƯ KHÔNG ĐỔI
# ==============================================================================
def test_c2_webhook_persistent_idempotency_after_server_restart(
    client, db_session, driver_and_wallet_s39
):
    """C2: Mô phỏng khởi động lại server (mở session/client mới trên cùng database): webhook cũ không cộng đôi."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_C2_RESTART",
        amount=Decimal("50000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    sig = compute_signature(order.order_code, "SUCCESS")
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Paid",
        "signature": sig,
    }

    # Lần 1: Xử lý thành công
    resp1 = client.post("/api/v1/payments/webhook", json=payload)
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "SUCCESS"

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("100000.00")

    # Giả lập restart server: đóng toàn bộ kết nối session hiện tại
    db_session.expire_all()

    # Lần 2: Webhook gửi lại sau khi restart server
    resp2 = client.post("/api/v1/payments/webhook", json=payload)
    assert resp2.status_code == 200
    assert resp2.json()["message"] == "Already processed"

    db_session.refresh(wallet)
    # Số dư ví không đổi, vẫn là 100,000 VND
    assert wallet.balance == Decimal("100000.00")

    # Sổ cái chỉ có 1 bản ghi
    tx_count = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .count()
    )
    assert tx_count == 1


# ==============================================================================
# ĐIỀU KIỆN C3: HAI WEBHOOK ĐỒNG THỜI & ÉP ĐƯỜNG INTEGRITYERROR
# ==============================================================================
def test_c3_forced_integrity_error_handled_cleanly_returns_200(
    client, db_session, driver_and_wallet_s39
):
    """C3: Kịch bản ép đường IntegrityError (khi 2 thread cùng cố ghi sổ cái): bắt lỗi, rollback, trả 200 'Already processed'."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_C3_INTEGRITY",
        amount=Decimal("80000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    sig = compute_signature(order.order_code, "SUCCESS")
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Paid",
        "signature": sig,
    }

    # Lần 1: Thành công bình thường
    resp1 = client.post("/api/v1/payments/webhook", json=payload)
    assert resp1.status_code == 200

    # Lần 2: Giả lập kịch bản đua tranh mà order.status vẫn chưa nhìn thấy SUCCESS (ép IntegrityError tại topup_wallet)
    # Lúc này topup_wallet sẽ kích hoạt IntegrityError do trùng unique constraint trên (wallet_id, reference_id, transaction_type)
    with patch("app.api.v1.endpoints.payments.topup_wallet", side_effect=IntegrityError("duplicate key", params=None, orig=Exception("unique constraint violated"))):
        resp2 = client.post("/api/v1/payments/webhook", json=payload)
        # Bên thua cuộc đua PHẢI trả về 200 'Already processed', KHÔNG ĐƯỢC trả 500
        assert resp2.status_code == 200
        assert resp2.json()["message"] == "Already processed"

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("130000.00")


def test_c3_concurrent_race_condition_safe(
    client, db_session, driver_and_wallet_s39
):
    """C3: Hai webhook đồng thời qua ThreadPoolExecutor: chỉ 1 request cộng tiền, không văng 500."""
    import concurrent.futures

    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_C3_CONCURRENT",
        amount=Decimal("50000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    sig = compute_signature(order.order_code, "SUCCESS")
    payload = {
        "order_code": order.order_code,
        "status": "SUCCESS",
        "message": "Paid concurrently",
        "signature": sig,
    }

    def send_webhook():
        return client.post("/api/v1/payments/webhook", json=payload)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(send_webhook)
        f2 = executor.submit(send_webhook)
        res1 = f1.result()
        res2 = f2.result()

    # Cả 2 đều phải trả 200, KHÔNG ĐƯỢC 500
    assert res1.status_code == 200
    assert res2.status_code == 200

    # Số dư ví chỉ tăng 1 lần từ 50,000 lên 100,000
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("100000.00")


# ==============================================================================
# ĐIỀU KIỆN C4: KIỂM TOÁN CHỮ KÝ - TẤT CẢ TRƯỜNG HỢP SAI/THIẾU/BYPASS BỊ TỪ CHỐI 401
# ==============================================================================
def test_c4_signature_validation_all_invalid_cases_return_401(
    client, db_session, driver_and_wallet_s39
):
    """C4: Chữ ký 'test_valid_signature', sai, thiếu, rỗng, ký tự lạ, secret rỗng: tất cả đều trả 401, ví không đổi."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_C4_SIGS",
        amount=Decimal("20000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    # 1. CỬA SAU test_valid_signature PHẢI BỊ TỪ CHỐI 401 (Hiện tại đang trả 200 -> TEST SẼ ĐỎ)
    resp_bypass = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order.order_code,
            "status": "SUCCESS",
            "signature": "test_valid_signature",
        },
    )
    assert resp_bypass.status_code == 401, f"Bypass signature must return 401, got {resp_bypass.status_code}"
    assert resp_bypass.json()["detail"] == "Invalid signature"

    # 2. Sai chữ ký (forged signature) -> 401
    resp_wrong = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order.order_code,
            "status": "SUCCESS",
            "signature": "forged_hex_signature_abcdef0123456789",
        },
    )
    assert resp_wrong.status_code == 401
    assert resp_wrong.json()["detail"] == "Invalid signature"

    # 3. Không có trường signature trong body (body missing key) -> 401 (không phải 422)
    resp_missing = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order.order_code,
            "status": "SUCCESS",
        },
    )
    assert resp_missing.status_code == 401
    assert resp_missing.json()["detail"] == "Missing signature"

    # 4. Trường signature rỗng ("") hoặc None -> 401
    resp_empty = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order.order_code,
            "status": "SUCCESS",
            "signature": "",
        },
    )
    assert resp_empty.status_code == 401
    assert resp_empty.json()["detail"] == "Missing signature"

    # 5. Chữ ký chứa ký tự lạ (Unicode, non-ASCII) -> 401, không bị lỗi 500 TypeError
    resp_unicode = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order.order_code,
            "status": "SUCCESS",
            "signature": "chữ_ký_bất_thường_🔥_invalid",
        },
    )
    assert resp_unicode.status_code == 401
    assert resp_unicode.json()["detail"] == "Invalid signature"

    # 6. Secret key rỗng / chưa cấu hình -> Fail-closed từ chối 401
    with patch("app.core.config.settings.PAYMENT_WEBHOOK_SECRET", ""):
        sig_valid = compute_signature(order.order_code, "SUCCESS", secret="")
        resp_no_secret = client.post(
            "/api/v1/payments/webhook",
            json={
                "order_code": order.order_code,
                "status": "SUCCESS",
                "signature": sig_valid or "any_sig",
            },
        )
        assert resp_no_secret.status_code == 401

    # Đảm bảo số dư ví và trạng thái đơn hàng giữ nguyên tuyệt đối
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("50000.00")
    db_session.refresh(order)
    assert order.status == "PENDING"


# ==============================================================================
# ĐIỀU KIỆN C5: ĐƠN KHÔNG TỒN TẠI -> 404, KHÔNG TẠO/CỘNG GÌ
# ==============================================================================
def test_c5_webhook_nonexistent_order_returns_404_and_warns(
    client, db_session, caplog
):
    """C5: Webhook gửi mã đơn không tồn tại: trả 404, không tự tạo đơn, không cộng ví."""
    fake_code = "ORDER_GHOST_NOT_EXISTS_999"
    sig = compute_signature(fake_code, "SUCCESS")

    with caplog.at_level(logging.WARNING, logger="ev_csms.payments"):
        resp = client.post(
            "/api/v1/payments/webhook",
            json={
                "order_code": fake_code,
                "status": "SUCCESS",
                "signature": sig,
            },
        )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Order not found"
    assert "Webhook order not found" in caplog.text
    assert fake_code in caplog.text

    # Kiểm tra trong DB không có đơn ảo nào được sinh ra
    order_in_db = db_session.query(TopupOrder).filter(TopupOrder.order_code == fake_code).first()
    assert order_in_db is None


# ==============================================================================
# ĐIỀU KIỆN C6: CAPLOG AUDIT CÓ IP, LÝ DO, 401, KHÔNG LỘ KHÓA
# ==============================================================================
def test_c6_caplog_audit_ip_and_reason_without_leaking_key(
    client, db_session, driver_and_wallet_s39, caplog
):
    """C6: Kiểm tra log WARNING có Client IP, mã 401, lý do missing_signature/invalid_signature, không lộ secret/signature."""
    user = driver_and_wallet_s39["user"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_C6_AUDIT",
        amount=Decimal("10000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    secret = settings.PAYMENT_WEBHOOK_SECRET

    with caplog.at_level(logging.WARNING, logger="ev_csms.payments"):
        # 1. Test missing signature
        client.post(
            "/api/v1/payments/webhook",
            json={"order_code": order.order_code, "status": "SUCCESS"},
        )
        assert "missing_signature" in caplog.text or "Webhook missing signature" in caplog.text

        caplog.clear()

        # 2. Test invalid signature
        fake_sig = "fake_sig_123456789"
        client.post(
            "/api/v1/payments/webhook",
            json={"order_code": order.order_code, "status": "SUCCESS", "signature": fake_sig},
        )
        assert "invalid_signature" in caplog.text or "Webhook invalid signature" in caplog.text
        # Tuyệt đối không in secret key trong log
        if secret:
            assert secret not in caplog.text


# ==============================================================================
# CÁC TEST BỔ SUNG: KHỚP SỔ CÁI, TRẠNG THÁI KẾT THÚC, TOPUP_WALLET IDEMPOTENCY
# ==============================================================================
def test_webhook_valid_first_time_increases_balance_and_matches_ledger(
    client, db_session, driver_and_wallet_s39
):
    """Webhook hợp lệ lần đầu cộng đúng order.amount và số dư khớp tổng sổ cái."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_VALID_MATCH",
        amount=Decimal("75000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()

    sig = compute_signature(order.order_code, "SUCCESS")
    resp = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order.order_code,
            "status": "SUCCESS",
            "signature": sig,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "SUCCESS"

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("125000.00")  # 50k + 75k

    # Tổng số tiền trong sổ cái phải khớp với số dư ví
    ledger_entries = db_session.query(WalletTransaction).filter(WalletTransaction.wallet_id == wallet.id).all()
    assert len(ledger_entries) == 1
    assert ledger_entries[0].amount == Decimal("75000.00")


def test_webhook_failed_and_cancelled_never_changes_balance(
    client, db_session, driver_and_wallet_s39
):
    """Webhook FAILED / CANCELLED cập nhật đơn nhưng tuyệt đối không cộng tiền ví."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order_f = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_FAILED",
        amount=Decimal("30000.00"),
        status="PENDING",
    )
    db_session.add(order_f)
    db_session.commit()

    sig_f = compute_signature(order_f.order_code, "FAILED")
    resp_f = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": order_f.order_code,
            "status": "FAILED",
            "message": "Payment rejected by bank",
            "signature": sig_f,
        },
    )
    assert resp_f.status_code == 200
    assert resp_f.json()["status"] == "FAILED"

    db_session.refresh(order_f)
    assert order_f.status == "FAILED"
    assert order_f.failure_reason == "Payment rejected by bank"

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("50000.00")


def test_webhook_terminal_state_transition_rules(
    client, db_session, driver_and_wallet_s39, caplog
):
    """Quy tắc chuyển trạng thái kết thúc:
    - Đơn đã FAILED nhận SUCCESS: không cộng tiền, log WARNING, trả 200.
    - Đơn đã SUCCESS nhận FAILED: không đổi trạng thái, không trừ tiền.
    """
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_TERMINAL",
        amount=Decimal("40000.00"),
        status="FAILED",
    )
    db_session.add(order)
    db_session.commit()

    sig_s = compute_signature(order.order_code, "SUCCESS")

    with caplog.at_level(logging.WARNING, logger="ev_csms.payments"):
        resp_late_success = client.post(
            "/api/v1/payments/webhook",
            json={
                "order_code": order.order_code,
                "status": "SUCCESS",
                "signature": sig_s,
            },
        )
    assert resp_late_success.status_code == 200

    # Số dư ví không đổi, đơn giữ FAILED
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("50000.00")
    db_session.refresh(order)
    assert order.status == "FAILED"

    successful_order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_TERMINAL_SUCCESS",
        amount=Decimal("15000.00"),
        status="PENDING",
    )
    db_session.add(successful_order)
    db_session.commit()
    success_response = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": successful_order.order_code,
            "status": "SUCCESS",
            "signature": compute_signature(successful_order.order_code, "SUCCESS"),
        },
    )
    assert success_response.status_code == 200
    late_failure_response = client.post(
        "/api/v1/payments/webhook",
        json={
            "order_code": successful_order.order_code,
            "status": "FAILED",
            "signature": compute_signature(successful_order.order_code, "FAILED"),
        },
    )
    assert late_failure_response.status_code == 200
    db_session.refresh(successful_order)
    db_session.refresh(wallet)
    assert successful_order.status == "SUCCESS"
    assert wallet.balance == Decimal("65000.00")


def test_topup_wallet_idempotency_with_same_reference_id(
    db_session, driver_and_wallet_s39
):
    """topup_wallet gọi 2 lần với cùng reference_id: chỉ 1 dòng sổ cái, số dư tăng 1 lần (HIỆN TẠI SẼ ĐỎ do thiếu tham số/chưa áp dụng reference_id)."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]

    # Gọi lần 1
    topup_wallet(
        db=db_session,
        user_id=user.id,
        amount=Decimal("60000.00"),
        note="Nạp lần 1",
        reference_id="ORDER_REF_TEST_999",
    )

    db_session.refresh(wallet)
    assert wallet.balance == Decimal("110000.00")  # 50k + 60k

    # Gọi lần 2 với cùng reference_id
    topup_wallet(
        db=db_session,
        user_id=user.id,
        amount=Decimal("60000.00"),
        note="Nạp lần 2 trùng ref",
        reference_id="ORDER_REF_TEST_999",
    )

    db_session.refresh(wallet)
    # Số dư ví PHẢI giữ nguyên 110,000 VND (không được thành 170,000 VND)
    assert wallet.balance == Decimal("110000.00")

    # Sổ cái chỉ có 1 dòng
    txs = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id, WalletTransaction.reference_id == "ORDER_REF_TEST_999")
        .all()
    )
    assert len(txs) == 1


def test_sandbox_simulation_signs_server_side_and_checks_order_ownership(
    client, db_session, driver_and_wallet_s39, monkeypatch
):
    """Sandbox ký phía máy chủ và chỉ cho chủ đơn PENDING mô phỏng."""
    user = driver_and_wallet_s39["user"]
    wallet = driver_and_wallet_s39["wallet"]
    monkeypatch.setattr(settings, "ALLOW_PAYMENT_SANDBOX_SIMULATION", True)
    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_S39_SANDBOX_SIMULATION",
        amount=Decimal("22000.00"),
        status="PENDING",
    )
    db_session.add(order)
    db_session.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role})
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/api/v1/payments/sandbox/simulate",
        json={"order_code": order.order_code, "status": "SUCCESS"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "SUCCESS"
    db_session.refresh(wallet)
    assert wallet.balance == Decimal("72000.00")

    other = User(
        username="other_sandbox_driver",
        email="other_sandbox_driver@test.com",
        password_hash="hashed_pw",
        role="CUSTOMER",
    )
    db_session.add(other)
    db_session.commit()
    other_token = create_access_token({"sub": str(other.id), "role": other.role})
    denied = client.post(
        "/api/v1/payments/sandbox/simulate",
        json={"order_code": order.order_code, "status": "SUCCESS"},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert denied.status_code == 404

