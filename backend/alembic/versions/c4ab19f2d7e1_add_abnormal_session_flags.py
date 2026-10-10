"""Thêm cờ và lý do phiên sạc bất thường (T-53)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c4ab19f2d7e1"
down_revision: Union[str, None] = "339c5001fe7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "charging_sessions",
        sa.Column(
            "is_abnormal",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "charging_sessions",
        sa.Column("abnormal_reason", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("charging_sessions", "abnormal_reason")
    op.drop_column("charging_sessions", "is_abnormal")
