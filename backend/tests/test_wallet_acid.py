from decimal import Decimal
import pytest
from fastapi import HTTPException
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services.wallet_service import (
    deduct_charging_fee,
    get_or_create_wallet,
    topup_wallet,
)


@pytest.fixture
def wallet_users(db_session):
    """Fixture tạo các user và ví phục vụ test giao dịch ACID."""
    u1 = User(
        username="acid_user1",
        email="acid1@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    u2 = User(
        username="acid_user2",
        email="acid2@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([u1, u2])
    db_session.commit()

    w1 = Wallet(user_id=u1.id, balance=Decimal("100000.00"), is_debt_locked=False)
    w2 = Wallet(user_id=u2.id, balance=Decimal("20000.00"), is_debt_locked=False)
    db_session.add_all([w1, w2])
    db_session.commit()

    return {"u1": u1, "u2": u2, "w1": w1, "w2": w2}


class TestWalletServiceACID:
    """Kiểm thử tính toàn vẹn ACID của tầng nghiệp vụ Ví điện tử."""

    def test_topup_wallet_success(self, db_session, wallet_users):
        """1. Nạp tiền vào ví: số dư tăng chính xác và sinh bản ghi WalletTransaction."""
        u1 = wallet_users["u1"]
        topup_amt = Decimal("50000.00")

        w = topup_wallet(
            db=db_session,
            user_id=u1.id,
            amount=topup_amt,
            note="Nạp tiền test qua cổng ngân hàng",
        )

        assert w.balance == Decimal("150000.00")

        # Kiểm tra giao dịch transaction đã lưu
        tx = (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.wallet_id == w.id)
            .order_by(WalletTransaction.id.desc())
            .first()
        )
        assert tx is not None
        assert tx.transaction_type == "TOPUP"
        assert tx.amount == topup_amt
        assert tx.balance_after == Decimal("150000.00")

    def test_deduct_fee_with_sufficient_balance(self, db_session, wallet_users):
        """2. Trừ cước sạc khi số dư đủ: trừ chính xác và ghi nhận giao dịch CHARGE_FEE."""
        u1 = wallet_users["u1"]
        fee = Decimal("40000.00")

        w, tx, debt_locked = deduct_charging_fee(
            db=db_session,
            user_id=u1.id,
            session_id=101,
            amount=fee,
        )

        assert w.balance == Decimal("60000.00")
        assert debt_locked is False
        assert tx.transaction_type == "CHARGE_FEE"
        assert tx.amount == -fee
        assert tx.balance_after == Decimal("60000.00")
        assert tx.reference_id == "session_101"

    def test_deduct_fee_allows_debt_within_limit(self, db_session, wallet_users):
        """3. Trừ cước vượt quá số dư nhưng trong hạn mức cho nợ (-300,000 VND)."""
        u2 = wallet_users["u2"]  # balance = 20,000 VND
        fee = Decimal("120000.00")  # balance_after = -100,000 VND >= -300,000 VND

        w, tx, debt_locked = deduct_charging_fee(
            db=db_session,
            user_id=u2.id,
            session_id=102,
            amount=fee,
        )

        assert w.balance == Decimal("-100000.00")
        assert debt_locked is False  # Chưa vượt -300k
        assert tx.balance_after == Decimal("-100000.00")

    def test_deduct_fee_exceeding_debt_limit_triggers_debt_lock(self, db_session, wallet_users):
        """4. Trừ cước vượt quá hạn mức nợ (-300,000 VND) -> Cho trừ hết số điện nhưng kích hoạt khóa nợ."""
        u2 = wallet_users["u2"]  # balance = 20,000 VND
        fee = Decimal("350000.00")  # balance_after = -330,000 VND < -300,000 VND

        w, tx, debt_locked = deduct_charging_fee(
            db=db_session,
            user_id=u2.id,
            session_id=103,
            amount=fee,
        )

        assert w.balance == Decimal("-330000.00")
        assert debt_locked is True
        assert w.is_debt_locked is True
        assert "khóa nợ" in tx.note.lower()

    def test_topup_clears_debt_lock_when_positive(self, db_session, wallet_users):
        """5. Nạp tiền trả nợ đưa số dư >= 0 -> Tự động giải phóng khóa nợ."""
        u2 = wallet_users["u2"]
        # Đưa ví vào trạng thái nợ sâu
        w, _, _ = deduct_charging_fee(
            db=db_session,
            user_id=u2.id,
            session_id=104,
            amount=Decimal("350000.00"),
        )
        assert w.is_debt_locked is True

        # Nạp tiền trả nợ đưa số dư về dương
        w_cleared = topup_wallet(
            db=db_session,
            user_id=u2.id,
            amount=Decimal("400000.00"),
            note="Nạp tiền trả nợ cước sạc",
        )
        assert w_cleared.balance == Decimal("70000.00")  # -330k + 400k = +70k
        assert w_cleared.is_debt_locked is False
