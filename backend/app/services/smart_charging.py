"""Dịch vụ Smart Charging & Phân bổ công suất động (S-42, S-43 / Epic E-08)."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable

from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.ocpp.dispatcher import OcppCallError, send_call_and_wait
from app.ocpp.gateway import active_ocpp_connections

logger = logging.getLogger("ev_csms.smart_charging")

# Bộ nhớ lưu hạn mức công suất đang áp dụng cho từng phiên (transaction_id -> limit_W)
applied_session_limits: dict[int, int] = {}

# Khóa tuần tự hóa theo trạm (Station-level lock) để tránh race condition khi nhiều xe cắm sạc cùng lúc
station_locks: dict[int, asyncio.Lock] = {}

# Tập tham chiếu mạnh giữ các background tasks để tránh Garbage Collector thu hồi
_background_tasks: set[asyncio.Task] = set()


def get_station_lock(station_id: int) -> asyncio.Lock:
    """Lấy hoặc tạo mới asyncio.Lock cho từng trạm."""
    if station_id not in station_locks:
        station_locks[station_id] = asyncio.Lock()
    return station_locks[station_id]


def clear_applied_limits_cache() -> None:
    """Xóa sạch cache hạn mức (dành cho teardown/setup kiểm thử)."""
    applied_session_limits.clear()


def calculate_fair_share_targets(
    station_capacity_kw: float,
    sessions_data: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Hàm thuần (Pure Function) tính toán hạn mức Fair-Share công suất (Watt nguyên dương).

    Thuật toán S-43:
    1. Hạn mức trạm: P_station_W = int(station_capacity_kw * 1000).
    2. Mỗi phiên có công suất danh định đầu nối: rated_W = int(rated_power_kw * 1000).
    3. Giới hạn đang áp dụng: mặc định = rated_W nếu phiên chưa từng bị giới hạn.
    4. Nếu tổng rated_W <= P_station_W:
       - Hạn mức trạm dư dả.
       - Mỗi phiên nhận rated_W.
       - Nếu phiên chưa từng bị giới hạn (current_limit == rated_W) -> needs_update = False (không gửi gì).
       - Nếu phiên trước đó từng bị hạ tải (current_limit != rated_W) -> needs_update = True (khôi phục tải).
    5. Nếu tổng rated_W > P_station_W:
       - Trạm quá tải / over-subscribed -> kích hoạt Fair-Share chia đều.
       - fair_share_W = P_station_W // N (làm tròn xuống bằng số nguyên floor).
       - limit_W = min(rated_W, fair_share_W).
       - Bất biến: sum(limit_W) <= P_station_W (không vượt quá 1 Watt).
       - Nếu limit_W != current_limit -> needs_update = True (cần gửi SetChargingProfile).
       - Nếu limit_W == current_limit -> needs_update = False (chống spam).
    """
    p_station_w = int(max(0.0, float(station_capacity_kw or 0.0)) * 1000)
    n = len(sessions_data)
    if n == 0 or p_station_w <= 0:
        return []

    total_rated_w = sum(int(s["rated_W"]) for s in sessions_data)
    results = []

    if total_rated_w <= p_station_w:
        # Trường hợp thừa công suất: Mỗi xe được nạp tối đa theo công suất đầu nối (rated_W)
        for s in sessions_data:
            tx_id = s["transaction_id"]
            rated_w = s["rated_W"]
            current_limit = applied_session_limits.get(tx_id, rated_w)
            needs_update = current_limit != rated_w
            results.append({
                **s,
                "target_limit_W": rated_w,
                "current_limit_W": current_limit,
                "needs_update": needs_update,
            })
    else:
        # Trường hợp chia tải Fair-Share: Floor rounding chia đều cho N phiên
        fair_share_w = p_station_w // n
        for s in sessions_data:
            tx_id = s["transaction_id"]
            rated_w = s["rated_W"]
            allocated_w = min(rated_w, fair_share_w)
            current_limit = applied_session_limits.get(tx_id, rated_w)
            needs_update = current_limit != allocated_w
            results.append({
                **s,
                "target_limit_W": allocated_w,
                "current_limit_W": current_limit,
                "needs_update": needs_update,
            })

    return results


