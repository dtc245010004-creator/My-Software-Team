import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.services.compose_schema_service import upgrade_compose_sqlite_schema


def test_upgrades_existing_compose_sqlite_wallet_schema_idempotently():
    engine = create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE wallets "
                    "(id INTEGER PRIMARY KEY, balance NUMERIC NOT NULL)"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE wallet_transactions "
                    "(id INTEGER PRIMARY KEY, wallet_id INTEGER NOT NULL, "
                    "amount NUMERIC NOT NULL, transaction_type VARCHAR(20) NOT NULL, "
                    "reference_id VARCHAR(50))"
                )
            )
            connection.execute(
                text("INSERT INTO wallets (id, balance) VALUES (1, 1250)")
            )
            connection.execute(
                text(
                    "INSERT INTO wallet_transactions "
                    "(id, wallet_id, amount, transaction_type, reference_id) "
                    "VALUES (1, 1, 1250, 'TOPUP', 'existing-topup')"
                )
            )

        added = upgrade_compose_sqlite_schema(engine)
        assert "wallets.is_reconcile_locked" in added
        assert upgrade_compose_sqlite_schema(engine) == []

        inspector = inspect(engine)
        wallet_columns = {column["name"] for column in inspector.get_columns("wallets")}
        assert "is_reconcile_locked" in wallet_columns
        assert "uq_wallet_transactions_wallet_reference_type" in {
            index["name"] for index in inspector.get_indexes("wallet_transactions")
        }

        with engine.connect() as connection:
            wallet = connection.execute(
                text("SELECT balance, is_reconcile_locked FROM wallets WHERE id = 1")
            ).one()
            ledger_count = connection.execute(
                text("SELECT COUNT(*) FROM wallet_transactions")
            ).scalar_one()
        assert wallet == (1250, 0)
        assert ledger_count == 1

        with pytest.raises(IntegrityError, match="append-only"):
            with engine.begin() as connection:
                connection.execute(
                    text("UPDATE wallet_transactions SET amount = 0 WHERE id = 1")
                )

        with pytest.raises(IntegrityError, match="append-only"):
            with engine.begin() as connection:
                connection.execute(
                    text("DELETE FROM wallet_transactions WHERE id = 1")
                )
    finally:
        engine.dispose()
