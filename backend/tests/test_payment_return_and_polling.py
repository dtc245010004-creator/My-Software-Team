import pytest
from app.models.payment import TopupOrder
from app.models.wallet import Wallet
from app.main import app as fastapi_app
from app.api.deps import get_current_user_or_driver_guest

def test_payment_return_url(client, db_session):
    # Tạo user và order
    from app.models.user import User
    user = User(
        username="driver_return",
        email="return@test.com",
        password_hash="hashed",
        role="DRIVER"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    
    wallet = Wallet(user_id=user.id, balance=100000)
    db_session.add(wallet)
    
    order = TopupOrder(
        user_id=user.id,
        order_code="ORDER_RET_123",
        amount=50000,
        status="PENDING"
    )
    db_session.add(order)
    db_session.commit()
    
    # Giả lập Sandbox gọi Return URL, truyền trạng thái trên URL
    response = client.get("/api/v1/payments/return?order_code=ORDER_RET_123&status=SUCCESS", follow_redirects=False)
    
    # Kiểm tra redirect đúng
    assert response.status_code in [302, 307, 303]
    redirect_url = response.headers.get("location")
    assert "status=PENDING" in redirect_url # Đọc từ DB PENDING chứ ko phải SUCCESS từ query URL
    assert "ORDER_RET_123" in redirect_url
    
    # Đảm bảo DB không bị đổi
    db_session.refresh(order)
    assert order.status == "PENDING"
    
    db_session.refresh(wallet)
    assert wallet.balance == 100000

def test_polling_api_status_success_and_forbidden(client, db_session):
    from app.models.user import User
    user1 = User(username="user1", email="u1@test.com", password_hash="hashed", role="DRIVER")
    user2 = User(username="user2", email="u2@test.com", password_hash="hashed", role="DRIVER")
    db_session.add(user1)
    db_session.add(user2)
    db_session.commit()
    db_session.refresh(user1)
    db_session.refresh(user2)
    
    order = TopupOrder(
        user_id=user1.id,
        order_code="ORDER_POLL_123",
        amount=50000,
        status="SUCCESS"
    )
    db_session.add(order)
    db_session.commit()
    
    # Test user1 (chủ order) truy cập -> 200 OK
    def override_get_user1():
        return user1
    fastapi_app.dependency_overrides[get_current_user_or_driver_guest] = override_get_user1
    
    response = client.get("/api/v1/wallet/topup-requests/ORDER_POLL_123")
    assert response.status_code == 200
    assert response.json()["status"] == "SUCCESS"
    assert response.json()["order_code"] == "ORDER_POLL_123"
    
    # Test user2 truy cập -> 403 Forbidden
    def override_get_user2():
        return user2
    fastapi_app.dependency_overrides[get_current_user_or_driver_guest] = override_get_user2
    
    response2 = client.get("/api/v1/wallet/topup-requests/ORDER_POLL_123")
    assert response2.status_code == 403
    assert "permission" in response2.json()["detail"].lower()
    
    fastapi_app.dependency_overrides.clear()