async def _dispatch_single_profile(
    charge_point_code: str,
    connector_number: int,
    transaction_id: int,
    limit_w: int,
) -> dict[str, Any]:
    """Gửi bản tin SetChargingProfile OCPP 1.6J tới một trụ với timeout 5s và retry đúng 1 lần."""
    charging_profile_id = int(transaction_id)
    if charge_point_code not in active_ocpp_connections:
        logger.warning(
            "WARNING: Charger %s unreachable (no websocket connection) for profile update",
            charge_point_code,
        )
        logger.info(
            "SetChargingProfile: charger=%s, connector=%s, transaction_id=%s, profile_id=%s, limit_W=%s, result=timeout",
            charge_point_code,
            connector_number,
            transaction_id,
            charging_profile_id,
            limit_w,
        )
        return {
            "status": "TIMEOUT",
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    payload = {
        "connectorId": int(connector_number),
        "csChargingProfiles": {
            "chargingProfileId": charging_profile_id,
            "stackLevel": 1,
            "chargingProfilePurpose": "TxProfile",
            "chargingProfileKind": "Relative",
            "transactionId": int(transaction_id),
            "chargingSchedule": {
                "chargingRateUnit": "W",
                "chargingSchedulePeriod": [
                    {
                        "startPeriod": 0,
                        "limit": int(limit_w),
                    }
                ],
            },
        },
    }

    # Thử gửi lần 1 (timeout 5s)
    try:
        res = await send_call_and_wait(
            charge_point_code, "SetChargingProfile", payload, timeout_seconds=5.0
        )
        status_str = res.get("status", "Accepted")
        logger.info(
            "SetChargingProfile: charger=%s, connector=%s, transaction_id=%s, profile_id=%s, limit_W=%s, result=%s",
            charge_point_code,
            connector_number,
            transaction_id,
            charging_profile_id,
            limit_w,
            status_str,
        )
        return {
            "status": status_str,
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }
    except (TimeoutError, ConnectionError) as exc:
        logger.debug(
            "Lần 1 gửi SetChargingProfile tới trụ %s bị timeout/lỗi mạng: %s. Thử lại lần 2...",
            charge_point_code,
            exc,
        )
    except OcppCallError as exc:
        # Lỗi CALLERROR từ trụ (ví dụ NotSupported)
        logger.exception(
            "ERROR: Charger %s does not support SetChargingProfile: %s (code=%s)",
            charge_point_code,
            exc.description,
            exc.error_code,
        )
        logger.info(
            "SetChargingProfile: charger=%s, connector=%s, transaction_id=%s, profile_id=%s, limit_W=%s, result=CALLERROR",
            charge_point_code,
            connector_number,
            transaction_id,
            charging_profile_id,
            limit_w,
        )
        return {
            "status": "CALLERROR",
            "error_code": exc.error_code,
            "description": exc.description,
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    # Thử lại (retry) đúng 1 lần với timeout 5s (CÙNG chargingProfileId)
    try:
        res = await send_call_and_wait(
            charge_point_code, "SetChargingProfile", payload, timeout_seconds=5.0
        )
        status_str = res.get("status", "Accepted")
        logger.info(
            "SetChargingProfile: charger=%s, connector=%s, transaction_id=%s, profile_id=%s, limit_W=%s, result=%s",
            charge_point_code,
            connector_number,
            transaction_id,
            charging_profile_id,
            limit_w,
            status_str,
        )
        return {
            "status": status_str,
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }
    except OcppCallError as exc:
        logger.exception(
            "ERROR: Charger %s does not support SetChargingProfile: %s (code=%s)",
            charge_point_code,
            exc.description,
            exc.error_code,
        )
        logger.info(
            "SetChargingProfile: charger=%s, connector=%s, transaction_id=%s, profile_id=%s, limit_W=%s, result=CALLERROR",
            charge_point_code,
            connector_number,
            transaction_id,
            charging_profile_id,
            limit_w,
        )
        return {
            "status": "CALLERROR",
            "error_code": exc.error_code,
            "description": exc.description,
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }
    except (TimeoutError, ConnectionError, OSError, RuntimeError) as exc:
        logger.warning(
            "WARNING: Charger %s unreachable for profile update after retry: %s",
            charge_point_code,
            exc,
        )
        logger.info(
            "SetChargingProfile: charger=%s, connector=%s, transaction_id=%s, profile_id=%s, limit_W=%s, result=timeout",
            charge_point_code,
            connector_number,
            transaction_id,
            charging_profile_id,
            limit_w,
        )
        return {
            "status": "TIMEOUT",
            "exception": exc,
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }


async def _execute_remote_stop_outside_lock(
    charge_point_code: str,
    transaction_id: int,
    station_id: int | None = None,
    reason: str = "trụ từ chối giới hạn công suất",
    session_factory: Callable[[], Any] | None = None,
) -> None:
    """Gửi RemoteStopTransaction ở tác vụ độc lập sau khi đã nhả khóa trạm (Timeout 30s).

    1. Phát sự kiện cảnh báo qua kênh /ws/telemetry cho chủ trạm/vận hành viên (dù stop thành công hay thất bại).
    2. Ghi lý do vào phiên sạc trong CSDL bằng trường có sẵn (abnormal_reason).
    3. Nếu RemoteStopTransaction bị từ chối hoặc timeout/không kết nối:
       - Ghi cảnh báo nghiêm trọng (CRITICAL).
       - Đánh dấu phiên bất thường (ABNORMAL) theo cơ chế sẵn có trong repo.
    """
    now_dt = datetime.now(timezone.utc)

    # 1. Phát sự kiện cảnh báo qua kênh /ws/telemetry (không có idTag)
    alert_event = {
        "event": "ALERT",
        "alert_type": "LOAD_SHEDDING_ALERT",
        "station_id": station_id,
        "charge_point_code": charge_point_code,
        "transaction_id": int(transaction_id),
        "reason": reason,
        "timestamp": now_dt.isoformat(),
    }
    try:
        from app.core.websocket import ws_manager

        await ws_manager.broadcast(alert_event)
    except Exception as ws_err:  # noqa: BLE001
        logger.warning(
            "Không thể phát cảnh báo WebSocket qua /ws/telemetry: %s", ws_err
        )

    # 2. Ghi nhận lý do vào phiên bằng trường có sẵn nếu tìm thấy
    if session_factory is None:
        from app.core.database import SessionLocal

        session_factory = SessionLocal

    try:
        with session_factory() as db:
            sess = (
                db.query(ChargingSession)
                .filter(ChargingSession.transaction_id == transaction_id)
                .first()
            )
            if sess:
                sess.abnormal_reason = reason
                sess.stop_reason = "RebalanceStop"
                db.commit()
    except Exception as db_err:  # noqa: BLE001
        logger.warning(
            "Không thể lưu lý do dừng tải vào phiên #%s: %s", transaction_id, db_err
        )

    # 3. Gửi RemoteStopTransaction tới trụ
    is_failed = False
    fail_reason = ""
    try:
        logger.critical(
            "CRITICAL: %s (SetChargingProfile). Đang gửi RemoteStopTransaction cho transactionId=%s để bảo vệ trạm...",
            reason,
            transaction_id,
        )
        res = await send_call_and_wait(
            charge_point_code,
            "RemoteStopTransaction",
            {"transactionId": int(transaction_id)},
            timeout_seconds=30.0,
        )
        if str(res.get("status", "")).lower() != "accepted":
            is_failed = True
            fail_reason = (
                f"RemoteStopTransaction bị từ chối bởi trụ {charge_point_code}: {res}"
            )
            logger.critical(
                "CRITICAL: %s cho transactionId=%s",
                fail_reason,
                transaction_id,
            )
        else:
            logger.info(
                "RemoteStopTransaction đã được trụ %s chấp nhận cho transactionId=%s. Đang chờ StopTransaction từ trụ...",
                charge_point_code,
                transaction_id,
            )
    except (TimeoutError, ConnectionError, OSError, RuntimeError, OcppCallError) as exc:
        is_failed = True
        fail_reason = f"Lỗi/Timeout khi gửi RemoteStopTransaction tới trụ {charge_point_code}: {exc}"
        logger.critical(
            "CRITICAL: %s cho transactionId=%s",
            fail_reason,
            transaction_id,
        )

    if is_failed:
        # Đánh dấu phiên bất thường ABNORMAL trong CSDL theo cơ chế sẵn có:
        # app/ocpp/handlers/start_transaction.py:184-188 & app/services/scheduler_service.py:381-382
        try:
            with session_factory() as db:
                sess = (
                    db.query(ChargingSession)
                    .filter(ChargingSession.transaction_id == transaction_id)
                    .first()
                )
                if sess:
                    sess.status = "ABNORMAL"
                    sess.is_abnormal = True
                    sess.abnormal_reason = f"{reason} - {fail_reason}"
                    sess.stop_reason = "RebalanceStopFailed"
                    now_err_dt = datetime.now(timezone.utc)
                    sess.stop_time = now_err_dt
                    sess.end_time = now_err_dt
                    db.commit()
                    logger.critical(
                        "CRITICAL: Đã đánh dấu phiên #%s sang trạng thái ABNORMAL do trụ không phản hồi lệnh dừng tải.",
                        transaction_id,
                    )
        except Exception as exc:  # noqa: BLE001
            logger.critical(
                "CRITICAL: Không thể cập nhật trạng thái ABNORMAL cho phiên #%s: %s",
                transaction_id,
                exc,
            )


def launch_remote_stop_task(
    charge_point_code: str,
    transaction_id: int,
    station_id: int | None = None,
    reason: str = "trụ từ chối giới hạn công suất",
    session_factory: Callable[[], Any] | None = None,
) -> asyncio.Task:
    """Khởi tạo tác vụ riêng gửi RemoteStopTransaction ngoài khóa trạm."""
    task = asyncio.create_task(
        _execute_remote_stop_outside_lock(
            charge_point_code=charge_point_code,
            transaction_id=transaction_id,
            station_id=station_id,
            reason=reason,
            session_factory=session_factory,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


async def rebalance_station_power(
    station_id: int,
    session_factory: Callable[[], Any] | None = None,
) -> None:
    """Thực thi phân bổ công suất động cho toàn bộ trạm (S-43).

    Bảo đảm:
    - Nhận session_factory để test cô lập CSDL (không gắn cứng SessionLocal).
    - Khóa tuần tự station_lock để chống race condition.
    - Dispatch song song qua asyncio.gather.
    - Gửi RemoteStopTransaction ở tác vụ riêng NGOÀI khóa trạm nếu bị Rejected.
    - Dọn dẹp cache phiên kết thúc.
    """
    if session_factory is None:
        from app.core.database import SessionLocal

        session_factory = SessionLocal

    lock = get_station_lock(station_id)
    rejected_sessions_to_stop: list[tuple[str, int]] = []

    async with lock:
        with session_factory() as db:
            station = db.query(Station).filter(Station.id == station_id).first()
            if not station:
                return

            station_capacity_kw = float(station.total_grid_capacity_kw or 0.0)

            # Đếm cả CHARGING và ACTIVE, loại trừ ABNORMAL
            active_sessions = (
                db.query(ChargingSession)
                .join(Connector, ChargingSession.connector_id == Connector.id)
                .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
                .filter(
                    ChargingPoint.station_id == station_id,
                    ChargingSession.status.in_(["CHARGING", "ACTIVE"]),
                )
                .all()
            )

            # Thu thập danh sách ID các phiên đang hoạt động để dọn dẹp cache
            active_tx_ids = {s.transaction_id for s in active_sessions}

            # Dọn dẹp cache của các phiên thuộc trạm này đã kết thúc
            all_known_station_txs = [
                tx_id
                for tx_id in list(applied_session_limits.keys())
                if tx_id not in active_tx_ids
            ]
            for dead_tx in all_known_station_txs:
                # Kiểm tra xem session này có thuộc trạm này không trước khi dọn
                old_sess = (
                    db.query(ChargingSession)
                    .join(Connector, ChargingSession.connector_id == Connector.id)
                    .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
                    .filter(
                        ChargingSession.transaction_id == dead_tx,
                        ChargingPoint.station_id == station_id,
                    )
                    .first()
                )
                if old_sess:
                    applied_session_limits.pop(dead_tx, None)

            if not active_sessions:
                return

            sessions_data = []
            for s in active_sessions:
                conn = s.connector
                cp = conn.charging_point if conn else None
                rated_kw = float(conn.max_power_kw or 22.0) if conn else 22.0
                connector_num = (
                    conn.connector_number or conn.connector_id or 1
                ) if conn else 1
                sessions_data.append({
                    "transaction_id": s.transaction_id,
                    "charge_point_code": cp.code if cp else "UNKNOWN",
                    "connector_number": connector_num,
                    "rated_W": int(rated_kw * 1000),
                })

            targets = calculate_fair_share_targets(station_capacity_kw, sessions_data)

            # Lọc các phiên cần gửi SetChargingProfile
            dispatch_tasks = []
            for item in targets:
                if item["needs_update"]:
                    dispatch_tasks.append(
                        _dispatch_single_profile(
                            charge_point_code=item["charge_point_code"],
                            connector_number=item["connector_number"],
                            transaction_id=item["transaction_id"],
                            limit_w=item["target_limit_W"],
                        )
                    )

            if not dispatch_tasks:
                return

            # Gửi song song tất cả các bản tin cần thiết
            results = await asyncio.gather(*dispatch_tasks, return_exceptions=True)

            # Duyệt kết quả từng phiên
            for res in results:
                if isinstance(res, Exception):
                    logger.warning(
                        "WARNING: Ngoại lệ không mong muốn khi gửi profile: %s", res
                    )
                    continue

                if not isinstance(res, dict):
                    continue

                status_resp = res.get("status")
                tx_id = res.get("transaction_id")
                limit_w = res.get("limit_W")
                cp_code = res.get("charge_point_code", "UNKNOWN")

                if status_resp == "Accepted":
                    if tx_id is not None and limit_w is not None:
                        applied_session_limits[tx_id] = limit_w
                        logger.info(
                            "Áp dụng thành công SetChargingProfile cho tx #%s trụ %s: %s W",
                            tx_id,
                            cp_code,
                            limit_w,
                        )
                elif status_resp == "Rejected":
                    logger.critical(
                        "CRITICAL: Trụ %s từ chối lệnh SetChargingProfile cho tx #%s",
                        cp_code,
                        tx_id,
                    )
                    if tx_id is not None:
                        rejected_sessions_to_stop.append(
                            (cp_code, tx_id, "trụ từ chối giới hạn công suất")
                        )
                elif status_resp == "CALLERROR":
                    # Đã được ghi nhận log ERROR tại _dispatch_single_profile; giữ nguyên phiên sạc
                    pass
                elif status_resp in ("TIMEOUT", "UNREACHABLE"):
                    logger.warning(
                        "WARNING: Charger %s unreachable/timeout for profile update: status=%s (xử lý như Rejected)",
                        cp_code,
                        status_resp,
                    )
                    if tx_id is not None:
                        rejected_sessions_to_stop.append(
                            (cp_code, tx_id, "trụ không phản hồi giới hạn công suất")
                        )

    # 3. Kích hoạt RemoteStopTransaction ngoài khóa trạm cho các phiên bị Rejected / Timeout
    for cp_code, tx_id, reason_text in rejected_sessions_to_stop:
        launch_remote_stop_task(
            charge_point_code=cp_code,
            transaction_id=tx_id,
            station_id=station_id,
            reason=reason_text,
            session_factory=session_factory,
        )


def trigger_rebalance_background(
    station_id: int,
    session_factory: Callable[[], Any] | None = None,
) -> asyncio.Task:
    """Kích hoạt rebalance trong tác vụ nền với quản lý tham chiếu an toàn."""
    task = asyncio.create_task(_safe_rebalance_runner(station_id, session_factory))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


async def _safe_rebalance_runner(
    station_id: int,
    session_factory: Callable[[], Any] | None = None,
) -> None:
    try:
        await rebalance_station_power(station_id, session_factory=session_factory)
    except Exception:
        logger.exception(
            "Lỗi không mong muốn trong tác vụ nền rebalance trạm #%s",
            station_id,
        )
