from sqlalchemy import (
    DDL,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    event,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class Wallet(Base):
    """Mô hình ví điện tử người dùng (Hỗ trợ nợ đến hạn mức an toàn, ACID)."""

    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("balance >= -500000", name="ck_wallet_balance_max_debt"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    balance = Column(Numeric(12, 2), default=0.00, nullable=False)
    currency = Column(String(10), default="VND", nullable=False)
    is_debt_locked = Column(
        Boolean, default=False, nullable=False
    )  # Bị khóa nợ nếu âm quá hạn mức
    is_reconcile_locked = Column(
        Boolean, default=False, nullable=False
    )  # Khóa giao dịch khi số dư không khớp sổ cái
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Quan hệ
    user = relationship("User", back_populates="wallet")
    transactions = relationship(
        "WalletTransaction",
        back_populates="wallet",
        cascade="all, delete-orphan",
        order_by="WalletTransaction.id.desc()",
    )

    def __repr__(self) -> str:
        return f"<Wallet(id={self.id}, user_id={self.user_id}, balance={self.balance} {self.currency}, debt_locked={self.is_debt_locked})>"


class WalletTransaction(Base):
    """Mô hình nhật ký biến động số dư ví (Đối soát minh bạch)."""

    __tablename__ = "wallet_transactions"
    __table_args__ = (
        CheckConstraint(
            "transaction_type IN ('TOPUP', 'CHARGE_FEE', 'REFUND')",
            name="ck_wallet_transaction_type_valid",
        ),
        Index(
            "uq_wallet_transactions_wallet_reference_type",
            "wallet_id",
            "reference_id",
            "transaction_type",
            unique=True,
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    wallet_id = Column(
        Integer,
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount = Column(
        Numeric(12, 2), nullable=False
    )  # Số tiền biến động (+ nạp, - trừ cước)
    transaction_type = Column(String(20), nullable=False)  # TOPUP, CHARGE_FEE, REFUND
    balance_after = Column(Numeric(12, 2), nullable=False)
    reference_id = Column(String(50), nullable=True)  # Mã tham chiếu (VD: session_123)
    note = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Quan hệ
    wallet = relationship("Wallet", back_populates="transactions")

    def __repr__(self) -> str:
        return f"<WalletTransaction(id={self.id}, wallet_id={self.wallet_id}, type='{self.transaction_type}', amount={self.amount})>"


# Compose và các test SQLite khởi tạo schema bằng Base.metadata.create_all();
# cài trigger tại thời điểm tạo bảng để các đường này cũng giữ append-only.
event.listen(
    WalletTransaction.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER IF NOT EXISTS trg_wallet_transactions_no_update
        BEFORE UPDATE ON wallet_transactions
        BEGIN
            SELECT RAISE(ABORT, 'wallet_transactions is append-only');
        END;
        """
    ).execute_if(dialect="sqlite"),
)
event.listen(
    WalletTransaction.__table__,
    "after_create",
    DDL(
        """
        CREATE OR REPLACE FUNCTION wallet_transactions_immutable()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'wallet_transactions is append-only: UPDATE/DELETE is forbidden';
        END;
        $$ LANGUAGE plpgsql;
        """
    ).execute_if(dialect="postgresql"),
)
event.listen(
    WalletTransaction.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER trg_wallet_transactions_immutable
        BEFORE UPDATE OR DELETE ON wallet_transactions
        FOR EACH ROW EXECUTE FUNCTION wallet_transactions_immutable();
        """
    ).execute_if(dialect="postgresql"),
)
event.listen(
    WalletTransaction.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER IF NOT EXISTS trg_wallet_transactions_no_delete
        BEFORE DELETE ON wallet_transactions
        BEGIN
            SELECT RAISE(ABORT, 'wallet_transactions is append-only');
        END;
        """
    ).execute_if(dialect="sqlite"),
)
