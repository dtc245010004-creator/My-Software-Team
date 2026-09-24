from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.api.deps import get_current_user
from app.models.user import User


def require_roles(*allowed_roles: str):
    allowed = set(allowed_roles)

    def checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        user_roles = {
            role.name
            for role in current_user.roles
        }

        if not user_roles.intersection(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thực hiện thao tác này",
            )

        return current_user

    return checker