"""make_station_operator_id_nullable

Revision ID: e4b6f9a2c1d3
Revises: d3a5e8b1c4f2
Create Date: 2026-09-30 10:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4b6f9a2c1d3'
down_revision: Union[str, None] = 'd3a5e8b1c4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('stations', schema=None) as batch_op:
        batch_op.alter_column('operator_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('stations', schema=None) as batch_op:
        batch_op.alter_column('operator_id', existing_type=sa.Integer(), nullable=False)
