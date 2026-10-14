"""merge reservation and data erasure heads

Revision ID: 9ca7bc091ee2
Revises: 6e7b8d9f1023, e07a1b2c3d4e
Create Date: 2026-10-13 21:37:37.260753

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '9ca7bc091ee2'
down_revision: Union[str, None] = ('6e7b8d9f1023', 'e07a1b2c3d4e')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
