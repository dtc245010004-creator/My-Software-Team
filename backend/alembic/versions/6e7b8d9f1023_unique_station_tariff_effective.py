"""Prevent duplicate station tariff versions at the same effective time.

Revision ID: 6e7b8d9f1023
Revises: cca26ecdf5a8
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "6e7b8d9f1023"
down_revision: Union[str, None] = "cca26ecdf5a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    duplicate = connection.execute(
        sa.text(
            """
            SELECT station_id, effective_from, COUNT(*) AS duplicate_count
            FROM tariffs
            WHERE station_id IS NOT NULL
            GROUP BY station_id, effective_from
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).first()
    if duplicate:
        raise RuntimeError(
            "Cannot add uq_tariffs_station_effective: duplicate station tariff "
            f"versions already exist for station_id={duplicate.station_id} at "
            f"effective_from={duplicate.effective_from}. Resolve these records "
            "explicitly before retrying the migration."
        )

    op.create_unique_constraint(
        "uq_tariffs_station_effective",
        "tariffs",
        ["station_id", "effective_from"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_tariffs_station_effective", "tariffs", type_="unique"
    )
