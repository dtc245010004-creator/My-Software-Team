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
    amount: Decimal = Field(
        ..., ge=0, description="Thành tiền đã làm tròn của đoạn (VNĐ)"
    )

    model_config = ConfigDict(from_attributes=True, extra="forbid")


class IdleFeeLineResponse(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Phí chiếm trụ (VNĐ)")
    chargeable_minutes: int | None = Field(
        default=None,
        gt=0,
        description="Số phút bị tính phí; null nếu phiên cũ chưa lưu chi tiết",
    )
    fee_per_minute: Decimal | None = Field(
        default=None,
        ge=0,
        description="Đơn giá (VNĐ/phút); null nếu phiên cũ chưa lưu chi tiết",
    )
    grace_minutes_applied: int | None = Field(
        default=None,
        ge=0,
        description="Số phút ân hạn đã áp dụng; null nếu phiên cũ chưa lưu chi tiết",
    )

    model_config = ConfigDict(extra="forbid")


class SessionInvoiceResponse(BaseModel):
    session_id: int | str
    invoice_status: Literal["finalized", "pending_review"]
    is_legacy: bool = False
    message: str | None = None
    segments: list[InvoiceSegmentResponse] | None = None
    energy_amount: Decimal | None = Field(
        default=None, description="Tổng tiền điện sau khi cộng thành tiền từng đoạn"
    )
    idle_fee_line: IdleFeeLineResponse | None = Field(
        default=None,
        description="Dòng phí chiếm trụ; bỏ khỏi response khi không phát sinh phí",
    )
    idle_fee_amount: Decimal | None = Field(
        default=None, description="Số tiền phí chiếm trụ đã chốt (VNĐ)"
    )
    total_amount: Decimal | None = Field(
        default=None, description="Tổng tiền hóa đơn đã chốt (VNĐ)"
    )
    rounding_rule: str = Field(
        default="ROUND_EACH_SEGMENT",
        description="Làm tròn từng đoạn rồi cộng",
    )
    rounding_note: str | None = None
    currency: Literal["VND"] = "VND"

    @model_validator(mode="after")
    def validate_finalization_state(self):
        if self.invoice_status == "pending_review":
            if self.segments not in (None, []):
                raise ValueError("Hóa đơn pending_review không được có các đoạn giá tạm tính.")
            if self.idle_fee_line is not None or self.idle_fee_amount is not None:
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

    # Giữ các trường chi tiết S-30/S-31 mà màn hình hiện tại đang dùng.
    # Các trường chuẩn hóa ở trên là hợp đồng hóa đơn riêng của S-33.
    model_config = ConfigDict(from_attributes=True, extra="allow")
