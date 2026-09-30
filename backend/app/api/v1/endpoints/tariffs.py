from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.station import Station
from app.models.tariff import Tariff
from app.models.user import User
from app.schemas.tariff import TariffCreate, TariffResponse, TariffUpdate
from app.services.station_service import verify_station_ownership

router = APIRouter(prefix="/tariffs", tags=["Biểu giá điện linh hoạt (Tariffs)"])


@router.get(
    "",
    response_model=list[TariffResponse],
    summary="Xem danh sách biểu giá điện áp dụng",
)
def list_tariffs(
    station_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Tariff).filter(Tariff.is_active.is_(True))
    if station_id is not None:
        query = query.filter(
            (Tariff.station_id == station_id) | Tariff.station_id.is_(None)
        )
    return query.all()


@router.get(
    "/{tariff_id}",
    response_model=TariffResponse,
    summary="Xem chi tiết biểu giá",
)
def get_tariff(tariff_id: int, db: Session = Depends(get_db)):
    tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá."
        )
    return tariff


@router.post(
    "",
    response_model=TariffResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo biểu giá mới (Admin tạo chung/riêng, Chủ trạm chỉ tạo riêng cho trạm của mình)",
)
def create_tariff(
    tariff_in: TariffCreate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    # Kiểm tra phân quyền: Biểu giá chung chỉ Admin mới được tạo
    if tariff_in.station_id is None:
        if current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên mới có quyền tạo biểu giá chung toàn hệ thống.",
            )
    else:
        station = (
            db.query(Station)
            .filter(
                Station.id == tariff_in.station_id,
                Station.is_active.is_(True),
            )
            .first()
        )
        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy trạm sạc để áp dụng biểu giá.",
            )
        verify_station_ownership(station, current_user)

    new_tariff = Tariff(**tariff_in.model_dump())
    db.add(new_tariff)
    db.commit()
    db.refresh(new_tariff)
    return new_tariff


@router.put(
    "/{tariff_id}",
    response_model=TariffResponse,
    summary="Cập nhật biểu giá (Kiểm tra quyền sở hữu trạm)",
)
def update_tariff(
    tariff_id: int,
    tariff_in: TariffUpdate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá."
        )

    # Biểu giá chung chỉ Admin được sửa
    if tariff.station_id is None:
        if current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên mới có quyền cập nhật biểu giá chung toàn hệ thống.",
            )
    else:
        station = db.query(Station).filter(Station.id == tariff.station_id).first()
        if station:
            verify_station_ownership(station, current_user)

    update_data = tariff_in.model_dump(exclude_unset=True)
    if "station_id" in update_data and update_data["station_id"] != tariff.station_id:
        new_st_id = update_data["station_id"]
        if new_st_id is None:
            if current_user.role != "ADMIN":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Chỉ Quản trị viên mới có quyền chuyển biểu giá thành dùng chung toàn hệ thống.",
                )
        else:
            new_st = db.query(Station).filter(Station.id == new_st_id).first()
            if not new_st:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy trạm sạc mới.")
            verify_station_ownership(new_st, current_user)

    for field, value in update_data.items():
        setattr(tariff, field, value)

    db.commit()
    db.refresh(tariff)
    return tariff


@router.delete(
    "/{tariff_id}",
    summary="Vô hiệu hóa biểu giá (Soft delete - Kiểm tra quyền sở hữu)",
)
def delete_tariff(
    tariff_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá."
        )

    # Biểu giá chung chỉ Admin được xóa
    if tariff.station_id is None:
        if current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên mới có quyền xóa biểu giá chung toàn hệ thống.",
            )
    else:
        station = db.query(Station).filter(Station.id == tariff.station_id).first()
        if station:
            verify_station_ownership(station, current_user)

    tariff.is_active = False
    db.commit()
    return {"message": f"Đã vô hiệu hóa biểu giá '{tariff.name}' thành công."}
