from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.core.rbac import roles
from app.crud.station import get_stations
from app.models.user import User
from app.schemas.station import StationCreate, StationResponse, StationUpdate
from app.services.station import create_station, update_station

router = APIRouter()


@router.get(
    "/",
    response_model=list[StationResponse],
    summary="Lấy danh sách trạm sạc",
    description="Trả về danh sách trạm thuộc quyền sở hữu của chủ trạm hiện tại.",
)
@roles("station_owner", "admin", "operator")
def read_stations(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    """API lấy danh sách trạm sạc.

    Tự động áp dụng logic phân quyền tầng truy vấn (Task 07):
    - Chủ trạm chỉ thấy trạm do chính mình sở hữu.
    - Admin / vận hành viên thấy toàn bộ trạm.
    """
    return get_stations(db, current_user)


@router.post(
    "/",
    response_model=StationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo trạm sạc mới",
    description="Chỉ tài khoản có vai trò chủ trạm (station_owner) mới được tạo trạm.",
)
@roles("station_owner")
def create_new_station(
    station_data: StationCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    """API tạo trạm sạc mới gắn với tài khoản đang đăng nhập.

    - AC 1: Trạm được gán owner_id = current_user.id và is_active = False (chưa hoạt động).
    - AC 2: Validate tọa độ [-90, 90] / [-180, 180] bằng Pydantic schema.
    - AC 4: UniqueConstraint (name, owner_id) chống tạo trạm trùng khi bấm lưu nhiều lần.
    """
    try:
        return create_station(db, station_data.model_dump(), current_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trạm sạc với tên này đã tồn tại cho tài khoản của bạn",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put(
    "/{station_id}",
    response_model=StationResponse,
    summary="Cập nhật thông tin trạm sạc",
    description="Chỉ chủ trạm sở hữu trạm đó mới có quyền sửa.",
)
@roles("station_owner")
def update_existing_station(
    station_id: int,
    station_data: StationUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    """API cập nhật thông tin trạm sạc.

    - AC 3: Kiểm tra quyền sở hữu (owner_id == current_user.id).
    - Dữ liệu sau khi cập nhật phải được lưu và phản ánh ngay trong danh sách trạm.
    """
    try:
        return update_station(
            db, station_id, station_data.model_dump(exclude_unset=True), current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
