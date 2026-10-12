"""Kiểm thử tính năng Hạn mức công suất trạm theo khung giờ (SCRUM-311, SCRUM-312, SCRUM-313)."""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models.station import Station, StationPowerLimit
from app.models.user import User
from app.services.scheduler_service import check_station_power_limits_boundary_job
from app.services.tariff_validation import validate_periods


@pytest.fixture
def test_setup(db_session: Session):
    owner = User(
        username="owner_tou",
        email="owner_tou@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    other_owner = User(
        username="other_owner_tou",
        email="other_tou@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    admin = User(
        username="admin_tou",
        email="admin_tou@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="ADMIN",
        is_active=True,
    )
    db_session.add_all([owner, other_owner, admin])
    db_session.commit()

    station = Station(
        operator_id=owner.id,
        name="Trạm Test TOU Power Limit",
        address="123 Nguyễn Văn Linh, Đà Nẵng",
        total_grid_capacity_kw=100.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    return {
        "owner": owner,
        "other_owner": other_owner,
        "admin": admin,
        "station": station,
        "token_owner": create_access_token({"sub": str(owner.id), "role": owner.role}),
        "token_other": create_access_token({"sub": str(other_owner.id), "role": other_owner.role}),
        "token_admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
    }


# ==============================================================================
# SCRUM-311: KIỂM THỬ XÁC THỰC KHUNG GIỜ VÀ MODEL/CONSTRAINT DB
# ==============================================================================


def test_scrum311_validate_valid_power_limits():
    """Khung giờ hợp lệ: phủ kín 24h, không chồng lấn, qua nửa đêm."""
    valid_periods = [
        {"start_time": "00:00", "end_time": "06:00", "power_limit_kw": 120.0},
        {"start_time": "06:00", "end_time": "18:00", "power_limit_kw": 80.0},
        {"start_time": "18:00", "end_time": "24:00", "power_limit_kw": 150.0},
    ]
    assert validate_periods(valid_periods, value_field="power_limit_kw") == []

    midnight_periods = [
        {"start_time": "22:00", "end_time": "06:00", "power_limit_kw": 150.0},
        {"start_time": "06:00", "end_time": "22:00", "power_limit_kw": 70.0},
    ]
    assert validate_periods(midnight_periods, value_field="power_limit_kw") == []


def test_scrum311_validate_invalid_power_limits():
    """Khung giờ lỗi: hở gap, chồng lấn, công suất <= 0."""
    gap_periods = [
        {"start_time": "00:00", "end_time": "10:00", "power_limit_kw": 100.0},
        {"start_time": "12:00", "end_time": "24:00", "power_limit_kw": 100.0},
    ]
    errors = validate_periods(gap_periods, value_field="power_limit_kw")
    assert any("Chưa có khung giờ cho 10:00-12:00" in e for e in errors)

    overlap_periods = [
        {"start_time": "00:00", "end_time": "14:00", "power_limit_kw": 100.0},
        {"start_time": "12:00", "end_time": "24:00", "power_limit_kw": 100.0},
    ]
    errors = validate_periods(overlap_periods, value_field="power_limit_kw")
    assert any("chồng với khung" in e for e in errors)

    invalid_kw = [
        {"start_time": "00:00", "end_time": "24:00", "power_limit_kw": -10.0},
    ]
    errors = validate_periods(invalid_kw, value_field="power_limit_kw")
    assert any("power_limit_kw phải là số dương lớn hơn 0" in e for e in errors)


def test_scrum311_database_check_constraint_rejects_negative_power(db_session: Session, test_setup):
    """DB CheckConstraint ck_station_power_limit_positive chặn lưu power_limit_kw <= 0."""
    station = test_setup["station"]
    limit_neg = StationPowerLimit(
        station_id=station.id,
        start_time="00:00",
        end_time="24:00",
        power_limit_kw=-5.0,
    )
    db_session.add(limit_neg)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# ==============================================================================
# SCRUM-312: KIỂM THỬ API ĐỌC / GHI HẠN MỨC THEO KHUNG GIỜ
# ==============================================================================


def test_scrum312_get_empty_power_limits(client, test_setup):
    """GET trả về danh sách rỗng nếu trạm chưa cấu hình."""
    station = test_setup["station"]
    res = client.get(f"/api/v1/stations/{station.id}/power-limits")
    assert res.status_code == 200
    assert res.json() == []


def test_scrum312_set_power_limits_success_and_rbac(client, test_setup, db_session: Session):
    """Owner & Admin cập nhật thành công; Operator khác bị chặn 403."""
    station = test_setup["station"]
    payload = {
        "limits": [
            {"start_time": "00:00", "end_time": "08:00", "power_limit_kw": 120.0, "sort_order": 0},
            {"start_time": "08:00", "end_time": "20:00", "power_limit_kw": 60.0, "sort_order": 1},
            {"start_time": "20:00", "end_time": "24:00", "power_limit_kw": 100.0, "sort_order": 2},
        ]
    }

    # 1. Operator khác cố cập nhật -> 403 Forbidden
    res_other = client.put(
        f"/api/v1/stations/{station.id}/power-limits",
        json=payload,
        headers={"Authorization": f"Bearer {test_setup['token_other']}"},
    )
    assert res_other.status_code == 403

    # 2. Đúng Owner cập nhật -> 200 OK
    res_owner = client.put(
        f"/api/v1/stations/{station.id}/power-limits",
        json=payload,
        headers={"Authorization": f"Bearer {test_setup['token_owner']}"},
    )
    assert res_owner.status_code == 200
    data = res_owner.json()
    assert len(data) == 3
    assert data[0]["power_limit_kw"] == 120.0
    assert data[1]["power_limit_kw"] == 60.0
    assert data[2]["power_limit_kw"] == 100.0

    # 3. GET lại đối chiếu giá trị
    res_get = client.get(f"/api/v1/stations/{station.id}/power-limits")
    assert res_get.status_code == 200
    assert len(res_get.json()) == 3


def test_scrum312_set_power_limits_invalid_coverage_rejected(client, test_setup):
    """Từ chối 422 khi khung giờ có khoảng trống hoặc chồng lấn."""
    station = test_setup["station"]
    bad_payload = {
        "limits": [
            {"start_time": "00:00", "end_time": "12:00", "power_limit_kw": 100.0},
            {"start_time": "14:00", "end_time": "24:00", "power_limit_kw": 100.0},
        ]
    }
    res = client.put(
        f"/api/v1/stations/{station.id}/power-limits",
        json=bad_payload,
        headers={"Authorization": f"Bearer {test_setup['token_owner']}"},
    )
    assert res.status_code == 422


# ==============================================================================
# SCRUM-313: KIỂM THỬ SCHEDULER TẠI RANH GIỚI KHUNG GIỜ VÀ REBALANCE CÔNG SUẤT
# ==============================================================================


def test_scrum313_scheduler_boundary_updates_grid_capacity_and_triggers_rebalance(
    db_session: Session, test_setup
):
    """Job scheduler phát hiện ranh giới khung giờ, cập nhật trần trạm và kích hoạt rebalance."""
    station = test_setup["station"]
    station.total_grid_capacity_kw = 100.0
    db_session.commit()

    # Cấu hình 2 khung: 00:00-12:00 (50 kW), 12:00-24:00 (150 kW)
    limit1 = StationPowerLimit(
        station_id=station.id,
        start_time="00:00",
        end_time="12:00",
        power_limit_kw=50.0,
        sort_order=0,
    )
    limit2 = StationPowerLimit(
        station_id=station.id,
        start_time="12:00",
        end_time="24:00",
        power_limit_kw=150.0,
        sort_order=1,
    )
    db_session.add_all([limit1, limit2])
    db_session.commit()

    # Giả lập thời điểm 08:30 sáng (thuộc khung 00:00-12:00 -> 50 kW)
    sim_morning = datetime(2026, 10, 12, 8, 30, tzinfo=timezone.utc)
    with patch("app.services.smart_charging.trigger_rebalance_background") as mock_rebalance:
        triggered = check_station_power_limits_boundary_job(db=db_session, current_time=sim_morning)
        assert triggered == 1
        db_session.refresh(station)
        assert station.total_grid_capacity_kw == 50.0
        mock_rebalance.assert_called_once_with(station.id)

    # Chạy lại cùng thời điểm: Idempotent, không cập nhật lại trần
    with patch("app.services.smart_charging.trigger_rebalance_background") as mock_rebalance:
        triggered = check_station_power_limits_boundary_job(db=db_session, current_time=sim_morning)
        assert triggered == 0
        mock_rebalance.assert_not_called()

    # Giả lập thời điểm chuyển sang 12:00 trưa (thuộc khung 12:00-24:00 -> 150 kW)
    sim_noon = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)
    with patch("app.services.smart_charging.trigger_rebalance_background") as mock_rebalance:
        triggered = check_station_power_limits_boundary_job(db=db_session, current_time=sim_noon)
        assert triggered == 1
        db_session.refresh(station)
        assert station.total_grid_capacity_kw == 150.0
        mock_rebalance.assert_called_once_with(station.id)
