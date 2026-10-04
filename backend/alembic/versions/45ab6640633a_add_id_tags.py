"""Thêm thẻ idTag OCPP để xác thực quyền sử dụng trụ sạc.

Revision ID: 45ab6640633a
Revises: 057c4ed34525
Create Date: 2026-10-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "45ab6640633a"
down_revision: Union[str, None] = "057c4ed34525"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "id_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'blocked')", name="ck_id_tag_status_valid"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_id_tags_code"), "id_tags", ["code"], unique=True)
    op.create_index(
        op.f("ix_id_tags_user_id"), "id_tags", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_id_tags_user_id"), table_name="id_tags")
    op.drop_index(op.f("ix_id_tags_code"), table_name="id_tags")
    op.drop_table("id_tags")
