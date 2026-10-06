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
            status = "Accepted"

    id_tag_info: dict[str, Any] = {"status": status}
    if id_tag is not None and id_tag.expiry_date is not None:
        expiry_date = id_tag.expiry_date
        if expiry_date.tzinfo is None:
            expiry_date = expiry_date.replace(tzinfo=timezone.utc)
        id_tag_info["expiryDate"] = expiry_date.isoformat()

    return {"idTagInfo": id_tag_info}
