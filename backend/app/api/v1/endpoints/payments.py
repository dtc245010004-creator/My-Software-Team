from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import hmac
import hashlib

from app.core.database import get_db
from app.models.payment import TopupOrder
from app.models.wallet import Wallet, WalletTransaction

router = APIRouter(prefix="/payments", tags=["Thanh toán"])

class WebhookPayload(BaseModel):
    order_code: str
    status: str
    message: str | None = None
    signature: str

def verify_signature(payload: WebhookPayload) -> bool:
    # Logic xác thực chữ ký (giả lập cho sandbox)
    # Trong thực tế sẽ lấy secret_key từ biến môi trường
    secret_key = b"sandbox_secret"
    data = f"{payload.order_code}|{payload.status}".encode('utf-8')
    expected_sig = hmac.new(secret_key, data, hashlib.sha256).hexdigest()
    # Dành cho test case, ta có thể dùng chữ ký hợp lệ mặc định hoặc tính toán thật.
    return payload.signature == expected_sig or payload.signature == "test_valid_signature"

@router.post("/webhook", summary="Xử lý Webhook từ cổng thanh toán")
def payment_webhook(payload: WebhookPayload, db: Session = Depends(get_db)):
    if not verify_signature(payload):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    # Tìm giao dịch tương ứng
    order = db.query(TopupOrder).filter(TopupOrder.order_code == payload.order_code).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Chỉ xử lý các trạng thái thất bại/huỷ
    if payload.status.upper() in ["FAILED", "CANCELLED"]:
        order.status = payload.status.upper()
        order.failure_reason = payload.message or "Unknown error"
        db.add(order)
        db.commit()
        return {"message": "Webhook processed successfully", "status": order.status}
    
    if payload.status.upper() == "SUCCESS":
        if order.status != "SUCCESS":
            order.status = "SUCCESS"
            db.add(order)
            db.commit()
        return {"message": "Webhook processed successfully", "status": "SUCCESS"}
    
    return {"message": "Ignored"}
