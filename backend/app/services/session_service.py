from datetime import datetime, time, timezone
from decimal import Decimal
import logging
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.datetime_utils import to_vn_time
from app.core.websocket import ws_manager
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


def get_or_create_default_tariff(db: Session, station_id: Optional[int] = None) -> Tariff:
    """Lấy biểu giá áp dụng riêng cho trạm hoặc biểu giá mặc định hệ thống."""
    if station_id:
        tariff = (
            db.query(Tariff)
            .filter(Tariff.station_id == station_id, Tariff.is_active == True)
            .first()
        )
        if tariff:
            return tariff

    # Lấy biểu giá mặc định hệ thống
    default_tariff = (
        db.query(Tariff)
        .filter(Tariff.station_id == None, Tariff.is_active == True)
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
        except Exception:
            db.rollback()
            default_tariff = (
                db.query(Tariff)
                .filter(Tariff.station_id == None, Tariff.is_active == True)
                .first()
            )

    return default_tariff



def start_charging_session(
    db: Session,
    user: User,
    connector_id: int,
    battery_capacity_kwh: Optional[float] = 60.0,
    initial_soc: Optional[float] = None,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ví tiền người dùng.")

    if wallet.balance < Decimal("0"):
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
    station_id = connector.charging_point.station_id if connector and connector.charging_point else None
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
        simulator_manager.start_simulation(
            session_id=new_session.id,
            connector_id=connector_id,
            user_id=user.id,
            applied_price_per_kwh=applied_price,
            max_power_kw=power,
            battery_capacity_kwh=battery_capacity_kwh or 60.0,
            initial_soc=initial_soc,
        )
    except Exception as sim_err:
        logger.warning(f"Không thể khởi động simulator cho session #{new_session.id}: {sim_err}")

    return new_session


def stop_charging_session(
    db: Session,
    user: User,
    session_id: int,
    meter_stop_kwh: Optional[Decimal] = None,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc.")

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
                meter_stop_kwh = session.total_kwh if session.total_kwh else Decimal("0.00")
        except Exception:
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
        connector = db.query(Connector).filter(Connector.id == session.connector_id).first()
        if connector and connector.charging_point_id:
            other_active = (
                db.query(Connector)
                .filter(
                    Connector.charging_point_id == connector.charging_point_id,
                    Connector.status == "CHARGING",
                    Connector.id != session.connector_id,
                    Connector.is_active == True,
                )
                .count()
            )
            if other_active == 0:
                db.execute(
                    text("UPDATE charging_points SET status = 'AVAILABLE' WHERE id = :cpid AND status = 'CHARGING';"),
                    {"cpid": connector.charging_point_id},
                )

        db.commit()
        db.refresh(session)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi giao dịch khi quyết toán phiên sạc: {str(e)}",
        )

    # 7. Dọn dẹp background simulator task
    try:
        from app.simulator.charging_simulator import simulator_manager
        simulator_manager.stop_simulation(session.id)
    except Exception as sim_stop_err:
        logger.warning(f"Lỗi khi dừng simulator task cho session #{session.id}: {sim_stop_err}")

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
    active_sessions = db.query(ChargingSession).filter(ChargingSession.status == "ACTIVE").all()
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
            connector = db.query(Connector).filter(Connector.id == session.connector_id).first()
            if connector and connector.charging_point_id:
                other_active = (
                    db.query(Connector)
                    .filter(
                        Connector.charging_point_id == connector.charging_point_id,
                        Connector.status == "CHARGING",
                        Connector.is_active == True,
                    )
                    .count()
                )
                if other_active == 0:
                    db.execute(
                        text("UPDATE charging_points SET status = 'AVAILABLE' WHERE id = :cpid AND status = 'CHARGING';"),
                        {"cpid": connector.charging_point_id},
                    )
            count += 1
        except Exception as e:
            logger.error(f"Lỗi khi reconcile session #{session.id}: {e}")

    db.commit()
    logger.info(f"Đã phục hồi và giải phóng {count} phiên sạc bị gián đoạn do server crash.")
    return count

