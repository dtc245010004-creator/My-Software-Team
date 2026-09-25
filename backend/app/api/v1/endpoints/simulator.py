from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.session import ChargingSession
from app.models.user import User
from app.simulator.charging_simulator import simulator_manager

router = APIRouter(prefix="/simulator", tags=["Charging Simulator"])


class TriggerEventRequest(BaseModel):
    event_type: str = Field(..., description="Loại sự cố giả lập: OVERHEAT")


class SetPowerLimitRequest(BaseModel):
    power_limit_kw: float = Field(..., gt=0, description="Giới hạn công suất sạc mới (kW)")


def verify_session_management_permission(db: Session, session_id: int, user: User) -> ChargingSession:
    """Kiểm tra quyền quản lý phần cứng giả lập: Chỉ Admin hoặc Operator sở hữu trạm mới được can thiệp."""
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc.")

    if user.role == "ADMIN":
        return session

    if user.role == "OPERATOR":
        connector = session.connector
        station = connector.charging_point.station if connector and connector.charging_point else None
        if station and station.operator_id == user.id:
            return session

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Chỉ Quản trị viên (Admin) hoặc Đơn vị vận hành (CPO) quản lý trạm mới có quyền can thiệp vào bộ giả lập.",
    )


@router.get(
    "/sessions",
    response_model=List[Dict[str, Any]],
    summary="Xem danh sách các phiên sạc đang chạy mô phỏng trong RAM (Chỉ Admin / CPO)",
)
def list_active_simulators(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
):
    """
    Tra cứu toàn bộ trạng thái telemetry tức thời trong bộ đệm In-Memory State Buffer:
    - Admin: xem toàn bộ mạng lưới.
    - Operator: chỉ xem các phiên thuộc trạm mình quản lý.
    - Customer: bị cấm 403.
    """
    sims = list(simulator_manager.active_simulators.values())
    results = []

    for sim in sims:
        session = db.query(ChargingSession).filter(ChargingSession.id == sim.session_id).first()
        if not session:
            continue

        if current_user.role == "ADMIN":
            results.append(sim.to_telemetry_dict())
        elif current_user.role == "OPERATOR":
            connector = session.connector
            station = connector.charging_point.station if connector and connector.charging_point else None
            if station and station.operator_id == current_user.id:
                results.append(sim.to_telemetry_dict())

    return results


@router.get(
    "/sessions/{session_id}",
    response_model=Dict[str, Any],
    summary="Xem thông số Telemetry tức thời của một phiên sạc từ RAM",
)
def get_session_telemetry(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lấy thông số telemetry tức thời từ RAM:
    - Admin / Operator sở hữu trạm: được xem.
    - Customer: chỉ được xem telemetry phiên sạc của chính mình.
    """
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc.")

    # Kiểm tra quyền xem
    if current_user.role == "CUSTOMER" and session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền theo dõi telemetry của tài xế khác.",
        )
    elif current_user.role == "OPERATOR":
        connector = session.connector
        station = connector.charging_point.station if connector and connector.charging_point else None
        if not station or station.operator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền theo dõi trạm sạc này.",
            )

    sim = simulator_manager.get_simulator(session_id)
    if not sim:
        # Nếu phiên không còn trong RAM (đã kết thúc hoặc server vừa restart), trả về dữ liệu DB
        return {
            "session_id": session.id,
            "connector_id": session.connector_id,
            "soc": session.current_soc,
            "power_kw": 0.0,
            "energy_kwh": float(session.total_kwh),
            "cost_estimate": int(round(float(session.total_amount), 0)),
            "status": session.status,
            "is_in_memory": False,
        }

    telemetry = sim.to_telemetry_dict()
    telemetry["is_in_memory"] = True
    return telemetry


@router.post(
    "/sessions/{session_id}/trigger-event",
    summary="Kích hoạt sự cố giả lập: Quá nhiệt, ngắt khẩn cấp (Chỉ Admin / CPO)",
)
def trigger_simulator_event(
    session_id: int,
    payload: TriggerEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
):
    """
    Kích hoạt sự cố giả lập để kiểm thử rơ-le an toàn:
    - event_type: OVERHEAT
    - Driver (CUSTOMER) tuyệt đối bị từ chối 403 Forbidden.
    """
    verify_session_management_permission(db, session_id, current_user)

    sim = simulator_manager.get_simulator(session_id)
    if not sim:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên sạc không tồn tại hoặc đã kết thúc trong bộ nhớ giả lập.",
        )

    success = simulator_manager.trigger_event(session_id, payload.event_type)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loại sự cố '{payload.event_type}' không được hỗ trợ (chỉ hỗ trợ: OVERHEAT).",
        )

    return {
        "message": f"Đã kích hoạt sự cố '{payload.event_type}' trên phiên sạc #{session_id}. Rơ-le an toàn sẽ ngắt sau chu kỳ tiếp theo.",
        "session_id": session_id,
    }


@router.put(
    "/sessions/{session_id}/set-power-limit",
    summary="Điều chỉnh công suất trần tức thời P_max từ bên ngoài (Chỉ Admin / CPO / AI Load Balancer)",
)
def set_simulator_power_limit(
    session_id: int,
    payload: SetPowerLimitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
):
    """
    Điều tiết công suất sạc tối đa tức thời (chuẩn bị cho AI Smart Charging ở Bước 09):
    - Driver (CUSTOMER) tuyệt đối bị từ chối 403 Forbidden.
    """
    verify_session_management_permission(db, session_id, current_user)

    sim = simulator_manager.get_simulator(session_id)
    if not sim:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên sạc không tồn tại hoặc đã kết thúc trong bộ nhớ giả lập.",
        )

    simulator_manager.set_power_limit(session_id, payload.power_limit_kw)
    return {
        "message": f"Đã cập nhật công suất trần mới {payload.power_limit_kw} kW cho phiên sạc #{session_id}.",
        "session_id": session_id,
        "new_power_limit_kw": payload.power_limit_kw,
    }
