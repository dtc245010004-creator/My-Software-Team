import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session, sessionmaker
from starlette.testclient import TestClient

from app.models.ocpp_message import OcppMessage
from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call
from app.services.scheduler_service import cleanup_old_ocpp_messages_job


def _create_charging_point(db_session: Session, code: str) -> ChargingPoint:
    charging_point = ChargingPoint(
        station=Station(
            name="Trạm kiểm thử chống lặp",
            address="Địa chỉ kiểm thử",
            total_grid_capacity_kw=100.0,
            is_active=True,
        ),
        code=code,
        max_power_kw=60.0,
    )
    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    return charging_point


def _boot_payload(vendor: str) -> dict[str, str]:
    return {
        "chargePointVendor": vendor,
        "chargePointModel": "IdempotencyModel",
        "firmwareVersion": "1.0.0",
    }


def test_repeated_message_id_reuses_saved_response_five_times(
    client: TestClient, db_session: Session
) -> None:
    _create_charging_point(db_session, "CP-IDEMPOTENT-FIVE")
    results = []

    with client.websocket_connect(
        "/ocpp/CP-IDEMPOTENT-FIVE", subprotocols=["ocpp1.6"]
    ) as websocket:
        for attempt in range(5):
            websocket.send_text(
                build_call(
                    "boot-idempotent-five",
                    "BootNotification",
                    _boot_payload(
                        "Original Vendor" if attempt == 0 else "Changed Vendor"
                    ),
                )
            )
            results.append(json.loads(websocket.receive_text()))

    assert results.count(results[0]) == 5
    session_factory = sessionmaker(bind=db_session.get_bind())
    with session_factory() as verification_session:
        saved = (
            verification_session.query(OcppMessage)
            .filter_by(
                charge_point_code="CP-IDEMPOTENT-FIVE",
                message_id="boot-idempotent-five",
            )
            .one()
        )
        charging_point = (
            verification_session.query(ChargingPoint)
            .filter_by(code="CP-IDEMPOTENT-FIVE")
            .one()
        )
        assert saved.action == "BootNotification"
        assert json.loads(saved.response_payload) == [
            3,
            "boot-idempotent-five",
            results[0][2],
        ]
        assert charging_point.charge_point_vendor == "Original Vendor"
        assert verification_session.query(OcppMessage).count() == 1


def test_duplicate_is_recognized_by_a_new_database_session(
    client: TestClient, db_session: Session
) -> None:
    _create_charging_point(db_session, "CP-IDEMPOTENT-SESSION")
    call_id = "boot-new-session"

    with client.websocket_connect(
        "/ocpp/CP-IDEMPOTENT-SESSION", subprotocols=["ocpp1.6"]
    ) as first_connection:
        first_connection.send_text(
            build_call(call_id, "BootNotification", _boot_payload("Original Vendor"))
        )
        original_response = json.loads(first_connection.receive_text())

    with client.websocket_connect(
        "/ocpp/CP-IDEMPOTENT-SESSION", subprotocols=["ocpp1.6"]
    ) as new_connection:
        new_connection.send_text(
            build_call(call_id, "BootNotification", _boot_payload("Changed Vendor"))
        )
        replayed_response = json.loads(new_connection.receive_text())

    session_factory = sessionmaker(bind=db_session.get_bind())
    with session_factory() as verification_session:
        charging_point = (
            verification_session.query(ChargingPoint)
            .filter_by(code="CP-IDEMPOTENT-SESSION")
            .one()
        )
        assert replayed_response == original_response
        assert charging_point.charge_point_vendor == "Original Vendor"
        assert verification_session.query(OcppMessage).count() == 1


def test_reused_message_id_with_different_action_replays_and_warns(
    client: TestClient, db_session: Session, caplog
) -> None:
    _create_charging_point(db_session, "CP-IDEMPOTENT-ACTION")

    with client.websocket_connect(
        "/ocpp/CP-IDEMPOTENT-ACTION", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("shared-message-id", "BootNotification", _boot_payload("Vendor"))
        )
        original_response = json.loads(websocket.receive_text())

        websocket.send_text(build_call("shared-message-id", "Heartbeat", {}))
        replayed_response = json.loads(websocket.receive_text())

    assert replayed_response == original_response
    assert "action khác" in caplog.text


def test_cleanup_job_removes_only_messages_older_than_seven_days(
    db_session: Session,
) -> None:
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            OcppMessage(
                charge_point_code="CP-IDEMPOTENT-CLEANUP",
                message_id="old-message",
                action="BootNotification",
                response_payload="[]",
                created_at=now - timedelta(days=8),
            ),
            OcppMessage(
                charge_point_code="CP-IDEMPOTENT-CLEANUP",
                message_id="recent-message",
                action="BootNotification",
                response_payload="[]",
                created_at=now - timedelta(days=6),
            ),
        ]
    )
    db_session.commit()

    assert cleanup_old_ocpp_messages_job(db_session) == 1
    remaining = (
        db_session.query(OcppMessage)
        .filter_by(charge_point_code="CP-IDEMPOTENT-CLEANUP")
        .all()
    )
    assert [message.message_id for message in remaining] == ["recent-message"]
