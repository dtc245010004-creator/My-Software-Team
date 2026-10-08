"""Thêm phí chiếm trụ vào biểu giá và ghi nhận thời điểm đổi trạng thái đầu nối.

Revision ID: 783e7f907c98
Revises: ab12cd34ef56
Create Date: 2026-10-08
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "783e7f907c98"
down_revision: Union[str, None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tariffs") as batch_op:
        batch_op.add_column(
            sa.Column(
                "idle_fee_per_minute",
                sa.Numeric(precision=10, scale=2),
                server_default=sa.text("0"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "idle_grace_minutes",
                sa.Integer(),
                server_default=sa.text("0"),
                nullable=False,
            )
        )
        batch_op.create_check_constraint(
            "ck_tariff_idle_fee_non_negative", "idle_fee_per_minute >= 0"
        )
        batch_op.create_check_constraint(
            "ck_tariff_idle_grace_non_negative", "idle_grace_minutes >= 0"
        )

    op.add_column(
        "connectors",
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "connectors",
        sa.Column("idle_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "connectors",
        sa.Column("idle_ended_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("connectors") as batch_op:
        batch_op.drop_column("idle_ended_at")
        batch_op.drop_column("idle_started_at")
        batch_op.drop_column("status_changed_at")

    with op.batch_alter_table("tariffs") as batch_op:
        batch_op.drop_constraint("ck_tariff_idle_grace_non_negative", type_="check")
        batch_op.drop_constraint("ck_tariff_idle_fee_non_negative", type_="check")
        batch_op.drop_column("idle_grace_minutes")
        batch_op.drop_column("idle_fee_per_minute")
