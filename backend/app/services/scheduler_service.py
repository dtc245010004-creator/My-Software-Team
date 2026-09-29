import logging
from typing import Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.services.ai_service import AIService, latest_smart_charging_cache
from app.simulator.charging_simulator import simulator_manager
from app.core.websocket import ws_manager

logger = logging.getLogger("ev_csms.scheduler")

scheduler = AsyncIOScheduler()

# Bộ nhớ lưu năng lượng lũy kế của từng trạm tại lần tick trước (phục vụ tính delta kWh * 60)
# {station_id: cumulative_energy_kwh}
_last_station_cumulative_energy: Dict[int, float] = {}


def get_station_cumulative_energy(db: Session, station_id: int) -> float:
    """
    Tính tổng năng lượng lũy kế (kWh) của một trạm tại thời điểm hiện tại:
    = (Tổng total_kwh của các phiên sạc ĐÃ KẾT THÚC của trạm đó trong CSDL)
    + (Tổng current_energy_kwh của các phiên sạc ĐANG CHẠY trong RAM của trạm đó).
    Bảo toàn 100% điện năng, kể cả các phiên ngắn bắt đầu và kết thúc gọn trong chu kỳ.
    """
    completed_kwh = (
        db.query(func.coalesce(func.sum(ChargingSession.total_kwh), 0.0))
        .join(Connector, ChargingSession.connector_id == Connector.id)
        .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
        .filter(
            ChargingPoint.station_id == station_id,
            ChargingSession.status != "ACTIVE",
        )
        .scalar()
    ) or 0.0

    active_kwh = 0.0
    active_sims = list(simulator_manager.active_simulators.values())
    if active_sims:
        conn_ids = [s.connector_id for s in active_sims]
        st_conn_ids = set(
            cid for (cid,) in (
                db.query(Connector.id)
                .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
                .filter(ChargingPoint.station_id == station_id, Connector.id.in_(conn_ids))
                .all()
            )
        )
        for s in active_sims:
            if s.connector_id in st_conn_ids:
                active_kwh += float(s.current_energy_kwh or 0.0)

    return round(float(completed_kwh) + active_kwh, 4)


def reset_cumulative_energy_cache():
    """Reset bộ nhớ lũy kế năng lượng (phục vụ kiểm thử cô lập)."""
    global _last_station_cumulative_energy
    _last_station_cumulative_energy.clear()



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


async def record_station_power_metrics_minute_job(db: Session = None):
    """
    Tác vụ định kỳ mỗi 1 phút: Đo đếm và lưu công suất trung bình mỗi phút dựa trên năng lượng thực tế (P_avg = ΔkWh * 60).
    - Bảo toàn 100% năng lượng tiêu thụ, không bỏ sót bất kỳ phiên sạc nào dù ngắn hay dài.
    - Lấy tổng năng lượng lũy kế hiện tại (active trong RAM + completed trong DB).
    - Tính delta = hiện tại - lần tick trước.
    - Công suất trung bình: power_kw = round(delta * 60.0, 2).
    - Xử lý lần đầu chạy / restart server: delta = 0, power_kw = 0.0, lưu mốc lũy kế mới.
    """
    from datetime import datetime, timezone
    from app.models.station import StationPowerMetric

    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True
    try:
        stations = db.query(Station).filter(Station.is_active == True).all()
        if not stations:
            return

        # 1. Truy vấn tổng năng lượng của các phiên sạc ĐÃ KẾT THÚC theo từng trạm
        completed_rows = (
            db.query(ChargingPoint.station_id, func.coalesce(func.sum(ChargingSession.total_kwh), 0.0))
            .join(Connector, ChargingSession.connector_id == Connector.id)
            .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
            .filter(ChargingSession.status != "ACTIVE")
            .group_by(ChargingPoint.station_id)
            .all()
        )
        completed_energy_map = {st_id: float(kwh) for st_id, kwh in completed_rows}

        # 2. Thu thập năng lượng từ các phiên sạc ĐANG CHẠY trong RAM
        active_sims = list(simulator_manager.active_simulators.values())
        conn_ids = [s.connector_id for s in active_sims]
        conn_station_map = {}
        if conn_ids:
            rows = (
                db.query(Connector.id, ChargingPoint.station_id)
                .join(ChargingPoint, Connector.charging_point_id == ChargingPoint.id)
                .filter(Connector.id.in_(conn_ids))
                .all()
            )
            conn_station_map = {cid: st_id for cid, st_id in rows}

        active_energy_map = {st.id: 0.0 for st in stations}
        station_chargers_map = {st.id: set() for st in stations}

        for s in active_sims:
            st_id = conn_station_map.get(s.connector_id)
            if st_id and st_id in active_energy_map:
                active_energy_map[st_id] += float(s.current_energy_kwh or 0.0)
                station_chargers_map[st_id].add(s.connector_id)

        # 3. Tính công suất trung bình P_avg = ΔkWh * 60 cho TẤT CẢ các trạm
        for st in stations:
            st_id = st.id
            current_cum = round(completed_energy_map.get(st_id, 0.0) + active_energy_map.get(st_id, 0.0), 4)
            active_count = len(station_chargers_map.get(st_id, set()))

            if st_id not in _last_station_cumulative_energy:
                # Lần đầu chạy job hoặc sau khi restart server làm mất trạng thái lũy kế trong RAM:
                # coi delta = 0, không suy đoán bừa, ghi power_kw = 0.0 và bắt đầu tích lũy lại từ mốc đó.
                delta_kwh = 0.0
                st_power = 0.0
            else:
                last_cum = _last_station_cumulative_energy[st_id]
                delta_kwh = max(0.0, current_cum - last_cum)
                # P_avg = ΔkWh / (1/60 giờ) = ΔkWh * 60 (kW)
                st_power = round(delta_kwh * 60.0, 2)

            # Cập nhật mốc lũy kế hiện tại làm mốc so sánh cho lần tick kế tiếp
            _last_station_cumulative_energy[st_id] = current_cum

            existing = (
                db.query(StationPowerMetric)
                .filter(
                    StationPowerMetric.station_id == st_id,
                    StationPowerMetric.timestamp == now,
                )
                .first()
            )
            if existing:
                existing.power_kw = st_power
                existing.active_chargers_count = active_count
            else:
                metric = StationPowerMetric(
                    station_id=st_id,
                    timestamp=now,
                    power_kw=st_power,
                    active_chargers_count=active_count,
                )
                db.add(metric)

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Lỗi ghi nhận định kỳ station_power_metrics: {exc}")
    finally:
        if should_close:
            db.close()


def start_scheduler():
    """Khởi động bộ lập lịch APScheduler."""
    if not scheduler.running:
        # Job 1: AI Smart Charging định kỳ 3 phút
        scheduler.add_job(
            periodic_smart_charging_job,
            "interval",
            minutes=3,
            id="periodic_smart_charging",
            replace_existing=True,
        )
        # Job 2: Ghi log công suất trạm sạc theo phút (Equalizer 24h)
        scheduler.add_job(
            record_station_power_metrics_minute_job,
            "interval",
            minutes=1,
            id="record_station_power_metrics_minute",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Đã khởi động APScheduler cho các tác vụ định kỳ (Smart Charging 3p & Power Metrics 1p).")


def stop_scheduler():
    """Dừng bộ lập lịch APScheduler an toàn."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Đã dừng APScheduler.")
