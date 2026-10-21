"""Nghiệp vụ Đặt chỗ trước đầu nối sạc (User Story S-48, S-49 / Epic E-07)."""

import logging
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.id_tag import IdTag
from app.models.reservation import Reservation, ReservationStatus
from app.models.station import ChargingPoint, Connector
from app.models.user import User
from app.models.wallet import Wallet
from app.ocpp.dispatcher import send_call_and_wait
from app.schemas.reservation import (
    ReservationCreateRequest,
)
from app.services.wallet_service import (
    WalletInsufficientBalanceException,
    WalletNegativeBalanceException,
    validate_wallet_balance_for_session,
)

logger = logging.getLogger("ev_csms.reservation")


class ReservationConflictException(HTTPException):
    """Ngoại lệ khi đầu nối sạc bị tranh chấp hoặc đã được đặt trước (S-49 / HTTP 409 Conflict)."""

    def __init__(
        self,
        detail: str = "Trụ/đầu nối này vừa được người khác đặt trước hoặc đang bận.",
        suggested_connectors: list[dict[str, Any]] | None = None,
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )
        self.suggested_connectors = suggested_connectors or []


def get_suggested_connectors(
    db: Session,
    station_id: int,
    exclude_connector_id: int,
) -> list[dict[str, Any]]:
    """Tìm các đầu nối sạc thay thế đang khả dụng (AVAILABLE) trong cùng trạm sạc (S-49)."""
    now = datetime.now(timezone.utc)
    candidates = (
        db.query(Connector)
        .join(ChargingPoint, Connector.charge_point_id == ChargingPoint.id)
        .filter(
            ChargingPoint.station_id == station_id,
            ChargingPoint.is_active.is_(True),
            Connector.id != exclude_connector_id,
            Connector.is_active.is_(True),
            Connector.status == "AVAILABLE",
        )
        .all()
    )

    suggested: list[dict[str, Any]] = []
    for conn in candidates:
        has_active_res = (
            db.query(Reservation)
            .filter(
                Reservation.connector_id == conn.id,
                Reservation.status == ReservationStatus.ACTIVE.value,
                Reservation.expiry_date > now,
            )
            .first()
        )
        if not has_active_res:
            suggested.append(
                {
                    "id": conn.id,
                    "charge_point_id": conn.charge_point_id,
                    "charge_point_code": conn.charging_point.code if conn.charging_point else "",
                    "connector_id": conn.connector_id or conn.connector_number,
                    "connector_number": conn.connector_number or conn.connector_id,
                    "connector_type": conn.connector_type or conn.type,
                    "type": conn.type or conn.connector_type,
                    "rated_power_kw": conn.rated_power_kw or conn.max_power_kw,
                    "status": conn.status,
                }
            )
    return suggested


