"""add last seen at to charging points

Revision ID: 5ba0e05433d7
Revises: 45ab6640633a
Create Date: 2026-10-03 14:34:20.055181

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5ba0e05433d7"
down_revision: Union[str, None] = "45ab6640633a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Thêm thời điểm liên lạc cuối của trụ sạc."""
    op.add_column(
        "charging_points",
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Xóa thời điểm liên lạc cuối của trụ sạc."""
    op.drop_column("charging_points", "last_seen_at")