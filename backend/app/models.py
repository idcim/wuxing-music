from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now() -> datetime:
    return datetime.utcnow()


class Admin(Base):
    __tablename__ = "admin"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(64), default="管理员")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Element(Base):
    """五行配置。id 用元素名（木火土金水）。"""

    __tablename__ = "element"

    id: Mapped[str] = mapped_column(String(2), primary_key=True)
    en: Mapped[str] = mapped_column(String(16))
    icon: Mapped[str] = mapped_column(String(32), default="")
    primary: Mapped[str] = mapped_column(String(16))
    accent: Mapped[str] = mapped_column(String(16))
    glow: Mapped[str] = mapped_column(String(48))
    bg: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(String(2))
    note_pinyin: Mapped[str] = mapped_column(String(16))
    organ: Mapped[str] = mapped_column(String(16))
    season: Mapped[str] = mapped_column(String(8))
    quality: Mapped[str] = mapped_column(String(16))
    desc: Mapped[str] = mapped_column(String(128), default="")
    sleep_tip: Mapped[str] = mapped_column(Text, default="")
    sort: Mapped[int] = mapped_column(Integer, default=0)

    tracks: Mapped[list["Track"]] = relationship(back_populates="element")


class Track(Base):
    __tablename__ = "track"

    id: Mapped[int] = mapped_column(primary_key=True)
    element_id: Mapped[str] = mapped_column(ForeignKey("element.id"), index=True)
    title: Mapped[str] = mapped_column(String(64))
    duration: Mapped[str] = mapped_column(String(16), default="00:00")
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    hz: Mapped[str] = mapped_column(String(16), default="")
    tag: Mapped[str] = mapped_column(String(32), default="")
    plays: Mapped[str] = mapped_column(String(16), default="0")
    audio_url: Mapped[str] = mapped_column(Text, default="")
    cover_url: Mapped[str] = mapped_column(Text, default="")
    is_premium: Mapped[bool] = mapped_column(Boolean, default=True)
    preview_sec: Mapped[int] = mapped_column(Integer, default=30)
    is_online: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    element: Mapped["Element"] = relationship(back_populates="tracks")


class Plan(Base):
    __tablename__ = "plan"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # free/month/year/trial
    name: Mapped[str] = mapped_column(String(32))
    en: Mapped[str] = mapped_column(String(32), default="")
    price: Mapped[float] = mapped_column(Float, default=0)
    original: Mapped[str] = mapped_column(String(16), default="")
    unit: Mapped[str] = mapped_column(String(16), default="")
    badge: Mapped[str] = mapped_column(String(16), default="")
    duration_days: Mapped[int] = mapped_column(Integer, default=0)
    features: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    openid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    unionid: Mapped[str] = mapped_column(String(64), default="")
    nickname: Mapped[str] = mapped_column(String(64), default="律音用户")
    avatar: Mapped[str] = mapped_column(Text, default="")
    element: Mapped[str] = mapped_column(String(2), default="")
    element_scores: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    quiz_completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    membership_type: Mapped[str] = mapped_column(String(16), default="free")
    membership_name: Mapped[str] = mapped_column(String(32), default="听闻")
    membership_expire_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    membership_source: Mapped[str] = mapped_column(String(16), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Cdkey(Base):
    __tablename__ = "cdkey"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    batch_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    plan_type: Mapped[str] = mapped_column(String(16))  # month/year/trial
    duration_days: Mapped[int] = mapped_column(Integer)
    plan_name: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="unused", index=True)
    used_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expire_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    remark: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class CdkeyRedeemLog(Base):
    __tablename__ = "cdkey_redeem_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    cdkey_id: Mapped[int] = mapped_column(Integer, index=True)
    redeem_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    ip: Mapped[str] = mapped_column(String(45), default="")
    device: Mapped[str] = mapped_column(String(255), default="")


class Order(Base):
    __tablename__ = "app_order"  # order 是 MySQL 保留字，加前缀避免冲突

    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    plan_id: Mapped[str] = mapped_column(String(16))
    plan_name: Mapped[str] = mapped_column(String(32), default="")
    amount: Mapped[float] = mapped_column(Float)
    # pending/paid/refunding/refunded/failed/closed
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    # 退款相关
    refund_amount: Mapped[float] = mapped_column(Float, default=0)
    refund_reason: Mapped[str] = mapped_column(String(255), default="")
    refund_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    refund_by: Mapped[str] = mapped_column(String(64), default="")  # 操作管理员


class QuizQuestion(Base):
    __tablename__ = "quiz_question"

    id: Mapped[int] = mapped_column(primary_key=True)
    q: Mapped[str] = mapped_column(String(255))
    options: Mapped[str] = mapped_column(Text, default="[]")  # JSON: [{text, score:{}}]
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Setting(Base):
    """键值配置表，存支付参数等。"""

    __tablename__ = "setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