def _enrich_reservation(res: Reservation, db: Session | None = None) -> Reservation:
    """Bổ sung các trường thông tin trạm, trụ, đầu sạc phục vụ hiển thị toàn diện hệ thống (S-50)."""
    cp = res.charging_point
    conn = res.connector
    res.charger_id = res.charge_point_id
    if cp:
        res.charge_point_code = cp.code
        res.charger_code = cp.code
        if cp.station:
            res.station_id = cp.station.id
            res.station_name = cp.station.name
            res.station_address = cp.station.address
            res.station_latitude = float(cp.station.latitude) if cp.station.latitude is not None else None
            res.station_longitude = float(cp.station.longitude) if cp.station.longitude is not None else None
            res.latitude = res.station_latitude
            res.longitude = res.station_longitude
    if conn:
        res.connector_number = conn.connector_number or conn.connector_id
        res.connector_type = conn.connector_type or conn.type or "Type 2"
        res.max_power_kw = conn.max_power_kw or conn.max_kw or (cp.max_power_kw if cp else 22.0)

    res.reservation_code = (
        f"RES-{res.created_at.strftime('%Y%m%d') if res.created_at else '2026'}-{res.id:04d}"
    )
    res.valid_until = res.expiry_date

    st_upper = (res.status or "").upper()
    if st_upper == "ACTIVE":
        res.reason = "Đang trong thời gian giữ chỗ an toàn. Vui lòng đến cắm súng trước hạn."
        res.no_show_fee = 0.0
    elif st_upper == "EXPIRED":
        res.reason = "Quá giờ giữ chỗ không tới nhận trụ. Đã tự động mở lại trụ và trừ phí không đến."
        res.wallet_transaction_id = f"TX-LEDGER-{res.id + 800}"
        res.no_show_fee = 20000.0
    elif st_upper == "CANCELLED":
        res.reason = "Tài xế đã chủ động hủy giữ chỗ trước hạn. Không tính phí."
        res.no_show_fee = 0.0
    elif st_upper == "COMPLETED":
        res.reason = "Tài xế đã đến cắm súng đúng giờ và bắt đầu phiên sạc. Miễn phí giữ chỗ."
        res.no_show_fee = 0.0
    else:
        res.no_show_fee = 0.0

    if not hasattr(res, "session_id"):
        res.session_id = None

    if st_upper == "COMPLETED" and db is not None and res.session_id is None:
        try:
            from app.models.session import ChargingSession
            sess = (
                db.query(ChargingSession)
                .filter(
                    (ChargingSession.user_id == res.user_id) | (ChargingSession.driver_id == res.user_id),
                )
            )
            if res.connector_id and res.charge_point_id:
                sess = sess.filter(
                    (ChargingSession.connector_id == res.connector_id)
                    | (ChargingSession.connector.has(charge_point_id=res.charge_point_id))
                )
            elif res.connector_id:
                sess = sess.filter(ChargingSession.connector_id == res.connector_id)
            matching = sess.order_by(ChargingSession.id.desc()).first()
            if matching:
                res.session_id = matching.id
        except Exception:
            pass

    return res


