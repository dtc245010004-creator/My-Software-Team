"""Kiểm thử tính năng Cảnh báo trụ ngoại tuyến & lỗi liên tục (SCRUM-316, SCRUM-317, SCRUM-318, SCRUM-319)."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models.station import (
    ChargerAlert,
    ChargingPoint,
    Connector,
    ConnectorError,
    Station,
)
from app.models.user import User
from app.services.alert_service import (
    check_connector_errors_burst_and_alert,
    check_offline_chargers_and_alert,
)
from app.services.charge_point_service import mark_charge_point_online


@pytest.fixture
def alert_setup(db_session: Session):
    owner_a = User(
        username="owner_alert_a",
        email="owner_a@evtest.vn",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    owner_b = User(
        username="owner_alert_b",
        email="owner_b@evtest.vn",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    admin = User(
        username="admin_alert",
        email="admin@evtest.vn",
        password_hash=get_password_hash("Pass1234"),
        role="ADMIN",
        is_active=True,
    )
    db_session.add_all([owner_a, owner_b, admin])
    db_session.commit()

    st_a = Station(
        operator_id=owner_a.id,
        name="Trạm Alert A",
        address="100 Trần Phú, Hà Nội",
        is_active=True,
    )
    st_b = Station(
        operator_id=owner_b.id,
        name="Trạm Alert B",
        address="200 Hai Bà Trưng, HCM",
        is_active=True,
    )
    db_session.add_all([st_a, st_b])
    db_session.commit()

    cp_a = ChargingPoint(
        station_id=st_a.id,
        code="CP-ALERT-A1",
        vendor="Schneider",
        status="Online",
        last_seen_at=datetime.now(timezone.utc),
        is_active=True,
    )
    cp_b = ChargingPoint(
        station_id=st_b.id,
        code="CP-ALERT-B1",
        vendor="ABB",
        status="Online",
        last_seen_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db_session.add_all([cp_a, cp_b])
    db_session.commit()

    conn_a = Connector(
        charging_point_id=cp_a.id,
        connector_number=1,
        is_active=True,
    )
    db_session.add(conn_a)
    db_session.commit()

    return {
        "owner_a": owner_a,
        "owner_b": owner_b,
        "admin": admin,
        "st_a": st_a,
        "st_b": st_b,
        "cp_a": cp_a,
        "cp_b": cp_b,
        "conn_a": conn_a,
        "token_owner_a": create_access_token({"sub": str(owner_a.id), "role": owner_a.role}),
        "token_owner_b": create_access_token({"sub": str(owner_b.id), "role": owner_b.role}),
        "token_admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
    }


# ==============================================================================
# SCRUM-316 & SCRUM-318: RÀNG BUỘC DB CHỐNG TRÙNG VÀ AUTO-RESOLVE
# ==============================================================================


def test_scrum318_db_partial_unique_constraint_prevents_duplicate_open_alerts(
    db_session: Session, alert_setup
):
    """Partial unique index uq_charger_alert_open chặn 2 cảnh báo OPEN cùng loại trên cùng trụ."""
    cp_a = alert_setup["cp_a"]
    st_a = alert_setup["st_a"]

    alert1 = ChargerAlert(
        charging_point_id=cp_a.id,
        station_id=st_a.id,
        alert_type="OFFLINE",
        status="OPEN",
        message="Cảnh báo lần 1",
    )
    db_session.add(alert1)
    db_session.commit()

    # Cố tình chèn bản ghi thứ 2 trạng thái OPEN cùng loại trên cùng trụ -> Bị chặn IntegrityError
    alert2 = ChargerAlert(
        charging_point_id=cp_a.id,
        station_id=st_a.id,
        alert_type="OFFLINE",
        status="OPEN",
        message="Cảnh báo lần 2 cố tình trùng",
    )
    db_session.add(alert2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Nhưng nếu cảnh báo cũ đã RESOLVED thì cho phép tạo cảnh báo mới
    alert1_db = db_session.query(ChargerAlert).filter(ChargerAlert.id == alert1.id).first()
    alert1_db.status = "RESOLVED"
    db_session.commit()

    alert3 = ChargerAlert(
        charging_point_id=cp_a.id,
        station_id=st_a.id,
        alert_type="OFFLINE",
        status="OPEN",
        message="Cảnh báo mới sau khi sự cố cũ đã giải quyết",
    )
    db_session.add(alert3)
    db_session.commit()
    assert alert3.id is not None


# ==============================================================================
# SCRUM-317: JOB QUÉT NGOẠI TUYẾN & LỖI LIÊN TỤC VỚI NGƯỠNG TỪ CONFIG
# ==============================================================================


def test_scrum317_scan_offline_chargers_creates_alert_and_sends_email(
    db_session: Session, alert_setup
):
    """Trụ ngoại tuyến quá ngưỡng (15 phút) tạo cảnh báo OPEN và gửi email."""
    cp_a = alert_setup["cp_a"]
    now = datetime.now(timezone.utc)

    # Đặt last_seen_at cách đây 20 phút (> ngưỡng 15 phút)
    cp_a.last_seen_at = now - timedelta(minutes=20)
    cp_a.status = "Offline"
    db_session.commit()

    with patch("app.services.alert_service.send_alert_email", return_value=True) as mock_email:
        created = check_offline_chargers_and_alert(db=db_session, now=now)
        assert len(created) == 1
        assert created[0].alert_type == "OFFLINE"
        assert created[0].severity == "CRITICAL"
        assert created[0].charging_point_id == cp_a.id
        mock_email.assert_called_once()

    # Chạy lại lần 2: Không tạo trùng cảnh báo
    with patch("app.services.alert_service.send_alert_email") as mock_email:
        created_second = check_offline_chargers_and_alert(db=db_session, now=now)
        assert len(created_second) == 0
        mock_email.assert_not_called()


def test_scrum317_scan_connector_errors_burst_creates_alert(
    db_session: Session, alert_setup
):
    """Connector ghi nhận >= 5 lỗi trong 15 phút tạo cảnh báo ERROR_BURST."""
    conn_a = alert_setup["conn_a"]
    now = datetime.now(timezone.utc)

    # Thêm 5 bản ghi lỗi trong vòng 5 phút gần đây
    for i in range(5):
        err = ConnectorError(
            connector_id=conn_a.id,
            error_code=f"GroundFailure_{i}",
            created_at=now - timedelta(minutes=i),
        )
        db_session.add(err)
    db_session.commit()

    with patch("app.services.alert_service.send_alert_email", return_value=True) as mock_email:
        burst_alerts = check_connector_errors_burst_and_alert(db=db_session, now=now)
        assert len(burst_alerts) == 1
        assert burst_alerts[0].alert_type == "ERROR_BURST"
        assert burst_alerts[0].severity == "WARNING"
        mock_email.assert_called_once()


def test_scrum318_auto_resolve_when_charger_comes_online(
    db_session: Session, alert_setup
):
    """Khi trụ online lại qua mark_charge_point_online, cảnh báo OFFLINE tự động đóng."""
    cp_a = alert_setup["cp_a"]
    st_a = alert_setup["st_a"]

    alert = ChargerAlert(
        charging_point_id=cp_a.id,
        station_id=st_a.id,
        alert_type="OFFLINE",
        status="OPEN",
        message="Trụ mất kết nối",
    )
    db_session.add(alert)
    db_session.commit()

    # Trụ phát sinh tín hiệu trực tuyến
    mark_charge_point_online(charging_point=cp_a, db=db_session)

    db_session.refresh(alert)
    assert alert.status == "RESOLVED"
    assert "trực tuyến trở lại" in alert.resolved_reason


# ==============================================================================
# SCRUM-319: API XEM DANH SÁCH VÀ ĐÓNG CẢNH BÁO
# ==============================================================================


def test_scrum319_api_list_alerts_and_rbac(client, alert_setup, db_session: Session):
    """Admin xem được toàn bộ, Operator chỉ xem được cảnh báo trạm của mình."""
    cp_a = alert_setup["cp_a"]
    st_a = alert_setup["st_a"]
    cp_b = alert_setup["cp_b"]
    st_b = alert_setup["st_b"]

    alert_a = ChargerAlert(charging_point_id=cp_a.id, station_id=st_a.id, alert_type="OFFLINE", status="OPEN", message="A offline")
    alert_b = ChargerAlert(charging_point_id=cp_b.id, station_id=st_b.id, alert_type="OFFLINE", status="OPEN", message="B offline")
    db_session.add_all([alert_a, alert_b])
    db_session.commit()

    # 1. Admin GET /alerts -> Thấy cả 2
    res_admin = client.get("/api/v1/alerts", headers={"Authorization": f"Bearer {alert_setup['token_admin']}"})
    assert res_admin.status_code == 200
    ids_admin = [a["id"] for a in res_admin.json()]
    assert alert_a.id in ids_admin
    assert alert_b.id in ids_admin

    # 2. Owner A GET /alerts -> Chỉ thấy alert_a
    res_owner_a = client.get("/api/v1/alerts", headers={"Authorization": f"Bearer {alert_setup['token_owner_a']}"})
    assert res_owner_a.status_code == 200
    ids_a = [a["id"] for a in res_owner_a.json()]
    assert alert_a.id in ids_a
    assert alert_b.id not in ids_a


def test_scrum319_api_resolve_alert_success_and_rbac(client, alert_setup, db_session: Session):
    """Owner đóng cảnh báo của mình thành công; Owner khác cố đóng bị 403."""
    cp_a = alert_setup["cp_a"]
    st_a = alert_setup["st_a"]

    alert = ChargerAlert(charging_point_id=cp_a.id, station_id=st_a.id, alert_type="OFFLINE", status="OPEN", message="A offline")
    db_session.add(alert)
    db_session.commit()

    # 1. Owner B cố đóng cảnh báo của trạm A -> 403 Forbidden
    res_b = client.post(
        f"/api/v1/alerts/{alert.id}/resolve",
        json={"resolved_reason": "Hack đóng hộ"},
        headers={"Authorization": f"Bearer {alert_setup['token_owner_b']}"},
    )
    assert res_b.status_code == 403

    # 2. Owner A đóng cảnh báo của trạm mình -> 200 OK
    res_a = client.post(
        f"/api/v1/alerts/{alert.id}/resolve",
        json={"resolved_reason": "Kỹ thuật viên đã cắm lại dây mạng"},
        headers={"Authorization": f"Bearer {alert_setup['token_owner_a']}"},
    )
    assert res_a.status_code == 200
    data = res_a.json()
    assert data["status"] == "RESOLVED"
    assert data["resolved_reason"] == "Kỹ thuật viên đã cắm lại dây mạng"
    assert data["resolved_by_user_id"] == alert_setup["owner_a"].id
