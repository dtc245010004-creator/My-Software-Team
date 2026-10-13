import hashlib
import hmac
import logging
import urllib.parse

from app.core.config import settings

logger = logging.getLogger("ev_csms.payments")

_secret_warning_logged = False


def build_payment_url(order_code: str, amount: int, return_url: str = "") -> str:
    """
    Sinh ra URL điều hướng sang cổng thanh toán Sandbox.
    Sử dụng thuật toán HMAC-SHA256 để tạo chữ ký (signature) đảm bảo tính toàn vẹn.
    """
    # Các tham số cơ bản gửi sang cổng thanh toán
    params = {
        "order_code": order_code,
        "amount": str(amount),
        "return_url": return_url
    }
    
    # Sắp xếp các tham số theo alphabet để chuẩn hóa chuỗi dữ liệu ký
    sorted_params = sorted(params.items())
    query_string = urllib.parse.urlencode(sorted_params)
    
    # Tạo chữ ký
    secret_key = settings.SANDBOX_PAYMENT_SECRET.encode('utf-8')
    signature = hmac.new(secret_key, query_string.encode('utf-8'), hashlib.sha256).hexdigest()
    
    # Gắn chữ ký vào tham số
    final_query = f"{query_string}&signature={signature}"
    
    # URL của cổng thanh toán Sandbox (giả lập)
    sandbox_base_url = "https://sandbox.payment-gateway.local/checkout"
    return f"{sandbox_base_url}?{final_query}"


def verify_webhook_signature(
    payload_data: bytes | str,
    signature: str,
    secret: str,
) -> bool:
    """Xác thực chữ ký HMAC-SHA256 của Webhook Sandbox (SCRUM-269)."""
    global _secret_warning_logged
    if not secret:
        if not _secret_warning_logged:
            logger.warning(
                "PAYMENT_WEBHOOK_SECRET is empty or not configured. All webhook signatures will be rejected."
            )
            _secret_warning_logged = True
        return False

    if not signature or not isinstance(signature, str):
        return False

    try:
        if isinstance(payload_data, str):
            payload_bytes = payload_data.encode("utf-8")
        elif isinstance(payload_data, bytes):
            payload_bytes = payload_data
        else:
            payload_bytes = str(payload_data).encode("utf-8")

        expected = hmac.new(
            secret.encode("utf-8"), payload_bytes, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except (TypeError, ValueError, UnicodeError) as exc:
        logger.debug("Signature comparison error: %s", exc)
        return False


