from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.datetime_utils import UTCDateTime


class TopupRequest(BaseModel):
    """Yêu cầu nạp tiền vào ví điện tử."""

    amount: Decimal = Field(..., gt=0, description="Số tiền nạp (VND), phải lớn hơn 0")
    note: str | None = Field(default="Nạp tiền vào ví điện tử", max_length=255)
    full_name: str | None = Field(
        default=None, max_length=100, description="Họ và tên người nạp / tài xế"
    )


class WalletTransactionResponse(BaseModel):
    """Lịch sử giao dịch ví điện tử."""

    id: int
    wallet_id: int
    amount: Decimal
    transaction_type: str
    balance_after: Decimal
    balance_before: Decimal | None = None
    reference_type: str | None = None
    reference_id: str | None = None
    receipt_code: str | None = None
    note: str | None = None
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


class StandardizedWalletTransactionResponse(BaseModel):
    """Lịch sử giao dịch ví chuẩn hoá cho tài xế (SCRUM-280)."""

    id: int
    transaction_type: str
    amount: Decimal
    balance_after: Decimal
    created_at: UTCDateTime
    note: str | None = None
    reference_type: str | None = None
    reference_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedWalletTransactionsResponse(BaseModel):
    """Phân trang danh sách lịch sử giao dịch ví (SCRUM-281)."""

    items: list[StandardizedWalletTransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminManualTopupRequest(BaseModel):
    """Yêu cầu nạp tay vào ví tài xế dành cho Quản trị viên (SCRUM-246)."""

    driver_id: int | None = Field(
        default=None, description="ID của tài xế (User.id)", ge=1
    )
    wallet_id: int | None = Field(
        default=None, description="ID của ví điện tử (Wallet.id)", ge=1
    )
    amount: Decimal = Field(
        ..., gt=0, description="Số tiền nạp (VND), bắt buộc phải lớn hơn 0"
    )
    receipt_code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Mã phiếu thu duy nhất chống nạp trùng",
    )
    note: str | None = Field(
        default=None, max_length=255, description="Ghi chú nạp tiền"
    )


class AdminManualTopupResponse(BaseModel):
    """Kết quả nạp tay vào ví tài xế cho Quản trị viên (SCRUM-246)."""

    transaction_id: int
    wallet_id: int
    new_balance: Decimal
    receipt_code: str
    created_at: UTCDateTime


class WalletResponse(BaseModel):
    """Thông tin số dư ví điện tử và danh sách giao dịch gần nhất."""

    id: int
    user_id: int
    balance: Decimal
    currency: str = "VND"
    is_debt_locked: bool
    is_reconcile_locked: bool = False
    updated_at: UTCDateTime
    transactions: list[WalletTransactionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TopupOrderResponse(BaseModel):
    order_id: str
    redirect_url: str


class TopupOrderStatusResponse(BaseModel):
    order_code: str
    amount: Decimal
    status: str
    failure_reason: str | None = None
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


class WalletReconciliationUnlockRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Lý do mở khóa không được để trống.")
        return cleaned
