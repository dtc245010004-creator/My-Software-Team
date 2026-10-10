"""merge remaining migration heads

Revision ID: f2c9a6d81b40
Revises: 795931a69149, e4b6f9a2c1d3
Create Date: 2026-09-30 12:21:01.000000

"""
from typing import Sequence, Union

revision: str = "f2c9a6d81b40"
down_revision: Union[str, None] = ("795931a69149", "e4b6f9a2c1d3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
