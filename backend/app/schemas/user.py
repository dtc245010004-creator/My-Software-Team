import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from app.core.datetime_utils import UTCDateTime


class UserRegister(BaseModel):
    """Schema nhận thông tin đăng ký tài khoản (Role luôn mặc định gán tại Service, cấm nạp từ client)."""

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Tên đăng nhập (3-50 ký tự)",
        examples=["driver01"],
    )
    email: EmailStr = Field(
        ...,
        description="Email người dùng hợp lệ",
        examples=["driver01@example.com"],
    )
    password: str = Field(
        ...,
        description="Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số",
        examples=["Password123"],
    )
    full_name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Họ và tên đầy đủ",
        examples=["Nguyễn Văn A"],
    )

    # Cấu hình bỏ qua bất kỳ trường lạ nào như 'role' do client cố tình gửi kèm
    model_config = ConfigDict(extra="ignore")

    @field_validator("password")
    @classmethod
    def validate_password_policy(cls, v: str) -> str:
        # 1. Kiểm tra độ dài ký tự tối thiểu
        if len(v) < 8:
            raise ValueError("Mật khẩu phải có độ dài tối thiểu 8 ký tự.")

        # Kiểm tra độ phức tạp: phải chứa ít nhất 1 chữ cái và 1 chữ số
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái.")
        if not re.search(r"\d", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ số.")

        return v


class UserLogin(BaseModel):
    """Schema đăng nhập bằng email, giữ trường username để tương thích API cũ."""

    email: Optional[str] = Field(default=None, description="Email tài khoản")
    username: Optional[str] = Field(default=None, description="Tên đăng nhập (tương thích client cũ)")
    password: str = Field(..., description="Mật khẩu")

    @field_validator("email", "username")
    @classmethod
    def normalize_identifier(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else value

    @model_validator(mode="after")
    def require_identifier(self):
        if not (self.email or self.username):
            raise ValueError("Vui lòng nhập email.")
        return self

    @property
    def identifier(self) -> str:
        return self.email or self.username or ""


class UserResponse(BaseModel):
    """Schema trả về thông tin người dùng (TUYỆT ĐỐI KHÔNG chứa password hay password_hash)."""

    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: UTCDateTime
    wallet_balance: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Thông tin tài khoản; thông tin phiên chỉ được đặt trong cookie HttpOnly."""

    token_type: str = "cookie"
    user: UserResponse
