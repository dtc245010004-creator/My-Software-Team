"""Nâng bổ sung schema SQLite cũ cho stack Compose phát triển."""

from sqlalchemy import Engine, inspect, text

SQLITE_COLUMN_ADDITIONS = {
    "wallets": {
        "is_reconcile_locked": "BOOLEAN NOT NULL DEFAULT 0",
    },
    "tariffs": {
        "effective_from": "DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00+00'",
        "idle_fee_per_minute": (
            "NUMERIC(10, 2) NOT NULL DEFAULT 0 "
            "CONSTRAINT ck_tariff_idle_fee_non_negative "
            "CHECK (idle_fee_per_minute >= 0)"
        ),
        "idle_grace_minutes": (
            "INTEGER NOT NULL DEFAULT 0 "
            "CONSTRAINT ck_tariff_idle_grace_non_negative "
            "CHECK (idle_grace_minutes >= 0)"
        ),
    },
    "connectors": {
        "status_changed_at": "DATETIME",
        "idle_started_at": "DATETIME",
        "idle_ended_at": "DATETIME",
    },
    "charging_sessions": {
        "idle_amount": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
        "idle_chargeable_minutes": "INTEGER NOT NULL DEFAULT 0",
        "idle_fee_per_minute_applied": "NUMERIC(10, 2)",
        "idle_grace_minutes_applied": "INTEGER",
    },
}


def upgrade_compose_sqlite_schema(engine: Engine) -> list[str]:
    """Bổ sung schema Compose còn thiếu mà không đổi số dư hoặc dòng ledger cũ."""
    if engine.dialect.name != "sqlite":
        return []

    added_columns: list[str] = []
    with engine.begin() as connection:
        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())

        for table_name, columns in SQLITE_COLUMN_ADDITIONS.items():
            if table_name not in existing_tables:
                continue

            existing_columns = {
                column["name"] for column in inspector.get_columns(table_name)
            }
            for column_name, definition in columns.items():
                if column_name in existing_columns:
                    continue

                connection.execute(
                    text(
                        f'ALTER TABLE "{table_name}" ADD COLUMN '
                        f'"{column_name}" {definition}'
                    )
                )
                existing_columns.add(column_name)
                added_columns.append(f"{table_name}.{column_name}")

        if "tariffs" in existing_tables and "effective_from" in {
            column["name"] for column in inspect(connection).get_columns("tariffs")
        }:
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_tariffs_effective_from "
                    "ON tariffs (effective_from)"
                )
            )

        if "wallet_transactions" in existing_tables:
            index_names = {
                index["name"]
                for index in inspect(connection).get_indexes("wallet_transactions")
            }
            if "uq_wallet_transactions_wallet_reference_type" not in index_names:
                connection.execute(
                    text(
                        "CREATE UNIQUE INDEX "
                        "uq_wallet_transactions_wallet_reference_type "
                        "ON wallet_transactions "
                        "(wallet_id, reference_id, transaction_type)"
                    )
                )

            connection.execute(
                text(
                    """
                    CREATE TRIGGER IF NOT EXISTS trg_wallet_transactions_no_update
                    BEFORE UPDATE ON wallet_transactions
                    BEGIN
                        SELECT RAISE(ABORT, 'wallet_transactions is append-only');
                    END;
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE TRIGGER IF NOT EXISTS trg_wallet_transactions_no_delete
                    BEFORE DELETE ON wallet_transactions
                    BEGIN
                        SELECT RAISE(ABORT, 'wallet_transactions is append-only');
                    END;
                    """
                )
            )

    return added_columns
