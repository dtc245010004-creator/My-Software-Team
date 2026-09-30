# ruff: noqa: E402

import os
import sys
from pathlib import Path

# Đảm bảo thư mục backend luôn nằm trong sys.path khi chạy từ bất kỳ thư mục nào (bao gồm CI runner)
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app as fastapi_app

TEST_DB_FILE = "./test_ev_csms.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_FILE}"

if os.path.exists(TEST_DB_FILE):
    try:
        os.remove(TEST_DB_FILE)
    except FileNotFoundError:
        pass

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)
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


@pytest.fixture(scope="function")
def client(db_session):
    """Fixture cung cấp TestClient đã override get_db trỏ vào DB test in-memory."""

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