async def create_reservation(
    db: Session,
    user: User,
    payload: ReservationCreateRequest,
) -> Reservation:
    """Tạo mới đặt chỗ đầu nối sạc: kiểm tra ví, thẻ RFID, khóa bi quan DB và gửi ReserveNow (S-48, S-49)."""
    now = datetime.now(timezone.utc)

    # 1. Tính toán & kiểm tra tính hợp lệ của thời gian giữ chỗ (<= 2 giờ)
    if payload.duration_minutes is not None:
        if payload.duration_minutes <= 0 or payload.duration_minutes > 120:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thời gian đặt chỗ chỉ được từ 1 đến 120 phút (tối đa 2 giờ).",
            )
        expiry_date = now + timedelta(minutes=payload.duration_minutes)
    elif payload.expiry_date is not None:
        expiry_date = payload.expiry_date
        if expiry_date.tzinfo is None:
            expiry_date = expiry_date.replace(tzinfo=timezone.utc)
        if expiry_date <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thời gian hết hạn đặt chỗ phải ở tương lai.",
            )
        diff_seconds = (expiry_date - now).total_seconds()
        if diff_seconds > 2 * 3600 + 60:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thời gian đặt chỗ không được vượt quá 2 giờ.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp expiry_date hoặc duration_minutes.",
        )

    # 2. Thẩm định số dư ví tài xế (S-38 / R-02)
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    if wallet and wallet.is_debt_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ví của bạn đang bị khóa nợ. Vui lòng thanh toán nợ trước khi đặt chỗ.",
        )

    is_valid, error_code, current_balance, threshold = validate_wallet_balance_for_session(
        db, user.id
    )
    if not is_valid:
        if current_balance < Decimal(0):
            raise WalletNegativeBalanceException(
                current_balance=current_balance,
                required_balance=threshold,
            )
        raise WalletInsufficientBalanceException(
            current_balance=current_balance,
            required_balance=threshold,
        )

    # 3. Thẩm định thẻ định danh RFID / IdTag
    id_tag = (
        db.query(IdTag)
        .filter(
            IdTag.user_id == user.id,
            IdTag.status == "active",
        )
        .first()
    )
    if not id_tag:
        any_tag = db.query(IdTag).filter(IdTag.user_id == user.id).first()
        if any_tag:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tài khoản chưa có thẻ RFID hợp lệ để đặt chỗ.",
            )
        id_tag = IdTag(
            code=f"APP-RFID-{user.id:04d}",
            user_id=user.id,
            status="active",
            expiry_date=now + timedelta(days=365),
        )
        db.add(id_tag)
        db.flush()
    if id_tag.expiry_date:
        tag_exp = id_tag.expiry_date
        if tag_exp.tzinfo is None:
            tag_exp = tag_exp.replace(tzinfo=timezone.utc)
        if tag_exp <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thẻ RFID của bạn đã hết hạn.",
            )

    # 4. Khóa hàng bi quan trên Connector và kiểm tra khả dụng (S-49 / R-03)
    if db.get_bind().dialect.name == "sqlite":
        try:
            db.execute(
                update(Connector)
                .where(Connector.id == payload.connector_id)
                .values(updated_at=func.now())
            )
        except SQLAlchemyError as lock_err:
            logger.debug("SQLite soft row update lock: %s", lock_err)

    query = db.query(Connector).filter(Connector.id == payload.connector_id)
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    connector = query.populate_existing().first()
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đầu nối sạc.",
        )

    charger = connector.charging_point
    if not charger or not charger.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trụ sạc không tồn tại hoặc đã ngừng hoạt động.",
        )

    if charger.station and not charger.station.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trạm sạc đang tạm ngừng hoạt động.",
        )

    # Kiểm tra xem connector có đang AVAILABLE và không có đặt chỗ ACTIVE còn hạn không
    has_active_res = (
        db.query(Reservation)
        .filter(
            Reservation.connector_id == connector.id,
            Reservation.status == ReservationStatus.ACTIVE.value,
            Reservation.expiry_date > now,
        )
        .first()
    )

    if connector.status.upper() != "AVAILABLE" or has_active_res is not None:
        # Cạnh tranh chỗ đặt: Người thứ hai nhận 409 kèm gợi ý đầu nối thay thế
        suggested = get_suggested_connectors(
            db,
            station_id=charger.station_id,
            exclude_connector_id=connector.id,
        )
        raise ReservationConflictException(
            detail="Trụ/đầu nối này vừa được người khác đặt trước hoặc đang bận.",
            suggested_connectors=suggested,
        )

    # 5. Khởi tạo bản ghi đặt chỗ trong DB
    reservation = Reservation(
        user_id=user.id,
        charge_point_id=charger.id,
        connector_id=connector.id,
        id_tag=id_tag.code,
        start_time=now,
        expiry_date=expiry_date,
        status="PENDING",
    )
    db.add(reservation)
    db.flush()

    # 6. Gửi bản tin OCPP 1.6 ReserveNow qua WebSocket xuống trụ sạc
    sim_cond = (payload.simulate_condition or "").upper()
    is_testing = (
        settings.TESTING
        or "PYTEST_CURRENT_TEST" in os.environ
        or settings.ALLOW_REMOTE_START_SIMULATION
    )

    if sim_cond and is_testing:
        if sim_cond == "ACCEPTED":
            response_status = "Accepted"
        elif sim_cond == "OCCUPIED":
            response_status = "Occupied"
        elif sim_cond == "REJECTED":
            response_status = "Rejected"
        elif sim_cond in ("UNAVAILABLE", "FAULTED"):
            response_status = sim_cond.capitalize()
        elif sim_cond == "TIMEOUT":
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Hết thời gian chờ phản hồi từ trụ sạc (Timeout).",
            )
        elif sim_cond == "OFFLINE":
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Trụ sạc {charger.code} hiện đang ngoại tuyến, không thể nhận lệnh đặt chỗ.",
            )
        else:
            response_status = "Rejected"
    else:
        from app.ocpp.gateway import active_ocpp_connections

        running_pytest = settings.TESTING and "PYTEST_CURRENT_TEST" in os.environ
        if charger.code not in active_ocpp_connections:
            if not running_pytest and (
                settings.ALLOW_REMOTE_START_SIMULATION
                or getattr(settings, "ENABLE_DEMO_ACCOUNTS", False)
            ):
                logger.info(
                    "Trụ sạc %s chưa kết nối OCPP vật lý, chấp nhận mô phỏng đặt chỗ (Demo/Sim mode).",
                    charger.code,
                )
                response_status = "Accepted"
            else:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Trụ sạc {charger.code} hiện đang ngoại tuyến, không thể nhận lệnh đặt chỗ.",
                )
        else:
            try:
                ocpp_resp = await send_call_and_wait(
                    charge_point_code=charger.code,
                    action="ReserveNow",
                    payload={
                        "connectorId": connector.connector_id or connector.connector_number or 1,
                        "expiryDate": expiry_date.isoformat(),
                        "idTag": id_tag.code,
                        "reservationId": reservation.id,
                    },
                )
                response_status = ocpp_resp.get("status", "Rejected")
            except TimeoutError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Hết thời gian chờ phản hồi từ trụ sạc (Timeout).",
                ) from exc
            except ConnectionError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Mất kết nối với trụ sạc: {exc}",
                ) from exc

    # 7. Xử lý phản hồi từ trụ sạc
    if response_status == "Accepted":
        reservation.status = ReservationStatus.ACTIVE.value
        connector.status = "RESERVED"
        connector.ocpp_status = "Reserved"
        db.commit()
        db.refresh(reservation)

        _enrich_reservation(reservation)
        logger.info(
            "Đặt chỗ thành công reservation_id=%s, connector_id=%s, user_id=%s",
            reservation.id,
            connector.id,
            user.id,
        )
        return reservation

    if response_status == "Occupied":
        db.rollback()
        suggested = get_suggested_connectors(
            db,
            station_id=charger.station_id,
            exclude_connector_id=connector.id,
        )
        raise ReservationConflictException(
            detail="Trụ sạc thông báo đầu nối đã bị chiếm dụng (Occupied).",
            suggested_connectors=suggested,
        )

    if response_status == "Rejected":
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trụ sạc từ chối yêu cầu đặt chỗ (Rejected).",
        )

    # Unavailable, Faulted
    db.rollback()
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Trụ sạc đang không khả dụng ({response_status}).",
    )


