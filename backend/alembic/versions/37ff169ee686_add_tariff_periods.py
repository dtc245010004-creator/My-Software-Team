"""add_tariff_periods

Revision ID: 37ff169ee686
Revises: 1660df6b86c6
Create Date: 2026-10-08 14:31:52.103890

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "37ff169ee686"
down_revision: Union[str, None] = "1660df6b86c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Giữ phạm vi S-29, không sửa chênh lệch schema/model lịch sử.
    op.create_table(
        "tariff_periods",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tariff_id", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("price_per_kwh", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint(
            "price_per_kwh >= 0", name="ck_tariff_period_price_non_negative"
        ),
        sa.ForeignKeyConstraint(["tariff_id"], ["tariffs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_tariff_periods_tariff_id"),
        "tariff_periods",
        ["tariff_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tariff_periods_tariff_id"), table_name="tariff_periods")
    op.drop_table("tariff_periods")
