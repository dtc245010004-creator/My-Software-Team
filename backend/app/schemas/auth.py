
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class LoginRequest(BaseModel):
    """Schema cho request đăng nhập."""
    email: str
    password: str


class RegisterRequest(BaseModel):
    """Schema cho request đăng ký tài khoản customer/driver."""
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Mật khẩu phải có ít nhất 6 ký tự")
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Họ tên không được để trống")
        return v.strip()


class UserResponse(BaseModel):
    """Schema cho response thông tin người dùng."""
    id: int
    email: str
    full_name: str
    roles: list[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("roles", mode="before")
    @classmethod
    def extract_role_names(cls, v):
        if isinstance(v, list):
            return [role.name if hasattr(role, "name") else str(role) for role in v]
        return v


class LoginResponse(BaseModel):
    """Schema cho response đăng nhập — chuẩn FastAPI Bearer token."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
