"""add charger_alerts and connector_errors composite index

Revision ID: c316a2b4d6e8
Revises: b311a1c2d3e4
Create Date: 2026-10-12 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c316a2b4d6e8"
down_revision: str | None = "b311a1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Tạo bảng charger_alerts
    op.create_table(
        "charger_alerts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("charging_point_id", sa.Integer(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("alert_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="OPEN", nullable=False),
        sa.Column("severity", sa.String(length=20), server_default="WARNING", nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("detail_info", sa.String(length=1000), nullable=True),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_reason", sa.String(length=255), nullable=True),
        sa.Column("resolved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["charging_point_id"], ["charging_points.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["station_id"], ["stations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_charger_alerts_id"),
        "charger_alerts",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_charger_alerts_charging_point_id"),
        "charger_alerts",
        ["charging_point_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_charger_alerts_station_id"),
        "charger_alerts",
        ["station_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_charger_alerts_status"),
        "charger_alerts",
        ["status"],
        unique=False,
    )

    # Ràng buộc chống trùng ở DB (SCRUM-318): Mỗi trụ chỉ có 1 cảnh báo OPEN cho mỗi loại
    op.create_index(
        "uq_charger_alert_open",
        "charger_alerts",
        ["charging_point_id", "alert_type"],
        unique=True,
        postgresql_where=sa.text("status = 'OPEN'"),
        sqlite_where=sa.text("status = 'OPEN'"),
    )

    # 2. Thêm composite index tối ưu hiệu năng cho connector_errors
    op.create_index(
        "ix_connector_errors_conn_created",
        "connector_errors",
        ["connector_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_connector_errors_conn_created",
        table_name="connector_errors",
    )
    op.drop_index(
        "uq_charger_alert_open",
        table_name="charger_alerts",
    )
    op.drop_index(
        op.f("ix_charger_alerts_status"),
        table_name="charger_alerts",
    )
    op.drop_index(
        op.f("ix_charger_alerts_station_id"),
        table_name="charger_alerts",
    )
    op.drop_index(
        op.f("ix_charger_alerts_charging_point_id"),
        table_name="charger_alerts",
    )
    op.drop_index(
        op.f("ix_charger_alerts_id"),
        table_name="charger_alerts",
    )
    op.drop_table("charger_alerts")
