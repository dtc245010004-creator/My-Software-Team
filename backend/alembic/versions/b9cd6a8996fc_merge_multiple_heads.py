"""merge multiple heads

Revision ID: b9cd6a8996fc
Revises: c0062f725df9, f2c9a6d81b40
Create Date: 2026-09-30 23:37:29.185569

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9cd6a8996fc'
down_revision: Union[str, None] = ('c0062f725df9', 'f2c9a6d81b40')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
