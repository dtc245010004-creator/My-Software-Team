"""add reconciliation periods, partner revenue share configs, and settlements for epic e-09 (s-54, s-55)

Revision ID: e09a1b2c3d4e
Revises: 9ca7bc091ee2, ba39ce389c0d
Create Date: 2026-10-14 09:15:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e09a1b2c3d4e"
down_revision: str | Sequence[str] | None = ("9ca7bc091ee2", "ba39ce389c0d")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Bảng partner_revenue_share_configs
    op.create_table(
        "partner_revenue_share_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("partner_id", sa.Integer(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=True),
        sa.Column("share_percentage", sa.Numeric(precision=5, scale=2), nullable=False, server_default="70.00"),
        sa.Column("include_idle_fee", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["partner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_partner_revenue_share_configs_id"),
        "partner_revenue_share_configs",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_partner_revenue_share_configs_partner_id"),
        "partner_revenue_share_configs",
        ["partner_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_partner_revenue_share_configs_station_id"),
        "partner_revenue_share_configs",
        ["station_id"],
        unique=False,
    )

    # 2. Bảng reconciliation_periods
    op.create_table(
        "reconciliation_periods",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("period_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("period_type", sa.String(length=20), nullable=False, server_default="month"),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="OPEN"),
        sa.Column("total_reconciled_revenue", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_partner_payout", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_platform_retained", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("closed_by_id", sa.Integer(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_by_id", sa.Integer(), nullable=True),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopen_reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["closed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reopened_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_code", name="uq_reconciliation_period_code"),
    )
    op.create_index(
        op.f("ix_reconciliation_periods_id"),
        "reconciliation_periods",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_periods_period_code"),
        "reconciliation_periods",
        ["period_code"],
        unique=True,
    )
    op.create_index(
        op.f("ix_reconciliation_periods_start_date"),
        "reconciliation_periods",
        ["start_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_periods_end_date"),
        "reconciliation_periods",
        ["end_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_periods_status"),
        "reconciliation_periods",
        ["status"],
        unique=False,
    )

    # 3. Bảng partner_settlements
    op.create_table(
        "partner_settlements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("period_id", sa.Integer(), nullable=False),
        sa.Column("partner_id", sa.Integer(), nullable=False),
        sa.Column("reconciled_revenue", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("share_percentage", sa.Numeric(precision=5, scale=2), nullable=False, server_default="70.00"),
        sa.Column("partner_payout_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("platform_retained_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_sessions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_kwh", sa.Numeric(precision=12, scale=3), nullable=False, server_default="0.000"),
        sa.Column("energy_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("idle_fee_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("include_idle_fee", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["partner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["period_id"], ["reconciliation_periods.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_id", "partner_id", name="uq_partner_settlement_period_partner"),
    )
    op.create_index(
        op.f("ix_partner_settlements_id"),
        "partner_settlements",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_partner_settlements_partner_id"),
        "partner_settlements",
        ["partner_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_partner_settlements_period_id"),
        "partner_settlements",
        ["period_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("partner_settlements")
    op.drop_table("reconciliation_periods")
    op.drop_table("partner_revenue_share_configs")
