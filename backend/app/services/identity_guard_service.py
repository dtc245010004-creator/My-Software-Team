"""Khóa tài khoản nhất quán với việc tạo phiên, nạp tiền và ẩn danh hóa."""

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.user import User


def lock_user_for_sensitive_operation(
    db: Session, user_id: int, *, require_active: bool = True
) -> User:
    """Khóa hàng user để tuần tự hóa thao tác nhạy cảm với ẩn danh hóa.

    PostgreSQL dùng SELECT FOR UPDATE. SQLite không hỗ trợ khóa hàng, nên UPDATE
    không đổi giá trị sẽ giành khóa ghi trước khi đọc lại user.
    """
    if db.get_bind().dialect.name == "sqlite":
        db.execute(
            update(User)
            .where(User.id == user_id)
            .values(updated_at=User.updated_at)
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản tài xế.",
        )
    if require_active and not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa.",
        )
    return user
