from app.core.database import SessionLocal
from app.models.role import Role

ROLES = [
    ("driver", "Tài xế sạc xe điện"),
    ("station_owner", "Chủ sở hữu trạm sạc"),
    ("operator", "Vận hành viên kỹ thuật trạm"),
    ("accountant", "Kế toán đối soát doanh thu"),
    ("admin", "Quản trị viên toàn hệ thống"),
]


def seed_roles() -> None:
    """Nạp sẵn đúng 5 vai trò vào bảng roles, bỏ qua nếu đã tồn tại."""
    db = SessionLocal()
    try:
        existing_names = {row.name for row in db.query(Role).filter(Role.name.in_([name for name, _ in ROLES])).all()}

        for name, description in ROLES:
            if name not in existing_names:
                db.add(Role(name=name, description=description))

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_roles()
