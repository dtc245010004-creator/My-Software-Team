"""merge station and roles migration heads

Revision ID: 795931a69149
Revises: c2d3e4f5a6b7, d3a5e8b1c4f2
Create Date: 2026-09-30 11:13:02.456655

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '795931a69149'
down_revision: Union[str, None] = ('c2d3e4f5a6b7', 'd3a5e8b1c4f2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
