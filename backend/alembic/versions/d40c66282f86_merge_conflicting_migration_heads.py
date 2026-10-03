"""merge conflicting migration heads

Revision ID: d40c66282f86
Revises: 45ab6640633a, b9cd6a8996fc
Create Date: 2026-10-02 09:52:56.318979

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd40c66282f86'
down_revision: Union[str, None] = ('45ab6640633a', 'b9cd6a8996fc')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
