from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TopupRequest(BaseModel):
    """Yêu cầu nạp tiền vào ví điện tử."""
    amount: Decimal = Field(..., gt=0, description="Số tiền nạp (VND), phải lớn hơn 0")
    note: Optional[str] = Field(default="Nạp tiền vào ví điện tử", max_length=255)


class WalletTransactionResponse(BaseModel):
    """Lịch sử giao dịch ví điện tử."""
    id: int
    wallet_id: int
    amount: Decimal
    transaction_type: str
    balance_after: Decimal
    reference_id: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WalletResponse(BaseModel):
    """Thông tin số dư ví điện tử và danh sách giao dịch gần nhất."""
    id: int
    user_id: int
    balance: Decimal
    currency: str = "VND"
    is_debt_locked: bool
    updated_at: datetime
    transactions: List[WalletTransactionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
