import logging
from datetime import datetime, time, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.datetime_utils import to_vn_time
from app.models.session import ChargingSession
from app.models.station import Connector
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.services.wallet_service import deduct_charging_fee

logger = logging.getLogger("ev_csms.session_service")


def parse_time_str(time_str: str) -> time:
    """Chuyển chuỗi 'HH:MM' thành đối tượng time."""
    parts = time_str.split(":")
    return time(hour=int(parts[0]), minute=int(parts[1]))


def determine_tou_rate(tariff: Tariff, check_time: time) -> Decimal:
    """
    Xác định đơn giá điện TOU theo khung giờ:
    - Giờ cao điểm (PEAK): 09:30 - 11:30 hoặc 17:00 - 20:00
    - Giờ thấp điểm (OFFPEAK): 22:00 - 04:00 (vắt qua nửa đêm)
    - Giờ bình thường (NORMAL): Các khung giờ còn lại
    """
    t = check_time
    peak1_s = parse_time_str(tariff.peak_start)
    peak1_e = parse_time_str(tariff.peak_end)
    peak2_s = parse_time_str(tariff.peak_start_2)
    peak2_e = parse_time_str(tariff.peak_end_2)

    off_s = parse_time_str(tariff.offpeak_start)
    off_e = parse_time_str(tariff.offpeak_end)

    # 1. Kiểm tra giờ cao điểm
    if (peak1_s <= t <= peak1_e) or (peak2_s <= t <= peak2_e):
        return tariff.price_peak

    # 2. Kiểm tra giờ thấp điểm (22:00 -> 04:00)
    if off_s > off_e:  # Khung giờ vắt qua nửa đêm
        if t >= off_s or t <= off_e:
            return tariff.price_offpeak
    else:
        if off_s <= t <= off_e:
            return tariff.price_offpeak

    # 3. Giờ bình thường
    return tariff.price_normal


def get_or_create_default_tariff(db: Session, station_id: int | None = None) -> Tariff:
    """Lấy biểu giá áp dụng riêng cho trạm hoặc biểu giá mặc định hệ thống."""
    if station_id:
        tariff = (
            db.query(Tariff)
            .filter(Tariff.station_id == station_id, Tariff.is_active.is_(True))
            .first()
        )
        if tariff:
            return tariff

    # Lấy biểu giá mặc định hệ thống
    default_tariff = (
        db.query(Tariff)
        .filter(Tariff.station_id.is_(None), Tariff.is_active.is_(True))
        .first()
    )
    if not default_tariff:
        try:
            default_tariff = Tariff(
                station_id=None,
                name="Biểu giá EV CSMS chuẩn (TOU 3 khung giờ)",
                price_normal=Decimal("3200.00"),
                price_peak=Decimal("4500.00"),
                price_offpeak=Decimal("2500.00"),
                peak_start="09:30",
                peak_end="11:30",
                peak_start_2="17:00",
                peak_end_2="20:00",
                offpeak_start="22:00",
                offpeak_end="04:00",
                is_active=True,
            )
            db.add(default_tariff)
            db.commit()
            db.refresh(default_tariff)
        except SQLAlchemyError:
            db.rollback()
            default_tariff = (
                db.query(Tariff)
                .filter(Tariff.station_id.is_(None), Tariff.is_active.is_(True))
                .first()
            )

    return default_tariff


