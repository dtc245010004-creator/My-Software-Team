"""Thêm bảng lưu mẫu đo điện năng MeterValues (T-40)."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4a0a1107f87d"
down_revision: Union[str, None] = "6a020424ca0e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "meter_values",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("measurand", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Numeric(precision=24, scale=9), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"], ["charging_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_meter_values_session_recorded_at",
        "meter_values",
        ["session_id", "recorded_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_meter_values_session_recorded_at",
        table_name="meter_values",
    )
    op.drop_table("meter_values")
