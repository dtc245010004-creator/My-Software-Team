from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import require_roles
from app.core.database import get_db
from app.models.tariff import Tariff
from app.models.user import User
from app.schemas.tariff import TariffCreate, TariffResponse, TariffUpdate

router = APIRouter(prefix="/tariffs", tags=["Biểu giá điện linh hoạt (Tariffs)"])


@router.get(
    "",
    response_model=List[TariffResponse],
    summary="Xem danh sách biểu giá điện áp dụng",
)
def list_tariffs(
    station_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Tariff).filter(Tariff.is_active == True)
    if station_id is not None:
        query = query.filter((Tariff.station_id == station_id) | (Tariff.station_id == None))
    return query.all()


@router.get(
    "/{tariff_id}",
    response_model=TariffResponse,
    summary="Xem chi tiết biểu giá",
)
def get_tariff(tariff_id: int, db: Session = Depends(get_db)):
    tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá.")
    return tariff


@router.post(
    "",
    response_model=TariffResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo biểu giá mới (CPO / ADMIN)",
)
def create_tariff(
    tariff_in: TariffCreate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    new_tariff = Tariff(**tariff_in.model_dump())
    db.add(new_tariff)
    db.commit()
    db.refresh(new_tariff)
    return new_tariff


@router.put(
    "/{tariff_id}",
    response_model=TariffResponse,
    summary="Cập nhật biểu giá (CPO / ADMIN)",
)
def update_tariff(
    tariff_id: int,
    tariff_in: TariffUpdate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá.")

    update_data = tariff_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tariff, field, value)

    db.commit()
    db.refresh(tariff)
    return tariff


@router.delete(
    "/{tariff_id}",
    summary="Vô hiệu hóa biểu giá (Soft delete)",
)
def delete_tariff(
    tariff_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá.")

    tariff.is_active = False
    db.commit()
    return {"message": f"Đã vô hiệu hóa biểu giá '{tariff.name}' thành công."}