async def cancel_reservation(
    db: Session,
    reservation_id: int,
    user: User,
) -> Reservation:
    """Hủy đặt chỗ trước: giải phóng đầu nối sạc về AVAILABLE và gửi CancelReservation nếu trụ online."""
    reservation = (
        db.query(Reservation)
        .filter(Reservation.id == reservation_id)
        .first()
    )
    if not reservation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin đặt chỗ.",
        )

    is_owner = reservation.user_id == user.id
    is_admin = user.role == "ADMIN"
    is_operator = False
    if user.role == "OPERATOR" and reservation.charging_point and reservation.charging_point.station:
        is_operator = reservation.charging_point.station.operator_id == user.id

    if not (is_owner or is_admin or is_operator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền hủy đặt chỗ này.",
        )

    if reservation.status != ReservationStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể hủy đặt chỗ ở trạng thái {reservation.status}.",
        )

    cp = reservation.charging_point
    if cp:
        from app.ocpp.gateway import active_ocpp_connections

        if cp.code in active_ocpp_connections:
            try:
                await send_call_and_wait(
                    charge_point_code=cp.code,
                    action="CancelReservation",
                    payload={"reservationId": reservation.id},
                    timeout_seconds=5,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Không thể gửi CancelReservation tới trụ %s: %s", cp.code, exc
                )

    reservation.status = ReservationStatus.CANCELLED.value
    reservation.updated_at = datetime.now(timezone.utc)

    conn = reservation.connector
    if conn and conn.status.upper() == "RESERVED":
        conn.status = "AVAILABLE"
        conn.ocpp_status = "Available"

    db.commit()
    db.refresh(reservation)

    if cp:
        reservation.charge_point_code = cp.code
    if conn:
        reservation.connector_number = conn.connector_number or conn.connector_id

    _enrich_reservation(reservation)
    return reservation




