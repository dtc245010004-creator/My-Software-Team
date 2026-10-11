from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.datetime_utils import UTCDateTime


class TopupRequest(BaseModel):
    """Y├¬u cß║ºu nß║íp tiß╗ün v├áo v├¡ ─æiß╗çn tß╗¡."""

    amount: Decimal = Field(..., gt=0, description="Sß╗æ tiß╗ün nß║íp (VND), phß║úi lß╗¢n h╞ín 0")
    note: str | None = Field(default="Nß║íp tiß╗ün v├áo v├¡ ─æiß╗çn tß╗¡", max_length=255)
    full_name: str | None = Field(
        default=None, max_length=100, description="Hß╗ì v├á t├¬n ng╞░ß╗¥i nß║íp / t├ái xß║┐"
    )


class WalletTransactionResponse(BaseModel):
    """Lß╗ïch sß╗¡ giao dß╗ïch v├¡ ─æiß╗çn tß╗¡."""

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
    """Th├┤ng tin sß╗æ d╞░ v├¡ ─æiß╗çn tß╗¡ v├á danh s├ích giao dß╗ïch gß║ºn nhß║Ñt."""

    id: int
    user_id: int
    balance: Decimal
    currency: str = "VND"
    is_debt_locked: bool
    is_reconcile_locked: bool
    updated_at: UTCDateTime
    transactions: list[WalletTransactionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class WalletReconciliationUnlockRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("L├╜ do mß╗ƒ kh├│a kh├┤ng ─æ╞░ß╗úc ─æß╗â trß╗æng.")
        return cleaned
