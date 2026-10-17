"""merge heads e07a1b2c3d4e and f3df48a70070

Revision ID: 62f5133ffb8c
Revises: e07a1b2c3d4e, f3df48a70070
Create Date: 2026-10-13 21:14:35.130959

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62f5133ffb8c'
down_revision: Union[str, None] = ('e07a1b2c3d4e', 'f3df48a70070')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
