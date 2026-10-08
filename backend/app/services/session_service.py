import asyncio
import logging
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.datetime_utils import to_vn_time
from app.models.remote_start_request import RemoteStartRequest
from app.models.session import ChargingSession
from app.models.station import Connector
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.services.audit_service import ghi_nhat_ky
from app.services.billing import calculate_session_total
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

    # 2.5. Kiểm tra tính khả dụng của Cổng sạc, Trụ sạc và Trạm sạc
    connector = db.query(Connector).filter(Connector.id == connector_id).first()
    if not connector or not connector.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cổng sạc hoặc cổng sạc đã bị vô hiệu hóa.",
        )

    charger = connector.charging_point
    if not charger or not charger.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy trụ sạc hoặc trụ sạc đã bị vô hiệu hóa.",
        )

    # Chặn nếu trụ sạc đang trong trạng thái bảo trì hoặc gặp sự cố
    if charger.status in ("UNAVAILABLE", "FAULTED", "MAINTENANCE"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Trụ sạc '{charger.code}' hiện đang trong trạng thái {charger.status} (bảo trì/sự cố), không thể bắt đầu phiên sạc.",
        )

    # Chặn nếu trạm sạc cha đang tạm ngừng hoạt động hoặc bảo trì
    station = charger.station
    if station and (not station.is_active or station.status == "MAINTENANCE"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Trạm sạc '{station.name}' hiện đang tạm ngừng hoạt động hoặc bảo trì, không thể bắt đầu phiên sạc.",
        )

    # Chặn nếu cổng sạc không ở trạng thái AVAILABLE
    if connector.status != "AVAILABLE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cổng sạc hiện không khả dụng, đang được sử dụng hoặc đang bảo trì (Trạng thái: {connector.status}).",
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

    # 4. Cập nhật trụ sạc cha sang CHARGING và xác định biểu giá TOU
    db.execute(
        text("UPDATE charging_points SET status = 'CHARGING' WHERE id = :cpid;"),
        {"cpid": charger.id},
    )
    station_id = station.id if station else None
    tariff = get_or_create_default_tariff(db, station_id=station_id)

    # 5. Chốt đơn giá điện TOU tại thời điểm bắt đầu phiên sạc theo giờ Việt Nam
    now = datetime.now(timezone.utc)
    vn_now = to_vn_time(now)
    applied_price = determine_tou_rate(tariff, vn_now.time())

    # 6. Khởi tạo phiên sạc
    init_soc = float(initial_soc) if initial_soc is not None else 20.0
    connector.idle_started_at = None
    connector.idle_ended_at = None
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
    session.total_kwh = total_kwh
    billing_total = calculate_session_total(session, session.tariff)
    total_amount = billing_total.total_amount

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
        session.idle_amount = billing_total.idle_amount
        session.total_amount = total_amount
        session.status = "COMPLETED"
        session.stop_reason = stop_reason

        # 6. Mở khóa cổng sạc (bảo toàn trạng thái bảo trì nếu trụ cha đang bảo trì/lỗi)
        connector = (
            db.query(Connector).filter(Connector.id == session.connector_id).first()
        )
        charger = connector.charging_point if connector else None

        target_conn_status = "AVAILABLE"
        if charger and charger.status in ("UNAVAILABLE", "FAULTED", "MAINTENANCE"):
            target_conn_status = charger.status

        db.execute(
            text("UPDATE connectors SET status = :target_status WHERE id = :cid;"),
            {"target_status": target_conn_status, "cid": session.connector_id},
        )

        # Đồng bộ trạng thái trụ sạc cha về AVAILABLE chỉ khi không còn cổng nào khác đang CHARGING VÀ trụ không ở trạng thái bảo trì/lỗi
        if charger and charger.status == "CHARGING":
            other_active = (
                db.query(Connector)
                .filter(
                    Connector.charging_point_id == charger.id,
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
                    {"cpid": charger.id},
                )

        # S-27/T-57: audit nằm cùng transaction với việc đóng phiên.
        ghi_nhat_ky(
            db,
            user_id=user.id,
            action="StopTransaction",
            object_type="charging_session",
            object_id=session.id,
            data={"result": "Completed", "stop_reason": stop_reason, "transaction_id": session.transaction_id},
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
    except (RuntimeError, KeyError):
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
            billing_total = calculate_session_total(session, session.tariff)
            amount = billing_total.total_amount
            if amount > 0:
                deduct_charging_fee(
                    db=db,
                    user_id=session.user_id,
                    session_id=session.id,
                    amount=amount,
                )
            session.end_time = now
            session.meter_stop_kwh = session.total_kwh
            session.idle_amount = billing_total.idle_amount
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
        ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Offline"})
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trụ sạc đang ngoại tuyến (Offline). Không thể gửi lệnh dừng từ xa, vui lòng kiểm tra kết nối mạng của trụ.",
        )

    # Ca 2: Trụ sạc từ chối (Rejected)
    if condition == "REJECTED":
        ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Rejected"})
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trụ sạc từ chối lệnh dừng (Rejected). Phiên sạc vẫn đang tiếp tục hoạt động.",
        )

    # Ca 3: Hết thời gian chờ (Timeout)
    if condition == "TIMEOUT":
        session.needs_review = True
        ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Timeout"})
        db.commit()
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
    session.total_kwh = total_kwh
    billing_total = calculate_session_total(session, session.tariff)
    total_amount = billing_total.total_amount

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
        session.idle_amount = billing_total.idle_amount
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

        ghi_nhat_ky(
            db,
            user_id=user.id,
            action="RemoteStopTransaction",
            object_type="charging_session",
            object_id=session.id,
            data={"transaction_id": session.transaction_id, "result": "Accepted", "stop_reason": "Remote"},
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
    except (RuntimeError, KeyError):
        logger.exception("Lỗi khi dừng simulator task cho session #%s", session.id)

    return session


def force_close_abnormal_session(
    db: Session,
    user: User,
    session_id: int,
    reason: str,
    meter_stop_kwh: Decimal | None = None,
) -> ChargingSession:
    """
    Đóng tay thủ công một phiên sạc bất thường (SCRUM-52 / SCRUM-148):
    - RBAC: Chỉ vai trò Vận hành viên (OPERATOR), Kế toán (ACCOUNTANT) và Quản trị viên (ADMIN) mới được thực hiện.
    - Validation: Chặn đóng tay nếu không có lý do can thiệp.
    - Quyết toán số đo cuối và giải phóng cổng sạc.
    """
    clean_reason = (reason or "").strip()
    if not clean_reason or len(clean_reason) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải cung cấp lý do can thiệp để đóng phiên sạc (tối thiểu 3 ký tự).",
        )

    if user.role not in ("OPERATOR", "ACCOUNTANT", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ vai trò vận hành viên và kế toán mới được thực hiện đóng tay phiên sạc.",
        )

    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên sạc.",
        )

    # Nếu là OPERATOR: Kiểm tra quyền quản lý trạm sạc
    if user.role == "OPERATOR":
        from app.services.station_service import get_accessible_station_ids

        accessible_ids = get_accessible_station_ids(user, db)
        if session.station_id not in accessible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền can thiệp vào phiên sạc của trạm này.",
            )

    if session.status == "COMPLETED":
        return session

    # Xác định số đo công tơ kết thúc
    if meter_stop_kwh is None:
        try:
            from app.simulator.charging_simulator import simulator_manager

            sim = simulator_manager.get_simulator(session_id)
            if sim:
                meter_stop_kwh = sim.current_energy_kwh
            else:
                meter_stop_kwh = session.meter_stop_kwh or session.total_kwh or Decimal("0.00")
        except (ImportError, RuntimeError, AttributeError):
            meter_stop_kwh = session.meter_stop_kwh or session.total_kwh or Decimal("0.00")

    if meter_stop_kwh < session.meter_start_kwh:
        meter_stop_kwh = session.meter_start_kwh

    total_kwh = max(Decimal("0.00"), meter_stop_kwh - session.meter_start_kwh)
    total_amount = round(total_kwh * session.applied_price_per_kwh, 2)

    try:
        if total_amount > 0 and session.status == "ACTIVE":
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
        session.stop_reason = f"ĐÓNG TAY THỦ CÔNG: {clean_reason}"

        # Mở khóa cổng sạc về AVAILABLE
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
            detail=f"Lỗi khi đóng tay phiên sạc: {exc!s}",
        ) from exc

    # Dọn dẹp simulator nếu còn chạy ngầm
    try:
        from app.simulator.charging_simulator import simulator_manager

        simulator_manager.stop_simulation(session.id)
    except (RuntimeError, KeyError):
        logger.warning("Không thể dừng simulator task cho session #%s", session.id)

    return session
