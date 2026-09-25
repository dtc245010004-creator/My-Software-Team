import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.services.ai_service import AIService, latest_smart_charging_cache
from app.simulator.charging_simulator import simulator_manager
from app.core.websocket import ws_manager

logger = logging.getLogger("ev_csms.scheduler")

scheduler = AsyncIOScheduler()


async def calculate_and_broadcast_smart_charging(
    station_id: int,
    db: Session,
    use_gemini: bool = False,
):
    """
    Hàm lõi tính toán điều phối công suất trạm sạc dùng chung cho 3 cơ chế:
    1. Event-driven (Fast Loop / Heuristic)
    2. Periodic background job (Slow Loop / Gemini AI)
    3. On-demand API
    """
    station = db.query(Station).filter(Station.id == station_id, Station.is_active == True).first()
    if not station:
        return None

    # Lấy các phiên sạc đang chạy
    active_sessions = (
        db.query(ChargingSession)
        .join(Connector, ChargingSession.connector_id == Connector.id)
        .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
        .filter(
            ChargingPoint.station_id == station_id,
            ChargingSession.status == "ACTIVE",
        )
        .all()
    )

    active_requests = []
    for sess in active_sessions:
        conn = sess.connector
        charger = conn.charging_point if conn else None
        sim = simulator_manager.get_simulator(sess.id)

        soc = sim.soc if sim else (sess.current_soc if sess.current_soc > 0 else 25.0)
        req_power = conn.max_power_kw if conn else 30.0

        active_requests.append(
            {
                "session_id": sess.id,
                "connector_id": conn.id if conn else sess.connector_id,
                "charger_id": charger.id if charger else None,
                "charger_code": charger.code if charger else "EVSE-UNKNOWN",
                "connector_number": conn.connector_number if conn else 1,
                "soc": soc,
                "requested_power_kw": req_power,
            }
        )

    # Tính toán qua AIService (Gemini AI nếu use_gemini=True, hoặc Heuristic)
    if use_gemini:
        res = await AIService.get_smart_charging(
            station_id=station.id,
            grid_capacity_kw=station.total_grid_capacity_kw,
            active_requests=active_requests,
        )
    else:
        from app.services.fallback_service import FallbackService
        res = FallbackService.calculate_load_balancing_heuristic(
            station_id=station.id,
            grid_capacity_kw=station.total_grid_capacity_kw,
            active_requests=active_requests,
        )
        latest_smart_charging_cache[station.id] = res

    # Phát sóng kết quả qua WebSocket cho Dashboard Frontend
    try:
        await ws_manager.broadcast(
            {
                "event": "SMART_CHARGING_ALLOCATION_UPDATED",
                "station_id": station_id,
                "data": res.model_dump(),
            }
        )
    except Exception as e:
        logger.warning(f"Lỗi phát sóng Smart Charging qua WebSocket: {e}")

    return res


async def periodic_smart_charging_job():
    """Tác vụ chạy định kỳ mỗi 3-5 phút: Phân tích xu hướng tải toàn bộ trạm sạc đang hoạt động."""
    logger.debug("Bắt đầu chu kỳ định kỳ phân tích điều phối tải lưới điện (Slow Loop)...")
    db: Session = SessionLocal()
    try:
        # Tìm các trạm đang có phiên sạc ACTIVE
        stations_with_active_sessions = (
            db.query(Station.id)
            .join(ChargingPoint, ChargingPoint.station_id == Station.id)
            .join(Connector, Connector.charging_point_id == ChargingPoint.id)
            .join(ChargingSession, ChargingSession.connector_id == Connector.id)
            .filter(ChargingSession.status == "ACTIVE", Station.is_active == True)
            .distinct()
            .all()
        )

        for (st_id,) in stations_with_active_sessions:
            try:
                await calculate_and_broadcast_smart_charging(st_id, db, use_gemini=True)
            except Exception as e:
                logger.error(f"Lỗi phân tích định kỳ trạm #{st_id}: {e}")

    except Exception as exc:
        logger.error(f"Lỗi thực thi periodic_smart_charging_job: {exc}")
    finally:
        db.close()


def start_scheduler():
    """Khởi động bộ lập lịch APScheduler."""
    if not scheduler.running:
        scheduler.add_job(
            periodic_smart_charging_job,
            "interval",
            minutes=3,
            id="periodic_smart_charging",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Đã khởi động APScheduler cho tác vụ AI Smart Charging (chu kỳ 3 phút).")


def stop_scheduler():
    """Dừng bộ lập lịch APScheduler an toàn."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Đã dừng APScheduler.")
