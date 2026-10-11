"""Persist immutable per-session billing segments.

Revision ID: 5ccaa686da2b
Revises: 37ff169ee686
Create Date: 2026-10-09
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "5ccaa686da2b"
down_revision: Union[str, None] = "37ff169ee686"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "session_billing_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("segment_date", sa.Date(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kwh", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("price_per_kwh", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("tariff_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["charging_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tariff_id"], ["tariffs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id", "segment_index", name="uq_session_billing_segment_session_index"
        ),
    )
    op.create_index(
        op.f("ix_session_billing_segments_session_id"),
        "session_billing_segments",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_session_billing_segments_tariff_id"),
        "session_billing_segments",
        ["tariff_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_session_billing_segments_tariff_id"), table_name="session_billing_segments"
    )
    op.drop_index(
        op.f("ix_session_billing_segments_session_id"), table_name="session_billing_segments"
    )
    op.drop_table("session_billing_segments")
