from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_optional_current_user, require_roles
from app.core.database import get_db
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.ocpp.dispatcher import OcppCallError, send_call_and_wait
from app.ocpp.gateway import active_ocpp_connections
from app.schemas.station import (
    ChargingPointCreate,
    ChargingPointResponse,
    ChargingPointStatusUpdate,
    ChargingPointUpdate,
    ConnectorCreate,
    ConnectorResponse,
)
from app.services.station_service import (
    atomic_reactivate_charger,
    atomic_soft_delete_charger,
    broadcast_status_change,
    enrich_charger_response,
    verify_charger_ownership,
    verify_station_ownership,
)

router = APIRouter(tags=["Quản lý Trụ sạc & Cổng sạc (Chargers & Connectors)"])


class ResetRequest(BaseModel):
    """Payload lệnh Reset theo OCPP 1.6J."""

    type: Literal["Soft", "Hard"]


@router.post(
    "/chargers/{code}/reset",
    summary="Gửi lệnh Reset OCPP tới trụ sạc đang kết nối",
)
async def reset_charging_point(
    code: str,
    reset_in: ResetRequest,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
):
    """Chỉ Admin/Operator được gửi lệnh Reset tới trụ đang online."""

    if code not in active_ocpp_connections:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trụ sạc đang ngoại tuyến.",
        )

    try:
        return await send_call_and_wait(
            code,
            "Reset",
            {"type": reset_in.type},
            timeout_seconds=30,
        )
    except ConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trụ sạc đang ngoại tuyến.",
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Trụ sạc không phản hồi lệnh Reset kịp thời.",
        ) from exc
    except OcppCallError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error_code": exc.error_code,
                "description": exc.description,
                "details": exc.details,
            },
        ) from exc


