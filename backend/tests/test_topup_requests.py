import pytest
import urllib.parse
from app.models.payment import TopupOrder
from app.core.config import settings
from app.api.deps import get_current_user_or_driver_guest
from app.main import app as fastapi_app

def test_create_topup_request_success(client, db_session):
    from app.models.user import User
    user = User(
        username="driver_topup",
        email="topup@test.com",
        password_hash="hashed",
        role="DRIVER"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Mock Dependency
    def override_get_current_user():
        return user
        
    fastapi_app.dependency_overrides[get_current_user_or_driver_guest] = override_get_current_user

    payload = {
        "amount": 50000,
        "note": "Nạp tiền Sandbox",
        "full_name": "Nguyen Van A"
    }

    response = client.post("/api/v1/wallet/topup-requests", json=payload)
    fastapi_app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert "order_id" in data
    assert "redirect_url" in data

    # Kiểm tra database
    order = db_session.query(TopupOrder).filter(TopupOrder.order_code == data["order_id"]).first()
    assert order is not None
    assert order.status == "PENDING"
    assert order.amount == 50000
    assert order.user_id == user.id

    # Kiểm tra redirect_url có chứa signature hợp lệ
    parsed_url = urllib.parse.urlparse(data["redirect_url"])
    query_params = urllib.parse.parse_qs(parsed_url.query)
    
    assert "signature" in query_params
    assert query_params["order_code"][0] == order.order_code
    assert query_params["amount"][0] == "50000"

def test_create_topup_request_invalid_amount(client, db_session):
    from app.models.user import User
    user = User(
        username="driver_topup_2",
        email="topup2@test.com",
        password_hash="hashed",
        role="DRIVER"
    )
    db_session.add(user)
    db_session.commit()

    def override_get_current_user():
        return user
        
    fastapi_app.dependency_overrides[get_current_user_or_driver_guest] = override_get_current_user

    payload = {
        "amount": 5000, # Nhỏ hơn TOPUP_MIN_AMOUNT (10000)
    }

    response = client.post("/api/v1/wallet/topup-requests", json=payload)
    fastapi_app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "Amount must be between" in response.json()["detail"]
