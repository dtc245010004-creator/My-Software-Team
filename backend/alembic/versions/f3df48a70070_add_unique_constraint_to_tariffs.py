"""add_unique_constraint_to_tariffs

Revision ID: f3df48a70070
Revises: c316a2b4d6e8
Create Date: 2026-10-13 15:25:54.060842

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3df48a70070'
down_revision: Union[str, None] = 'c316a2b4d6e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    # 1. Deduplicate dữ liệu cũ nếu có: Giữ lại bản ghi có ID lớn nhất cho mỗi cặp (station_id, effective_from)
    # Lưu ý xử lý cả station_id IS NULL và station_id IS NOT NULL
    bind.execute(
        sa.text(
            """
            DELETE FROM tariffs
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM tariffs
                WHERE station_id IS NOT NULL
                GROUP BY station_id, effective_from
            )
            AND station_id IS NOT NULL
            """
        )
    )
    bind.execute(
        sa.text(
            """
            DELETE FROM tariffs
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM tariffs
                WHERE station_id IS NULL
                GROUP BY effective_from
            )
            AND station_id IS NULL
            """
        )
    )

    # 2. Tạo Unique Constraint và Unique Partial Index (dùng batch_alter_table cho tương thích SQLite)
    with op.batch_alter_table("tariffs", schema=None) as batch_op:
        batch_op.create_unique_constraint(
            "uq_tariffs_station_effective_from",
            ["station_id", "effective_from"],
        )
        batch_op.create_index(
            "uq_tariffs_global_effective_from",
            ["effective_from"],
            unique=True,
            sqlite_where=sa.text("station_id IS NULL"),
            postgresql_where=sa.text("station_id IS NULL"),
        )


def downgrade() -> None:
    with op.batch_alter_table("tariffs", schema=None) as batch_op:
        batch_op.drop_index("uq_tariffs_global_effective_from")
        batch_op.drop_constraint("uq_tariffs_station_effective_from", type_="unique")

