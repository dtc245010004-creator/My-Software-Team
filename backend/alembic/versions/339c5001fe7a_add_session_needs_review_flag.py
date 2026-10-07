"""Thêm cờ cần xem xét cho phiên sạc (T-42)."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "339c5001fe7a"
down_revision: Union[str, None] = "4a0a1107f87d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "charging_sessions",
        sa.Column(
            "needs_review",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("charging_sessions", "needs_review")
