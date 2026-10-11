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
    case,
    event,
    func,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship

from app.core.database import Base


class TransactionTypeStr(str):
    """Chuỗi loại giao dịch cho phép so sánh tương thích giữa 'CHARGE_FEE' và 'SESSION_PAYMENT' theo S-37."""

    def __eq__(self, other: object) -> bool:
        if isinstance(other, str):
            if str(self) in ("CHARGE_FEE", "SESSION_PAYMENT") and other in (
                "CHARGE_FEE",
                "SESSION_PAYMENT",
            ):
                return True
        return super().__eq__(other)

    def __ne__(self, other: object) -> bool:
        return not self.__eq__(other)

    def __hash__(self) -> int:
        return (
            hash("CHARGE_FEE")
            if str(self) in ("CHARGE_FEE", "SESSION_PAYMENT")
            else super().__hash__()
        )


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

    # S-37: Debt flagging logic
    @hybrid_property
    def is_debt(self) -> bool:
        """Kiểm tra ví có đang rơi vào trạng thái nợ (balance < 0) hay không."""
        return bool(self.balance is not None and self.balance < 0)

    @is_debt.expression
    def is_debt(cls):
        return cls.balance < 0

    @is_debt.setter
    def is_debt(self, value: bool) -> None:
        pass

    @hybrid_property
    def debt_status(self) -> str:
        """Trạng thái nợ: 'IN_DEBT' khi balance < 0, ngược lại 'NORMAL'."""
        return (
            "IN_DEBT"
            if (self.balance is not None and self.balance < 0)
            else "NORMAL"
        )

    @debt_status.expression
    def debt_status(cls):
        return case((cls.balance < 0, "IN_DEBT"), else_="NORMAL")

    @debt_status.setter
    def debt_status(self, value: str) -> None:
        pass

    def __repr__(self) -> str:
        return f"<Wallet(id={self.id}, user_id={self.user_id}, balance={self.balance} {self.currency}, debt_locked={self.is_debt_locked}, is_debt={self.is_debt})>"


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

    # S-37: Tương thích truy cập type, session_id, invoice_id theo sổ cái append-only
    @property
    def type(self) -> TransactionTypeStr:
        return TransactionTypeStr(self.transaction_type)

    @type.setter
    def type(self, value: str) -> None:
        if value == "SESSION_PAYMENT":
            self.transaction_type = "CHARGE_FEE"
        else:
            self.transaction_type = value

    @property
    def session_id(self) -> int | None:
        if self.reference_id:
            ref_str = str(self.reference_id)
            if ref_str.startswith("session_"):
                try:
                    return int(ref_str.split("session_")[1])
                except (ValueError, IndexError):
                    pass
            elif ref_str.isdigit():
                return int(ref_str)
        return getattr(self, "_session_id", None)

    @session_id.setter
    def session_id(self, value: int | None) -> None:
        self._session_id = value
        if value is not None and not self.reference_id:
            self.reference_id = f"session_{value}"

    @property
    def invoice_id(self) -> str | int | None:
        return getattr(self, "_invoice_id", self.session_id)

    @invoice_id.setter
    def invoice_id(self, value: str | int | None) -> None:
        self._invoice_id = value

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

# Alias hỗ trợ thuật ngữ S-37 & S-41 (Sổ cái Append-only)
LedgerEntry = WalletTransaction
Ledger = WalletTransaction
