from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(30), unique=True, nullable=False, index=True)
    name = Column(String(80), nullable=False)

    user_assignments = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="role_assignments")
    role = relationship("Role", back_populates="user_assignments")


class LoginThrottle(Base):
    __tablename__ = "login_throttles"
    __table_args__ = (UniqueConstraint("subject_type", "subject_hash", name="uq_login_throttle_subject"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    subject_type = Column(String(16), nullable=False)
    subject_hash = Column(String(64), nullable=False)
    failed_attempts = Column(Integer, default=0, nullable=False)
    window_started_at = Column(DateTime(timezone=True), nullable=True)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