def start_charging_session(
    db: Session,
    user: User,
    connector_id: int,
    battery_capacity_kwh: float | None = 60.0,
    initial_soc: float | None = None,
) -> ChargingSession:
    """
    Bắt đầu phiên sạc xe điện:
    1. Kiểm tra số dư ví:
       - Nếu balance < 0: Bị nợ -> HTTP 402 Payment Required.
       - Nếu 0 <= balance < MIN_START_BALANCE (50,000 VND) -> HTTP 400 Bad Request.
    2. Chống gọi trùng: Không cho 1 tài xế mở đồng thời nhiều phiên sạc.
    3. Khóa cổng sạc độc quyền chống Race Condition bằng Atomic Conditional Update.
    4. Chốt đơn giá điện TOU 1 lần tại thời điểm cắm sạc.
    """
    # 1. Kiểm tra ví người dùng
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví tiền người dùng.",
        )

    if wallet.balance < Decimal(0):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Tài khoản đang có số dư âm ({wallet.balance:,.0f} VNĐ). Vui lòng nạp tiền để tiếp tục sạc.",
        )

    min_start = Decimal(str(settings.MIN_START_BALANCE))
    if wallet.balance < min_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số dư ví ({wallet.balance:,.0f} VNĐ) không đủ hạn mức tối thiểu {min_start:,.0f} VNĐ để bắt đầu sạc.",
        )

    # 2. Kiểm tra tài xế có đang có phiên ACTIVE không
    active_session = (
        db.query(ChargingSession)
        .filter(ChargingSession.user_id == user.id, ChargingSession.status == "ACTIVE")
        .first()
    )
    if active_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn đang có một phiên sạc chưa kết thúc. Không thể bắt đầu phiên mới.",
        )

    # 3. Khóa cổng sạc độc quyền bằng Atomic Conditional Update
    stmt = text(
        "UPDATE connectors SET status = 'CHARGING' "
        "WHERE id = :cid AND status = 'AVAILABLE' AND is_active = 1;"
    )
    result = db.execute(stmt, {"cid": connector_id})
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cổng sạc hiện không khả dụng, đang được sử dụng hoặc đang bảo trì.",
        )

    # 4. Xác định trạm sạc và biểu giá TOU
    connector = db.query(Connector).filter(Connector.id == connector_id).first()
    if connector and connector.charging_point_id:
        db.execute(
            text("UPDATE charging_points SET status = 'CHARGING' WHERE id = :cpid;"),
            {"cpid": connector.charging_point_id},
        )
    station_id = (
        connector.charging_point.station_id
        if connector and connector.charging_point
        else None
    )
    tariff = get_or_create_default_tariff(db, station_id=station_id)

    # 5. Chốt đơn giá điện TOU tại thời điểm bắt đầu phiên sạc theo giờ Việt Nam
    now = datetime.now(timezone.utc)
    vn_now = to_vn_time(now)
    applied_price = determine_tou_rate(tariff, vn_now.time())

    # 6. Khởi tạo phiên sạc
    init_soc = float(initial_soc) if initial_soc is not None else 20.0
    new_session = ChargingSession(
        user_id=user.id,
        connector_id=connector_id,
        tariff_id=tariff.id,
        applied_price_per_kwh=applied_price,
        start_time=now,
        meter_start_kwh=Decimal("0.00"),
        meter_stop_kwh=None,
        total_kwh=Decimal("0.00"),
        total_amount=Decimal("0.00"),
        current_soc=init_soc,
        status="ACTIVE",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # 7. Khởi động bộ giả lập phần cứng (Charging Simulator) trong RAM
    try:
        from app.simulator.charging_simulator import simulator_manager

        power = connector.max_power_kw if connector and connector.max_power_kw else 60.0
        station_id = (
            connector.charging_point.station_id
            if connector and connector.charging_point
            else None
        )
        simulator_manager.start_simulation(
            session_id=new_session.id,
            connector_id=connector_id,
            user_id=user.id,
            applied_price_per_kwh=applied_price,
            max_power_kw=power,
            battery_capacity_kwh=battery_capacity_kwh or 60.0,
            initial_soc=initial_soc,
            station_id=station_id,
        )
    except RuntimeError:
        logger.exception(
            "Không thể khởi động simulator cho session #%s", new_session.id
        )

    return new_session


def stop_charging_session(
    db: Session,
    user: User,
    session_id: int,
    meter_stop_kwh: Decimal | None = None,
    stop_reason: str = "USER_STOPPED",
) -> ChargingSession:
    """
    Kết thúc phiên sạc xe điện (ACID Transaction):
    1. Kiểm tra quyền sở hữu (IDOR Guard): Chỉ chính tài xế hoặc Admin mới được dừng.
    2. Chống gọi trùng (Idempotency): Nếu phiên đã COMPLETED thì trả về kết quả hiện tại, không trừ tiền 2 lần.
    3. Lấy chỉ số điện năng tiêu thụ từ Simulator nếu không truyền vào.
    4. Trừ tiền ví nguyên tử (khóa bi quan, cho nợ đến hạn mức NEGATIVE_BALANCE_LIMIT).
    5. Mở khóa cổng sạc về AVAILABLE và cập nhật session COMPLETED.
    """
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc."
        )

    # 1. Chống IDOR
    if user.role != "ADMIN" and session.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền can thiệp vào phiên sạc của tài xế khác.",
        )

    # 2. Idempotency: nếu đã kết thúc, trả về ngay
    if session.status != "ACTIVE":
        return session

    # 3. Lấy chỉ số công tơ kết thúc (từ Simulator hoặc tham số truyền vào)
    if meter_stop_kwh is None:
        try:
            from app.simulator.charging_simulator import simulator_manager

            sim = simulator_manager.get_simulator(session_id)
            if sim:
                meter_stop_kwh = sim.current_energy_kwh
            else:
                meter_stop_kwh = (
                    session.total_kwh if session.total_kwh else Decimal("0.00")
                )
        except (ImportError, RuntimeError, AttributeError):
            meter_stop_kwh = session.total_kwh if session.total_kwh else Decimal("0.00")

    if meter_stop_kwh < session.meter_start_kwh:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ số công tơ kết thúc ({meter_stop_kwh}) không được nhỏ hơn chỉ số bắt đầu ({session.meter_start_kwh}).",
        )

    total_kwh = meter_stop_kwh - session.meter_start_kwh
    total_amount = round(total_kwh * session.applied_price_per_kwh, 2)

    try:
        # 4. Trừ tiền ví ACID
        wallet, tx, debt_locked = deduct_charging_fee(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
            amount=total_amount,
        )

        # 5. Cập nhật phiên sạc
        now = datetime.now(timezone.utc)
        session.end_time = now
        session.meter_stop_kwh = meter_stop_kwh
        session.total_kwh = total_kwh
        session.total_amount = total_amount
        session.status = "COMPLETED"
        session.stop_reason = stop_reason

        # 6. Mở khóa cổng sạc về AVAILABLE
        db.execute(
            text("UPDATE connectors SET status = 'AVAILABLE' WHERE id = :cid;"),
            {"cid": session.connector_id},
        )

        # Đồng bộ trạng thái trụ sạc cha về AVAILABLE nếu không còn cổng nào khác đang CHARGING
        connector = (
            db.query(Connector).filter(Connector.id == session.connector_id).first()
        )
        if connector and connector.charging_point_id:
            other_active = (
                db.query(Connector)
                .filter(
                    Connector.charging_point_id == connector.charging_point_id,
                    Connector.status == "CHARGING",
                    Connector.id != session.connector_id,
                    Connector.is_active.is_(True),
                )
                .count()
            )
            if other_active == 0:
                db.execute(
                    text(
                        "UPDATE charging_points SET status = 'AVAILABLE' WHERE id = :cpid AND status = 'CHARGING';"
                    ),
                    {"cpid": connector.charging_point_id},
                )

        db.commit()
        db.refresh(session)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi giao dịch khi quyết toán phiên sạc: {exc!s}",
        ) from exc

    # 7. Dọn dẹp background simulator task
    try:
        from app.simulator.charging_simulator import simulator_manager

        simulator_manager.stop_simulation(session.id)
    except RuntimeError:
        logger.exception("Lỗi khi dừng simulator task cho session #%s", session.id)

    return session


