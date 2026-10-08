"""S-29: kiểm tra khung giờ, API, tương thích biểu giá cũ và ràng buộc lưu trữ."""

import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from copy import deepcopy
from datetime import time
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from app.core.security import create_access_token
from app.models import Tariff, TariffPeriod, User
from app.services.session_service import (
    determine_tou_rate,
    get_or_create_default_tariff,
)
from app.services.tariff_validation import (
    get_effective_periods,
    normalize_periods,
    validate_periods,
)


def _period(start, end, price="3000.00", **kwargs):
    return {"start_time": start, "end_time": end, "price_per_kwh": price, **kwargs}


VALID_PERIODS = [
    pytest.param(
        [
            _period("00:00", "08:00", "2000.00"),
            _period("08:00", "18:00", "4000.00"),
            _period("18:00", "24:00", "3000.00"),
        ],
        id="three-periods",
    ),
    pytest.param([_period("22:00", "02:00"), _period("02:00", "22:00")], id="midnight"),
    pytest.param([_period("00:00", "10:00"), _period("10:00", "24:00")], id="touching"),
    pytest.param([_period("00:00", "24:00", "0.00")], id="full-day-free"),
    pytest.param(
        [_period("22:00", "00:00"), _period("00:00", "22:00")], id="ends-midnight"
    ),
]

INVALID_PERIODS = [
    pytest.param(
        [
            _period("00:00", "09:00"),
            _period("09:00", "11:00"),
            _period("10:30", "12:00"),
            _period("12:00", "24:00"),
        ],
        "Khung 09:00-11:00 chồng với khung 10:30-12:00",
        id="overlap",
    ),
    pytest.param(
        [
            _period("00:00", "14:00"),
            _period("16:00", "24:00"),
        ],
        "Chưa có khung giờ cho 14:00-16:00",
        id="gap",
    ),
    pytest.param(
        [
            _period("22:00", "02:00"),
            _period("01:00", "22:00"),
        ],
        "chồng với khung",
        id="midnight-overlap",
    ),
    pytest.param(
        [_period("00:00", "00:00")], "trùng giờ kết thúc", id="equal-midnight"
    ),
    pytest.param([_period("10:00", "10:00")], "trùng giờ kết thúc", id="equal-daytime"),
    pytest.param([], "Chưa có khung giờ cho 00:00-24:00", id="empty"),
]


@pytest.mark.parametrize("periods", VALID_PERIODS)
def test_validate_valid_periods(periods):
    assert validate_periods(periods) == []


@pytest.mark.parametrize("periods, message", INVALID_PERIODS)
def test_validate_invalid_periods_identifies_problem(periods, message):
    assert any(message in error for error in validate_periods(periods))


@pytest.mark.parametrize(
    "period, message",
    [
        (_period("00:00", "24:00", "-1"), "price_per_kwh"),
        (_period("24:00", "02:00"), "24:00"),
        (_period("00:00", "24:01"), "24:01"),
        (_period("9:00", "24:00"), "HH:MM"),
        (_period("00:60", "24:00"), "HH:MM"),
        (_period("00:00", "24:00", "NaN"), "hữu hạn"),
    ],
)
def test_validation_rejects_bad_time_and_price(period, message):
    assert any(message in error for error in validate_periods([period]))
    with pytest.raises(ValueError):
        normalize_periods([period])


def test_normalize_midnight_preserves_input_price_and_source():
    periods = [_period("22:00", "02:00", "1234.56"), _period("02:00", "22:00", "3000")]
    original = deepcopy(periods)

    result = normalize_periods(periods)

    assert periods == original
    assert [
        (p.start_minute, p.end_minute, p.price_per_kwh, p.source_index) for p in result
    ] == [
        (0, 120, Decimal("1234.56"), 0),
        (120, 1320, Decimal("3000"), 1),
        (1320, 1440, Decimal("1234.56"), 0),
    ]


