from fastapi import APIRouter

from app.core.rbac import roles

router = APIRouter(
    prefix="/rbac-test",
    tags=["RBAC Test"],
)


@router.get("/admin")
@roles("admin")
def admin_test():
    return {
        "message": "Bạn có quyền admin"
    }


@router.get("/operator")
@roles("operator")
def operator_test():
    return {
        "message": "Bạn có quyền operator"
    }


@router.get("/owner")
@roles("station_owner")
def owner_test():
    return {
        "message": "Bạn có quyền station_owner"
    }

@router.get("/no-permission")
def no_permission_test():
    return {
        "message": "Route này không khai báo quyền"
    }