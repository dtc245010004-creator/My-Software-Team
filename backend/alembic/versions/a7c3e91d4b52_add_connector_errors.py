"""add connector_errors table

Revision ID: a7c3e91d4b52
Revises: 5ba0e05433d7
Create Date: 2026-10-04 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e91d4b52"
down_revision: str | None = "5ba0e05433d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "connector_errors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("connector_id", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(length=50), nullable=False),
        sa.Column("vendor_error_code", sa.String(length=50), nullable=True),
        sa.Column("info", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["connector_id"], ["connectors.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_connector_errors_id"), "connector_errors", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_connector_errors_connector_id"),
        "connector_errors",
        ["connector_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_connector_errors_connector_id"), table_name="connector_errors"
    )
    op.drop_index(op.f("ix_connector_errors_id"), table_name="connector_errors")
    op.drop_table("connector_errors")