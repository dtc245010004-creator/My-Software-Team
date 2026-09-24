from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.charge_point import ChargePoint
from app.models.connector import Connector
from app.models.station import Station
from app.schemas.charge_point import ChargePointCreate, ChargePointResponse

router = APIRouter()


@router.post("/", response_model=ChargePointResponse, status_code=status.HTTP_201_CREATED)
def create_charge_point(
    *,
    db: Annotated[Session, Depends(get_db)],
    item_in: ChargePointCreate,
) -> Any:
    """
    Thêm mới một Trụ sạc và số đầu nối tương ứng.
    """
    # 1. Kiểm tra trạm có tồn tại không
    station = db.query(Station).filter(Station.id == item_in.station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trạm sạc không tồn tại",
        )

    # 2. Tạo ChargePoint
    cp = ChargePoint(
        station_id=item_in.station_id,
        code=item_in.code,
        status="offline",
    )
    db.add(cp)

    try:
        db.flush()

        # 3. Tạo Connectors
        for i in range(1, item_in.connector_count + 1):
            conn = Connector(
                charge_point_id=cp.id,
                connector_number=i,
                connector_type="Type2",
                status="offline",
            )
            db.add(conn)

        db.commit()
        db.refresh(cp)
        return cp
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Mã trụ sạc đã được dùng",
        )
