from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User

ROLES = [
    ("driver", "Tài xế sạc xe điện"),
    ("station_owner", "Chủ sở hữu trạm sạc"),
    ("operator", "Vận hành viên kỹ thuật trạm"),
    ("accountant", "Kế toán đối soát doanh thu"),
    ("admin", "Quản trị viên toàn hệ thống"),
]

USERS = [
    {
        "email": "admin@evcharging.vn",
        "password": "Password@123",
        "full_name": "Quản trị viên Hệ thống",
        "phone": "0901234567",
        "role_name": "admin",
    },
    {
        "email": "operator@evcharging.vn",
        "password": "Password@123",
        "full_name": "Kỹ thuật Vận hành",
        "phone": "0902345678",
        "role_name": "operator",
    },
    {
        "email": "owner@evcharging.vn",
        "password": "Password@123",
        "full_name": "Chủ trạm Sạc VinFast",
        "phone": "0903456789",
        "role_name": "station_owner",
    },
    {
        "email": "accountant@evcharging.vn",
        "password": "Password@123",
        "full_name": "Kế toán Tài chính",
        "phone": "0904567890",
        "role_name": "accountant",
    },
    {
        "email": "driver@evcharging.vn",
        "password": "Password@123",
        "full_name": "Nguyễn Văn Tài Xế",
        "phone": "0905678901",
        "role_name": "driver",
    },
]


def seed_roles() -> None:
    """Nạp sẵn đúng 5 vai trò vào bảng roles, bỏ qua nếu đã tồn tại."""
    db = SessionLocal()
    try:
        existing_names = {
            row.name
            for row in db.query(Role)
            .filter(Role.name.in_([name for name, _ in ROLES]))
            .all()
        }

        for name, description in ROLES:
            if name not in existing_names:
                db.add(Role(name=name, description=description))

        db.commit()
    finally:
        db.close()


def seed_users() -> None:
    """Nạp sẵn các tài khoản test với mật khẩu băm argon2id và gán vai trò tương ứng."""
    db = SessionLocal()
    try:
        # Lấy bản đồ vai trò
        roles_map = {role.name: role for role in db.query(Role).all()}

        for user_data in USERS:
            existing_user = (
                db.query(User).filter(User.email == user_data["email"]).first()
            )
            role = roles_map.get(user_data["role_name"])

            if not existing_user:
                new_user = User(
                    email=user_data["email"],
                    password_hash=hash_password(user_data["password"]),
                    full_name=user_data["full_name"],
                    phone=user_data["phone"],
                    is_active=True,
                    failed_login_count=0,
                )
                if role:
                    new_user.roles.append(role)
                db.add(new_user)
            else:
                # Cập nhật mật khẩu và vai trò nếu chưa có
                existing_user.password_hash = hash_password(user_data["password"])
                if role and role not in existing_user.roles:
                    existing_user.roles.append(role)

        db.commit()
    finally:
        db.close()


def seed_all() -> None:
    """Chạy toàn bộ seed data."""
    seed_roles()
    seed_users()
    print("Seed data completed successfully!")


if __name__ == "__main__":
    seed_all()
