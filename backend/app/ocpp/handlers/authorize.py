"""Nghiệp vụ xử lý CALL Authorize của OCPP 1.6J."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.id_tag import IdTag
from app.models.station import ChargingPoint

logger = logging.getLogger(__name__)


def handle_authorize(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Xác thực idTag và trả payload Authorize.conf theo OCPP 1.6J.

    Giống các handler OCPP khác, hàm nhận session CSDL, trụ đã được gateway
    tra cứu và payload đã parse; handler chỉ xử lý nghiệp vụ rồi trả dictionary.
    Handler không tự commit và không phụ thuộc vào FastAPI hay WebSocket.
    """

    id_tag_code = payload.get("idTag")
    id_tag = None
    if isinstance(id_tag_code, str) and id_tag_code:
        id_tag = db.query(IdTag).filter(IdTag.code == id_tag_code).first()

    if id_tag is None:
        suffix = (
            id_tag_code[-4:]
            if isinstance(id_tag_code, str) and len(id_tag_code) > 4
            else "****"
        )
        logger.warning("Không tìm thấy idTag; hậu tố mã thẻ: %s", suffix)
        status = "Invalid"
    elif id_tag.status == "blocked":
        status = "Blocked"
    else:
        expiry_date = id_tag.expiry_date
        if expiry_date is not None and expiry_date.tzinfo is None:
            expiry_date = expiry_date.replace(tzinfo=timezone.utc)
        if expiry_date is not None and expiry_date <= datetime.now(timezone.utc):
            status = "Expired"
        elif not charging_point.station.is_active:
            status = "Blocked"
        else:
            # S-38 / SCRUM-265: Thẩm định số dư ví theo quy tắc dùng chung
            from app.models.wallet import Wallet
            from app.services.audit_service import ghi_nhat_ky
            from app.services.wallet_service import validate_wallet_balance_for_session

            is_valid, error_code, current_balance, threshold = (
                validate_wallet_balance_for_session(db, id_tag.user_id)
            )
            if not is_valid:
                status = "Blocked"
                wallet = db.query(Wallet).filter(Wallet.user_id == id_tag.user_id).first()
                wallet_id = wallet.id if wallet else None
                ghi_nhat_ky(
                    db=db,
                    user_id=id_tag.user_id,
                    action="SESSION_BLOCKED_INSUFFICIENT_BALANCE",
                    object_type="wallet",
                    object_id=wallet_id,
                    data={
                        "user_id": id_tag.user_id,
                        "wallet_id": wallet_id,
                        "current_balance": str(current_balance),
                        "required_threshold": str(threshold),
                        "charge_point_id": charging_point.id,
                        "reason": "Số dư ví dưới ngưỡng tối thiểu",
                    },
                )
                db.commit()
            else:
                status = "Accepted"

    id_tag_info: dict[str, Any] = {"status": status}
    if id_tag is not None and id_tag.expiry_date is not None:
        expiry_date = id_tag.expiry_date
        if expiry_date.tzinfo is None:
            expiry_date = expiry_date.replace(tzinfo=timezone.utc)
        id_tag_info["expiryDate"] = expiry_date.isoformat()

    return {"idTagInfo": id_tag_info}
