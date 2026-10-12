from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from threading import Barrier
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from app.core.database import engine
from app.core.security import get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Ledger, LedgerEntry, Wallet, WalletTransaction
from app.services.session_service import stop_charging_session
from app.services.wallet_service import (
    auto_deduct_session_payment,
    reconcile_wallet_ledger,
    topup_wallet,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def env_s37(db_session):
    """Fixture tạo người dùng, hạ tầng trụ sạc, biểu giá và ví điện tử chuẩn cho S-37."""
    cpo = User(
        username="cpo_s37",
        email="cpo_s37@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_s37",
        email="driver_s37@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([cpo, driver])
    db_session.flush()

    wallet = Wallet(
        user_id=driver.id,
        balance=Decimal("0.00"),
        is_debt_locked=False,
        is_reconcile_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()

    wallet = topup_wallet(db_session, driver.id, Decimal("100000.00"), note="Số dư khởi tạo S37")

    tariff = Tariff(
        station_id=None,
        name="Biểu giá S37",
        price_normal=Decimal("3500.00"),
        price_peak=Decimal("3500.00"),
        price_offpeak=Decimal("3500.00"),
        is_active=True,
        effective_from=datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add(tariff)
    db_session.flush()

    st = Station(
        operator_id=cpo.id,
        name="Trạm Sạc S37",
        address="123 Đường Sạc Nhanh",
        latitude=10.75,
        longitude=106.68,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.flush()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-S37-01",
        vendor="ABB",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.flush()

    conn1 = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    conn2 = Connector(
        charging_point_id=cp.id,
        connector_number=2,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    return {
        "cpo": cpo,
        "driver": driver,
        "wallet": wallet,
        "tariff": tariff,
        "cp": cp,
        "conn1": conn1,
        "conn2": conn2,
    }


def _create_active_session(
    db, driver: User, conn: Connector, tariff: Tariff, meter_start: Decimal = Decimal("10.00")
) -> ChargingSession:
    """Tạo một phiên sạc ở trạng thái ACTIVE."""
    sess = ChargingSession(
        user_id=driver.id,
        connector_id=conn.id,
        tariff_id=tariff.id,
        status="ACTIVE",
        meter_start_kwh=meter_start,
        total_kwh=Decimal("0.00"),
        applied_price_per_kwh=tariff.price_normal,
        start_time=datetime.now(timezone.utc),
    )
    db.add(sess)
    conn.status = "CHARGING"
    db.commit()
    db.refresh(sess)
    return sess


class TestAutoWalletDeductionS37:
    """Bộ kiểm thử nghiệp vụ User Story S-37: Trừ ví tự động khi chốt phiên sạc."""

    def test_01_normal_session_deducts_exact_invoice_and_creates_ledger_entry(
        self, db_session, env_s37
    ):
        """AC 1: Phiên kết thúc bình thường, trừ đúng tiền hóa đơn và ghi sổ cái append-only."""
        driver = env_s37["driver"]
        conn = env_s37["conn1"]
        tariff = env_s37["tariff"]
        wallet = env_s37["wallet"]

        initial_balance = wallet.balance  # 100,000 VND
        sess = _create_active_session(db_session, driver, conn, tariff, meter_start=Decimal("100.00"))

        # Tiêu thụ 10 kWh: meter_stop = 110.00 kWh -> cước = 10 * 3500 = 35,000 VND
        stop_kwh = Decimal("110.00")
        expected_invoice = Decimal("35000.00")

        completed_sess = stop_charging_session(
            db=db_session,
            user=driver,
            session_id=sess.id,
            meter_stop_kwh=stop_kwh,
        )

        assert completed_sess.status == "COMPLETED"
        assert completed_sess.total_amount == expected_invoice

        # 1. Kiểm tra số dư ví bị trừ chính xác
        db_session.refresh(wallet)
        expected_balance = initial_balance - expected_invoice
        assert wallet.balance == expected_balance
        assert wallet.is_debt is False
        assert wallet.debt_status == "NORMAL"

        # 2. Kiểm tra bản ghi sổ cái (WalletTransaction / LedgerEntry)
        tx = (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.wallet_id == wallet.id, WalletTransaction.reference_id == f"session_{sess.id}")
            .one()
        )
        assert tx.amount == -expected_invoice
        assert tx.balance_after == expected_balance
        assert tx.transaction_type == "CHARGE_FEE"
        assert tx.type == "SESSION_PAYMENT"
        assert tx.type == "CHARGE_FEE"
        assert tx.session_id == sess.id
        assert tx.invoice_id == sess.id

        # 3. Đối soát sổ cái khớp tuyệt đối
        reconciliation = reconcile_wallet_ledger(db_session)
        assert reconciliation["mismatched"] == 0

    def test_02_concurrency_two_simultaneous_sessions_same_driver(
        self, db_session, env_s37
    ):
        """AC 2: Xử lý đồng thời 2 phiên sạc của cùng 1 tài xế kết thúc cùng lúc.
        Số dư cuối = Số dư đầu - (Hóa đơn 1 + Hóa đơn 2).
        """
        driver = env_s37["driver"]
        conn1 = env_s37["conn1"]
        conn2 = env_s37["conn2"]
        tariff = env_s37["tariff"]
        wallet = env_s37["wallet"]

        initial_balance = wallet.balance  # 100,000 VND
        sess1 = _create_active_session(db_session, driver, conn1, tariff, meter_start=Decimal("0.00"))
        sess2 = _create_active_session(db_session, driver, conn2, tariff, meter_start=Decimal("0.00"))

        amt1 = Decimal("30000.00")
        amt2 = Decimal("45000.00")
        barrier = Barrier(2)

        def worker(session_id: int, invoice_amount: Decimal):
            with TestingSessionLocal() as db:
                s = db.get(ChargingSession, session_id)
                barrier.wait(timeout=10)
                auto_deduct_session_payment(db, s, invoice_amount=invoice_amount)
                s.status = "COMPLETED"
                s.total_amount = invoice_amount
                db.commit()

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(worker, sess1.id, amt1)
            fut2 = executor.submit(worker, sess2.id, amt2)
            fut1.result(timeout=30)
            fut2.result(timeout=30)

        # Kiểm tra sau khi cả 2 giao dịch đồng thời hoàn tất
        db_session.expire_all()
        refreshed_wallet = db_session.get(Wallet, wallet.id)
        expected_balance = initial_balance - (amt1 + amt2)  # 100,000 - 75,000 = 25,000 VND
        assert refreshed_wallet.balance == expected_balance

        # Cả 2 dòng sổ cái đều phải tồn tại đầy đủ
        tx_rows = (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.wallet_id == wallet.id, WalletTransaction.transaction_type == "CHARGE_FEE")
            .all()
        )
        assert len(tx_rows) == 2
        ref_ids = {r.reference_id for r in tx_rows}
        assert ref_ids == {f"session_{sess1.id}", f"session_{sess2.id}"}

        # Đối soát sổ cái khớp tổng số dư
        reconciliation = reconcile_wallet_ledger(db_session)
        assert reconciliation["mismatched"] == 0

    def test_03_insufficient_balance_allows_debt_and_flags_is_debt(
        self, db_session, env_s37
    ):
        """AC 3: Khi ví không đủ tiền, hệ thống vẫn trừ để rơi vào số dư âm và gắn cờ nợ (is_debt=True)."""
        driver = env_s37["driver"]
        conn = env_s37["conn1"]
        tariff = env_s37["tariff"]
        wallet = env_s37["wallet"]

        # Thiết lập số dư nhỏ (20,000 VND)
        wallet.balance = Decimal("20000.00")
        db_session.commit()

        sess = _create_active_session(db_session, driver, conn, tariff, meter_start=Decimal("0.00"))
        invoice_amt = Decimal("70000.00")  # Cước 70,000 VND -> thiếu 50,000 VND

        w, tx, debt_locked = auto_deduct_session_payment(
            db=db_session, session=sess, invoice_amount=invoice_amt
        )
        db_session.commit()

        assert w.balance == Decimal("-50000.00")
        assert w.is_debt is True
        assert w.debt_status == "IN_DEBT"
        assert debt_locked is False  # Chưa vượt giới hạn khoá nợ cứng (-300,000 VND)

        # Kiểm tra truy vấn CSDL bằng filter hybrid_property
        debt_wallets = db_session.query(Wallet).filter(Wallet.is_debt.is_(True)).all()
        assert w in debt_wallets

        debt_status_wallets = (
            db_session.query(Wallet).filter(Wallet.debt_status == "IN_DEBT").all()
        )
        assert w in debt_status_wallets

    def test_04_topup_repayment_automatically_clears_debt_flag(
        self, db_session, env_s37
    ):
        """AC 4: Khi nạp bù tiền đưa số dư trở lại >= 0, trạng thái nợ tự động được gỡ bỏ (is_debt=False)."""
        driver = env_s37["driver"]
        wallet = env_s37["wallet"]

        # Cho ví nợ -50,000 VND
        wallet.balance = Decimal("-50000.00")
        db_session.commit()
        assert wallet.is_debt is True
        assert wallet.debt_status == "IN_DEBT"

        # 1. Nạp chưa đủ xóa nợ (nạp 30,000 VND -> còn âm 20,000 VND)
        topup_wallet(db_session, driver.id, Decimal("30000.00"), note="Nạp trả nợ đợt 1")
        db_session.refresh(wallet)
        assert wallet.balance == Decimal("-20000.00")
        assert wallet.is_debt is True
        assert wallet.debt_status == "IN_DEBT"

        # 2. Nạp tiếp 50,000 VND -> dương 30,000 VND (>= 0)
        topup_wallet(db_session, driver.id, Decimal("50000.00"), note="Nạp trả nợ đợt 2")
        db_session.refresh(wallet)
        assert wallet.balance == Decimal("30000.00")
        assert wallet.is_debt is False
        assert wallet.debt_status == "NORMAL"

        # 3. Thử nghiệm biên: nạp vừa khít số dư = 0.00 VND
        wallet.balance = Decimal("-10000.00")
        db_session.commit()
        assert wallet.is_debt is True

        topup_wallet(db_session, driver.id, Decimal("10000.00"), note="Nạp vừa khít")
        db_session.refresh(wallet)
        assert wallet.balance == Decimal("0.00")
        assert wallet.is_debt is False
        assert wallet.debt_status == "NORMAL"

    def test_05_idempotency_prevents_duplicate_charge_on_retries(
        self, db_session, env_s37
    ):
        """AC 5: Không bao giờ trừ tiền 2 lần cho cùng một phiên sạc khi gọi lặp/retry webhook/API."""
        driver = env_s37["driver"]
        conn = env_s37["conn1"]
        tariff = env_s37["tariff"]
        wallet = env_s37["wallet"]

        assert wallet.balance == Decimal("100000.00")
        sess = _create_active_session(db_session, driver, conn, tariff, meter_start=Decimal("10.00"))

        # Lần chốt phiên thứ nhất
        stop_charging_session(
            db=db_session,
            user=driver,
            session_id=sess.id,
            meter_stop_kwh=Decimal("20.00"),  # 10 kWh * 3500 = 35,000 VND
        )
        db_session.refresh(wallet)
        assert wallet.balance == Decimal("65000.00")

        ledger_count_1 = (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.wallet_id == wallet.id)
            .count()
        )

        # Lần 2: Gọi lại stop_charging_session (mô phỏng retry webhook / double click)
        retry_sess = stop_charging_session(
            db=db_session,
            user=driver,
            session_id=sess.id,
            meter_stop_kwh=Decimal("20.00"),
        )
        db_session.refresh(wallet)
        assert retry_sess.status == "COMPLETED"
        assert wallet.balance == Decimal("65000.00")  # Không bị trừ thêm

        ledger_count_2 = (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.wallet_id == wallet.id)
            .count()
        )
        assert ledger_count_2 == ledger_count_1  # Không sinh thêm dòng sổ cái nào

        # Lần 3: Gọi trực tiếp auto_deduct_session_payment với cùng số tiền
        w, tx, _ = auto_deduct_session_payment(
            db=db_session, session=sess, invoice_amount=Decimal("35000.00")
        )
        db_session.commit()
        assert w.balance == Decimal("65000.00")
        assert tx.reference_id == f"session_{sess.id}"

        ledger_count_3 = (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.wallet_id == wallet.id)
            .count()
        )
        assert ledger_count_3 == ledger_count_1

    def test_06_idempotency_raises_conflict_if_amount_differs(
        self, db_session, env_s37
    ):
        """AC 5 (Biên): Gọi lặp cùng mã phiên nhưng số tiền khác nhau phải bị từ chối với HTTP 409 Conflict."""
        driver = env_s37["driver"]
        conn = env_s37["conn1"]
        tariff = env_s37["tariff"]

        sess = _create_active_session(db_session, driver, conn, tariff)
        auto_deduct_session_payment(db_session, sess, invoice_amount=Decimal("20000.00"))
        db_session.commit()

        # Gọi lại cùng session nhưng amount khác
        with pytest.raises(HTTPException) as exc_info:
            auto_deduct_session_payment(db_session, sess, invoice_amount=Decimal("25000.00"))
        assert exc_info.value.status_code == 409
        assert "Mã tham chiếu giao dịch đã được dùng với số tiền khác" in exc_info.value.detail

    def test_07_atomic_transaction_rolls_back_everything_on_midway_failure(
        self, db_session, env_s37
    ):
        """AC 6: Tính nguyên tử ACID: Khi có lỗi ngoại lệ giữa chừng, toàn bộ thao tác bị rollback sạch sẽ."""
        driver = env_s37["driver"]
        conn = env_s37["conn1"]
        tariff = env_s37["tariff"]
        wallet = env_s37["wallet"]

        initial_balance = wallet.balance
        sess = _create_active_session(db_session, driver, conn, tariff, meter_start=Decimal("0.00"))

        # Giả lập lỗi xảy ra trong quá trình cập nhật connector / audit khi chốt phiên
        with patch(
            "app.services.session_service.persist_session_billing_segments",
            side_effect=RuntimeError("Lỗi hệ thống ghi nhận segment giả lập"),
        ):
            with pytest.raises(RuntimeError, match="Lỗi hệ thống ghi nhận segment giả lập"):
                # Mô phỏng một transaction chốt phiên bọc ngoài
                try:
                    stop_charging_session(
                        db=db_session,
                        user=driver,
                        session_id=sess.id,
                        meter_stop_kwh=Decimal("15.00"),
                    )
                except Exception:
                    db_session.rollback()
                    raise

        # Kiểm tra tính nguyên tử sau rollback:
        db_session.refresh(wallet)
        db_session.refresh(sess)

        # 1. Số dư ví không suy suyển
        assert wallet.balance == initial_balance

        # 2. Không có bản ghi sổ cái nào được sinh ra cho phiên này
        assert (
            db_session.query(WalletTransaction)
            .filter(WalletTransaction.reference_id == f"session_{sess.id}")
            .count()
            == 0
        )

        # 3. Phiên sạc vẫn giữ nguyên trạng thái ACTIVE
        assert sess.status == "ACTIVE"

    def test_08_financial_precision_and_ledger_aliases(
        self, db_session, env_s37
    ):
        """NFR: Độ chính xác tài chính kiểu Decimal (số lẻ) và tương thích LedgerEntry/Ledger."""
        driver = env_s37["driver"]
        conn = env_s37["conn1"]
        tariff = env_s37["tariff"]
        wallet = env_s37["wallet"]

        sess = _create_active_session(db_session, driver, conn, tariff)
        precise_amount = Decimal("14285.71")

        w, tx, _ = auto_deduct_session_payment(
            db=db_session, session=sess, invoice_amount=precise_amount
        )
        db_session.commit()

        # Kiểm tra kiểu dữ liệu Decimal
        assert isinstance(w.balance, Decimal)
        assert tx.amount == -precise_amount
        assert w.id == wallet.id
        assert w.balance == Decimal("100000.00") - precise_amount

        # Kiểm tra alias LedgerEntry và Ledger
        assert LedgerEntry is WalletTransaction
        assert Ledger is WalletTransaction
        ledger_entry = db_session.get(LedgerEntry, tx.id)
        assert ledger_entry is not None
        assert ledger_entry.session_id == sess.id
        assert ledger_entry.invoice_id == sess.id
        assert ledger_entry.type == "SESSION_PAYMENT"
