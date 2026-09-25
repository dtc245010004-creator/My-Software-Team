import asyncio
from datetime import datetime, timezone
from decimal import Decimal
import logging
import random
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.websocket import ws_manager
from app.models.session import ChargingSession
from app.models.wallet import Wallet

logger = logging.getLogger("ev_csms.simulator")


class ChargingSimulator:
    """
    Bộ giả lập chu trình sạc pin xe điện chuẩn OCPP-like:
    - Mô phỏng đường cong sạc CC-CV (Constant Current - Constant Voltage).
    - Đo đếm thông số vật lý: SoC %, công suất P (kW), điện áp V, dòng điện I, nhiệt độ cổng sạc T (°C).
    - Tích phân điện năng tiêu thụ kWh = ∫ P(t) dt.
    - Checkpoint định kỳ ghi snapshot kWh, SoC vào CSDL (bảo vệ khi server crash).
    - Tự động ngắt sạc an toàn (Auto Cut-off):
      1. Pin đầy: SoC >= 100% -> BATTERY_FULL
      2. Quá nhiệt cổng sạc: T > 75°C -> OVERHEAT_EMERGENCY
      3. Chạm hạn mức nợ ví: balance - cost < NEGATIVE_BALANCE_LIMIT -> DEBT_LIMIT_REACHED
    """

    def __init__(
        self,
        session_id: int,
        connector_id: int,
        user_id: int,
        applied_price_per_kwh: Decimal,
        max_power_kw: float,
        battery_capacity_kwh: float = 60.0,
        initial_soc: Optional[float] = None,
        tick_interval: float = 2.0,
        checkpoint_interval: float = 30.0,
    ):
        self.session_id = session_id
        self.connector_id = connector_id
        self.user_id = user_id
        self.applied_price_per_kwh = Decimal(str(applied_price_per_kwh))
        self.max_power_kw = float(max_power_kw)
        self.battery_capacity_kwh = float(battery_capacity_kwh)

        # SoC ban đầu tự sinh ngẫu nhiên an toàn (20% - 40%), không nhận từ client để chống gian lận
        if initial_soc is not None:
            self.soc = float(initial_soc)
        else:
            self.soc = round(random.uniform(20.0, 40.0), 1)

        self.last_load_balance_soc = self.soc
        self.current_energy_kwh = Decimal("0.00")
        self.power_kw = 0.0
        self.voltage_v = 400.0
        self.current_a = 0.0
        self.temp_c = 30.0

        # Cờ can thiệp điều khiển từ Admin/CPO
        self.power_limit_override_kw: Optional[float] = None
        self.overheat_triggered: bool = False

        # Vòng lặp thời gian
        self.tick_interval = tick_interval
        self.checkpoint_interval = checkpoint_interval
        self.time_since_last_checkpoint = 0.0
        self.is_running = False
        self.task: Optional[asyncio.Task] = None

    def compute_physics(self, dt_seconds: float) -> Optional[str]:
        """
        Tính toán bước chuyển vật lý và kiểm tra ngưỡng an toàn:
        Trả về stop_reason nếu kích hoạt điều kiện ngắt sạc tự động, ngược lại trả về None.
        """
        # 1. Xác định công suất trần áp dụng
        target_max_kw = self.max_power_kw
        if self.power_limit_override_kw is not None:
            target_max_kw = min(target_max_kw, max(0.0, self.power_limit_override_kw))

        # 2. Đường cong sạc CC-CV
        if self.soc < 80.0:
            # Giai đoạn CC: Sạc ở công suất tối đa
            self.power_kw = target_max_kw
        elif self.soc < 100.0:
            # Giai đoạn CV: Công suất giảm dần tuyến tính từ target_max_kw về 10 kW tại 100%
            ratio = (self.soc - 80.0) / 20.0
            self.power_kw = max(10.0, target_max_kw - (target_max_kw - 10.0) * ratio)
        else:
            self.power_kw = 0.0

        # 3. Điện áp và dòng điện
        self.voltage_v = round(390.0 + 10.0 * (self.soc / 100.0), 1)
        if self.voltage_v > 0 and self.power_kw > 0:
            self.current_a = round((self.power_kw * 1000.0) / self.voltage_v, 1)
        else:
            self.current_a = 0.0

        # 4. Nhiệt độ súng sạc
        if self.overheat_triggered:
            # Admin/Tester cố tình kích hoạt lỗi quá nhiệt để test rơ-le an toàn
            self.temp_c = 82.5
        else:
            # Nhiệt độ tăng dần theo tải, ổn định ở 45 - 55°C
            load_factor = (self.power_kw / target_max_kw) if target_max_kw > 0 else 0.0
            self.temp_c = round(30.0 + 25.0 * load_factor, 1)

        # 5. Tích phân năng lượng kWh: ΔkWh = P(kW) * Δt(s) / 3600
        delta_kwh = (self.power_kw * dt_seconds) / 3600.0
        self.current_energy_kwh += Decimal(str(round(delta_kwh, 4)))

        # 6. Cập nhật SoC %
        if self.battery_capacity_kwh > 0:
            delta_soc = (delta_kwh / self.battery_capacity_kwh) * 100.0
            self.soc = min(100.0, round(self.soc + delta_soc, 2))

        # 7. Kiểm tra ngưỡng ngắt an toàn tức thời
        if self.soc >= 100.0:
            return "BATTERY_FULL"

        if self.temp_c > 75.0:
            return "OVERHEAT_EMERGENCY"

        return None

    def get_cost_estimate_vnd(self) -> int:
        """Tính cước phí tạm tính làm tròn số nguyên VND (tránh hiển thị số lẻ gây khó chịu UI)."""
        cost = float(self.current_energy_kwh) * float(self.applied_price_per_kwh)
        return int(round(cost, 0))

    def to_telemetry_dict(self) -> Dict[str, Any]:
        """Tạo gói tin JSON telemetry chuẩn hóa."""
        return {
            "event": "TELEMETRY",
            "session_id": self.session_id,
            "connector_id": self.connector_id,
            "soc": self.soc,
            "power_kw": round(self.power_kw, 2),
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 1),
            "temp_c": round(self.temp_c, 1),
            "energy_kwh": float(round(self.current_energy_kwh, 3)),
            "cost_estimate": self.get_cost_estimate_vnd(),
            "status": "CHARGING",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def checkpoint_db(self, db: Session) -> None:
        """Ghi snapshot năng lượng và SoC vào CSDL (bảo vệ chống server crash)."""
        try:
            session = db.query(ChargingSession).filter(ChargingSession.id == self.session_id).first()
            if session and session.status == "ACTIVE":
                session.total_kwh = self.current_energy_kwh
                session.current_soc = self.soc
                session.last_checkpoint_at = datetime.now(timezone.utc)
                db.commit()
                logger.debug(
                    f"Checkpoint Session #{self.session_id}: {self.current_energy_kwh} kWh, SoC: {self.soc}%"
                )
        except Exception as e:
            db.rollback()
            logger.error(f"Lỗi khi checkpoint Session #{self.session_id}: {e}")

    def check_debt_limit(self, db: Session) -> bool:
        """
        Kiểm tra số dư ví theo thời gian thực:
        Nếu số dư trừ cước tạm tính vượt quá hạn mức nợ NEGATIVE_BALANCE_LIMIT (-300,000 VND)
        thì trả về True để kích hoạt ngắt sạc khẩn cấp.
        """
        try:
            wallet = db.query(Wallet).filter(Wallet.user_id == self.user_id).first()
            if wallet:
                cost = Decimal(str(self.get_cost_estimate_vnd()))
                projected_balance = wallet.balance - cost
                limit = Decimal(str(settings.NEGATIVE_BALANCE_LIMIT))
                if projected_balance < limit:
                    logger.warning(
                        f"Session #{self.session_id}: Dự kiến số dư {projected_balance} VNĐ chạm hạn mức nợ {limit} VNĐ!"
                    )
                    return True
        except Exception as e:
            logger.error(f"Lỗi kiểm tra hạn mức ví: {e}")
        return False

    async def step(self, dt_seconds: float, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        Thực hiện một bước mô phỏng:
        - Tính toán vật lý.
        - Phát telemetry qua WebSocket phân kênh cho session.
        - Kiểm tra checkpoint & điều kiện ngắt sạc an toàn.
        """
        stop_reason = self.compute_physics(dt_seconds)

        # Quản lý DB session
        owns_db = False
        if db is None:
            db = SessionLocal()
            owns_db = True

        try:
            # Kiểm tra hạn mức ví nếu chưa có lý do ngắt
            if stop_reason is None and self.check_debt_limit(db):
                stop_reason = "DEBT_LIMIT_REACHED"

            # Checkpoint định kỳ
            self.time_since_last_checkpoint += dt_seconds
            if self.time_since_last_checkpoint >= self.checkpoint_interval:
                self.checkpoint_db(db)
                self.time_since_last_checkpoint = 0.0

            # Phát telemetry qua WebSocket
            telemetry_data = self.to_telemetry_dict()
            await ws_manager.broadcast_to_session(self.session_id, telemetry_data)

            # Kích hoạt Fast Loop Load Balancing (Event-driven Heuristic) khi SoC đổi >= 5%
            if abs(self.soc - self.last_load_balance_soc) >= 5.0:
                self.last_load_balance_soc = self.soc
                try:
                    from app.models.station import Connector
                    from app.services.scheduler_service import calculate_and_broadcast_smart_charging
                    conn = db.query(Connector).filter(Connector.id == self.connector_id).first()
                    if conn and conn.charging_point and conn.charging_point.station_id:
                        await calculate_and_broadcast_smart_charging(
                            station_id=conn.charging_point.station_id,
                            db=db,
                            use_gemini=False,
                        )
                except Exception as exc:
                    logger.debug(f"Event-driven load balancing non-blocking notice: {exc}")

            # Xử lý tự động ngắt sạc nếu có stop_reason
            if stop_reason is not None:
                logger.info(f"Tự động ngắt sạc Session #{self.session_id}: Lý do = {stop_reason}")
                self.is_running = False

                # Gọi hàm dừng phiên sạc chuẩn
                from app.services.session_service import stop_charging_session
                from app.models.user import User

                user = db.query(User).filter(User.id == self.user_id).first()
                if user:
                    stop_charging_session(
                        db=db,
                        user=user,
                        session_id=self.session_id,
                        meter_stop_kwh=self.current_energy_kwh,
                        stop_reason=stop_reason,
                    )

                # Gửi sự kiện dừng qua WebSocket
                stopped_event = {
                    "event": "SESSION_STOPPED",
                    "session_id": self.session_id,
                    "connector_id": self.connector_id,
                    "stop_reason": stop_reason,
                    "total_kwh": float(round(self.current_energy_kwh, 3)),
                    "total_amount": self.get_cost_estimate_vnd(),
                    "status": "COMPLETED",
                }
                await ws_manager.broadcast_to_session(self.session_id, stopped_event)

            return telemetry_data
        finally:
            if owns_db:
                db.close()

    async def run_loop(self) -> None:
        """Vòng lặp chạy ngầm trong asyncio task với bảo vệ ngoại lệ (Task Crash Guard)."""
        logger.info(f"Khởi động vòng lặp Simulator cho Session #{self.session_id} (tick={self.tick_interval}s)")
        self.is_running = True
        try:
            while self.is_running:
                await asyncio.sleep(self.tick_interval)
                if not self.is_running:
                    break
                await self.step(self.tick_interval)
        except asyncio.CancelledError:
            logger.info(f"Simulator Session #{self.session_id} bị hủy (Cancelled).")
        except Exception as e:
            logger.critical(f"Lỗi nghiêm trọng trong background loop Session #{self.session_id}: {e}", exc_info=True)
            # Dọn dẹp an toàn khi task crash
            try:
                db = SessionLocal()
                from app.services.session_service import stop_charging_session
                from app.models.user import User

                user = db.query(User).filter(User.id == self.user_id).first()
                if user:
                    stop_charging_session(
                        db=db,
                        user=user,
                        session_id=self.session_id,
                        meter_stop_kwh=self.current_energy_kwh,
                        stop_reason="SIMULATOR_TASK_ERROR",
                    )
                db.close()
            except Exception as cleanup_err:
                logger.error(f"Không thể dọn dẹp sau crash Simulator #{self.session_id}: {cleanup_err}")
        finally:
            self.is_running = False
            simulator_manager.remove_simulator(self.session_id)


class SimulatorManager:
    """Quản lý các instance ChargingSimulator đang hoạt động trong bộ nhớ RAM."""

    def __init__(self):
        self.active_simulators: Dict[int, ChargingSimulator] = {}

    def start_simulation(
        self,
        session_id: int,
        connector_id: int,
        user_id: int,
        applied_price_per_kwh: Decimal,
        max_power_kw: float,
        battery_capacity_kwh: float = 60.0,
        initial_soc: Optional[float] = None,
        tick_interval: float = 2.0,
        checkpoint_interval: float = 30.0,
    ) -> ChargingSimulator:
        """Tạo mới và khởi động background task mô phỏng cho phiên sạc."""
        if session_id in self.active_simulators:
            return self.active_simulators[session_id]

        sim = ChargingSimulator(
            session_id=session_id,
            connector_id=connector_id,
            user_id=user_id,
            applied_price_per_kwh=applied_price_per_kwh,
            max_power_kw=max_power_kw,
            battery_capacity_kwh=battery_capacity_kwh,
            initial_soc=initial_soc,
            tick_interval=tick_interval,
            checkpoint_interval=checkpoint_interval,
        )
        self.active_simulators[session_id] = sim

        # Tạo background asyncio task
        loop = asyncio.get_event_loop()
        sim.task = loop.create_task(sim.run_loop())
        logger.info(f"Đã đăng ký và chạy simulator cho Session #{session_id}")
        return sim

    def stop_simulation(self, session_id: int) -> None:
        """Hủy task và dừng mô phỏng của phiên sạc."""
        sim = self.active_simulators.pop(session_id, None)
        if sim:
            sim.is_running = False
            if sim.task and not sim.task.done():
                sim.task.cancel()
            logger.info(f"Đã hủy simulator cho Session #{session_id}")

    def get_simulator(self, session_id: int) -> Optional[ChargingSimulator]:
        """Lấy instance simulator trong RAM."""
        return self.active_simulators.get(session_id)

    def remove_simulator(self, session_id: int) -> None:
        """Gỡ bỏ khỏi danh sách active."""
        self.active_simulators.pop(session_id, None)

    def trigger_event(self, session_id: int, event_type: str) -> bool:
        """Kích hoạt sự cố giả lập (OVERHEAT, v.v.)."""
        sim = self.get_simulator(session_id)
        if not sim:
            return False

        if event_type.upper() == "OVERHEAT":
            sim.overheat_triggered = True
            logger.warning(f"Đã kích hoạt sự cố quá nhiệt cho Session #{session_id}")
            return True
        return False

    def set_power_limit(self, session_id: int, power_limit_kw: float) -> bool:
        """Cập nhật giới hạn công suất từ bên ngoài."""
        sim = self.get_simulator(session_id)
        if not sim:
            return False

        sim.power_limit_override_kw = power_limit_kw
        logger.info(f"Session #{session_id}: Cập nhật công suất trần mới = {power_limit_kw} kW")
        return True


# Singleton instance toàn hệ thống
simulator_manager = SimulatorManager()
