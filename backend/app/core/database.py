from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Cấu hình tham số kết nối động dựa trên loại CSDL
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False,
        "timeout": 30,  # Chờ tối đa 30s nếu có transaction khác đang ghi
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)


# Bật chế độ WAL (Write-Ahead Logging) và Khóa ngoại (Foreign Keys) cho SQLite
@event.listens_for(engine, "connect")
def configure_sqlite_connection(dbapi_connection, connection_record):
    if settings.DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        # Bắt buộc bật kiểm tra khóa ngoại (SQLite mặc định tắt)
        cursor.execute("PRAGMA foreign_keys = ON;")
        # Bật WAL để hỗ trợ đọc và ghi đồng thời không bị lỗi database locked
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA synchronous = NORMAL;")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency cung cấp session CSDL cho FastAPI request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