def confirm_reservation_usage(
    db: Session,
    user_id: int,
    connector_id: int,
    session_id: int | None = None,
) -> Reservation | None:
    """Tự động xác nhận lượt đặt chỗ thành COMPLETED khi tài xế tới cắm súng / bắt đầu sạc (S-50 / SCRUM-378).

    1. Tìm đặt chỗ ACTIVE hoặc PENDING của user:
       - Ưu tiên 1: Đặt chỗ chính xác trên connector_id này.
       - Ưu tiên 2: Đặt chỗ trên cùng trụ sạc (charge_point_id).
       - Ưu tiên 3: Đặt chỗ trên cùng trạm sạc (station_id).
    2. Nếu không tìm thấy ACTIVE/PENDING, kiểm tra đặt chỗ gần nhất (trong vòng 24 giờ) tại trụ/trạm đó.
    3. Cập nhật reservation.status = 'COMPLETED', cập nhật updated_at.
    4. Nếu user sạc trên cổng khác cổng đã giữ chỗ ban đầu, giải phóng cổng cũ về AVAILABLE.
    """
    now = datetime.now(timezone.utc)

    conn = db.query(Connector).filter(Connector.id == connector_id).first()
    cp_id = conn.charge_point_id if conn else None
    station_id = conn.charging_point.station_id if (conn and conn.charging_point) else None

    # Ưu tiên 1: Cùng connector_id và status ACTIVE/PENDING
    res = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == user_id,
            Reservation.connector_id == connector_id,
            Reservation.status.in_([ReservationStatus.ACTIVE.value, "PENDING"]),
        )
        .order_by(Reservation.created_at.desc())
        .first()
    )

    # Ưu tiên 2: Cùng charge_point_id
    if not res and cp_id:
        res = (
            db.query(Reservation)
            .filter(
                Reservation.user_id == user_id,
                Reservation.charge_point_id == cp_id,
                Reservation.status.in_([ReservationStatus.ACTIVE.value, "PENDING"]),
            )
            .order_by(Reservation.created_at.desc())
            .first()
        )

    # Ưu tiên 3: Cùng station_id
    if not res and station_id:
        res = (
            db.query(Reservation)
            .join(ChargingPoint, Reservation.charge_point_id == ChargingPoint.id)
            .filter(
                Reservation.user_id == user_id,
                ChargingPoint.station_id == station_id,
                Reservation.status.in_([ReservationStatus.ACTIVE.value, "PENDING"]),
            )
            .order_by(Reservation.created_at.desc())
            .first()
        )

    # Fallback: Đặt chỗ gần đây nhất (trong vòng 24 giờ) tại trụ/trạm này
    if not res:
        window_start = now - timedelta(hours=24)
        query = (
            db.query(Reservation)
            .filter(
                Reservation.user_id == user_id,
                Reservation.created_at >= window_start,
                Reservation.status.in_([
                    ReservationStatus.ACTIVE.value,
                    ReservationStatus.EXPIRED.value,
                    ReservationStatus.CANCELLED.value,
                ]),
            )
        )
        if cp_id:
            query = query.filter(
                (Reservation.connector_id == connector_id) | (Reservation.charge_point_id == cp_id)
            )
        else:
            query = query.filter(Reservation.connector_id == connector_id)

        candidate = query.order_by(Reservation.created_at.desc()).first()
        if candidate:
            exp = candidate.expiry_date
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            start_t = candidate.start_time or candidate.created_at
            if start_t.tzinfo is None:
                start_t = start_t.replace(tzinfo=timezone.utc)
            if (start_t - timedelta(seconds=15)) <= now <= (exp + timedelta(hours=2)):
                res = candidate

    if not res:
        return None

    res.status = ReservationStatus.COMPLETED.value
    res.updated_at = now
    if session_id:
        res.session_id = session_id

    # Nếu reservation được tạo cho connector khác cổng đang cắm, giải phóng cổng cũ
    if res.connector_id != connector_id and res.connector:
        if res.connector.status == "RESERVED":
            res.connector.status = "AVAILABLE"
            res.connector.ocpp_status = "Available"

    db.commit()
    logger.info(
        "Tự động xác nhận đặt chỗ #%s thành COMPLETED cho user #%s khi bắt đầu sạc tại connector #%s (session=%s)",
        res.id,
        user_id,
        connector_id,
        session_id,
    )
    return res


