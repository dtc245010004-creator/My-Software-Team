import hmac
import hashlib
import urllib.parse
from app.core.config import settings

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
