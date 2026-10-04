"""Thêm các trường OCPP cho charging_sessions và bảng orphan_messages (Sprint 3: T-36, T-38).

Revision ID: e1f2a3b4c5d6
Revises: d40c66282f86
Create Date: 2026-10-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d40c66282f86"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Thêm các cột cho charging_sessions (Task T-36)
    with op.batch_alter_table("charging_sessions") as batch_op:
        batch_op.add_column(sa.Column("id_tag", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("stop_id_tag", sa.String(length=100), nullable=True))
        batch_op.add_column(
            sa.Column(
                "meter_start",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(sa.Column("meter_stop", sa.Integer(), nullable=True))
        batch_op.create_index("ix_charging_sessions_id_tag", ["id_tag"], unique=False)

    # 2. Tạo partial unique index chống cắm trùng cổng khi đang CHARGING (Task T-36)
    op.create_index(
        "uq_active_session_per_connector",
        "charging_sessions",
        ["connector_id"],
        unique=True,
        sqlite_where=sa.text("status = 'CHARGING'"),
        postgresql_where=sa.text("status = 'CHARGING'"),
    )

    # 3. Tạo bảng orphan_messages lưu trữ tin nhắn mồ côi (Task T-38)
    op.create_table(
        "orphan_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("charge_point_code", sa.String(length=100), nullable=False),
        sa.Column("message_id", sa.String(length=100), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False, server_default="StopTransaction"),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_orphan_messages_charge_point_code"),
        "orphan_messages",
        ["charge_point_code"],
        unique=False,
    )


def downgrade() -> None:
    # 1. Xóa bảng orphan_messages
    op.drop_index(
        op.f("ix_orphan_messages_charge_point_code"),
        table_name="orphan_messages",
    )
    op.drop_table("orphan_messages")

    # 2. Xóa index và các cột đã thêm trong charging_sessions
    op.drop_index("uq_active_session_per_connector", table_name="charging_sessions")
    with op.batch_alter_table("charging_sessions") as batch_op:
        batch_op.drop_index("ix_charging_sessions_id_tag")
        batch_op.drop_column("meter_stop")
        batch_op.drop_column("meter_start")
        batch_op.drop_column("stop_id_tag")
        batch_op.drop_column("id_tag")

