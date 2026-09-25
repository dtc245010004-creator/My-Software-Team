import pytest
from datetime import datetime, timezone
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core import rbac
from app.core.database import Base, engine, SessionLocal
from app.models.user import User
from app.models.station import Station
from app.api.deps import get_current_user, get_current_active_user


class FakeUser:
    def __init__(self, id, email, full_name, is_active, role_name):
        self.id = id
        self.email = email
        self.full_name = full_name
        self.is_active = is_active
        self.roles = [SimpleNamespace(name=role_name)]


def fake_get_db(user_obj):
    class MockQuery:
        def __init__(self, obj):
            self.obj = obj
        def options(self, *args, **kwargs):
            return self
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return self.obj

    class MockDB:
        def __init__(self, obj):
            self.obj = obj
        def query(self, *args, **kwargs):
            return MockQuery(self.obj)

    def generator():
        yield MockDB(user_obj)

    return generator()


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        owner = db.query(User).filter(User.id == 999).first()
        if not owner:
            owner = User(
                id=999,
                email="owner_s04_clean@evcharging.vn",
                password_hash="fakehash123",
                full_name="Clean Station Owner",
                is_active=True,
            )
            db.add(owner)
            db.commit()
    finally:
        db.close()


@pytest.fixture
def client(monkeypatch):
    test_owner = FakeUser(
        id=999,
        email="owner_s04_clean@evcharging.vn",
        full_name="Clean Station Owner",
        is_active=True,
        role_name="station_owner",
    )

    monkeypatch.setattr(rbac, "get_db", lambda: fake_get_db(test_owner))
    monkeypatch.setattr(rbac, "decode_access_token", lambda token: {"sub": "999"})

    # Map mock user vào dependency nội bộ của router
    app.dependency_overrides[get_current_user] = lambda: test_owner
    app.dependency_overrides[get_current_active_user] = lambda: test_owner

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer mock_owner_token"}


def test_ac1_create_station_valid(client, auth_headers):
    payload = {
        "name": f"Station Valid {datetime.now(timezone.utc).timestamp()}",
        "address": "123 Vo Van Ngan, Thu Duc, HCM",
        "latitude": 10.8505,
        "longitude": 106.7719
    }
    res = client.post("/api/v1/stations/", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == payload["name"]
    assert data["address"] == payload["address"]
    assert data["latitude"] == payload["latitude"]
    assert data["longitude"] == payload["longitude"]
    assert data["is_active"] is False
    assert data["owner_id"] == 999


def test_ac2_create_station_invalid_coordinates(client, auth_headers):
    payload_lat = {
        "name": "Invalid Lat Station",
        "address": "123 ABC",
        "latitude": 95.0,
        "longitude": 106.77
    }
    res_lat = client.post("/api/v1/stations/", json=payload_lat, headers=auth_headers)
    assert res_lat.status_code == 422

    payload_lng = {
        "name": "Invalid Lng Station",
        "address": "123 ABC",
        "latitude": 10.85,
        "longitude": 190.0
    }
    res_lng = client.post("/api/v1/stations/", json=payload_lng, headers=auth_headers)
    assert res_lng.status_code == 422


def test_ac3_update_station_info(client, auth_headers):
    create_payload = {
        "name": f"Station Update Test {datetime.now(timezone.utc).timestamp()}",
        "address": "Old Address",
        "latitude": 10.0,
        "longitude": 106.0
    }
    create_res = client.post("/api/v1/stations/", json=create_payload, headers=auth_headers)
    assert create_res.status_code == 201
    station_id = create_res.json()["id"]

    update_payload = {
        "name": "Updated Station Name",
        "address": "Updated Address 456"
    }
    update_res = client.put(f"/api/v1/stations/{station_id}", json=update_payload, headers=auth_headers)
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["name"] == "Updated Station Name"
    assert data["address"] == "Updated Address 456"


def test_ac4_idempotency_duplicate_click(client, auth_headers):
    payload = {
        "name": f"Station Duplicate {datetime.now(timezone.utc).timestamp()}",
        "address": "789 Unique Path",
        "latitude": 10.123,
        "longitude": 106.456
    }
    res1 = client.post("/api/v1/stations/", json=payload, headers=auth_headers)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/stations/", json=payload, headers=auth_headers)
    assert res2.status_code in [400, 409]
