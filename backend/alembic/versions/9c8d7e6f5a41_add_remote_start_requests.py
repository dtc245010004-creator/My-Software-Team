"""add remote start pending records
Revision ID: 9c8d7e6f5a41
Revises: 8b7c6d5e4f30
"""
from alembic import op
import sqlalchemy as sa
revision = "9c8d7e6f5a41"
down_revision = "8b7c6d5e4f30"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "remote_start_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connector_id", sa.Integer(), sa.ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id_tag", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("charging_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for name, cols in [("user_id", ["user_id"]),("connector_id",["connector_id"]),("status",["status"]),("transaction_id",["transaction_id"]),("expires_at",["expires_at"])]:
        op.create_index("ix_remote_start_requests_"+name, "remote_start_requests", cols)

def downgrade():
    for name in ["expires_at","transaction_id","status","connector_id","user_id"]:
        op.drop_index("ix_remote_start_requests_"+name, table_name="remote_start_requests")
    op.drop_table("remote_start_requests")
