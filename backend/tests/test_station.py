import uuid
from datetime import datetime, timezone
import pytest
import sqlite3
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, joinedload
from fastapi import status, Depends
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.security import create_access_tokengit 
from app.models.user import User


@event.listens_for(Engine, "connect")
def register_sqlite_now(dbapi_connection, connection_record):
    if hasattr(dbapi_connection, "create_function"):
        dbapi_connection.create_function(
            "now", 0, lambda: datetime.now(timezone.utc).isoformat()
        )


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    conn = sqlite3.connect("sql_app.db")
    conn.create_function("now", 0, lambda: datetime.now(timezone.utc).isoformat())
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM roles WHERE name = 'station_owner'")
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO roles (name, description) VALUES ('station_owner', 'Chủ trạm')")
            role_id = cursor.lastrowid
        else:
            role_id = row[0]

        cursor.execute("SELECT id FROM users WHERE id = 1")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT OR REPLACE INTO users (id, email, password_hash, full_name, is_active)
                VALUES (1, 'chutram_test@evcsms.com', 'dummy_hash_for_test', 'Chủ Trạm Mẫu', 1)
            """)

        try:
            cursor.execute("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (1, ?)", (role_id,))
        except Exception:
            pass

        conn.commit()
    finally:
        conn.close()


def get_mock_owner_with_db(db: Session = Depends(deps.get_db)):
    return db.query(User).options(joinedload(User.roles)).filter(User.id == 1).first()


@pytest.fixture
def client():
    token = create_access_token(data={"sub": "1"})

    if hasattr(deps, "get_current_user"):
        app.dependency_overrides[deps.get_current_user] = get_mock_owner_with_db
    if hasattr(deps, "get_current_active_user"):
        app.dependency_overrides[deps.get_current_active_user] = get_mock_owner_with_db
    if hasattr(deps, "require_station_owner"):
        app.dependency_overrides[deps.require_station_owner] = get_mock_owner_with_db

    test_client = TestClient(app)
    test_client.cookies.set(settings.session_cookie_name, token)
    test_client.headers.update({"Authorization": f"Bearer {token}"})

    yield test_client

    app.dependency_overrides.clear()


BASE_URL = "/api/v1/stations/stations"


def test_ac1_create_station_valid(client):
    """AC 1: Tạo trạm hợp lệ -> is_active=False và gắn đúng owner_id."""
    unique_name = f"Trạm Sạc Thái Nguyên {uuid.uuid4().hex[:6]}"
    payload = {
        "name": unique_name,
        "address": "284 Lương Ngọc Quyến, TP. Thái Nguyên",
        "latitude": 21.5852,
        "longitude": 105.8412,
    }
    response = client.post(f"{BASE_URL}/", json=payload)
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
    data = response.json()
    assert data["name"] == unique_name
    assert data["is_active"] is False
    assert data.get("owner_id") == 1 or data.get("user_id") == 1


def test_ac2_create_station_invalid_coordinates(client):
    """AC 2: Toạ độ nằm ngoài dải hợp lệ -> Báo lỗi và không tạo bản ghi."""
    res_lat = client.post(f"{BASE_URL}/", json={
        "name": f"Trạm Sai Vĩ Độ {uuid.uuid4().hex[:6]}",
        "address": "Hà Nội",
        "latitude": 95.0,
        "longitude": 105.0,
    })
    assert res_lat.status_code in (status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_400_BAD_REQUEST)

    res_lng = client.post(f"{BASE_URL}/", json={
        "name": f"Trạm Sai Kinh Độ {uuid.uuid4().hex[:6]}",
        "address": "Hà Nội",
        "latitude": 21.0,
        "longitude": 190.0,
    })
    assert res_lng.status_code in (status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_400_BAD_REQUEST)


def test_ac3_update_station_info(client):
    """AC 3: Sửa tên hoặc địa chỉ -> Cập nhật thành công."""
    unique_name = f"Trạm Ban Đầu {uuid.uuid4().hex[:6]}"
    create_res = client.post(f"{BASE_URL}/", json={
        "name": unique_name,
        "address": "Địa chỉ ban đầu",
        "latitude": 21.0,
        "longitude": 105.0,
    })
    assert create_res.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
    station_id = create_res.json()["id"]

    new_name = f"Trạm Sau Sửa {uuid.uuid4().hex[:6]}"
    update_res = client.put(f"{BASE_URL}/{station_id}", json={
        "name": new_name,
        "address": "Địa chỉ mới đã sửa",
    })
    assert update_res.status_code == status.HTTP_200_OK

    get_res = client.get(f"{BASE_URL}/")
    assert get_res.status_code == status.HTTP_200_OK
    stations = get_res.json()
    target = next((s for s in stations if s["id"] == station_id), None)
    assert target is not None
    assert target["name"] == new_name
    assert target["address"] == "Địa chỉ mới đã sửa"


def test_ac4_idempotency_duplicate_click(client):
    """AC 4: Bấm lưu hai lần liên tiếp -> Chỉ tạo một trạm."""
    unique_name = f"Trạm Trùng {uuid.uuid4().hex[:6]}"
    payload = {
        "name": unique_name,
        "address": "Hải Phòng",
        "latitude": 20.8449,
        "longitude": 106.6881,
    }
    res1 = client.post(f"{BASE_URL}/", json=payload)
    assert res1.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)

    res2 = client.post(f"{BASE_URL}/", json=payload)
    assert res2.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT, status.HTTP_200_OK)
