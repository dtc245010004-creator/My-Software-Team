"""add reservations table for epic e-07 (s-48, s-49)

Revision ID: e07a1b2c3d4e
Revises: c316a2b4d6e8
Create Date: 2026-10-13 20:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e07a1b2c3d4e"
down_revision: str | None = "c316a2b4d6e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Tạo bảng reservations
    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("charge_point_id", sa.Integer(), nullable=False),
        sa.Column("connector_id", sa.Integer(), nullable=False),
        sa.Column("id_tag", sa.String(length=100), nullable=False),
        sa.Column(
            "start_time",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(length=50),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["charge_point_id"], ["charging_points.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["connector_id"], ["connectors.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_reservations_id"),
        "reservations",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservations_user_id"),
        "reservations",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservations_charge_point_id"),
        "reservations",
        ["charge_point_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservations_connector_id"),
        "reservations",
        ["connector_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservations_id_tag"),
        "reservations",
        ["id_tag"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservations_expiry_date"),
        "reservations",
        ["expiry_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reservations_status"),
        "reservations",
        ["status"],
        unique=False,
    )

    # Ràng buộc chống trùng ở DB (S-49 / R-03): Mỗi connector chỉ có 1 đặt chỗ ACTIVE tại một thời điểm
    op.create_index(
        "uq_active_reservation_per_connector",
        "reservations",
        ["connector_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE'"),
        sqlite_where=sa.text("status = 'ACTIVE'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_active_reservation_per_connector",
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_status"),
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_expiry_date"),
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_id_tag"),
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_connector_id"),
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_charge_point_id"),
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_user_id"),
        table_name="reservations",
    )
    op.drop_index(
        op.f("ix_reservations_id"),
        table_name="reservations",
    )
    op.drop_table("reservations")