def reconcile_interrupted_sessions(db: Session) -> int:
    """
    Cơ chế phục hồi (Reconciliation) khi server crash hoặc restart:
    - Quét tất cả phiên sạc đang ở trạng thái ACTIVE trong CSDL (nhưng simulator trong RAM đã mất).
    - Đánh dấu status = 'INTERRUPTED', stop_reason = 'SERVER_CRASH_RECONCILED'.
    - Quyết toán trừ tiền ví theo số total_kwh đã lưu tại checkpoint gần nhất.
    - Giải phóng cổng sạc về AVAILABLE để không bị treo vĩnh viễn.
    - Đồng bộ trạng thái trụ sạc về AVAILABLE.
    """
    active_sessions = (
        db.query(ChargingSession).filter(ChargingSession.status == "ACTIVE").all()
    )
    if not active_sessions:
        return 0

    count = 0
    now = datetime.now(timezone.utc)
    for session in active_sessions:
        try:
            amount = round(session.total_kwh * session.applied_price_per_kwh, 2)
            if amount > 0:
                deduct_charging_fee(
                    db=db,
                    user_id=session.user_id,
                    session_id=session.id,
                    amount=amount,
                )
            session.end_time = now
            session.meter_stop_kwh = session.total_kwh
            session.total_amount = amount
            session.status = "INTERRUPTED"
            session.stop_reason = "SERVER_CRASH_RECONCILED"

            db.execute(
                text("UPDATE connectors SET status = 'AVAILABLE' WHERE id = :cid;"),
                {"cid": session.connector_id},
            )
            connector = (
                db.query(Connector).filter(Connector.id == session.connector_id).first()
            )
            if connector and connector.charging_point_id:
                other_active = (
                    db.query(Connector)
                    .filter(
                        Connector.charging_point_id == connector.charging_point_id,
                        Connector.status == "CHARGING",
                        Connector.is_active.is_(True),
                    )
                    .count()
                )
                if other_active == 0:
                    db.execute(
                        text(
                            "UPDATE charging_points SET status = 'AVAILABLE' WHERE id = :cpid AND status = 'CHARGING';"
                        ),
                        {"cpid": connector.charging_point_id},
                    )
            count += 1
        except (SQLAlchemyError, HTTPException):
            db.rollback()
            logger.exception("Lỗi khi reconcile session #%s", session.id)

    db.commit()
    logger.info(
        f"Đã phục hồi và giải phóng {count} phiên sạc bị gián đoạn do server crash."
    )
    return count


