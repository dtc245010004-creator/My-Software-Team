from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.routing import iter_route_contexts
from sqlalchemy.orm import joinedload
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Match

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User


def roles(*role_names: str):
    def decorator(func):
        func.allowed_roles = set(role_names)
        return func

    return decorator


def find_endpoint(request: Request):
    """Tìm endpoint tương ứng với URL hiện tại."""

    for context in iter_route_contexts(request.app.routes):
        match, _ = context.matches(request.scope)

        if match == Match.FULL:
            return context.endpoint

    return None


class RBACMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):

        # Các đường dẫn công khai
        public_paths = {
            "/",
            "/docs",
            "/docs/oauth2-redirect",
            "/openapi.json",
            "/redoc",
        }

        if request.url.path in public_paths:
            return await call_next(request)

        # Tìm endpoint
        endpoint = find_endpoint(request)

        if endpoint is None:
            return JSONResponse(
                status_code=404,
                content={"detail": "Không tìm thấy route"},
            )

        # Lấy role được khai báo bằng @roles(...)
        allowed_roles = getattr(endpoint, "allowed_roles", None)

        # Route chưa khai báo quyền -> từ chối mặc định
        if allowed_roles is None:
            return JSONResponse(
                status_code=403,
                content={"detail": "Route chưa khai báo quyền"},
            )

        # Route public
        if "public" in allowed_roles:
            return await call_next(request)

        # Lấy JWT từ cookie
        token = request.cookies.get(
            settings.session_cookie_name
        )

        # Hỗ trợ Bearer token
        if not token:
            auth_header = request.headers.get(
                "Authorization",
                "",
            )

            if auth_header.startswith("Bearer "):
                token = auth_header.split(
                    " ", 1
                )[1]

        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Chưa xác thực"},
            )

        # Giải mã JWT
        payload = decode_access_token(token)

        if not payload:
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "Phiên đăng nhập không hợp lệ "
                        "hoặc đã hết hạn"
                    )
                },
            )

        user_id = payload.get("sub")

        if not user_id:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token không hợp lệ"},
            )

        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return JSONResponse(
                status_code=401,
                content={"detail": "Token không hợp lệ"},
            )

        # Lấy user và role từ database
        db_gen = get_db()
        db = next(db_gen)

        try:
            user = (
                db.query(User)
                .options(joinedload(User.roles))
                .filter(User.id == user_id)
                .first()
            )
        finally:
            db_gen.close()

        if not user:
            return JSONResponse(
                status_code=401,
                content={"detail": "Người dùng không tồn tại"},
            )

        if not user.is_active:
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "Tài khoản đã bị vô hiệu hóa"
                    )
                },
            )

        # Lưu user vào request
        request.state.user = user

        # Chỉ yêu cầu đăng nhập
        if "authenticated" in allowed_roles:
            return await call_next(request)

        # Lấy role của user
        user_roles = {
            role.name
            for role in user.roles
        }

        # Kiểm tra role
        if not user_roles.intersection(allowed_roles):
            return JSONResponse(
                status_code=403,
                content={
                    "detail": (
                        "Bạn không có quyền thực hiện thao tác này"
                    )
                },
            )

        return await call_next(request)