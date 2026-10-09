"""Store applied idle-fee details with the finalized session.

Revision ID: d8f56c4a911e
Revises: 5ccaa686da2b
Create Date: 2026-10-09
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d8f56c4a911e"
down_revision: Union[str, None] = "5ccaa686da2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "charging_sessions",
        sa.Column(
            "idle_chargeable_minutes",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "charging_sessions",
        sa.Column("idle_fee_per_minute_applied", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "charging_sessions",
        sa.Column("idle_grace_minutes_applied", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("charging_sessions", "idle_grace_minutes_applied")
    op.drop_column("charging_sessions", "idle_fee_per_minute_applied")
    op.drop_column("charging_sessions", "idle_chargeable_minutes")
