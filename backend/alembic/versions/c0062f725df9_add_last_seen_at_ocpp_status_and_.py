# Khôi phục lại các tệp bị gạch đỏ về trạng thái đúng
"""add_last_seen_at_ocpp_status_and_connector_errors

Revision ID: c0062f725df9
Revises: 
Create Date: 2026-09-30 22:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c0062f725df9'
down_revision: Union[str, None] = None  # Hoặc điền mã revision trước đó nếu có
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Thêm cột last_seen_at vào charging_points (Task T-19/T-20)
    op.add_column('charging_points', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))

    # 2. Thêm cột ocpp_status vào connectors (Task T-20)
    op.add_column('connectors', sa.Column('ocpp_status', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('connectors', 'ocpp_status')
    op.drop_column('charging_points', 'last_seen_at')