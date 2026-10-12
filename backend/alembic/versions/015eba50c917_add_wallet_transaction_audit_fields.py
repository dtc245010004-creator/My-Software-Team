"""add_wallet_transaction_audit_fields

Revision ID: 015eba50c917
Revises: 5f9249bf58da
Create Date: 2026-10-11 23:18:50.189455

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '015eba50c917'
down_revision: Union[str, None] = '5f9249bf58da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Thêm các cột cho wallet_transactions
    op.add_column('wallet_transactions', sa.Column('balance_before', sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column('wallet_transactions', sa.Column('reference_type', sa.String(length=50), nullable=True))
    op.add_column('wallet_transactions', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.add_column('wallet_transactions', sa.Column('receipt_code', sa.String(length=100), nullable=True))

    # 2. Tạo index duy nhất cho receipt_code
    op.create_index(
        op.f('ix_wallet_transactions_receipt_code'),
        'wallet_transactions',
        ['receipt_code'],
        unique=True,
    )

    # 3. Tạo foreign key nếu không phải SQLite (hoặc Postgres staging)
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        op.create_foreign_key(
            'fk_wallet_transactions_created_by_id_users',
            'wallet_transactions',
            'users',
            ['created_by_id'],
            ['id'],
            ondelete='SET NULL',
        )

    # 4. Backfill dữ liệu cũ
    op.execute(
        "UPDATE wallet_transactions SET balance_before = balance_after - amount WHERE balance_before IS NULL"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        op.drop_constraint('fk_wallet_transactions_created_by_id_users', 'wallet_transactions', type_='foreignkey')

    op.drop_index(op.f('ix_wallet_transactions_receipt_code'), table_name='wallet_transactions')
    op.drop_column('wallet_transactions', 'receipt_code')
    op.drop_column('wallet_transactions', 'created_by_id')
    op.drop_column('wallet_transactions', 'reference_type')
    op.drop_column('wallet_transactions', 'balance_before')
