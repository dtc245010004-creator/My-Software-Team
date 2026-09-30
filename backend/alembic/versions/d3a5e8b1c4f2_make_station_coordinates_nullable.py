"""make_station_coordinates_nullable

Revision ID: d3a5e8b1c4f2
Revises: 149038e71dc9
Create Date: 2026-09-30 09:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3a5e8b1c4f2'
down_revision: Union[str, None] = '149038e71dc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('stations', schema=None) as batch_op:
        batch_op.alter_column('latitude', existing_type=sa.Float(), nullable=True)
        batch_op.alter_column('longitude', existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('stations', schema=None) as batch_op:
        batch_op.alter_column('latitude', existing_type=sa.Float(), nullable=False)
        batch_op.alter_column('longitude', existing_type=sa.Float(), nullable=False)
