import hashlib
import hmac
import logging
import re

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


class SepayWebhookPayload(BaseModel):
    id: int | None = None
    gateway: str | None = None
    transactionDate: str | None = None
    accountNumber: str | None = None
    code: str | None = None
    content: str | None = ""
    transferType: str | None = "in"
    transferAmount: float | None = 0.0
    accumulated: float | None = 0.0
    subAccount: str | None = None
    referenceCode: str | None = None
    description: str | None = None


@router.post("/sepay-webhook", summary="Webhook nạp tiền tự động từ SePay (API Banking)")
async def sepay_webhook(
    request: Request,
    payload: SepayWebhookPayload,
    db: Session = Depends(get_db),
):
    """
    Xử lý Webhook tự động từ SePay khi có biến động số dư ngân hàng:
    1. Kiểm tra xác thực (HMAC-SHA256 hoặc Authorization Header nếu đã cấu hình).
    2. Bỏ qua giao dịch tiền ra (transferType != 'in').
    3. Trích xuất mã đơn nạp (ORDER_xxxx hoặc EV_xxxx) từ nội dung chuyển khoản.
    4. Nếu khớp đơn và số tiền hợp lệ: Tự động cộng tiền ví tài xế qua ACID transaction (topup_wallet).
    5. Nếu có sai sót (sai số tiền, sai cú pháp): Lưu trạng thái đơn PENDING/FLAGGED để Admin/Chủ trạm duyệt thủ công.
    """
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    logger.info(
        "SePay Webhook received: id=%s, gateway=%s, amount=%s, content='%s', ip=%s",
        payload.id,
        payload.gateway,
        payload.transferAmount,
        payload.content,
        client_ip,
    )

    # 1. Xác thực HMAC-SHA256 nếu có chữ ký hoặc header
    auth_header = request.headers.get("Authorization", "")
    sepay_sig = (
        request.headers.get("x-sepay-signature")
        or request.headers.get("sepay-signature")
        or request.headers.get("x-signature")
        or ""
    )
    secret_key = getattr(settings, "SEPAY_WEBHOOK_SECRET", None) or getattr(
        settings, "PAYMENT_WEBHOOK_SECRET", ""
    )

    if secret_key and sepay_sig:
        try:
            raw_body = await request.body()
            computed_sig = hmac.new(
                secret_key.encode("utf-8"), raw_body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(computed_sig.lower(), sepay_sig.lower()):
                logger.warning("SePay signature mismatch from IP %s", client_ip)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid SePay signature",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Error verifying SePay signature: %s", exc)

    # Nếu chỉ là ping kiểm tra webhook hoặc không có nội dung
    if not payload.content and (not payload.transferAmount or payload.transferAmount <= 0):
        return {
            "success": True,
            "message": "SePay webhook ping received successfully",
        }

    # 2. Chỉ xử lý tiền vào (in)
    if payload.transferType and payload.transferType.lower() != "in":
        logger.info("Ignoring SePay transferType=%s", payload.transferType)
        return {
            "success": True,
            "message": f"Ignored non-incoming transfer: {payload.transferType}",
        }

    # 3. Trích xuất mã đơn nạp từ content
    # Cú pháp hỗ trợ: ORDER_xxxxxxxx, EV_xxxxxxxx, hoặc EVxxxxxxxx
    content = payload.content or ""
    order_code = None

    match = re.search(r"(ORDER_[A-F0-9]+|EV_[A-F0-9]+)", content, re.IGNORECASE)
    if match:
        order_code = match.group(1).upper()
    else:
        # Thử tìm ORDER_... dạng đơn giản
        match_simple = re.search(r"ORDER\s*([A-F0-9]+)", content, re.IGNORECASE)
        if match_simple:
            order_code = f"ORDER_{match_simple.group(1).upper()}"

    if not order_code and payload.code:
        order_code = payload.code.strip().upper()

    if not order_code:
        logger.warning(
            "Could not parse order code from SePay content: '%s'. Kept for manual review.",
            content,
        )
        return {
            "success": True,
            "status": "MANUAL_REVIEW_REQUIRED",
            "message": "Transaction recorded but order code could not be determined. Routed to Admin approval.",
        }

    # 4. Tìm đơn nạp trong CSDL
    order = (
        db.query(TopupOrder)
        .filter(TopupOrder.order_code == order_code)
        .with_for_update()
        .populate_existing()
        .first()
    )

    if not order:
        logger.warning("TopupOrder not found for code: %s", order_code)
        return {
            "success": True,
            "status": "ORDER_NOT_FOUND",
            "message": f"Order {order_code} not found. Kept for manual admin reconciliation.",
        }

    # Nếu đơn đã thành công từ trước
    if order.status == "SUCCESS":
        return {
            "success": True,
            "status": "SUCCESS",
            "message": "Order already processed",
            "order_code": order.order_code,
        }

    # 5. Kiểm tra số tiền chuyển vào
    transfer_amount = payload.transferAmount or 0.0
    if transfer_amount < float(order.amount):
        logger.warning(
            "Amount mismatch for order %s: expected %s, got %s",
            order.order_code,
            order.amount,
            transfer_amount,
        )
        order.status = "PENDING"  # Giữ ở PENDING để Admin/Chủ trạm đối soát duyệt thủ công
        order.failure_reason = f"Số tiền thực nhận ({transfer_amount:,.0f}đ) ít hơn số tiền đơn ({order.amount:,.0f}đ)"
        db.add(order)
        db.commit()
        return {
            "success": True,
            "status": "AMOUNT_MISMATCH",
            "message": "Amount is less than requested. Order flagged for manual review.",
            "order_code": order.order_code,
        }

    # 6. Tự động cộng tiền vào ví (ACID Transaction)
    try:
        order.status = "SUCCESS"
        order.failure_reason = None
        db.add(order)

        note = f"Nạp ví tự động qua SePay ({payload.gateway or 'Banking'} - GD {payload.id or payload.referenceCode or order.order_code})"
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
        logger.info(
            "Successfully auto-credited %s VND to user %s for order %s via SePay",
            order.amount,
            order.user_id,
            order.order_code,
        )
        return {
            "success": True,
            "status": "SUCCESS",
            "message": "Wallet credited automatically via SePay",
            "order_code": order.order_code,
        }
    except IntegrityError:
        db.rollback()
        logger.warning("Duplicate topup detected for order: %s", order.order_code)
        return {
            "success": True,
            "status": "SUCCESS",
            "message": "Already processed",
            "order_code": order.order_code,
        }
    except Exception as exc:
        db.rollback()
        logger.exception("Error processing SePay topup: %s", exc)
        return {
            "success": False,
            "status": "ERROR",
            "message": "Internal error, routed to Admin manual approval",
            "order_code": order.order_code,
        }

