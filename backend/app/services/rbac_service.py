from sqlalchemy.orm import Session

from app.models.auth import Role, UserRole
from app.models.user import User

ROLE_NAMES = {
    "CUSTOMER": "Tài xế",
    "STATION_OWNER": "Chủ trạm",
    "OPERATOR": "Vận hành viên",
    "ACCOUNTANT": "Kế toán",
    "ADMIN": "Quản trị viên",
}


def ensure_role_catalog(db: Session) -> dict[str, Role]:
    roles: dict[str, Role] = {}
    for code, name in ROLE_NAMES.items():
        role = db.query(Role).filter(Role.code == code).first()
        if role is None:
            role = Role(code=code, name=name)
            db.add(role)
            db.flush()
        roles[code] = role
    return roles


def assign_user_role(db: Session, user: User, code: str) -> None:
    role = ensure_role_catalog(db).get(code)
    if role is None:
        raise ValueError(f"Vai trò không được khai báo: {code}")
    assignment = db.query(UserRole).filter_by(user_id=user.id, role_id=role.id).first()
    if assignment is None:
        db.add(UserRole(user_id=user.id, role_id=role.id))
