"""add station_power_limits table

Revision ID: b311a1c2d3e4
Revises: 19a6b144ac96
Create Date: 2026-10-12 18:15:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b311a1c2d3e4"
down_revision: str | None = "19a6b144ac96"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "station_power_limits",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("power_limit_kw", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "power_limit_kw > 0", name="ck_station_power_limit_positive"
        ),
        sa.ForeignKeyConstraint(
            ["station_id"], ["stations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_station_power_limits_id"),
        "station_power_limits",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_station_power_limits_station_id"),
        "station_power_limits",
        ["station_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_station_power_limits_station_id"),
        table_name="station_power_limits",
    )
    op.drop_index(
        op.f("ix_station_power_limits_id"),
        table_name="station_power_limits",
    )
    op.drop_table("station_power_limits")
