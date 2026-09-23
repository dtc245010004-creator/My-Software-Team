from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.core.rbac as rbac
from app.main import app


class FakeQuery:
    def __init__(self, user):
        self.user = user

    def options(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.user


class FakeDB:
    def __init__(self, user):
        self.user = user

    def query(self, *args, **kwargs):
        return FakeQuery(self.user)


def fake_get_db(user):
    def generator():
        yield FakeDB(user)

    return generator()


def make_user(role_name):
    return SimpleNamespace(
        id=1,
        is_active=True,
        roles=[
            SimpleNamespace(name=role_name)
        ],
    )


@pytest.fixture
def client(monkeypatch):
    user = make_user("admin")

    monkeypatch.setattr(
        rbac,
        "get_db",
        lambda: fake_get_db(user),
    )

    monkeypatch.setattr(
        rbac,
        "decode_access_token",
        lambda token: {"sub": "1"},
    )

    test_client = TestClient(app)

    test_client.cookies.set(
        "session_token",
        "test-token",
    )

    return test_client


def test_admin_role_allowed(client):
    response = client.get("/rbac-test/admin")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Bạn có quyền admin"
    }


def test_admin_cannot_access_operator(client, monkeypatch):
    user = make_user("admin")

    monkeypatch.setattr(
        rbac,
        "get_db",
        lambda: fake_get_db(user),
    )

    response = client.get("/rbac-test/operator")

    assert response.status_code == 403


def test_admin_cannot_access_owner(client, monkeypatch):
    user = make_user("admin")

    monkeypatch.setattr(
        rbac,
        "get_db",
        lambda: fake_get_db(user),
    )

    response = client.get("/rbac-test/owner")

    assert response.status_code == 403


def test_route_without_permission_is_denied(client):
    response = client.get(
        "/rbac-test/no-permission"
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Route chưa khai báo quyền"
    }


def test_unauthenticated_is_rejected(monkeypatch):
    user = make_user("admin")

    monkeypatch.setattr(
        rbac,
        "get_db",
        lambda: fake_get_db(user),
    )

    monkeypatch.setattr(
        rbac,
        "decode_access_token",
        lambda token: {"sub": "1"},
    )

    test_client = TestClient(app)

    response = test_client.get(
        "/rbac-test/admin"
    )

    assert response.status_code == 401