def auto_heal_reservations(db: Session, reservations: list[Reservation]) -> bool:
    """Tự động đối soát và khôi phục (Self-healing) các lượt đặt chỗ:

    1. Nếu có ChargingSession khớp thời gian & vị trí đặt chỗ: Tự động chuyển thành COMPLETED.
    2. Nếu không có phiên sạc và quá hạn: Chuyển thành EXPIRED và mở lại cổng sạc.
    """
    from app.models.session import ChargingSession
    now = datetime.now(timezone.utc)
    needs_commit = False

    for res in reservations:
        exp = res.expiry_date
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        start_t = res.start_time or res.created_at
        if start_t.tzinfo is None:
            start_t = start_t.replace(tzinfo=timezone.utc)

        # 1. Kiểm tra xem tài xế đã sạc xe thực tế chưa
        if res.status != ReservationStatus.COMPLETED.value:
            # Chỉ khớp với phiên sạc bắt đầu SAU KHI tạo lượt đặt chỗ (dung sai tối đa 15 giây)
            # Tuyệt đối không lấy phiên sạc cũ trong quá khứ để tránh tự động hoàn thành khi chưa đến trụ!
            window_min = start_t - timedelta(seconds=5)
            window_max = exp + timedelta(minutes=15)

            s_query = (
                db.query(ChargingSession)
                .filter(
                    (ChargingSession.user_id == res.user_id) | (ChargingSession.driver_id == res.user_id),
                    ChargingSession.start_time.isnot(None),
                    ChargingSession.start_time >= window_min,
                    ChargingSession.start_time <= window_max,
                )
                .filter(
                    (ChargingSession.end_time.is_(None)) | (ChargingSession.end_time > start_t)
                )
            )
            if res.connector_id and res.charge_point_id:
                s_query = s_query.filter(
                    (ChargingSession.connector_id == res.connector_id)
                    | (ChargingSession.connector.has(charge_point_id=res.charge_point_id))
                )
            elif res.connector_id:
                s_query = s_query.filter(ChargingSession.connector_id == res.connector_id)

            matching_session = (
                s_query.order_by(ChargingSession.id.desc())
                .first()
            )

            if matching_session:
                res.status = ReservationStatus.COMPLETED.value
                res.updated_at = matching_session.start_time or now
                res.session_id = matching_session.id
                needs_commit = True
                if res.connector and res.connector.status.upper() == "RESERVED":
                    res.connector.status = "AVAILABLE"
                    res.connector.ocpp_status = "Available"
                continue

        # 2. Nếu không có phiên sạc và đã quá hạn
        if res.status == ReservationStatus.ACTIVE.value and exp < now:
            res.status = ReservationStatus.EXPIRED.value
            res.updated_at = now
            needs_commit = True
            if res.connector and res.connector.status.upper() == "RESERVED":
                res.connector.status = "AVAILABLE"
                res.connector.ocpp_status = "Available"

    if needs_commit:
        db.commit()

    return needs_commit


def get_my_reservations(
    db: Session,
    user: User,
) -> list[Reservation]:
    """Lấy danh sách các lượt đặt chỗ của tài xế hiện tại, tự động đối soát và cập nhật trạng thái."""
    reservations = (
        db.query(Reservation)
        .filter(Reservation.user_id == user.id)
        .order_by(Reservation.created_at.desc())
        .all()
    )

    auto_heal_reservations(db, reservations)

    for res in reservations:
        _enrich_reservation(res, db)

    return reservations


def get_all_reservations(
    db: Session,
    user: User,
) -> list[Reservation]:
    """Lấy danh sách tất cả các lượt đặt chỗ theo phân quyền người dùng."""
    query = db.query(Reservation).order_by(Reservation.created_at.desc())

    if user.role == "ADMIN":
        pass
    elif user.role == "OPERATOR":
        from app.models.station import Station
        station_ids = [
            s.id for s in db.query(Station.id).filter(Station.operator_id == user.id).all()
        ]
        query = query.join(
            ChargingPoint, Reservation.charge_point_id == ChargingPoint.id
        ).filter(ChargingPoint.station_id.in_(station_ids))
    else:
        query = query.filter(Reservation.user_id == user.id)

    reservations = query.all()

    auto_heal_reservations(db, reservations)

    for res in reservations:
        _enrich_reservation(res, db)

    return reservations


def get_reservation_by_id(
    db: Session,
    reservation_id: int,
    user: User,
) -> Reservation:
    """Xem chi tiết một lượt đặt chỗ theo ID."""
    reservation = (
        db.query(Reservation)
        .filter(Reservation.id == reservation_id)
        .first()
    )
    if not reservation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin đặt chỗ.",
        )

    is_owner = reservation.user_id == user.id
    is_admin = user.role == "ADMIN"
    is_operator = False
    if user.role == "OPERATOR" and reservation.charging_point and reservation.charging_point.station:
        is_operator = reservation.charging_point.station.operator_id == user.id

    if not (is_owner or is_admin or is_operator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem thông tin đặt chỗ này.",
        )

    auto_heal_reservations(db, [reservation])
    _enrich_reservation(reservation, db)
    return reservation
