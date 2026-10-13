from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.datetime_utils import VIETNAM_TZ, get_vn_now, to_vn_time
from app.models.session import ChargingSession
from app.models.station import Station
from app.models.tariff import Tariff
from app.models.tariff_period import TariffPeriod
from app.models.user import User
from app.schemas.tariff import TariffCreate, TariffResponse, TariffUpdate
from app.services.session_service import (
    determine_tou_rate,
    get_or_create_default_tariff,
)
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


class LiveTariffPeriodItem(BaseModel):
    start: str
    end: str
    price: float


class LiveTariffConfigPayload(BaseModel):
    station_id: int | None = None
    periods: list[LiveTariffPeriodItem]


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
    "/live-config",
    summary="Lấy cấu hình biểu giá nhiều khung giờ đang áp dụng thực tế",
)
def get_live_tariff_config(
    station_id: int | None = None,
    db: Session = Depends(get_db),
):
    tariff = get_or_create_default_tariff(db, station_id=station_id)
    if tariff and tariff.periods:
        ordered = sorted(tariff.periods, key=lambda p: (p.sort_order, p.id or 0))
        return {
            "station_id": tariff.station_id or station_id or 1,
            "periods": [
                {
                    "start": p.start_time,
                    "end": p.end_time,
                    "price": float(p.price_per_kwh),
                }
                for p in ordered
            ],
        }

    base_normal = float(tariff.price_normal) if tariff else 3200.0
    base_peak = float(tariff.price_peak) if tariff else 4500.0
    base_offpeak = float(tariff.price_offpeak) if tariff else 2500.0
    return {
        "station_id": station_id or 1,
        "periods": [
            {"start": "00:00", "end": "06:00", "price": base_offpeak},
            {"start": "06:00", "end": "18:00", "price": base_normal},
            {"start": "18:00", "end": "24:00", "price": base_peak},
        ],
    }


@router.put(
    "/live-config",
    summary="Cập nhật trực tiếp biểu giá nhiều khung giờ và đồng bộ ngay cho phiên sạc",
)
def update_live_tariff_config(
    payload: LiveTariffConfigPayload,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    if not payload.periods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phải có ít nhất 1 khung giờ biểu giá.",
        )

    # Cập nhật trên biểu giá mặc định toàn hệ thống (và biểu giá riêng của trạm nếu có)
    target_tariffs = (
        db.query(Tariff)
        .options(selectinload(Tariff.periods))
        .filter(Tariff.is_active.is_(True))
        .all()
    )
    if not target_tariffs:
        default_t = get_or_create_default_tariff(db, station_id=None)
        target_tariffs = [default_t]

    vn_now_time = get_vn_now().time()

    for t in target_tariffs:
        if payload.station_id is not None and t.station_id not in (None, payload.station_id):
            continue
        db.query(TariffPeriod).filter(TariffPeriod.tariff_id == t.id).delete(
            synchronize_session=False
        )
        new_periods = []
        for idx, item in enumerate(payload.periods):
            p_obj = TariffPeriod(
                tariff_id=t.id,
                start_time=item.start.strip(),
                end_time=item.end.strip(),
                price_per_kwh=Decimal(str(item.price)),
                sort_order=idx,
            )
            db.add(p_obj)
            new_periods.append(p_obj)
        t.periods = new_periods
        db.flush()

        # Tính đơn giá tại đúng thời điểm hiện tại theo khung giờ vừa lưu
        active_rate = determine_tou_rate(t, vn_now_time)
        t.price_normal = active_rate

    # Cập nhật luôn applied_price_per_kwh cho các phiên sạc đang chạy (ACTIVE) để Tài xế thấy đổi ngay
    primary_tariff = get_or_create_default_tariff(db, station_id=payload.station_id)
    current_rate = determine_tou_rate(primary_tariff, vn_now_time)
    active_sessions = (
        db.query(ChargingSession).filter(ChargingSession.status == "ACTIVE").all()
    )
    for sess in active_sessions:
        sess.applied_price_per_kwh = current_rate

    db.commit()

    return {
        "station_id": payload.station_id or 1,
        "applied_price_now": float(current_rate),
        "periods": [
            {"start": item.start, "end": item.end, "price": item.price}
            for item in payload.periods
        ],
    }


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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đã tồn tại biểu giá có hiệu lực từ thời điểm này cho trạm sạc chỉ định.",
        )
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
    # Tự động kế thừa toàn bộ thuộc tính của bản ghi cũ (trừ id, created_at, effective_from)
    # để tránh rủi ro quên cột khi model Tariff được mở rộng.
    ignored_columns = {"id", "created_at", "effective_from"}
    new_version_data = {
        col.name: getattr(current_tariff, col.name)
        for col in Tariff.__table__.columns
        if col.name not in ignored_columns
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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đã tồn tại biểu giá có hiệu lực từ thời điểm này cho trạm sạc chỉ định.",
        )
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
 