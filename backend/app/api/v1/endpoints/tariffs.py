from datetime import datetime, timedelta, timezone
 
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
 
from app.api.deps import require_roles
from app.core.database import get_db
from app.core.datetime_utils import VIETNAM_TZ, get_vn_now, to_vn_time
from app.models.station import Station
from app.models.tariff import Tariff
from app.models.tariff_period import TariffPeriod
from app.models.user import User
from app.schemas.tariff import TariffCreate, TariffResponse, TariffUpdate
from app.services.station_service import verify_station_ownership
from app.services.tariff_validation import validate_periods
 
router = APIRouter(prefix="/tariffs", tags=["Biểu giá điện linh hoạt (Tariffs)"])
 
 
def _build_periods(periods) -> list[TariffPeriod]:
    errors = validate_periods(periods)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return [
        TariffPeriod(
            **period.model_dump(exclude={"sort_order"}),
            sort_order=(
                period.sort_order if "sort_order" in period.model_fields_set else index
            ),
        )
        for index, period in enumerate(periods)
    ]
 
 
def _clone_periods(periods) -> list[TariffPeriod]:
    """Sao chép khung giờ của phiên bản cũ sang phiên bản biểu giá mới."""
    columns = [
        c.key
        for c in TariffPeriod.__table__.columns
        if c.key not in ("id", "tariff_id")
    ]
    return [
        TariffPeriod(**{col: getattr(period, col) for col in columns})
        for period in periods
    ]
 
 
@router.get(
    "",
    response_model=list[TariffResponse],
    summary="Xem danh sách biểu giá điện áp dụng",
)
def list_tariffs(
    station_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(Tariff)
        .options(selectinload(Tariff.periods))
        .filter(Tariff.is_active.is_(True))
    )
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
 
    # Kiểm tra ngày hiệu lực (effective_from): bắt buộc từ ngày mai trở đi theo giờ Việt Nam
    now_vn = get_vn_now()
    tomorrow_start_vn = datetime(
        now_vn.year, now_vn.month, now_vn.day, tzinfo=VIETNAM_TZ
    ) + timedelta(days=1)
 
    effective_dt = tariff_in.effective_from
    if effective_dt is None:
        # Mặc định bắt đầu từ 00:00 ngày mai theo giờ Việt Nam (chuyển sang UTC)
        effective_dt = tomorrow_start_vn.astimezone(timezone.utc)
    else:
        # Nếu truyền vào, kiểm tra phải >= 00:00 ngày mai theo giờ VN
        effective_dt_vn = to_vn_time(effective_dt)
        if effective_dt_vn < tomorrow_start_vn:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ngày hiệu lực của biểu giá phải từ ngày mai trở đi (theo giờ Việt Nam). Không được áp dụng trong quá khứ hoặc hôm nay.",
            )
 
    tariff_dict = tariff_in.model_dump(exclude={"periods"})
    tariff_dict["effective_from"] = effective_dt
    new_tariff = Tariff(**tariff_dict)
    if tariff_in.periods is not None:
        new_tariff.periods = _build_periods(tariff_in.periods)
    db.add(new_tariff)
    db.commit()
    db.refresh(new_tariff)
    return new_tariff
 
 
@router.put(
    "/{tariff_id}",
    response_model=TariffResponse,
    summary="Cập nhật biểu giá (Tạo phiên bản kế tiếp có hiệu lực từ tương lai, không ghi đè bản đang dùng)",
)
def update_tariff(
    tariff_id: int,
    tariff_in: TariffUpdate,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    current_tariff = db.query(Tariff).filter(Tariff.id == tariff_id).first()
    if not current_tariff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy biểu giá."
        )
 
    # Biểu giá chung chỉ Admin được sửa
    if current_tariff.station_id is None:
        if current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên mới có quyền cập nhật biểu giá chung toàn hệ thống.",
            )
    else:
        station = db.query(Station).filter(Station.id == current_tariff.station_id).first()
        if station:
            verify_station_ownership(station, current_user)
 
    # Kiểm tra ngày hiệu lực (effective_from): bắt buộc từ ngày mai trở đi theo giờ Việt Nam
    now_vn = get_vn_now()
    tomorrow_start_vn = datetime(
        now_vn.year, now_vn.month, now_vn.day, tzinfo=VIETNAM_TZ
    ) + timedelta(days=1)
 
    effective_dt = tariff_in.effective_from
    if effective_dt is None:
        effective_dt = tomorrow_start_vn.astimezone(timezone.utc)
    else:
        effective_dt_vn = to_vn_time(effective_dt)
        if effective_dt_vn < tomorrow_start_vn:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ngày hiệu lực của biểu giá phải từ ngày mai trở đi (theo giờ Việt Nam). Không được áp dụng trong quá khứ hoặc hôm nay.",
            )
 
    update_data = tariff_in.model_dump(exclude_unset=True, exclude={"periods"})
 
    # Kiểm tra quyền khi đổi trạm áp dụng của biểu giá
    if (
        "station_id" in update_data
        and update_data["station_id"] != current_tariff.station_id
    ):
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
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Không tìm thấy trạm sạc mới.",
                )
            verify_station_ownership(new_st, current_user)
 
    # Nguyên tắc S-34: Không ghi đè bản ghi cũ; tạo phiên bản mới kế tiếp
    new_version_data = {
        "station_id": current_tariff.station_id,
        "name": current_tariff.name,
        "price_normal": current_tariff.price_normal,
        "price_peak": current_tariff.price_peak,
        "price_offpeak": current_tariff.price_offpeak,
        "peak_start": current_tariff.peak_start,
        "peak_end": current_tariff.peak_end,
        "peak_start_2": current_tariff.peak_start_2,
        "peak_end_2": current_tariff.peak_end_2,
        "offpeak_start": current_tariff.offpeak_start,
        "offpeak_end": current_tariff.offpeak_end,
        "is_active": True,
        "effective_from": effective_dt,
    }
    new_version_data.update(update_data)
    new_version_data["effective_from"] = effective_dt
 
    new_version_tariff = Tariff(**new_version_data)
    # Khung giờ: nếu có gửi lên thì thay toàn bộ; nếu bỏ qua/null thì giữ nguyên
    # khung giờ của phiên bản cũ (sao chép sang phiên bản mới).
    if tariff_in.periods is not None:
        new_version_tariff.periods = _build_periods(tariff_in.periods)
    else:
        new_version_tariff.periods = _clone_periods(current_tariff.periods)
    db.add(new_version_tariff)
    db.commit()
    db.refresh(new_version_tariff)
    return new_version_tariff
 
 
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
 