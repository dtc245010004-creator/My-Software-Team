import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.payment import TopupOrder
from app.services.payment_service import verify_webhook_signature
from app.services.wallet_service import topup_wallet

logger = logging.getLogger("ev_csms.payments")

router = APIRouter(prefix="/payments", tags=["Thanh toán"])


class WebhookPayload(BaseModel):
    order_code: str
    status: str
    message: str | None = None
    signature: str | None = None


# Alias hỗ trợ quy chuẩn đặt tên PaymentWebhookRequest
PaymentWebhookRequest = WebhookPayload


class SandboxSignRequest(BaseModel):
    order_code: str
    status: str = "SUCCESS"


class SandboxSignResponse(BaseModel):
    order_code: str
    status: str
    signature: str


def is_sandbox_signing_allowed() -> bool:
    env = getattr(settings, "ENVIRONMENT", "development").lower()
    return env in ("development", "testing", "staging", "dev", "local") or getattr(
        settings, "TESTING", False
    )


@router.post(
    "/sandbox/sign",
    response_model=SandboxSignResponse,
    summary="Tạo chữ ký HMAC-SHA256 giả lập cho môi trường Sandbox (Chỉ dùng cho Dev/Testing)",
)
def sign_sandbox_webhook(payload: SandboxSignRequest):
    """Hỗ trợ Frontend Sandbox tạo chữ ký hợp lệ khi giả lập thanh toán (SCRUM-269).

    Chỉ khả dụng trong môi trường phát triển / thử nghiệm.
    """
    if not is_sandbox_signing_allowed():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sandbox signing is disabled in production",
        )

    secret_key = settings.PAYMENT_WEBHOOK_SECRET
    if not secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PAYMENT_WEBHOOK_SECRET is not configured",
        )

    raw_data = f"{payload.order_code}|{payload.status}".encode("utf-8")
    sig = hmac.new(secret_key.encode("utf-8"), raw_data, hashlib.sha256).hexdigest()

    return SandboxSignResponse(
        order_code=payload.order_code,
        status=payload.status,
        signature=sig,
    )


def verify_signature(payload: WebhookPayload) -> bool:
    if not payload.signature:
        return False
    secret_key = settings.PAYMENT_WEBHOOK_SECRET
    data = f"{payload.order_code}|{payload.status}"
    return verify_webhook_signature(data, payload.signature, secret_key)



@router.post("/webhook", summary="Xử lý Webhook từ cổng thanh toán")
async def payment_webhook(
    request: Request,
    payload: WebhookPayload,
    db: Session = Depends(get_db),
):
    # 1. Trích xuất Client IP (SCRUM-269, SCRUM-273)
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    # 2. Xác thực chữ ký: Nếu thiếu hoặc sai -> Trả 401, không đổi số dư, ghi log cảnh báo kèm IP
    if not payload.signature or not payload.signature.strip():
        logger.warning(
            "Audit Log - Webhook rejected: status=401, reason=missing_signature, ip=%s",
            client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature"
        )

    secret_key = settings.PAYMENT_WEBHOOK_SECRET
    data_str = f"{payload.order_code}|{payload.status}"
    is_valid = verify_webhook_signature(data_str, payload.signature, secret_key)
    if not is_valid:
        try:
            raw_body = await request.body()
            if raw_body:
                is_valid = verify_webhook_signature(
                    raw_body, payload.signature, secret_key
                )
        except (RuntimeError, ValueError, OSError) as exc:
            logger.debug("Cannot read raw body for webhook verification: %s", exc)

    if not is_valid:
        logger.warning(
            "Audit Log - Webhook rejected: status=401, reason=invalid_signature, ip=%s",
            client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature"
        )

    # 3. Mở transaction và lock bản ghi ở tầng Database (SCRUM-275, R-03)
    if db.get_bind().dialect.name == "sqlite":
        db.execute(
            update(TopupOrder)
            .where(TopupOrder.order_code == payload.order_code)
            .values(updated_at=func.now())
        )

    order = (
        db.query(TopupOrder)
        .filter(TopupOrder.order_code == payload.order_code)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not order:
        logger.warning(
            "Webhook order not found: %s from IP: %s", payload.order_code, client_ip
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found"
        )

    target_status = payload.status.upper()

    # Xử lý đơn hàng đã ở trạng thái kết thúc (Terminal State)
    if order.status in ["FAILED", "CANCELLED"]:
        if target_status == "SUCCESS":
            logger.warning(
                "Late SUCCESS webhook for terminal order %s", order.order_code
            )
            return {
                "status": order.status,
                "message": "Order already in terminal state",
                "order_code": order.order_code,
            }
        return {
            "status": order.status,
            "message": "Already processed",
            "order_code": order.order_code,
        }

    if order.status == "SUCCESS":
        return {
            "status": "SUCCESS",
            "message": "Already processed",
            "order_code": order.order_code,
        }

    # Đơn hàng đang PENDING (SCRUM-274): Cập nhật trạng thái và số dư
    if target_status in ["FAILED", "CANCELLED"]:
        order.status = target_status
        order.failure_reason = payload.message or "Payment failed"
        db.add(order)
        db.commit()
        return {
            "status": order.status,
            "message": "Webhook processed successfully",
            "order_code": order.order_code,
        }

    if target_status == "SUCCESS":
        try:
            order.status = "SUCCESS"
            db.add(order)
            note = f"Nạp tiền từ giao dịch {order.order_code}"
            topup_wallet(
                db=db,
                user_id=order.user_id,
                amount=order.amount,
                note=note,
                reference_id=order.order_code,
                reference_type="TOPUP",
                auto_commit=False,
            )
            db.commit()
            return {
                "status": "SUCCESS",
                "message": "Webhook processed successfully",
                "order_code": order.order_code,
            }
        except IntegrityError:
            db.rollback()
            logger.warning(
                "Webhook duplicate transaction detected (race condition) for order: %s",
                order.order_code,
            )
            return {
                "status": "SUCCESS",
                "message": "Already processed",
                "order_code": order.order_code,
            }

    return {"status": "IGNORED", "message": "Ignored"}




@router.get("/return", summary="Return URL từ cổng thanh toán")
def payment_return(order_code: str, db: Session = Depends(get_db)):
    # Tuyệt đối không thay đổi trạng thái giao dịch hay số dư ở đây
    # Chỉ đọc DB để lấy trạng thái thực tế
    order = db.query(TopupOrder).filter(TopupOrder.order_code == order_code).first()
    
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        
    frontend_url = "http://localhost:5173/wallet/topup/result"
    redirect_url = f"{frontend_url}?order_code={order.order_code}&status={order.status}"
    
    return RedirectResponse(url=redirect_url)
