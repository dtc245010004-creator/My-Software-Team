"""add_idle_amount_to_charging_sessions

Revision ID: 1660df6b86c6
Revises: 783e7f907c98
Create Date: 2026-10-08 10:52:02.032011

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1660df6b86c6'
down_revision: Union[str, None] = '783e7f907c98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "charging_sessions",
        sa.Column(
            "idle_amount",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    with op.batch_alter_table("charging_sessions") as batch_op:
        batch_op.drop_column("idle_amount")
