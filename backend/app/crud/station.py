from sqlalchemy.orm import Session

from app.models.station import Station


def filter_stations_by_user(user, query):
    """Áp dụng logic phân quyền theo vai trò ở tầng truy vấn.

    - Chủ trạm (station_owner) chỉ thấy trạm do chính mình sở hữu.
    - Quản trị viên (admin) / vận hành viên (operator) thấy toàn bộ trạm.
    """
    role_names = getattr(user, "role_names", None)
    if role_names and not any(
        role in ("admin", "operator", "van_hanh_vien") for role in role_names
    ):
        query = query.filter(Station.owner_id == user.id)
    return query


def get_stations(session: Session, user):
    """Lấy danh sách trạm theo quyền sở hữu của người dùng."""
    query = session.query(Station)
    query = filter_stations_by_user(user, query)
    return query.all()