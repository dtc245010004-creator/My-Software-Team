"""add_no_show_fee_to_stations_s50

Revision ID: ba39ce389c0d
Revises: 62f5133ffb8c
Create Date: 2026-10-13 23:51:02.108340

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba39ce389c0d'
down_revision: Union[str, None] = '62f5133ffb8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("stations") as batch_op:
        batch_op.add_column(
            sa.Column(
                "no_show_fee",
                sa.Numeric(precision=12, scale=2),
                nullable=False,
                server_default="20000.00",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("stations") as batch_op:
        batch_op.drop_column("no_show_fee")

