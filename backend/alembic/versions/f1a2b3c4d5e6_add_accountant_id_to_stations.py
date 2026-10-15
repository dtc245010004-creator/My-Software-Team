"""add accountant_id to stations

Revision ID: f1a2b3c4d5e6
Revises: e07a1b2c3d4e
Create Date: 2026-10-15 14:40:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e07a1b2c3d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("stations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("accountant_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_stations_accountant_id", ["accountant_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_stations_accountant_id_users",
            "users",
            ["accountant_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("stations", schema=None) as batch_op:
        batch_op.drop_constraint("fk_stations_accountant_id_users", type_="foreignkey")
        batch_op.drop_index("ix_stations_accountant_id")
        batch_op.drop_column("accountant_id")

