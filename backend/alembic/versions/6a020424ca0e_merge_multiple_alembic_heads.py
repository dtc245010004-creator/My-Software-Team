"""merge multiple alembic heads

Revision ID: 6a020424ca0e
Revises: a7c3e91d4b52, e1f2a3b4c5d6
Create Date: 2026-10-05 00:26:16.187401

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a020424ca0e'
down_revision: Union[str, None] = ('a7c3e91d4b52', 'e1f2a3b4c5d6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
