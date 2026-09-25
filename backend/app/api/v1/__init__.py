from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.core.database import get_db

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health", summary="Kiểm tra trạng thái hệ thống")
def health_check(db: Session = Depends(get_db)):
    """Kiểm tra hoạt động của API và kết nối CSDL."""
    db_status = "connected"
    try:
        db.execute(text("SELECT 1;"))
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
