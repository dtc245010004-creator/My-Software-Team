from typing import List
from pydantic import BaseModel, ConfigDict, field_validator


class LoginRequest(BaseModel):
    """Schema cho request đăng nhập."""
    email: str
    password: str


class UserResponse(BaseModel):
    """Schema cho response thông tin người dùng."""
    id: int
    email: str
    full_name: str
    roles: List[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("roles", mode="before")
    @classmethod
    def extract_role_names(cls, v):
        if isinstance(v, list):
            return [role.name if hasattr(role, "name") else str(role) for role in v]
        return v