async def remote_start_charging_session(
    db: Session,
    user: User,
    connector_id: int,
    simulate_condition: str | None = None,
) -> "RemoteStartRequest":
    """Kiểm tra cổng, lưu yêu cầu chờ rồi gửi RemoteStartTransaction."""
    from app.models.id_tag import IdTag
    from app.models.remote_start_request import RemoteStartRequest
    from app.ocpp.dispatcher import OcppCallError, send_call_and_wait

    condition = (simulate_condition or "").upper().strip()

    connector = (
        db.query(Connector)
        .filter(Connector.id == connector_id, Connector.is_active.is_(True))
        .first()
    )
    if connector is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đầu nối.")
    station = connector.charging_point.station if connector.charging_point else None
    if station is None or not station.is_active:
        raise HTTPException(status_code=409, detail="Trạm sạc hiện không hoạt động.")

    # Ca 3 của S-24: Đầu nối bận
    if condition == "BUSY" or connector.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Đầu nối đang bận hoặc không khả dụng.")

    # Kiểm tra kết nối OCPP chỉ khi không phải chế độ mô phỏng
    if not condition:
        from app.ocpp.gateway import active_ocpp_connections

        code = connector.charging_point.code
        if code not in active_ocpp_connections:
            raise HTTPException(status_code=409, detail="Trụ sạc đang ngoại tuyến.")

    # Mỗi tài xế có một idTag ảo để dùng chung luồng xác thực với thẻ vật lý.
    tag = db.query(IdTag).filter(IdTag.user_id == user.id, IdTag.code.like("REMOTE-%")).first()
    if tag is None:
        tag = IdTag(code=f"REMOTE-{user.id}", user_id=user.id, status="active")
        db.add(tag)
        db.flush()

    # Xử lý ca EXPIRED: tạo yêu cầu với thời gian hết hạn đã qua
    if condition == "EXPIRED":
        request = RemoteStartRequest(
            user_id=user.id,
            connector_id=connector.id,
            id_tag=tag.code,
            status="PENDING",
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
        db.add(request)
        db.flush()
        db.commit()
        db.refresh(request)
        return request

    request = RemoteStartRequest(
        user_id=user.id,
        connector_id=connector.id,
        id_tag=tag.code,
        status="PENDING",
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
    )
    db.add(request)
    db.flush()
    # Commit trước khi gửi lệnh: Authorize/StartTransaction có thể về ngay sau
    # CALLRESULT và chạy trên một kết nối database độc lập.
    db.commit()
    db.refresh(request)

    def record_failure(result: str, error_code: str | None = None) -> None:
        db.refresh(request)
        if request.status != "STARTED":
            request.status = result.upper()
        data = {"result": result}
        if error_code:
            data["error_code"] = error_code
        ghi_nhat_ky(
            db,
            user_id=user.id,
            action="RemoteStartTransaction",
            object_type="connector",
            object_id=connector.id,
            data=data,
        )
        db.commit()

    # Xử lý các ca mô phỏng kiểm thử
    if condition == "OFFLINE":
        record_failure("Offline")
        raise HTTPException(status_code=409, detail="Trụ sạc đang ngoại tuyến.")

    if condition == "REJECTED":
        record_failure("Rejected")
        raise HTTPException(status_code=409, detail="Trụ sạc từ chối lệnh bắt đầu (Rejected).")

    if condition == "TIMEOUT":
        record_failure("Timeout")
        raise HTTPException(status_code=504, detail="Trụ sạc không phản hồi lệnh bắt đầu trong thời gian chờ.")

    if condition == "SUCCESS":
        # Mô phỏng thành công: Đánh dấu request và ghi audit log
        ghi_nhat_ky(
            db,
            user_id=user.id,
            action="RemoteStartTransaction",
            object_type="connector",
            object_id=connector.id,
            data={"result": "Accepted", "request_id": request.id},
        )
        try:
            new_session = start_charging_session(
                db=db,
                user=user,
                connector_id=connector.id,
            )
            request.status = "STARTED"
            request.transaction_id = new_session.id
        except (HTTPException, SQLAlchemyError, RuntimeError, ValueError) as exc:
            logger.warning("Không thể khởi tạo phiên sạc mô phỏng: %s", exc)

        db.commit()
        db.refresh(request)
        return request

    # Luồng thật: gửi lệnh OCPP RemoteStartTransaction
    code = connector.charging_point.code
    try:
        result = await send_call_and_wait(
            code,
            "RemoteStartTransaction",
            {"connectorId": connector.connector_id or connector.connector_number, "idTag": tag.code},
            timeout_seconds=30,
        )
    except ConnectionError as exc:
        record_failure("Offline")
        raise HTTPException(status_code=409, detail="Trụ sạc đang ngoại tuyến.") from exc
    except TimeoutError as exc:
        record_failure("Timeout")
        raise HTTPException(status_code=504, detail="Trụ sạc không phản hồi lệnh bắt đầu trong thời gian chờ.") from exc
    except OcppCallError as exc:
        record_failure("Rejected", exc.error_code)
        raise HTTPException(status_code=409, detail="Trụ sạc từ chối lệnh bắt đầu (Rejected).") from exc

    if str(result.get("status", "")).lower() != "accepted":
        record_failure("Rejected")
        raise HTTPException(status_code=409, detail="Trụ sạc từ chối lệnh bắt đầu (Rejected).")

    ghi_nhat_ky(
        db,
        user_id=user.id,
        action="RemoteStartTransaction",
        object_type="connector",
        object_id=connector.id,
        data={"result": "Accepted", "request_id": request.id},
    )
    db.commit()
    db.refresh(request)
    return request

async def remote_stop_charging_session_ocpp(
    db: Session,
    user: User,
    session_id: int,
) -> ChargingSession:
    """S-23/T-49 flow thật: RemoteStopTransaction Accepted -> chờ StopTransaction tối đa 2 phút."""
    from app.ocpp.dispatcher import (
        OcppCallError,
        pending_stop_transactions,
        register_stop_transaction_waiter,
        send_call_and_wait,
    )
    from app.ocpp.gateway import active_ocpp_connections

    if user.role not in ("ADMIN", "OPERATOR"):
        raise HTTPException(status_code=403, detail="Chỉ vai trò vận hành viên và quản trị mới có quyền gửi lệnh dừng từ xa.")
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên sạc.")
    connector = session.connector
    station = connector.charging_point.station if connector and connector.charging_point else None
    if user.role == "OPERATOR" and (not station or station.operator_id != user.id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền can thiệp vào phiên sạc của trạm sạc khác.")
    if session.status != "CHARGING":
        # App-created sessions dùng ACTIVE; vẫn cho phép remote stop nếu simulator chưa chuyển CHARGING.
        if session.status != "ACTIVE":
            raise HTTPException(status_code=400, detail=f"Phiên sạc không ở trạng thái đang sạc (trạng thái hiện tại: {session.status}).")
    code = connector.charging_point.code if connector and connector.charging_point else None
    if not code or code not in active_ocpp_connections:
        raise HTTPException(status_code=400, detail="Trụ sạc đang ngoại tuyến (Offline). Không thể gửi lệnh dừng từ xa.")

    waiter = register_stop_transaction_waiter(session.transaction_id)
    try:
        try:
            result = await send_call_and_wait(
                code, "RemoteStopTransaction", {"transactionId": session.transaction_id}, timeout_seconds=30
            )
        except ConnectionError as exc:
            # Không gửi được lệnh -> không ghi "result từ trụ".
            raise HTTPException(status_code=400, detail="Trụ sạc đang ngoại tuyến (Offline). Không thể gửi lệnh dừng từ xa.") from exc
        except TimeoutError as exc:
            session.needs_review = True
            ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Timeout"})
            db.commit()
            raise HTTPException(status_code=504, detail="Hết thời gian chờ phản hồi từ trụ sạc (Timeout).") from exc
        except OcppCallError as exc:
            ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Rejected", "error_code": exc.error_code})
            db.commit()
            raise HTTPException(status_code=409, detail="Trụ sạc từ chối lệnh dừng (Rejected). Phiên sạc vẫn đang tiếp tục hoạt động.") from exc

        if str(result.get("status", "")).lower() != "accepted":
            ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Rejected"})
            db.commit()
            raise HTTPException(status_code=409, detail="Trụ sạc từ chối lệnh dừng (Rejected). Phiên sạc vẫn đang tiếp tục hoạt động.")

        ghi_nhat_ky(db, user_id=user.id, action="RemoteStopTransaction", object_type="charging_session", object_id=session.id, data={"result": "Accepted", "transaction_id": session.transaction_id})
        db.commit()

        try:
            await asyncio.wait_for(waiter, timeout=120)
        except asyncio.TimeoutError as exc:
            session.needs_review = True
            session.is_abnormal = True
            session.abnormal_reason = "RemoteStopAcceptedButNoStopTransaction"
            db.commit()
            raise HTTPException(status_code=504, detail="Trụ đã chấp nhận lệnh dừng nhưng không gửi StopTransaction trong 2 phút; phiên được đánh dấu cần xem xét.") from exc

        # StopTransaction handler đã chốt phiên và lý do từ OCPP.
        db.refresh(session)
        return session
    finally:
        if pending_stop_transactions.get(session.transaction_id) is waiter:
            del pending_stop_transactions[session.transaction_id]


def calculate_session_price_segments(
    start_time: datetime,
    end_time: datetime,
    total_kwh: Decimal,
    tariff: Tariff,
) -> list[dict]:
    """
    Chia phiên sạc thành danh sách các đoạn giá theo khung giờ TOU (Story S-33):
    Mỗi đoạn gồm:
    - segment_index: int
    - rate_type: 'NORMAL' | 'PEAK' | 'OFFPEAK'
    - rate_name: str
    - time_range: str (HH:MM - HH:MM)
    - start_time: ISO string
    - end_time: ISO string
    - duration_minutes: int
    - kwh: Decimal
    - unit_price: Decimal
    - amount: Decimal
    """
    vn_start = to_vn_time(start_time)
    vn_end = to_vn_time(end_time)
    if not vn_start or not vn_end or vn_end <= vn_start:
        vn_end = vn_start + timedelta(minutes=1)

    # Lấy các mốc giờ ranh giới TOU
    # 04:00 (Hết thấp điểm), 09:30 (Bắt đầu cao điểm 1), 11:30 (Hết cao điểm 1)
    # 17:00 (Bắt đầu cao điểm 2), 20:00 (Hết cao điểm 2), 22:00 (Bắt đầu thấp điểm)
    boundary_times = [
        parse_time_str(tariff.offpeak_end),      # 04:00
        parse_time_str(tariff.peak_start),       # 09:30
        parse_time_str(tariff.peak_end),         # 11:30
        parse_time_str(tariff.peak_start_2),     # 17:00
        parse_time_str(tariff.peak_end_2),       # 20:00
        parse_time_str(tariff.offpeak_start),    # 22:00
    ]

    # Tìm các điểm cắt giữa vn_start và vn_end
    cut_points = [vn_start]
    current_date = vn_start.date()
    while current_date <= vn_end.date():
        for b_time in boundary_times:
            pt = datetime.combine(current_date, b_time, tzinfo=vn_start.tzinfo)
            if vn_start < pt < vn_end:
                cut_points.append(pt)
        current_date += timedelta(days=1)
    cut_points.append(vn_end)
    cut_points = sorted(list(set(cut_points)))

    raw_segments = []
    total_duration_sec = max(1, int((vn_end - vn_start).total_seconds()))

    for i in range(len(cut_points) - 1):
        t1 = cut_points[i]
        t2 = cut_points[i + 1]
        mid_time = (t1 + (t2 - t1) / 2).time()
        price = determine_tou_rate(tariff, mid_time)

        if price == tariff.price_peak:
            rate_type = "PEAK"
            rate_name = "Giờ cao điểm (Peak)"
        elif price == tariff.price_offpeak:
            rate_type = "OFFPEAK"
            rate_name = "Giờ thấp điểm (Off-peak)"
        else:
            rate_type = "NORMAL"
            rate_name = "Giờ bình thường (Normal)"

        sec = int((t2 - t1).total_seconds())
        raw_segments.append({
            "rate_type": rate_type,
            "rate_name": rate_name,
            "t1": t1,
            "t2": t2,
            "seconds": sec,
            "unit_price": price,
        })

    # Gom các đoạn liền kề có cùng rate_type và unit_price
    merged = []
    for s in raw_segments:
        if merged and merged[-1]["rate_type"] == s["rate_type"] and merged[-1]["unit_price"] == s["unit_price"]:
            merged[-1]["t2"] = s["t2"]
            merged[-1]["seconds"] += s["seconds"]
        else:
            merged.append(s)

    # Phân bổ sản lượng kWh theo thời lượng
    result = []
    allocated_kwh = Decimal("0.000")
    total_kwh_dec = Decimal(str(total_kwh or 0))

    for idx, seg in enumerate(merged, start=1):
        dur_sec = seg["seconds"]
        dur_min = max(1, round(dur_sec / 60))
        
        if idx == len(merged):
            seg_kwh = max(Decimal("0.000"), total_kwh_dec - allocated_kwh)
        else:
            proportion = Decimal(dur_sec) / Decimal(total_duration_sec)
            seg_kwh = round(total_kwh_dec * proportion, 3)
            allocated_kwh += seg_kwh

        seg_price = seg["unit_price"]
        amount = round(seg_kwh * seg_price, 2)
        
        t1_str = seg["t1"].strftime("%H:%M")
        t2_str = seg["t2"].strftime("%H:%M")
        time_range = f"{t1_str} - {t2_str}"

        result.append({
            "segment_index": idx,
            "rate_type": seg["rate_type"],
            "rate_name": seg["rate_name"],
            "time_range": time_range,
            "start_time": seg["t1"].isoformat(),
            "end_time": seg["t2"].isoformat(),
            "duration_minutes": dur_min,
            "kwh": seg_kwh,
            "unit_price": seg_price,
            "amount": amount,
        })

    return result


def get_session_invoice(db: Session, session_id: int, user: User) -> dict:
    """
    Truy xuất và tính toán chi tiết hóa đơn phiên sạc có diễn giải từng đoạn giá (S-33 / SCRUM-224):
    - Kiểm tra quyền truy cập (IDOR Guard).
    - Diễn giải từng đoạn giá theo khung giờ TOU (khoảng thời gian, kWh, đơn giá, thành tiền).
    - Tính phí chiếm trụ (nếu có).
    - Cảnh báo nếu phiên đang trong diện cần xem xét (NEEDS_REVIEW / ABNORMAL).
    """
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc."
        )

    # IDOR Guard
    if user.role != "ADMIN":
        if user.role == "OPERATOR":
            connector = session.connector
            station = connector.charging_point.station if connector and connector.charging_point else None
            if not station or (station.operator_id != user.id and session.user_id != user.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền xem thông tin hóa đơn phiên sạc này.",
                )
        elif session.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền xem thông tin hóa đơn phiên sạc của người khác.",
            )

    # Tra cứu các thực thể liên quan
    connector = session.connector
    charger = connector.charging_point if connector else None
    station = charger.station if charger else None
    driver = session.user
    tariff = session.tariff or get_or_create_default_tariff(db, station_id=station.id if station else None)

    # Thời gian bắt đầu và kết thúc
    now = datetime.now(timezone.utc)
    start_time = session.start_time or session.created_at
    end_time = session.end_time or (now if session.status == "ACTIVE" else start_time)
    total_dur_sec = max(1, int((end_time - start_time).total_seconds()))
    duration_minutes = max(1, round(total_dur_sec / 60))

    # Từng đoạn giá (Price segments)
    segments = calculate_session_price_segments(
        start_time=start_time,
        end_time=end_time,
        total_kwh=session.total_kwh or Decimal("0.00"),
        tariff=tariff,
    )

    charging_amount = sum((s["amount"] for s in segments), Decimal("0.00"))

    # Phí chiếm trụ (Idle Fee)
    idle_minutes = 0
    idle_rate_per_min = Decimal("1000.00")
    idle_fee = Decimal("0.00")
    if session.stop_reason in ("BATTERY_FULL", "IDLE_CHARGER", "EmergencyStop"):
        idle_minutes = 15
        idle_fee = round(Decimal(idle_minutes) * idle_rate_per_min, 2)

    total_amount = charging_amount + idle_fee
    if session.total_amount and session.total_amount > Decimal("0.00") and idle_fee == Decimal("0.00"):
        total_amount = session.total_amount

    # Kiểm tra trạng thái cần xem xét (AC S-33)
    is_reviewing = bool(
        session.needs_review
        or session.is_abnormal
        or session.status in ("NEEDS_REVIEW", "ABNORMAL")
    )
    review_message = None
    payment_status = "PAID" if session.status == "COMPLETED" else "IN_PROGRESS"
    if is_reviewing:
        review_message = (
            session.abnormal_reason
            or "Phiên sạc đang trong diện cần xem xét / đối soát kỹ thuật. Số tiền và sản lượng chi tiết đang được bộ phận vận hành xử lý."
        )
        payment_status = "PENDING_REVIEW"

    return {
        "session_id": session.id,
        "status": session.status,
        "is_reviewing": is_reviewing,
        "review_message": review_message,
        "driver_id": session.user_id,
        "driver_name": driver.full_name or driver.username if driver else None,
        "station_id": station.id if station else None,
        "station_name": station.name if station else None,
        "charger_code": charger.code if charger else None,
        "connector_id": session.connector_id,
        "connector_number": connector.connector_number if connector else None,
        "connector_type": connector.connector_type if connector else None,
        "start_time": start_time,
        "end_time": session.end_time,
        "duration_minutes": duration_minutes,
        "meter_start_kwh": session.meter_start_kwh or Decimal("0.00"),
        "meter_stop_kwh": session.meter_stop_kwh,
        "total_kwh": session.total_kwh or Decimal("0.00"),
        "applied_price_per_kwh": session.applied_price_per_kwh or tariff.price_normal,
        "tariff_name": tariff.name if tariff else "Biểu giá EV CSMS chuẩn (TOU 3 khung giờ)",
        "price_segments": segments,
        "charging_amount": charging_amount,
        "idle_minutes": idle_minutes,
        "idle_rate_per_min": idle_rate_per_min,
        "idle_fee": idle_fee,
        "tax_amount": Decimal("0.00"),
        "total_amount": total_amount,
        "payment_status": payment_status,
    }

