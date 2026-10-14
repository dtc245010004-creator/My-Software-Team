"""Add data erasure requests and durable anonymization marker.

Revision ID: cca26ecdf5a8
Revises: c316a2b4d6e8
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "cca26ecdf5a8"
down_revision: str | None = "c316a2b4d6e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("data_erased_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "data_erasure_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("block_reason", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')",
            name="ck_data_erasure_request_status_valid",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_data_erasure_requests_user_id",
        "data_erasure_requests",
        ["user_id"],
    )
    op.create_index(
        "ix_data_erasure_requests_status_requested",
        "data_erasure_requests",
        ["status", "requested_at"],
    )
    op.create_index(
        "uq_data_erasure_pending_user",
        "data_erasure_requests",
        ["user_id"],
        unique=True,
        sqlite_where=sa.text("status = 'PENDING'"),
        postgresql_where=sa.text("status = 'PENDING'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_data_erasure_pending_user", table_name="data_erasure_requests"
    )
    op.drop_index(
        "ix_data_erasure_requests_status_requested",
        table_name="data_erasure_requests",
    )
    op.drop_index(
        "ix_data_erasure_requests_user_id", table_name="data_erasure_requests"
    )
    op.drop_table("data_erasure_requests")
    op.drop_column("users", "data_erased_at")
