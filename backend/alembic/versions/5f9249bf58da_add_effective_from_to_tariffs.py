"""add_effective_from_to_tariffs

Revision ID: 5f9249bf58da
Revises: 37ff169ee686
Create Date: 2026-10-08 17:52:09.459642

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f9249bf58da'
down_revision: Union[str, None] = '37ff169ee686'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Thêm cột effective_from với server_default là mốc xa xưa '2000-01-01 00:00:00+00'
    op.add_column(
        'tariffs',
        sa.Column(
            'effective_from',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("'2000-01-01 00:00:00+00'"),
        ),
    )
    # 2. Tạo index cho effective_from
    op.create_index(
        op.f('ix_tariffs_effective_from'),
        'tariffs',
        ['effective_from'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_tariffs_effective_from'), table_name='tariffs')
    op.drop_column('tariffs', 'effective_from')