def test_validation_reports_all_gaps_and_nested_overlaps():
    assert validate_periods([_period("02:00", "05:00"), _period("07:00", "23:00")]) == [
        "Chưa có khung giờ cho 00:00-02:00",
        "Chưa có khung giờ cho 05:00-07:00",
        "Chưa có khung giờ cho 23:00-24:00",
    ]
    errors = validate_periods(
        [
            _period("00:00", "24:00"),
            _period("04:00", "06:00"),
            _period("05:00", "07:00"),
        ]
    )
    assert len(errors) == 3
    assert "Khung 04:00-06:00 chồng với khung 05:00-07:00" in errors


@pytest.fixture
def headers(db_session):
    admin = User(
        username="period_admin",
        email="period_admin@test.com",
        password_hash="test-hash",
        role="ADMIN",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return {
        "Authorization": f"Bearer {create_access_token({'sub': str(admin.id), 'role': admin.role})}"
    }


def _payload(**kwargs):
    return {
        "name": "Biểu giá nhiều khung",
        "price_normal": 3000,
        "price_peak": 4500,
        "price_offpeak": 2000,
        **kwargs,
    }


def _write(client, headers, method, payload):
    if method == "post":
        return client.post("/api/v1/tariffs", json=_payload(**payload), headers=headers)
    created = client.post("/api/v1/tariffs", json=_payload(), headers=headers)
    assert created.status_code == 201
    return client.put(
        f"/api/v1/tariffs/{created.json()['id']}", json=payload, headers=headers
    )


@pytest.mark.parametrize("method", ["post", "put"])
@pytest.mark.parametrize("periods", VALID_PERIODS)
def test_api_saves_and_returns_original_periods(
    client, db_session, headers, method, periods
):
    response = _write(client, headers, method, {"periods": periods})

    assert response.status_code == (201 if method == "post" else 200)
    result = response.json()
    assert [
        (p["start_time"], p["end_time"], Decimal(p["price_per_kwh"]))
        for p in result["periods"]
    ] == [
        (p["start_time"], p["end_time"], Decimal(p["price_per_kwh"])) for p in periods
    ]
    assert [p["sort_order"] for p in result["periods"]] == list(range(len(periods)))
    db_session.expire_all()
    saved = db_session.get(Tariff, result["id"])
    assert len(saved.periods) == len(periods)
    assert saved.price_normal == Decimal("3000")
    assert saved.peak_start == "09:30"
    assert get_effective_periods(saved) == [
        {
            field: getattr(p, field)
            for field in ("start_time", "end_time", "price_per_kwh", "sort_order")
        }
        for p in saved.periods
    ]
    assert (
        client.get(f"/api/v1/tariffs/{saved.id}").json()["periods"] == result["periods"]
    )
    assert client.get("/api/v1/tariffs").json()[0]["periods"] == result["periods"]


@pytest.mark.parametrize("method", ["post", "put"])
@pytest.mark.parametrize("periods, message", INVALID_PERIODS)
def test_api_rejects_invalid_coverage(client, headers, method, periods, message):
    response = _write(client, headers, method, {"periods": periods})

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert any(message in error for error in response.json()["detail"])


@pytest.mark.parametrize("method", ["post", "put"])
@pytest.mark.parametrize(
    "period, field, message",
    [
        (_period("00:00", "24:00", "-1"), "price_per_kwh", "không được âm"),
        (_period("24:00", "02:00"), "start_time", "HH:MM"),
        (_period("00:00", "25:00"), "end_time", "HH:MM"),
    ],
)
def test_api_schema_rejects_invalid_period_fields(
    client, headers, method, period, field, message
):
    response = _write(client, headers, method, {"periods": [period]})

    assert response.status_code == 422
    assert any(
        error["loc"][-1] == field and message in error["msg"]
        for error in response.json()["detail"]
    )


def test_update_replaces_periods_atomically_and_omission_keeps_them(
    client, db_session, headers
):
    original = [_period("00:00", "10:00"), _period("10:00", "24:00")]
    created = client.post(
        "/api/v1/tariffs", json=_payload(periods=original), headers=headers
    ).json()
    url = f"/api/v1/tariffs/{created['id']}"

    for data in ({"name": "Đổi tên biểu giá"}, {"periods": None}):
        response = client.put(url, json=data, headers=headers)
        assert response.status_code == 200
        assert response.json()["periods"] == created["periods"]

    rejected = client.put(
        url,
        json={"name": "Không được lưu", "periods": [_period("00:00", "12:00")]},
        headers=headers,
    )
    assert rejected.status_code == 422
    unchanged = client.get(url).json()
    assert unchanged["name"] == "Đổi tên biểu giá"
    assert unchanged["periods"] == created["periods"]

    replaced = client.put(
        url, json={"periods": [_period("00:00", "24:00", "1234.56")]}, headers=headers
    )
    assert replaced.status_code == 200
    db_session.expire_all()
    assert (
        db_session.query(TariffPeriod).filter_by(tariff_id=created["id"]).count() == 1
    )
    assert Decimal(replaced.json()["periods"][0]["price_per_kwh"]) == Decimal("1234.56")


def test_legacy_fallback_covers_day_without_creating_rows(db_session):
    tariff = get_or_create_default_tariff(db_session)
    periods = get_effective_periods(tariff)

    assert [(p["start_time"], p["end_time"], p["price_per_kwh"]) for p in periods] == [
        ("00:00", "04:00", Decimal("2500")),
        ("04:00", "09:30", Decimal("3200")),
        ("09:30", "11:30", Decimal("4500")),
        ("11:30", "17:00", Decimal("3200")),
        ("17:00", "20:00", Decimal("4500")),
        ("20:00", "22:00", Decimal("3200")),
        ("22:00", "24:00", Decimal("2500")),
    ]
    assert validate_periods(periods) == []
    assert db_session.query(TariffPeriod).count() == 0
    assert get_or_create_default_tariff(db_session).id == tariff.id


@pytest.mark.parametrize(
    "hour, minute, expected",
    [
        (1, 0, "2500"),
        (8, 0, "3200"),
        (10, 0, "4500"),
        (18, 0, "4500"),
        (21, 0, "3200"),
        (23, 0, "2500"),
        (4, 0, "2500"),
        (11, 30, "4500"),
        (20, 0, "4500"),
    ],
)
def test_existing_rate_lookup_keeps_legacy_boundaries(
    db_session, hour, minute, expected
):
    tariff = get_or_create_default_tariff(db_session)
    assert determine_tou_rate(tariff, time(hour, minute)) == Decimal(expected)


@pytest.mark.parametrize("delete_mode", ["orm", "sql"])
def test_deleting_tariff_cascades_periods(db_session, delete_mode):
    tariff = get_or_create_default_tariff(db_session)
    tariff.periods = [TariffPeriod(**_period("00:00", "24:00"))]
    db_session.commit()
    if delete_mode == "orm":
        db_session.delete(tariff)
    else:
        db_session.execute(delete(Tariff).where(Tariff.id == tariff.id))
    db_session.commit()
    assert db_session.query(TariffPeriod).count() == 0


def test_database_rejects_negative_period_price(db_session):
    tariff = get_or_create_default_tariff(db_session)
    db_session.add(TariffPeriod(tariff_id=tariff.id, **_period("00:00", "24:00", "-1")))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_api_respects_explicit_sort_order(client, headers):
    periods = [
        _period("00:00", "10:00", sort_order=20),
        _period("10:00", "24:00", sort_order=10),
    ]
    response = client.post(
        "/api/v1/tariffs", json=_payload(periods=periods), headers=headers
    )
    assert response.status_code == 201
    assert [period["start_time"] for period in response.json()["periods"]] == [
        "10:00",
        "00:00",
    ]
    assert [period["sort_order"] for period in response.json()["periods"]] == [10, 20]


@pytest.mark.parametrize("period_fields", [{}, {"periods": None}])
def test_legacy_create_without_periods_still_works(client, headers, period_fields):
    response = client.post(
        "/api/v1/tariffs", json=_payload(**period_fields), headers=headers
    )
    assert response.status_code == 201
    assert response.json()["periods"] == []
    assert response.json()["offpeak_start"] == "22:00"


@pytest.mark.parametrize("off_start, off_end", [("12:00", "15:00"), ("10:00", "23:00")])
def test_legacy_fallback_respects_custom_times_and_peak_priority(
    db_session, off_start, off_end
):
    tariff = get_or_create_default_tariff(db_session)
    tariff.offpeak_start, tariff.offpeak_end = off_start, off_end
    normalized = normalize_periods(get_effective_periods(tariff))
    assert validate_periods(get_effective_periods(tariff)) == []
    # So sánh bên trong mỗi đoạn; legacy vẫn dùng biên đóng tại chính mốc giờ.
    for segment in normalized:
        minute = (segment.start_minute + segment.end_minute) // 2
        assert segment.price_per_kwh == determine_tou_rate(
            tariff, time(minute // 60, minute % 60)
        )


def test_migration_upgrade_downgrade_keeps_legacy_data(tmp_path):
    """Chạy chuỗi migration thật trên DB riêng, không dùng DB ứng dụng/fixture."""
    database = tmp_path / "tariff-period-migration.db"
    environment = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{database.as_posix()}",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
    }

    def alembic(*arguments):
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *arguments],
            cwd=Path(__file__).resolve().parents[1],
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=60,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    def legacy_schema(connection):
        return connection.execute(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE tbl_name NOT IN ('tariff_periods', 'alembic_version') "
            "ORDER BY type, name"
        ).fetchall()

    alembic("upgrade", "1660df6b86c6")
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute(
            "INSERT INTO tariffs "
            "(id, name, price_normal, price_peak, price_offpeak, peak_start, peak_end, "
            "peak_start_2, peak_end_2, offpeak_start, offpeak_end, is_active, "
            "idle_fee_per_minute, idle_grace_minutes) "
            "VALUES (1, 'Legacy', 3200, 4500, 2500, '09:30', '11:30', '17:00', "
            "'20:00', '22:00', '04:00', 1, 1000, 5)"
        )
        old_rows = connection.execute("SELECT * FROM tariffs").fetchall()
        old_schema = legacy_schema(connection)

    for _ in range(2):
        alembic("upgrade", "37ff169ee686")
        with closing(sqlite3.connect(database)) as connection, connection:
            assert legacy_schema(connection) == old_schema
            assert connection.execute("SELECT * FROM tariffs").fetchall() == old_rows
            assert connection.execute(
                "SELECT count(*) FROM tariff_periods"
            ).fetchone() == (0,)
            assert connection.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone() == ("37ff169ee686",)
            columns = {
                row[1]: row
                for row in connection.execute("PRAGMA table_info(tariff_periods)")
            }
            assert columns["price_per_kwh"][2:4] == ("NUMERIC(10, 2)", 1)
            assert columns["start_time"][2:4] == ("VARCHAR(5)", 1)
            assert any(
                row[1] == "ix_tariff_periods_tariff_id"
                for row in connection.execute("PRAGMA index_list(tariff_periods)")
            )
            foreign_key = connection.execute(
                "PRAGMA foreign_key_list(tariff_periods)"
            ).fetchone()
            assert foreign_key[2:5] == ("tariffs", "tariff_id", "id")
            assert foreign_key[6] == "CASCADE"
            connection.execute("PRAGMA foreign_keys = ON")
            with pytest.raises(sqlite3.IntegrityError, match="CHECK constraint"):
                connection.execute(
                    "INSERT INTO tariff_periods (tariff_id, start_time, end_time, price_per_kwh) "
                    "VALUES (1, '00:00', '24:00', -1)"
                )
            connection.execute(
                "INSERT INTO tariff_periods (tariff_id, start_time, end_time, price_per_kwh) "
                "VALUES (1, '22:00', '02:00', 1234.56)"
            )
            assert connection.execute(
                "SELECT sort_order FROM tariff_periods"
            ).fetchone() == (0,)

        alembic("downgrade", "1660df6b86c6")
        with closing(sqlite3.connect(database)) as connection, connection:
            assert legacy_schema(connection) == old_schema
            assert connection.execute("SELECT * FROM tariffs").fetchall() == old_rows
            assert (
                connection.execute(
                    "SELECT name FROM sqlite_master WHERE name='tariff_periods'"
                ).fetchone()
                is None
            )
