import pytest
from pydantic import ValidationError

from app.models.role import Role
from app.models.user import User
from app.schemas.auth import LoginRequest, UserResponse

# ==============================================================================
# 1. KIỂM THỬ SCHEMAS (app/schemas/auth.py)
# ==============================================================================

def test_login_request_valid_data():
    """Happy Path: Schema LoginRequest nhận dữ liệu hợp lệ."""
    data = {"email": "driver@evcsms.vn", "password": "SecurePassword123"}
    req = LoginRequest(**data)

    assert req.email == "driver@evcsms.vn"
    assert req.password == "SecurePassword123"


def test_login_request_missing_required_fields():
    """Negative Case: Thiếu email hoặc password -> Pydantic tung ValidationError."""
    with pytest.raises(ValidationError):
        LoginRequest(email="driver@evcsms.vn")  # Thiếu password

    with pytest.raises(ValidationError):
        LoginRequest(password="123456")  # Thiếu email

    with pytest.raises(ValidationError):
        LoginRequest()  # Thiếu cả hai


def test_user_response_extracts_role_names_from_role_objects():
    """Happy Path: UserResponse validator tự động trích xuất danh sách tên từ đối tượng Role."""
    role_driver = Role(id=1, name="driver", description="EV Driver")
    role_cpo = Role(id=2, name="cpo", description="Charge Point Operator")

    user_data = {
        "id": 10,
        "email": "user@evcsms.vn",
        "full_name": "Nguyễn Văn A",
        "roles": [role_driver, role_cpo],
    }
    res = UserResponse(**user_data)

    assert res.id == 10
    assert res.email == "user@evcsms.vn"
    assert res.full_name == "Nguyễn Văn A"
    assert res.roles == ["driver", "cpo"]


def test_user_response_handles_string_roles():
    """Edge Case: Trường roles truyền vào dạng chuỗi thay vì object Role."""
    user_data = {
        "id": 20,
        "email": "admin@evcsms.vn",
        "full_name": "Admin Quản trị",
        "roles": ["admin", "superadmin"],
    }
    res = UserResponse(**user_data)
    assert res.roles == ["admin", "superadmin"]


def test_user_response_handles_empty_roles():
    """Edge Case: Người dùng chưa được gán vai trò nào (roles rỗng)."""
    user_data = {
        "id": 30,
        "email": "newbie@evcsms.vn",
        "full_name": "Người dùng mới",
        "roles": [],
    }
    res = UserResponse(**user_data)
    assert res.roles == []


# ==============================================================================
# 2. KIỂM THỬ MODELS (app/models/user.py & app/models/role.py)
# ==============================================================================

def test_user_model_role_names_property_and_helper():
    """Happy Path: Thuộc tính role_names và helper get_role_names() trả về đúng danh sách tên vai trò."""
    role1 = Role(id=1, name="admin")
    role2 = Role(id=2, name="technician")

    user = User(
        id=1,
        email="tech@evcsms.vn",
        password_hash="fake_hash",
        full_name="Kỹ thuật viên",
        roles=[role1, role2],
    )

    assert user.role_names == ["admin", "technician"]
    assert user.get_role_names() == ["admin", "technician"]


def test_user_model_role_names_when_empty():
    """Edge Case: User không có role thì role_names trả về list rỗng."""
    user = User(
        id=2,
        email="norole@evcsms.vn",
        password_hash="fake_hash",
        full_name="Chưa có role",
        roles=[],
    )

    assert user.role_names == []
    assert user.get_role_names() == []
