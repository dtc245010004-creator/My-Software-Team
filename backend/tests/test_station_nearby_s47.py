"""Kiểm thử API công khai tìm trạm và đầu nối theo S-47."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.api.v1.endpoints import stations as stations_endpoint
from app.core.datetime_utils import VIETNAM_TZ
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff


def _station(db_session, name, address, *, latitude=None, longitude=None, **kwargs):
    station = Station(
        name=name,
        address=address,
        latitude=latitude,
        longitude=longitude,
        status=kwargs.pop("status", "ACTIVE"),
        is_active=kwargs.pop("is_active", True),
        **kwargs,
    )
    db_session.add(station)
    db_session.commit()
    return station


def _charger(db_session, station, *, status="Online", is_active=True, last_seen=None):
    charging_point = ChargingPoint(
        station_id=station.id,
        code=f"S47-{station.id}-{status}-{is_active}",
        status=status,
        is_active=is_active,
        last_seen_at=last_seen or datetime.now(timezone.utc),
    )
    db_session.add(charging_point)
    db_session.commit()
    return charging_point


def _connector(
    db_session,
    charging_point,
    number,
    *,
    ocpp_status="Available",
    status="AVAILABLE",
    is_active=True,
    connector_type="CCS2",
):
    connector = Connector(
        charging_point_id=charging_point.id,
        connector_number=number,
        connector_type=connector_type,
        max_power_kw=60,
        ocpp_status=ocpp_status,
        status=status,
        is_active=is_active,
    )
    db_session.add(connector)
    db_session.commit()
    return connector


def test_nearby_orders_by_distance_and_exposes_public_fields(client, db_session):
    stations = [
        _station(
            db_session,
            "Trạm Hải Phòng",
            "Hải Phòng",
            latitude=20.8449,
            longitude=106.6881,
        ),
        _station(
            db_session,
            "Trạm Hà Nội",
            "Hoàn Kiếm, Hà Nội",
            latitude=21.0285,
            longitude=105.8542,
        ),
        _station(
            db_session,
            "Trạm Vinh",
            "Nghệ An",
            latitude=18.6796,
            longitude=105.6813,
        ),
    ]
    for station in stations:
        charger = _charger(db_session, station)
        _connector(db_session, charger, 1)

    response = client.get(
        "/api/v1/stations/nearby?user_lat=21.0285&user_lon=105.8542"
    )

    assert response.status_code == 200
    data = response.json()
    assert [station["name"] for station in data] == [
        "Trạm Hà Nội",
        "Trạm Hải Phòng",
        "Trạm Vinh",
    ]
    assert data[0]["distance_km"] == 0
    assert 80 < data[1]["distance_km"] < 100
    assert data[2]["distance_km"] > data[1]["distance_km"]
    assert set(data[0]) == {
        "id",
        "name",
        "address",
        "latitude",
        "longitude",
        "distance_km",
        "connectors_available",
        "connectors_total",
        "connector_types",
        "current_price_per_kwh",
        "connectors",
    }
    assert set(data[0]["connectors"][0]) == {
        "connector_number",
        "connector_type",
        "max_power_kw",
        "status",
    }
    assert not {
        "operator_id",
        "total_grid_capacity_kw",
        "is_oversubscribed",
        "charging_points",
        "charge_point_id",
    }.intersection(data[0])


def test_nearby_counts_only_matching_available_connector_states(client, db_session):
    station = _station(db_session, "Trạm trạng thái", "Đường Trạng Thái")
    active_charger = _charger(db_session, station)
    _connector(db_session, active_charger, 1)
    _connector(
        db_session,
        active_charger,
        2,
        ocpp_status="Reserved",
        status="RESERVED",
    )
    _connector(
        db_session,
        active_charger,
        3,
        ocpp_status="Charging",
        status="OCCUPIED",
    )
    _connector(
        db_session,
        active_charger,
        4,
        ocpp_status="Faulted",
        status="FAULTED",
    )
    _connector(
        db_session,
        active_charger,
        5,
        ocpp_status="Unavailable",
        status="UNAVAILABLE",
    )
    _connector(db_session, active_charger, 6, is_active=False)
    _connector(
        db_session,
        active_charger,
        7,
        ocpp_status="Available",
        status="OCCUPIED",
    )
    offline_charger = _charger(db_session, station, status="Offline")
    _connector(db_session, offline_charger, 1)
    inactive_charger = _charger(db_session, station, is_active=False)
    _connector(db_session, inactive_charger, 1)

    response = client.get(
        "/api/v1/stations/nearby?q=trạm trạng thái"
    )

    assert response.status_code == 200
    station_data = response.json()[0]
    assert station_data["connectors_available"] == 1
    assert station_data["connectors_total"] == 7
    assert station_data["connector_types"] == ["CCS2"]
    assert next(
        connector
        for connector in station_data["connectors"]
        if connector["connector_number"] == 1
        and connector["status"] == "Offline"
    )

    _connector(
        db_session,
        active_charger,
        8,
        connector_type="TYPE_2",
    )
    filtered = client.get(
        "/api/v1/stations/nearby?q=trạm trạng thái&connector_type=TYPE2"
    )
    assert filtered.status_code == 200
    assert filtered.json()[0]["connectors_available"] == 1
    assert filtered.json()[0]["connectors_total"] == 1
    assert filtered.json()[0]["connector_types"] == ["TYPE_2"]


def test_nearby_excludes_inactive_and_non_active_stations(client, db_session):
    active = _station(db_session, "Trạm đang hoạt động", "Địa chỉ 1")
    _station(db_session, "Trạm bị tắt", "Địa chỉ 2", is_active=False)
    _station(db_session, "Trạm bảo trì", "Địa chỉ 3", status="UNDER_MAINTENANCE")

    response = client.get(
        "/api/v1/stations/nearby?user_lat=21&user_lon=105"
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [active.id]


def test_nearby_searches_name_or_address_and_requires_location_or_query(
    client, db_session
):
    station = _station(db_session, "Trạm Thanh HÓA", "Số 12 LÊ LỢI")

    by_name = client.get("/api/v1/stations/nearby?q=thanh hóa")
    by_address = client.get("/api/v1/stations/nearby?q=lê lợi")
    missing_criteria = client.get("/api/v1/stations/nearby")
    empty_query = client.get("/api/v1/stations/nearby?q=%20%20")

    assert by_name.status_code == by_address.status_code == 200
    assert by_name.json()[0]["id"] == by_address.json()[0]["id"] == station.id
    assert missing_criteria.status_code == 422
    assert empty_query.status_code == 422


def test_nearby_validates_coordinate_pair_and_bounds(client):
    missing_longitude = client.get("/api/v1/stations/nearby?user_lat=21")
    out_of_range = client.get(
        "/api/v1/stations/nearby?user_lat=91&user_lon=105"
    )

    assert missing_longitude.status_code == 422
    assert "phải được cung cấp cùng nhau" in missing_longitude.json()["detail"]
    assert out_of_range.status_code == 422


def test_nearby_uses_current_effective_tou_tariff_and_returns_null_without_tariff(
    client, db_session, monkeypatch
):
    now = datetime(2026, 10, 13, 10, 0, tzinfo=VIETNAM_TZ)
    monkeypatch.setattr(stations_endpoint, "get_vn_now", lambda: now)
    station = _station(db_session, "Trạm giá", "Địa chỉ giá")
    old_tariff = Tariff(
        station_id=station.id,
        name="Phiên bản cũ",
        price_normal=Decimal("100.00"),
        price_peak=Decimal("200.00"),
        price_offpeak=Decimal("50.00"),
        effective_from=datetime(2000, 1, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    current_tariff = Tariff(
        station_id=station.id,
        name="Phiên bản đang hiệu lực",
        price_normal=Decimal("1000.00"),
        price_peak=Decimal("2500.00"),
        price_offpeak=Decimal("500.00"),
        effective_from=now.astimezone(timezone.utc) - timedelta(hours=1),
        is_active=True,
    )
    future_tariff = Tariff(
        station_id=station.id,
        name="Phiên bản tương lai",
        price_normal=Decimal("9000.00"),
        price_peak=Decimal("9000.00"),
        price_offpeak=Decimal("9000.00"),
        effective_from=now.astimezone(timezone.utc) + timedelta(days=1),
        is_active=True,
    )
    no_tariff_station = _station(db_session, "Trạm chưa có giá", "Địa chỉ chưa giá")
    db_session.add_all([old_tariff, current_tariff, future_tariff])
    db_session.commit()

    peak_response = client.get("/api/v1/stations/nearby?q=Trạm giá")
    monkeypatch.setattr(
        stations_endpoint,
        "get_vn_now",
        lambda: now.replace(hour=15),
    )
    normal_response = client.get("/api/v1/stations/nearby?q=Trạm giá")
    no_tariff_response = client.get(
        f"/api/v1/stations/nearby?q={no_tariff_station.name}"
    )

    assert peak_response.status_code == normal_response.status_code == 200
    assert Decimal(str(peak_response.json()[0]["current_price_per_kwh"])) == Decimal(
        "2500.00"
    )
    assert Decimal(str(normal_response.json()[0]["current_price_per_kwh"])) == Decimal(
        "1000.00"
    )
    assert no_tariff_response.json()[0]["current_price_per_kwh"] is None


def test_nearby_offset_pages_cover_results_and_limit_is_capped(client, db_session):
    for index in range(53):
        _station(db_session, f"Trạm {index:02}", f"Địa chỉ {index}", latitude=21, longitude=105)

    first_page = client.get(
        "/api/v1/stations/nearby?user_lat=21&user_lon=105&limit=50"
    )
    second_page = client.get(
        "/api/v1/stations/nearby?user_lat=21&user_lon=105&limit=50&offset=50"
    )
    too_many = client.get(
        "/api/v1/stations/nearby?user_lat=21&user_lon=105&limit=51"
    )

    first_ids = {item["id"] for item in first_page.json()}
    second_ids = {item["id"] for item in second_page.json()}
    assert first_page.status_code == second_page.status_code == 200
    assert len(first_ids) == 50
    assert len(second_ids) == 3
    assert first_ids.isdisjoint(second_ids)
    assert len(first_ids | second_ids) == 53
    assert too_many.status_code == 422


def test_nearby_keeps_stations_without_coordinates_last_when_searching(client, db_session):
    station_with_coordinates = _station(
        db_session,
        "Trạm có tọa độ",
        "Hà Nội",
        latitude=21.0285,
        longitude=105.8542,
    )
    station_without_coordinates = _station(
        db_session,
        "Trạm không tọa độ",
        "Hải Phòng",
    )

    response = client.get(
        "/api/v1/stations/nearby?user_lat=21.0285&user_lon=105.8542&q=trạm"
    )
    radius_response = client.get(
        "/api/v1/stations/nearby?user_lat=21.0285&user_lon=105.8542&q=trạm&radius_km=1"
    )

    assert response.status_code == 200
    data = response.json()
    assert [item["id"] for item in data] == [
        station_with_coordinates.id,
        station_without_coordinates.id,
    ]
    assert data[1]["distance_km"] is None
    assert [item["id"] for item in radius_response.json()] == [
        station_with_coordinates.id
    ]
