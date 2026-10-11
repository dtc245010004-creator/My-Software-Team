"""Merge tariff and invoice migration heads.

Revision ID: e72b461d9ac3
Revises: 5f9249bf58da, d8f56c4a911e
Create Date: 2026-10-09
"""

from typing import Sequence, Union

revision: str = "e72b461d9ac3"
down_revision: Union[str, None] = ("5f9249bf58da", "d8f56c4a911e")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
