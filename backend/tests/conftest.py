# ruff: noqa: E402

import os
import sys
from pathlib import Path
from uuid import uuid4

# Đảm bảo thư mục backend luôn nằm trong sys.path khi chạy từ bất kỳ thư mục nào (bao gồm CI runner)
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Dùng chung một CSDL SQLite riêng cho mỗi lượt pytest giữa app và fixtures.
TEST_DB_FILE = Path.cwd() / f".pytest-ev-csms-{uuid4().hex}.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_FILE.as_posix()}"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.database import Base, engine as test_engine, get_db
from app.main import app as fastapi_app

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    """
    Function-scoped fixture:
    - Tạo mới toàn bộ bảng trước mỗi test case.
    - Xóa sạch toàn bộ bảng sau khi test kết thúc.
    - Đảm bảo tính cô lập tuyệt đối, không rò rỉ state giữa các test.
    """
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def pytest_unconfigure(config):
    """Đóng engine và chỉ xóa file CSDL tạm do lượt pytest này tạo."""
    test_engine.dispose()
    TEST_DB_FILE.unlink(missing_ok=True)


@pytest.fixture(scope="function")
def client(db_session):
    """TestClient dùng chung CSDL SQLite cô lập của lượt pytest hiện tại."""

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()
