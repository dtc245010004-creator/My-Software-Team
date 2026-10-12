"""merge_hung_s36_s40_and_teammate_wallet_ledger

Revision ID: 19a6b144ac96
Revises: 015eba50c917, f41a0b7c9d22
Create Date: 2026-10-12 00:02:54.422655

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19a6b144ac96'
down_revision: Union[str, None] = ('015eba50c917', 'f41a0b7c9d22')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
