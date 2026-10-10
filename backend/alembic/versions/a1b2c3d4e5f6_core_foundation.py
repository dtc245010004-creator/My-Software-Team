"""Create the core EV CSMS tables needed by the application."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=100), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="CUSTOMER"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "wallets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("balance", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="VND"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("balance >= -1000000", name="ck_wallet_balance_max_debt"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_wallets_user_id"),
    )
    op.create_index("ix_wallets_id", "wallets", ["id"])
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"], unique=True)

    op.create_table(
        "stations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("operator_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("total_grid_capacity_kw", sa.Float(), nullable=False),
        sa.Column("operating_hours", sa.String(length=50), nullable=False, server_default="24/7"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("total_grid_capacity_kw > 0", name="ck_station_grid_capacity_positive"),
        sa.CheckConstraint("status IN ('ACTIVE', 'MAINTENANCE')", name="ck_station_status_valid"),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stations_id", "stations", ["id"])
    op.create_index("ix_stations_operator_id", "stations", ["operator_id"])

    op.create_table(
        "charging_points",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("vendor", sa.String(length=100), nullable=False, server_default="VinFast/ABB"),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("max_power_kw", sa.Float(), nullable=False),
        sa.Column("firmware_version", sa.String(length=50), nullable=True, server_default="1.0.0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="UNKNOWN"),
        sa.Column("power_sharing_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("max_power_kw > 0", name="ck_charger_max_power_positive"),
        sa.CheckConstraint(
            "status IN ('AVAILABLE', 'PREPARING', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
            name="ck_charger_status_valid",
        ),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_charging_points_code"),
    )
    op.create_index("ix_charging_points_id", "charging_points", ["id"])
    op.create_index("ix_charging_points_station_id", "charging_points", ["station_id"])
    op.create_index("ix_charging_points_code", "charging_points", ["code"], unique=True)

    op.create_table(
        "connectors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("charging_point_id", sa.Integer(), nullable=False),
        sa.Column("connector_number", sa.Integer(), nullable=False),
        sa.Column("connector_type", sa.String(length=20), nullable=False),
        sa.Column("max_power_kw", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="AVAILABLE"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("connector_number >= 1", name="ck_connector_number_positive"),
        sa.CheckConstraint("max_power_kw > 0", name="ck_connector_max_power_positive"),
        sa.CheckConstraint("connector_type IN ('CCS2', 'TYPE_2', 'CHADEMO')", name="ck_connector_type_valid"),
        sa.CheckConstraint(
            "status IN ('UNKNOWN', 'AVAILABLE', 'OCCUPIED', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
            name="ck_connector_status_valid",
        ),
        sa.ForeignKeyConstraint(["charging_point_id"], ["charging_points.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("charging_point_id", "connector_number", name="uq_charger_connector_number"),
    )
    op.create_index("ix_connectors_id", "connectors", ["id"])
    op.create_index("ix_connectors_charging_point_id", "connectors", ["charging_point_id"])

    op.create_table(
        "station_power_metrics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("power_kw", sa.Float(), nullable=False, server_default="0"),
        sa.Column("active_chargers_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("station_id", "timestamp", name="uq_station_minute_snapshot"),
    )
    op.create_index("ix_station_power_metrics_id", "station_power_metrics", ["id"])
    op.create_index("ix_station_power_metrics_station_id", "station_power_metrics", ["station_id"])
    op.create_index("ix_station_power_metrics_timestamp", "station_power_metrics", ["timestamp"])


def downgrade() -> None:
    op.drop_index("ix_station_power_metrics_timestamp", table_name="station_power_metrics")
    op.drop_index("ix_station_power_metrics_station_id", table_name="station_power_metrics")
    op.drop_index("ix_station_power_metrics_id", table_name="station_power_metrics")
    op.drop_table("station_power_metrics")
    op.drop_index("ix_connectors_charging_point_id", table_name="connectors")
    op.drop_index("ix_connectors_id", table_name="connectors")
    op.drop_table("connectors")
    op.drop_index("ix_charging_points_code", table_name="charging_points")
    op.drop_index("ix_charging_points_station_id", table_name="charging_points")
    op.drop_index("ix_charging_points_id", table_name="charging_points")
    op.drop_table("charging_points")
    op.drop_index("ix_stations_operator_id", table_name="stations")
    op.drop_index("ix_stations_id", table_name="stations")
    op.drop_table("stations")
    op.drop_index("ix_wallets_user_id", table_name="wallets")
    op.drop_index("ix_wallets_id", table_name="wallets")
    op.drop_table("wallets")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
