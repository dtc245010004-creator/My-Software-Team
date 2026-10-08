"""Harden audit_logs as append-only at database level.

Revision ID: ab12cd34ef56
Revises: 9c8d7e6f5a41
"""
from alembic import op

revision = "ab12cd34ef56"
down_revision = "9c8d7e6f5a41"
branch_labels = None
depends_on = None


def upgrade():
    # Trigger prevents UPDATE/DELETE even if an application endpoint
    # is accidentally added later. INSERT/SELECT remain available normally.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("""
            CREATE OR REPLACE FUNCTION audit_logs_immutable()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'audit_logs is append-only: UPDATE/DELETE is forbidden';
            END;
            $$ LANGUAGE plpgsql;
        """)
        op.execute("""
            CREATE TRIGGER trg_audit_logs_immutable
            BEFORE UPDATE OR DELETE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
        """)
    elif bind.dialect.name == "sqlite":
        op.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is append-only: UPDATE is forbidden');
            END;
        """)
        op.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is append-only: DELETE is forbidden');
            END;
        """)


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;")
        op.execute("DROP FUNCTION IF EXISTS audit_logs_immutable();")
    elif bind.dialect.name == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS trg_audit_logs_no_update;")
        op.execute("DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;")
