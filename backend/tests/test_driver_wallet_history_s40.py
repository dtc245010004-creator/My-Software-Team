from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction


@pytest.fixture
def s40_setup(db_session):
    driver_1 = User(
        username="driver_s40_1",
        email="driver1_s40@evcsms.vn",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    driver_2 = User(
        username="driver_s40_2",
        email="driver2_s40@evcsms.vn",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([driver_1, driver_2])
    db_session.commit()

    wallet_1 = Wallet(
        user_id=driver_1.id,
        balance=Decimal("250000.00"),
        is_debt_locked=False,
    )
    wallet_2 = Wallet(
        user_id=driver_2.id,
        balance=Decimal("75000.00"),
        is_debt_locked=False,
    )
    db_session.add_all([wallet_1, wallet_2])
    db_session.commit()

    # Sinh 65 giao dịch cho driver 1 để test phân trang 50 dòng
    base_time = datetime.now(timezone.utc) - timedelta(days=10)
    txs = []
    for i in range(1, 66):
        tx = WalletTransaction(
            wallet_id=wallet_1.id,
            amount=Decimal("10000.00") if i % 2 == 1 else Decimal("-5000.00"),
            transaction_type="TOPUP" if i % 2 == 1 else "CHARGE_FEE",
            balance_before=Decimal("200000.00"),
            balance_after=Decimal("210000.00") if i % 2 == 1 else Decimal("195000.00"),
            reference_type="MANUAL_TOPUP" if i % 2 == 1 else "CHARGING_SESSION",
            reference_id=f"PT-REF-{i}" if i % 2 == 1 else f"session_{i}",
            receipt_code=f"PT-REF-{i}" if i % 2 == 1 else None,
            note=f"Giao dịch số #{i}",
            created_at=base_time + timedelta(hours=i),
        )
        txs.append(tx)
    db_session.add_all(txs)
    db_session.commit()

    t1 = create_access_token({"sub": str(driver_1.id)})
    t2 = create_access_token({"sub": str(driver_2.id)})

    return {
        "d1": driver_1,
        "d2": driver_2,
        "w1": wallet_1,
        "w2": wallet_2,
        "h1": {"Authorization": f"Bearer {t1}"},
        "h2": {"Authorization": f"Bearer {t2}"},
    }


def test_driver_view_own_balance(client, s40_setup):
    """SCRUM-279: Tài xế xem số dư ví hiện tại của chính mình."""
    setup = s40_setup
    res = client.get("/api/v1/wallet/balance", headers=setup["h1"])
    assert res.status_code == 200
    data = res.json()
    assert float(data["balance"]) == 250000.00
    assert data["currency"] == "VND"
    assert data["user_id"] == setup["d1"].id


def test_driver_view_empty_wallet(client, db_session):
    """SCRUM-282: Tài xế mới chưa có giao dịch nào xem số dư và lịch sử rỗng."""
    driver = User(
        username="driver_new_empty",
        email="new_empty@evcsms.vn",
        password_hash=get_password_hash("Pass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add(driver)
    db_session.commit()

    token = create_access_token({"sub": str(driver.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Số dư
    res_bal = client.get("/api/v1/wallet/balance", headers=headers)
    assert res_bal.status_code == 200
    assert float(res_bal.json()["balance"]) == 0.0

    # Lịch sử
    res_his = client.get("/api/v1/wallet/history", headers=headers)
    assert res_his.status_code == 200
    data = res_his.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["total_pages"] == 0


def test_driver_prevent_idor_other_wallet(client, s40_setup):
    """SCRUM-277: Chặn tài xế truy cập ví của tài xế khác bằng driver_id giả mạo -> 403."""
    setup = s40_setup
    # Driver 1 cố tình truyền driver_id của Driver 2 vào balance
    res_bal = client.get(
        f"/api/v1/wallet/balance?driver_id={setup['d2'].id}",
        headers=setup["h1"],
    )
    assert res_bal.status_code == 403
    assert "Bạn không có quyền truy cập ví của tài xế khác" in res_bal.json()["detail"]

    # Driver 1 cố tình truyền driver_id của Driver 2 vào history
    res_his = client.get(
        f"/api/v1/wallet/history?driver_id={setup['d2'].id}",
        headers=setup["h1"],
    )
    assert res_his.status_code == 403
    assert "Bạn không có quyền truy cập ví của tài xế khác" in res_his.json()["detail"]


def test_driver_unauthenticated_blocked(client):
    """SCRUM-277: Chưa đăng nhập bị chặn 401."""
    res_bal = client.get("/api/v1/wallet/balance")
    assert res_bal.status_code == 401

    res_his = client.get("/api/v1/wallet/history")
    assert res_his.status_code == 401


def test_driver_wallet_history_pagination_and_standardized_schema(client, s40_setup):
    """SCRUM-280, 281, 282: Phân trang đúng 50 dòng, dữ liệu chuẩn hoá, sắp xếp mới nhất trước."""
    setup = s40_setup

    # Trang 1: Phải có đủ đúng 50 dòng
    res_p1 = client.get("/api/v1/wallet/history?page=1", headers=setup["h1"])
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()
    assert data_p1["page"] == 1
    assert data_p1["page_size"] == 50
    assert data_p1["total"] == 65
    assert data_p1["total_pages"] == 2
    assert len(data_p1["items"]) == 50

    # Kiểm tra chuẩn hoá dòng đầu tiên (mới nhất trước: item 65)
    first_item = data_p1["items"][0]
    assert first_item["transaction_type"] == "TOPUP"
    assert float(first_item["amount"]) == 10000.00
    assert first_item["reference_type"] == "MANUAL_TOPUP"
    assert first_item["reference_id"] == "PT-REF-65"
    assert "created_by_id" not in first_item  # Không để lộ thông tin nội bộ của admin

    # Trang 2: Có 15 dòng còn lại (65 - 50 = 15)
    res_p2 = client.get("/api/v1/wallet/history?page=2", headers=setup["h1"])
    assert res_p2.status_code == 200
    data_p2 = res_p2.json()
    assert data_p2["page"] == 2
    assert len(data_p2["items"]) == 15

    # Đảm bảo không trùng ID giữa trang 1 và trang 2
    p1_ids = {item["id"] for item in data_p1["items"]}
    p2_ids = {item["id"] for item in data_p2["items"]}
    assert p1_ids.isdisjoint(p2_ids)

    # Trang 3: Vượt quá tổng số trang -> items rỗng
    res_p3 = client.get("/api/v1/wallet/history?page=3", headers=setup["h1"])
    assert res_p3.status_code == 200
    data_p3 = res_p3.json()
    assert data_p3["items"] == []


def test_driver_wallet_history_invalid_page(client, s40_setup):
    """SCRUM-281: Validate tham số page < 1 hoặc sai kiểu -> 422."""
    setup = s40_setup
    res_zero = client.get("/api/v1/wallet/history?page=0", headers=setup["h1"])
    assert res_zero.status_code == 422

    res_str = client.get("/api/v1/wallet/history?page=abc", headers=setup["h1"])
    assert res_str.status_code == 422
