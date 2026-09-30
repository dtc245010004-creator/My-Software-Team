"""add_login_security_columns_to_users

Revision ID: 45fd43d6126c
Revises: bc3917d064b0
Create Date: 2026-09-23 00:51:16.042386

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '45fd43d6126c'
down_revision: Union[str, Sequence[str], None] = 'bc3917d064b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('failed_login_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_failed_ip', sa.String(length=45), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'last_failed_ip')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_count')
