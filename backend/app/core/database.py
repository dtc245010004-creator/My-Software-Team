from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# chuỗi kết nối đọc từ biến môi trường (không hardcode) — đúng NFR của T-01
engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency dùng trong mọi endpoint FastAPI cần truy vấn DB."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
