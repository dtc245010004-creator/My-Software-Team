import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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
        description="Mật khẩu (tối thiểu 8 ký tự, tối đa 72 bytes, gồm cả chữ và số)",
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

        # 2. Kiểm tra giới hạn cứng 72 bytes của thuật toán bcrypt
        byte_length = len(v.encode("utf-8"))
        if byte_length > 72:
            raise ValueError(
                f"Mật khẩu quá dài ({byte_length} bytes). Thuật toán mã hóa giới hạn tối đa 72 bytes."
            )

        # 3. Kiểm tra độ phức tạp: phải chứa ít nhất 1 chữ cái và 1 chữ số
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái.")
        if not re.search(r"\d", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ số.")

        return v


class UserLogin(BaseModel):
    """Schema đăng nhập nhận username (hoặc email) và mật khẩu."""

    username: str = Field(..., description="Tên đăng nhập hoặc Email")
    password: str = Field(..., description="Mật khẩu")


from app.core.datetime_utils import UTCDateTime


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
    """Schema trả về JWT token sau khi xác thực thành công."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
