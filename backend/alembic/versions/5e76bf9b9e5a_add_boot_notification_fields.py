"""Add OCPP 1.6J BootNotification metadata and online status."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5e76bf9b9e5a"
down_revision: Union[str, None] = "f2c9a6d81b40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("charging_points") as batch_op:
        batch_op.add_column(
            sa.Column("charge_point_vendor", sa.String(100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("charge_point_model_name", sa.String(100), nullable=True)
        )
        batch_op.drop_constraint("ck_charger_status_valid", type_="check")
        batch_op.create_check_constraint(
            "ck_charger_status_valid",
            "status IN ('AVAILABLE', 'PREPARING', 'CHARGING', 'FAULTED', "
            "'UNAVAILABLE', 'online')",
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE charging_points SET status = 'AVAILABLE' WHERE status = 'online'"
        )
    )
    with op.batch_alter_table("charging_points") as batch_op:
        batch_op.drop_constraint("ck_charger_status_valid", type_="check")
        batch_op.create_check_constraint(
            "ck_charger_status_valid",
            "status IN ('AVAILABLE', 'PREPARING', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
        )
        batch_op.drop_column("charge_point_model_name")
        batch_op.drop_column("charge_point_vendor")
