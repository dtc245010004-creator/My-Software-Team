from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


def roles(*role_names: str):
    """
    Khai báo các role được phép truy cập route.

    Ví dụ:
        @roles("admin")
        def my_route():
            ...
    """
    allowed_roles = set(role_names)

    def decorator(func: Callable):
        func.allowed_roles = allowed_roles
        return func

    return decorator


class RBACMiddleware(BaseHTTPMiddleware):
    """
    Middleware kiểm tra quyền truy cập route.

    Route không khai báo @roles(...) sẽ bị từ chối mặc định.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Các endpoint công khai cần cho FastAPI hoạt động
        public_paths = {
            "/",
            "/docs",
            "/openapi.json",
            "/redoc",
        }

        if path in public_paths:
            return await call_next(request)

        route = request.scope.get("route")

        if route is None:
            return await call_next(request)

        endpoint = getattr(route, "endpoint", None)

        if endpoint is None:
            return await call_next(request)

        allowed_roles = getattr(endpoint, "allowed_roles", None)

        # Default deny:
        # route không khai báo quyền -> 403
        if not allowed_roles:
            return JSONResponse(
                status_code=403,
                content={"detail": "Route chưa khai báo quyền"},
            )

        # Public route
        if "public" in allowed_roles:
            return await call_next(request)

        # Authenticated route:
        # quyền xác thực thực tế sẽ được dependency của endpoint kiểm tra.
        if "authenticated" in allowed_roles:
            return await call_next(request)

        # Lấy user đã được xác thực nếu middleware/dependency trước đó đã gắn vào request
        user = getattr(request.state, "user", None)

        if user is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Chưa xác thực"},
            )

        user_roles = {role.name for role in getattr(user, "roles", [])}

        if not user_roles.intersection(allowed_roles):
            return JSONResponse(
                status_code=403,
                content={"detail": "Bạn không có quyền truy cập"},
            )

        return await call_next(request)