@router.get(
    "/chargers",
    response_model=List[ChargingPointResponse],
    summary="Lấy danh sách tất cả trụ sạc toàn hệ thống hoặc theo bộ lọc (Màn hình lưới theo dõi)",
)
def list_chargers(
    station_id: Optional[int] = Query(None, description="Lọc theo ID trạm sạc"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái vận hành"),
    search: Optional[str] = Query(
        None, description="Tìm theo mã EVSE ID, hãng hoặc model"
    ),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(100, ge=1, le=500, description="Số bản ghi tối đa"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    Lấy danh sách trụ sạc phục vụ màn hình lưới theo dõi trạng thái:
    - ADMIN: Xem tất cả trụ sạc trong toàn hệ thống.
    - OPERATOR: Xem các trụ sạc thuộc các trạm do mình sở hữu/quản lý.
    - CUSTOMER / Khách vãng lai: Xem các trụ sạc đang hoạt động (is_active=True).
    """
    query = db.query(ChargingPoint)

    if current_user and current_user.role == "OPERATOR":
        query = query.join(Station).filter(Station.operator_id == current_user.id)
    elif current_user and current_user.role == "ADMIN":
        pass
    else:
        query = query.filter(ChargingPoint.is_active.is_(True))

    if station_id is not None:
        query = query.filter(ChargingPoint.station_id == station_id)

    if status:
        query = query.filter(ChargingPoint.status == status.upper())

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            ChargingPoint.code.ilike(search_term)
            | ChargingPoint.vendor.ilike(search_term)
            | ChargingPoint.model.ilike(search_term)
        )

    chargers = (
        query.order_by(ChargingPoint.station_id.asc(), ChargingPoint.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [enrich_charger_response(c) for c in chargers]


@router.post(
    "/stations/{station_id}/chargers",
    response_model=ChargingPointResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm trụ sạc mới vào trạm sạc (Chặn IDOR cấp Station)",
)
def create_charger_for_station(
    station_id: int,
    charger_in: ChargingPointCreate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """
    Thêm trụ sạc vào trạm:
    - Kiểm tra trạm tồn tại và thuộc quyền sở hữu của Operator/Admin (IDOR Guard).
    - Kiểm tra mã trụ duy nhất toàn hệ thống.
    - Tự động tạo các cổng sạc kèm theo nếu được truyền vào.
    """
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc."
        )

    verify_station_ownership(station, current_user)

    # Kiểm tra trùng mã code
    existing_code = (
        db.query(ChargingPoint).filter(ChargingPoint.code == charger_in.code).first()
    )
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã trụ sạc '{charger_in.code}' đã tồn tại trong hệ thống.",
        )

    try:
        new_charger = ChargingPoint(
            station_id=station.id,
            code=charger_in.code,
            vendor=charger_in.vendor,
            model=charger_in.model,
            max_power_kw=charger_in.max_power_kw,
            firmware_version=charger_in.firmware_version,
            power_sharing_enabled=charger_in.power_sharing_enabled,
            status="AVAILABLE",
            is_active=True,
        )
        db.add(new_charger)
        db.flush()

        # Tạo các súng sạc nếu có
        seen_numbers = set()
        for conn_in in charger_in.connectors:
            if conn_in.connector_number in seen_numbers:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Trùng lặp số thứ tự súng #{conn_in.connector_number}.",
                )
            seen_numbers.add(conn_in.connector_number)
            new_conn = Connector(
                charging_point_id=new_charger.id,
                connector_number=conn_in.connector_number,
                connector_type=conn_in.connector_type,
                max_power_kw=conn_in.max_power_kw,
                status="AVAILABLE",
                is_active=True,
            )
            db.add(new_conn)

        db.commit()
        db.refresh(new_charger)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Xung đột dữ liệu: Mã trụ hoặc số thứ tự súng sạc bị trùng lặp.",
        )

    return enrich_charger_response(new_charger)


@router.get(
    "/chargers/{charger_id}",
    response_model=ChargingPointResponse,
    summary="Xem chi tiết trụ sạc và các cổng sạc trực thuộc",
)
def get_charger(
    charger_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    charger = db.query(ChargingPoint).filter(ChargingPoint.id == charger_id).first()
    if not charger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trụ sạc."
        )
    if current_user and current_user.role == "OPERATOR":
        if not charger.station or charger.station.operator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập trụ sạc này.",
            )
    return enrich_charger_response(charger)


@router.put(
    "/chargers/{charger_id}",
    response_model=ChargingPointResponse,
    summary="Cập nhật cấu hình trụ sạc (Chặn IDOR cấp Charger)",
)
def update_charger(
    charger_id: int,
    charger_in: ChargingPointUpdate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Cập nhật thông tin cấu hình trụ sạc: Chỉ Owner trạm cha hoặc Admin mới có quyền."""
    charger = db.query(ChargingPoint).filter(ChargingPoint.id == charger_id).first()
    if not charger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trụ sạc."
        )

    verify_charger_ownership(charger, current_user)

    update_data = charger_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(charger, field, value)

    db.commit()
    db.refresh(charger)
    return enrich_charger_response(charger)


@router.patch(
    "/chargers/{charger_id}/status",
    response_model=ChargingPointResponse,
    summary="Cập nhật trạng thái trụ sạc & Phát sóng WebSocket (Chặn IDOR)",
)
async def update_charger_status(
    charger_id: int,
    status_in: ChargingPointStatusUpdate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """
    Cập nhật trạng thái vận hành của trụ sạc:
    - Kiểm tra quyền sở hữu IDOR: Operator A không được PATCH trụ của Operator B.
    - Phát broadcast event realtime qua kênh WebSocket `/ws/telemetry`.
    """
    charger = db.query(ChargingPoint).filter(ChargingPoint.id == charger_id).first()
    if not charger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trụ sạc."
        )

    verify_charger_ownership(charger, current_user)

    charger.status = status_in.status
    db.commit()
    db.refresh(charger)

    # Phát sự kiện WebSocket
    await broadcast_status_change(
        entity_type="CHARGING_POINT",
        entity_id=charger.id,
        new_status=charger.status,
        extra={"station_id": charger.station_id, "code": charger.code},
    )

    return enrich_charger_response(charger)


@router.delete(
    "/chargers/{charger_id}",
    summary="Xóa mềm trụ sạc (Cascade Atomicity Soft-Delete)",
)
def delete_charger(
    charger_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Xóa mềm trụ sạc: Gán is_active = False cascade cho các súng sạc trong 1 Transaction."""
    charger = db.query(ChargingPoint).filter(ChargingPoint.id == charger_id).first()
    if not charger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trụ sạc."
        )

    verify_charger_ownership(charger, current_user)
    atomic_soft_delete_charger(db, charger)
    return {"message": f"Đã xóa mềm trụ sạc '{charger.code}' thành công."}


@router.post(
    "/chargers/{charger_id}/reactivate",
    response_model=ChargingPointResponse,
    summary="Phục hồi hoạt động trụ sạc sau khi đã xóa mềm",
)
def reactivate_charger(
    charger_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Phục hồi hoạt động trụ sạc và các súng sạc con."""
    charger = db.query(ChargingPoint).filter(ChargingPoint.id == charger_id).first()
    if not charger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trụ sạc."
        )

    verify_charger_ownership(charger, current_user)
    atomic_reactivate_charger(db, charger)
    return enrich_charger_response(charger)


@router.post(
    "/chargers/{charger_id}/connectors",
    response_model=ConnectorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm cổng sạc mới vào trụ sạc",
)
def add_connector(
    charger_id: int,
    conn_in: ConnectorCreate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Thêm cổng sạc vào trụ: Kiểm tra trùng lặp connector_number."""
    charger = db.query(ChargingPoint).filter(ChargingPoint.id == charger_id).first()
    if not charger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trụ sạc."
        )

    verify_charger_ownership(charger, current_user)

    existing_conn = (
        db.query(Connector)
        .filter(
            Connector.charging_point_id == charger.id,
            Connector.connector_number == conn_in.connector_number,
        )
        .first()
    )
    if existing_conn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cổng sạc #{conn_in.connector_number} đã tồn tại trên trụ sạc này.",
        )

    new_conn = Connector(
        charging_point_id=charger.id,
        connector_number=conn_in.connector_number,
        connector_type=conn_in.connector_type,
        max_power_kw=conn_in.max_power_kw,
        status="AVAILABLE",
        is_active=True,
    )
    db.add(new_conn)
    db.commit()
    db.refresh(new_conn)
    return ConnectorResponse.model_validate(new_conn)
