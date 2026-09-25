"""add_station_fields

Revision ID: 98fa4a593c80
Revises: 98fa4a593c79
Create Date: 2026-09-24 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '98fa4a593c80'
down_revision: Union[str, Sequence[str], None] = '98fa4a593c79'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Thêm các trường còn thiếu cho bảng stations bằng batch_alter_table (tương thích SQLite & PostgreSQL)."""
    with op.batch_alter_table('stations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('address', sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column('latitude', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('longitude', sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column('is_active', sa.Boolean(), server_default=sa.false(), nullable=False),
        )
        batch_op.add_column(
            sa.Column('owner_id', sa.Integer(), nullable=True),
        )

        # Index
        batch_op.create_index('ix_stations_name', ['name'], unique=False)
        batch_op.create_index('ix_stations_owner_id', ['owner_id'], unique=False)
        batch_op.create_index('ix_stations_is_active', ['is_active'], unique=False)

        # Khóa ngoại & Ràng buộc duy nhất chống tạo trùng
        batch_op.create_foreign_key(
            'fk_stations_owner_id_users',
            'users',
            ['owner_id'],
            ['id'],
            ondelete='CASCADE',
        )
        batch_op.create_unique_constraint(
            'uix_stations_name_owner',
            ['name', 'owner_id'],
        )


def downgrade() -> None:
    """Thu hồi các trường đã thêm."""
    with op.batch_alter_table('stations', schema=None) as batch_op:
        batch_op.drop_constraint('uix_stations_name_owner', type_='unique')
        batch_op.drop_constraint('fk_stations_owner_id_users', type_='foreignkey')
        batch_op.drop_index('ix_stations_is_active')
        batch_op.drop_index('ix_stations_owner_id')
        batch_op.drop_index('ix_stations_name')
        batch_op.drop_column('owner_id')
        batch_op.drop_column('is_active')
        batch_op.drop_column('longitude')
        batch_op.drop_column('latitude')
        batch_op.drop_column('address')