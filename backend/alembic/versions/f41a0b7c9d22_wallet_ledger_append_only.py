"""Add wallet reconciliation lock, reference idempotency, and immutable ledger.

Revision ID: f41a0b7c9d22
Revises: e72b461d9ac3
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f41a0b7c9d22"
down_revision: Union[str, None] = "e72b461d9ac3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in inspector.get_columns(table_name)
    )


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    duplicate = bind.execute(
        sa.text(
            """
            SELECT wallet_id, reference_id, transaction_type, COUNT(*) AS row_count
            FROM wallet_transactions
            WHERE reference_id IS NOT NULL
            GROUP BY wallet_id, reference_id, transaction_type
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).first()
    if duplicate:
        raise RuntimeError(
            "wallet_transactions contains duplicate (wallet_id, reference_id, "
            f"transaction_type) rows: {tuple(duplicate)}. Resolve duplicates before migration."
        )

    inspector = sa.inspect(bind)
    if not _has_column(inspector, "wallets", "is_reconcile_locked"):
        op.add_column(
            "wallets",
            sa.Column(
                "is_reconcile_locked",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            ),
        )
    if not _has_index(
        inspector,
        "wallet_transactions", "uq_wallet_transactions_wallet_reference_type"
    ):
        op.create_index(
            "uq_wallet_transactions_wallet_reference_type",
            "wallet_transactions",
            ["wallet_id", "reference_id", "transaction_type"],
            unique=True,
        )

    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute(
            """
            CREATE OR REPLACE FUNCTION wallet_transactions_immutable()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'wallet_transactions is append-only: UPDATE/DELETE is forbidden';
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            "DROP TRIGGER IF EXISTS trg_wallet_transactions_immutable ON wallet_transactions"
        )
        op.execute(
            """
            CREATE TRIGGER trg_wallet_transactions_immutable
            BEFORE UPDATE OR DELETE ON wallet_transactions
            FOR EACH ROW EXECUTE FUNCTION wallet_transactions_immutable();
            """
        )

        # Revoke write privileges for the configured DB login when it exists.
        # Triggers remain the enforcement layer for owners/superusers as well.
        app_role = bind.engine.url.username
        if app_role and bind.execute(
            sa.text("SELECT 1 FROM pg_roles WHERE rolname = :role"),
            {"role": app_role},
        ).scalar():
            quoted_role = bind.dialect.identifier_preparer.quote(app_role)
            op.execute(
                f"REVOKE UPDATE, DELETE ON TABLE wallet_transactions FROM {quoted_role}"
            )
    elif dialect == "sqlite":
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_wallet_transactions_no_update
            BEFORE UPDATE ON wallet_transactions
            BEGIN
                SELECT RAISE(ABORT, 'wallet_transactions is append-only');
            END;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_wallet_transactions_no_delete
            BEFORE DELETE ON wallet_transactions
            BEGIN
                SELECT RAISE(ABORT, 'wallet_transactions is append-only');
            END;
            """
        )
    else:
        raise RuntimeError(
            f"Wallet ledger immutability is not configured for {dialect}."
        )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS trg_wallet_transactions_immutable ON wallet_transactions"
        )
        op.execute("DROP FUNCTION IF EXISTS wallet_transactions_immutable()")
    elif dialect == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS trg_wallet_transactions_no_delete")
        op.execute("DROP TRIGGER IF EXISTS trg_wallet_transactions_no_update")

    inspector = sa.inspect(op.get_bind())
    if _has_index(
        inspector,
        "wallet_transactions", "uq_wallet_transactions_wallet_reference_type"
    ):
        op.drop_index(
            "uq_wallet_transactions_wallet_reference_type",
            table_name="wallet_transactions",
        )
    if _has_column(inspector, "wallets", "is_reconcile_locked"):
        op.drop_column("wallets", "is_reconcile_locked")
