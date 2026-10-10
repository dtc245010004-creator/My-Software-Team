from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

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
    reference_id: str | None = None
    note: str | None = None
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


class WalletResponse(BaseModel):
    """Thông tin số dư ví điện tử và danh sách giao dịch gần nhất."""

    id: int
    user_id: int
    balance: Decimal
    currency: str = "VND"
    is_debt_locked: bool
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
