"""add audit_logs append-only table

Revision ID: 8b7c6d5e4f30
Revises: c4ab19f2d7e1
"""
from alembic import op
import sqlalchemy as sa

revision = "8b7c6d5e4f30"
down_revision = "c4ab19f2d7e1"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("object_type", sa.String(100), nullable=False),
        sa.Column("object_id", sa.String(100), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_user_created_at", "audit_logs", ["user_id", "created_at"])
    op.create_index("ix_audit_logs_object_created_at", "audit_logs", ["object_type", "object_id", "created_at"])

def downgrade():
    op.drop_index("ix_audit_logs_object_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")
