"""Add persistent idempotency storage for OCPP CALL messages.

Revision ID: 057c4ed34525
Revises: 5e76bf9b9e5a
Create Date: 2026-10-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "057c4ed34525"
down_revision: Union[str, None] = "5e76bf9b9e5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ocpp_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("charge_point_code", sa.String(length=50), nullable=False),
        sa.Column("message_id", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("response_payload", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "charge_point_code",
            "message_id",
            name="uq_ocpp_message_charge_point_message",
        ),
    )
    op.create_index(
        op.f("ix_ocpp_messages_charge_point_code"),
        "ocpp_messages",
        ["charge_point_code"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ocpp_messages_charge_point_code"), table_name="ocpp_messages"
    )
    op.drop_table("ocpp_messages")
