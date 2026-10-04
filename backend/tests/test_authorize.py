from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.id_tag import IdTag
from app.models.station import ChargingPoint, Station
from app.models.user import User
from app.ocpp.handlers.authorize import handle_authorize


def _create_user(db_session: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="test-hash",
        role="CUSTOMER",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_charging_point(
    db_session: Session, code: str, *, station_is_active: bool = True
) -> ChargingPoint:
    charging_point = ChargingPoint(
        station=Station(
            name=f"Trạm {code}",
            address="Địa chỉ kiểm thử",
            total_grid_capacity_kw=100.0,
            is_active=station_is_active,
        ),
        code=code,
        max_power_kw=60.0,
    )
    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    return charging_point


@pytest.mark.parametrize(
    (
        "tag_exists",
        "tag_status",
        "expiry_offset_days",
        "station_is_active",
        "expected_status",
    ),
    [
        pytest.param(False, None, None, True, "Invalid", id="unknown-tag"),
        pytest.param(True, "blocked", None, True, "Blocked", id="blocked-tag"),
        pytest.param(True, "active", -1, True, "Expired", id="expired-tag"),
        pytest.param(True, "active", None, False, "Blocked", id="inactive-station"),
        pytest.param(True, "active", None, True, "Accepted", id="valid-tag"),
    ],
)
def test_authorize_returns_expected_id_tag_info_and_masks_unknown_code(
    db_session: Session,
    caplog: pytest.LogCaptureFixture,
    tag_exists: bool,
    tag_status: str | None,
    expiry_offset_days: int | None,
    station_is_active: bool,
    expected_status: str,
) -> None:
    username = f"authorize_{expected_status.lower()}_{station_is_active}"
    user = _create_user(db_session, username)
    charging_point = _create_charging_point(
        db_session,
        f"CP-AUTH-{username}",
        station_is_active=station_is_active,
    )
    id_tag_code = "TEST-CARD-12345678"
    if tag_exists:
        expiry_date = (
            datetime.now(timezone.utc) + timedelta(days=expiry_offset_days)
            if expiry_offset_days is not None
            else None
        )
        db_session.add(
            IdTag(
                code=id_tag_code,
                user_id=user.id,
                status=tag_status,
                expiry_date=expiry_date,
            )
        )
        db_session.commit()

    response = handle_authorize(db_session, charging_point, {"idTag": id_tag_code})

    assert response["idTagInfo"]["status"] == expected_status
    assert "expiryDate" not in response["idTagInfo"] or expiry_offset_days is not None
    assert id_tag_code not in caplog.text
    if not tag_exists:
        assert "5678" in caplog.text
        assert "TEST-CARD-1234" not in caplog.text
    else:
        assert caplog.text == ""


def test_id_tag_code_must_be_unique(
    db_session: Session,
) -> None:
    first_user = _create_user(db_session, "authorize_duplicate_first")
    second_user = _create_user(db_session, "authorize_duplicate_second")
    db_session.add(IdTag(code="DUPLICATE-CARD", user_id=first_user.id, status="active"))
    db_session.commit()
    db_session.add(
        IdTag(code="DUPLICATE-CARD", user_id=second_user.id, status="active")
    )

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()
    assert db_session.query(IdTag).filter_by(code="DUPLICATE-CARD").count() == 1
