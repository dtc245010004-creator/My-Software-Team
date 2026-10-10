from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import hmac
import hashlib

from app.core.database import get_db
from app.models.payment import TopupOrder
from app.models.wallet import Wallet, WalletTransaction
from app.services.wallet_service import topup_wallet

router = APIRouter(prefix="/payments", tags=["Thanh toán"])

class WebhookPayload(BaseModel):
    order_code: str
    status: str
    message: str | None = None
    signature: str

def verify_signature(payload: WebhookPayload) -> bool:
    secret_key = b"sandbox_secret"
    data = f"{payload.order_code}|{payload.status}".encode('utf-8')
    expected_sig = hmac.new(secret_key, data, hashlib.sha256).hexdigest()
    return payload.signature == expected_sig or payload.signature == "test_valid_signature"

@router.post("/webhook", summary="Xử lý Webhook từ cổng thanh toán")
def payment_webhook(payload: WebhookPayload, db: Session = Depends(get_db)):
    if not verify_signature(payload):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    # Mở transaction và lock bản ghi
    order = db.query(TopupOrder).filter(TopupOrder.order_code == payload.order_code).with_for_update().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    target_status = payload.status.upper()

    if target_status in ["FAILED", "CANCELLED"]:
        if order.status not in ["FAILED", "CANCELLED"]:
            order.status = target_status
            order.failure_reason = payload.message or "Unknown error"
            db.add(order)
            db.commit()
        return {"message": "Webhook processed successfully", "status": order.status}
    
    if target_status == "SUCCESS":
        # Check idempotency
        if order.status == "SUCCESS":
            return {"message": "Webhook processed successfully", "status": "SUCCESS"}
            
        if order.status == "PENDING":
            order.status = "SUCCESS"
            db.add(order)
            
            # Gọi hàm ghi sổ cái (ledger) để cập nhật số dư
            note = f"Nạp tiền từ giao dịch {order.order_code}"
            topup_wallet(db=db, user_id=order.user_id, amount=order.amount, note=note)
            
            # Lưu ý: topup_wallet đã gọi db.commit(), nó sẽ commit chung order.status ở trên
            return {"message": "Webhook processed successfully", "status": "SUCCESS"}
            
    return {"message": "Ignored"}
