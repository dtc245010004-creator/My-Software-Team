import pytest
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User


@pytest.fixture
def admin_setup(db_session: Session):
    admin = User(
        username="admin_test",
        email="admin_test@evcsms.vn",
        password_hash=get_password_hash("AdminPass123"),
        role="ADMIN",
        is_active=True,
    )
    user1 = User(
        username="driver_test1",
        email="driver_test1@evcsms.vn",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    user2 = User(
        username="driver_test2",
        email="driver_test2@evcsms.vn",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, user1, user2])
    db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id)})
    return {"admin": admin, "user1": user1, "user2": user2, "admin_token": admin_token}


def test_admin_reset_single_user_password(client, db_session: Session, admin_setup):
    token = admin_setup["admin_token"]
    user1 = admin_setup["user1"]

    # Test invalid password (less than 8 chars)
    res_invalid = client.patch(
        f"/api/v1/admin/users/{user1.id}/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_password": "short"},
    )
    assert res_invalid.status_code == 422

    # Test valid password update
    res = client.patch(
        f"/api/v1/admin/users/{user1.id}/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_password": "NewSecretPass2026"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "Đã đổi mật khẩu thành công" in data["message"]

    # Verify db hash changed
    db_session.refresh(user1)
    assert verify_password("NewSecretPass2026", user1.password_hash)


def test_admin_batch_reset_passwords(client, db_session: Session, admin_setup):
    token = admin_setup["admin_token"]
    user1 = admin_setup["user1"]
    user2 = admin_setup["user2"]

    # Batch reset for CUSTOMER role
    res = client.post(
        "/api/v1/admin/users/batch-reset-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "new_password": "BatchPass2026",
            "role": "CUSTOMER",
            "exclude_self": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 2
    assert "Đã đổi mật khẩu thành công" in data["message"]

    db_session.refresh(user1)
    db_session.refresh(user2)
    assert verify_password("BatchPass2026", user1.password_hash)
    assert verify_password("BatchPass2026", user2.password_hash)