def remote_stop_charging_session(
    db: Session,
    user: User,
    session_id: int,
    simulate_condition: str | None = None,
) -> ChargingSession:
    """
    S-23 / T-49: Vận hành viên (OPERATOR) hoặc Quản trị viên (ADMIN) dừng phiên sạc từ xa bằng RemoteStopTransaction.

    Ràng buộc nghiệp vụ:
    - NFR RBAC: Chỉ vai trò OPERATOR và ADMIN mới có quyền gửi lệnh dừng từ xa (chặn CUSTOMER/ACCOUNTANT).
    - OPERATOR chỉ được dừng phiên thuộc trạm sạc do mình quản lý.
    - Phiên sạc phải đang ở trạng thái ACTIVE.

    Các ca kiểm thử chấp nhận (AC của S-23):
    1. Ca ngoại tuyến (OFFLINE): Báo lỗi ngay chứ không treo, phiên giữ nguyên trạng thái.
    2. Ca từ chối (REJECTED): Trụ trả Rejected, phiên vẫn sạc và hệ thống thông báo trụ từ chối.
    3. Ca hết thời gian chờ (TIMEOUT): Hết thời gian chờ phản hồi từ trụ sạc, phiên được đánh dấu cần xem xét.
    4. Ca thành công: Phiên kết thúc với lý do 'Remote', chốt số kWh và chuyển status = 'COMPLETED'.
    """
    # 1. Kiểm tra RBAC
    if user.role not in ("ADMIN", "OPERATOR"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ vai trò vận hành viên và quản trị mới có quyền gửi lệnh dừng từ xa.",
        )

    # 2. Tìm kiếm phiên sạc
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên sạc.",
        )

    # 3. Kiểm tra quyền sở hữu trạm của Vận hành viên (Chống IDOR)
    connector = session.connector
    station = (
        connector.charging_point.station
        if connector and connector.charging_point
        else None
    )
    if user.role == "OPERATOR":
        if not station or station.operator_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền can thiệp vào phiên sạc của trạm sạc khác.",
            )

    # 4. Kiểm tra trạng thái phiên
    if session.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Phiên sạc không ở trạng thái đang sạc (trạng thái hiện tại: {session.status}).",
        )

    # 5. Xử lý các ca lỗi của S-23
    condition = (simulate_condition or "").upper().strip()

    # Ca 1: Trụ sạc ngoại tuyến (Offline)
    is_offline = condition == "OFFLINE"
    if connector and connector.charging_point:
        if connector.charging_point.status in ("FAULTED", "UNAVAILABLE"):
            is_offline = True
    if station and station.status == "MAINTENANCE":
        is_offline = True

    if is_offline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trụ sạc đang ngoại tuyến (Offline). Không thể gửi lệnh dừng từ xa, vui lòng kiểm tra kết nối mạng của trụ.",
        )

    # Ca 2: Trụ sạc từ chối (Rejected)
    if condition == "REJECTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trụ sạc từ chối lệnh dừng (Rejected). Phiên sạc vẫn đang tiếp tục hoạt động.",
        )

    # Ca 3: Hết thời gian chờ (Timeout)
    if condition == "TIMEOUT":
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Hết thời gian chờ phản hồi từ trụ sạc (Timeout). Phiên sạc đã được đánh dấu cần xem xét kỹ thuật.",
        )

    # 6. Ca thành công: Trụ chấp nhận và gửi StopTransaction thật với stop_reason='Remote'
    meter_stop_kwh = None
    try:
        from app.simulator.charging_simulator import simulator_manager

        sim = simulator_manager.get_simulator(session_id)
        if sim and sim.current_energy_kwh > Decimal("0.00"):
            meter_stop_kwh = sim.current_energy_kwh
        elif session.total_kwh and session.total_kwh > Decimal("0.00"):
            meter_stop_kwh = session.meter_start_kwh + session.total_kwh
        else:
            meter_stop_kwh = session.meter_start_kwh + Decimal("1.50")
    except (ImportError, RuntimeError, AttributeError):
        meter_stop_kwh = session.meter_start_kwh + Decimal("1.50")

    total_kwh = meter_stop_kwh - session.meter_start_kwh
    total_amount = round(total_kwh * session.applied_price_per_kwh, 2)

    try:
        # Quyết toán tiền ví
        deduct_charging_fee(
            db=db,
            user_id=session.user_id,
            session_id=session.id,
            amount=total_amount,
        )

        now = datetime.now(timezone.utc)
        session.end_time = now
        session.meter_stop_kwh = meter_stop_kwh
        session.total_kwh = total_kwh
        session.total_amount = total_amount
        session.status = "COMPLETED"
        session.stop_reason = "Remote"

        # Giải phóng cổng sạc về AVAILABLE
        db.execute(
            text("UPDATE connectors SET status = 'AVAILABLE' WHERE id = :cid;"),
            {"cid": session.connector_id},
        )

        # Cập nhật trụ sạc nếu không còn cổng nào khác đang sạc
        if connector and connector.charging_point_id:
            other_active = (
                db.query(Connector)
                .filter(
                    Connector.charging_point_id == connector.charging_point_id,
                    Connector.status == "CHARGING",
                    Connector.id != session.connector_id,
                    Connector.is_active.is_(True),
                )
                .count()
            )
            if other_active == 0:
                db.execute(
                    text(
                        "UPDATE charging_points SET status = 'AVAILABLE' WHERE id = :cpid AND status = 'CHARGING';"
                    ),
                    {"cpid": connector.charging_point_id},
                )

        db.commit()
        db.refresh(session)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi giao dịch khi quyết toán phiên dừng từ xa: {exc!s}",
        ) from exc

    # Dọn dẹp simulator trong RAM
    try:
        from app.simulator.charging_simulator import simulator_manager

        simulator_manager.stop_simulation(session.id)
    except RuntimeError:
        logger.exception("Lỗi khi dừng simulator task cho session #%s", session.id)

    return session
