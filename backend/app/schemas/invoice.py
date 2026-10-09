"""Schema response hóa đơn theo từng đoạn giá."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InvoiceSegmentResponse(BaseModel):
    segment_index: int = Field(..., ge=1, description="Thứ tự đoạn giá trong phiên")
    start_time: datetime = Field(..., description="Thời điểm bắt đầu đoạn")
    end_time: datetime = Field(..., description="Thời điểm kết thúc đoạn")
    energy_kwh: Decimal = Field(..., ge=0, description="Điện năng của đoạn (kWh)")
    price_per_kwh: Decimal = Field(
        ..., ge=0, description="Đơn giá đã chốt cho đoạn (VNĐ/kWh)"
    )
    amount: Decimal = Field(..., ge=0, description="Thành tiền đã làm tròn của đoạn (VNĐ)")

    model_config = ConfigDict(from_attributes=True, extra="forbid")


class IdleFeeLineResponse(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Phí chiếm trụ (VNĐ)")
    chargeable_minutes: int = Field(..., gt=0, description="Số phút bị tính phí")
    fee_per_minute: Decimal = Field(..., ge=0, description="Đơn giá (VNĐ/phút)")
    grace_minutes_applied: int = Field(..., ge=0, description="Số phút ân hạn đã áp dụng")

    model_config = ConfigDict(extra="forbid")


class SessionInvoiceResponse(BaseModel):
    session_id: int
    status: Literal["finalized", "pending_review"]
    is_legacy: bool = False
    message: str | None = None
    segments: list[InvoiceSegmentResponse] | None = None
    energy_amount: Decimal | None = Field(
        default=None, description="Tổng tiền điện sau khi cộng thành tiền từng đoạn"
    )
    idle_fee: IdleFeeLineResponse | None = Field(
        default=None,
        description="Dòng phí chiếm trụ; bỏ khỏi response khi không phát sinh phí",
    )
    total_amount: Decimal | None = Field(
        default=None, description="Tổng tiền hóa đơn đã chốt (VNĐ)"
    )
    rounding_rule: Literal["round_each_segment_then_sum"] = Field(
        default="round_each_segment_then_sum",
        description="Làm tròn từng đoạn rồi cộng",
    )
    currency: Literal["VND"] = "VND"

    @model_validator(mode="after")
    def validate_finalization_state(self):
        if self.status == "pending_review":
            if self.segments not in (None, []):
                raise ValueError("Hóa đơn pending_review không được có các đoạn giá tạm tính.")
            if self.idle_fee is not None:
                raise ValueError("Hóa đơn pending_review không được có phí tạm tính.")
            if self.energy_amount is not None or self.total_amount is not None:
                raise ValueError("Hóa đơn pending_review phải để các trường tiền là null.")
        elif (
            (self.segments is None and not self.is_legacy)
            or self.energy_amount is None
            or self.total_amount is None
        ):
            raise ValueError("Hóa đơn finalized phải có đoạn giá và tổng tiền đã chốt.")
        return self

    model_config = ConfigDict(from_attributes=True, extra="forbid")
