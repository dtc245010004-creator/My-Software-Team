"""Add roles, persistent login throttling, and the initial connector status."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "f99adeda980d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("connectors") as batch_op:
        batch_op.drop_constraint("ck_connector_status_valid", type_="check")
        batch_op.create_check_constraint(
            "ck_connector_status_valid",
            "status IN ('UNKNOWN', 'AVAILABLE', 'OCCUPIED', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
        )
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=20),
            server_default="UNKNOWN",
        )

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_roles_code"),
    )
    op.create_index("ix_roles_id", "roles", ["id"])
    op.create_index("ix_roles_code", "roles", ["code"], unique=True)

    op.create_table(
        "user_roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )
    op.create_index("ix_user_roles_id", "user_roles", ["id"])
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])

    op.create_table(
        "login_throttles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("subject_type", sa.String(length=16), nullable=False),
        sa.Column("subject_hash", sa.String(length=64), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subject_type", "subject_hash", name="uq_login_throttle_subject"),
    )
    op.create_index("ix_login_throttles_id", "login_throttles", ["id"])

    roles = sa.table(
        "roles",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
    )
    op.bulk_insert(
        roles,
        [
            {"code": "CUSTOMER", "name": "Tài xế"},
            {"code": "STATION_OWNER", "name": "Chủ trạm"},
            {"code": "OPERATOR", "name": "Vận hành viên"},
            {"code": "ACCOUNTANT", "name": "Kế toán"},
            {"code": "ADMIN", "name": "Quản trị viên"},
        ],
    )

    users = sa.table("users", sa.column("id", sa.Integer()), sa.column("role", sa.String()))
    role_rows = sa.table("roles", sa.column("id", sa.Integer()), sa.column("code", sa.String()))
    assignments = sa.table(
        "user_roles",
        sa.column("user_id", sa.Integer()),
        sa.column("role_id", sa.Integer()),
    )
    op.get_bind().execute(
        assignments.insert().from_select(
            ["user_id", "role_id"],
            sa.select(users.c.id, role_rows.c.id).select_from(
                users.join(role_rows, users.c.role == role_rows.c.code)
            ),
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("connectors") as batch_op:
        batch_op.drop_constraint("ck_connector_status_valid", type_="check")
        batch_op.create_check_constraint(
            "ck_connector_status_valid",
            "status IN ('AVAILABLE', 'OCCUPIED', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
        )
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=20),
            server_default="AVAILABLE",
        )

    op.drop_index("ix_login_throttles_id", table_name="login_throttles")
    op.drop_table("login_throttles")
    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_index("ix_user_roles_id", table_name="user_roles")
    op.drop_table("user_roles")
    op.drop_index("ix_roles_code", table_name="roles")
    op.drop_index("ix_roles_id", table_name="roles")
    op.drop_table("roles")
