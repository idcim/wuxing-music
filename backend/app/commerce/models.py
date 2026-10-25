from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, declarative_base, mapped_column
from app.models import User

Base = declarative_base()
SCHEMA_VERSION = 4


class Row:
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SchemaVersion(Base):
    __tablename__ = "commerce_schema_version"
    version: Mapped[int] = mapped_column(primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class Category(Row, Base):
    __tablename__ = "commerce_category"
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(80))
    sort: Mapped[int] = mapped_column(default=0)


class Teacher(Row, Base):
    __tablename__ = "course_teacher"
    name: Mapped[str] = mapped_column(String(80))
    avatar: Mapped[str] = mapped_column(String(1024), default="")
    intro: Mapped[str] = mapped_column(Text, default="")


class Course(Row, Base):
    __tablename__ = "course"
    category_id: Mapped[int | None] = mapped_column(nullable=True)
    teacher_id: Mapped[int | None] = mapped_column(nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    subtitle: Mapped[str] = mapped_column(String(255), default="")
    cover: Mapped[str] = mapped_column(String(1024), default="")
    intro: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    price_fen: Mapped[int] = mapped_column(default=0)
    access_days: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    sort: Mapped[int] = mapped_column(default=0)
    revision: Mapped[int] = mapped_column(default=1)
    payment_product: Mapped[str] = mapped_column(String(128), default="")
    payment_synced_revision: Mapped[int] = mapped_column(default=0)


class MediaAsset(Row, Base):
    __tablename__ = "course_media"
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(255))
    source_key: Mapped[str] = mapped_column(String(512), default="")
    playback_key: Mapped[str] = mapped_column(String(512), default="")
    playback_version: Mapped[str] = mapped_column(String(1024), default="", server_default="")
    state: Mapped[str] = mapped_column(String(16), default="uploading")
    duration: Mapped[int] = mapped_column(default=0)
    size: Mapped[int] = mapped_column(default=0)
    error: Mapped[str] = mapped_column(Text, default="")


class Lesson(Row, Base):
    __tablename__ = "course_lesson"
    course_id: Mapped[int] = mapped_column(index=True)
    title: Mapped[str] = mapped_column(String(160))
    media_id: Mapped[int | None] = mapped_column(nullable=True)
    preview: Mapped[bool] = mapped_column(default=False)
    sort: Mapped[int] = mapped_column(default=0)


class Enrollment(Row, Base):
    __tablename__ = "course_enrollment"
    __table_args__ = (UniqueConstraint("user_id", "course_id", "source"),)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    course_id: Mapped[int] = mapped_column(index=True)
    source: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    revoked: Mapped[bool] = mapped_column(default=False)


class Progress(Row, Base):
    __tablename__ = "course_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id"),)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    lesson_id: Mapped[int] = mapped_column(index=True)
    position: Mapped[int] = mapped_column(default=0)
    furthest: Mapped[int] = mapped_column(default=0)
    completed: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class Product(Row, Base):
    __tablename__ = "commerce_product"
    category_id: Mapped[int | None] = mapped_column(nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    subtitle: Mapped[str] = mapped_column(String(255), default="")
    cover: Mapped[str] = mapped_column(String(1024), default="")
    images: Mapped[list] = mapped_column(JSON, default=list)
    intro: Mapped[str] = mapped_column(Text, default="")
    shipping_note: Mapped[str] = mapped_column(Text, default="")
    aftersale_note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    sort: Mapped[int] = mapped_column(default=0)


class Sku(Row, Base):
    __tablename__ = "commerce_sku"
    product_id: Mapped[int] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(160))
    price_fen: Mapped[int] = mapped_column(default=0)
    stock: Mapped[int] = mapped_column(default=0)
    reserved: Mapped[int] = mapped_column(default=0)
    enabled: Mapped[bool] = mapped_column(default=True)


class InventoryLog(Row, Base):
    __tablename__ = "commerce_inventory_log"
    sku_id: Mapped[int] = mapped_column(index=True)
    delta: Mapped[int] = mapped_column()
    reason: Mapped[str] = mapped_column(String(255))
    operator: Mapped[str] = mapped_column(String(80), default="")


class CartItem(Row, Base):
    __tablename__ = "commerce_cart"
    __table_args__ = (UniqueConstraint("user_id", "sku_id"),)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    sku_id: Mapped[int] = mapped_column()
    quantity: Mapped[int] = mapped_column(default=1)


class Address(Row, Base):
    __tablename__ = "commerce_address"
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(32))
    province: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(80))
    district: Mapped[str] = mapped_column(String(80), default="")
    detail: Mapped[str] = mapped_column(String(255))


class Order(Row, Base):
    __tablename__ = "commerce_order"
    __table_args__ = (UniqueConstraint("user_id", "request_key"),)
    order_no: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    request_key: Mapped[str] = mapped_column(String(64))
    request_hash: Mapped[str] = mapped_column(String(64), default="")
    payer_openid: Mapped[str] = mapped_column(String(128), default="")
    kind: Mapped[str] = mapped_column(String(16))
    amount_fen: Mapped[int] = mapped_column()
    shipping_fen: Mapped[int] = mapped_column(default=0)
    refund_fen: Mapped[int] = mapped_column(default=0)
    address: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    fulfillment: Mapped[str] = mapped_column(String(20), default="unpaid")
    provider: Mapped[str] = mapped_column(String(20), default="wxpay")
    transaction_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)
    expires_at: Mapped[datetime] = mapped_column()


class OrderItem(Row, Base):
    __tablename__ = "commerce_order_item"
    order_id: Mapped[int] = mapped_column(index=True)
    entity_id: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(160))
    spec: Mapped[str] = mapped_column(String(160), default="")
    cover: Mapped[str] = mapped_column(String(1024), default="")
    price_fen: Mapped[int] = mapped_column()
    quantity: Mapped[int] = mapped_column()
    refund_quantity: Mapped[int] = mapped_column(default=0)
    access_days: Mapped[int | None] = mapped_column(nullable=True)
    product_revision: Mapped[int] = mapped_column(default=0)
    payment_product: Mapped[str] = mapped_column(String(128), default="")


class Payment(Row, Base):
    __tablename__ = "commerce_payment"
    order_id: Mapped[int] = mapped_column(unique=True)
    state: Mapped[str] = mapped_column(String(20), default="created")
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str] = mapped_column(Text, default="")
    credential: Mapped[str] = mapped_column(Text, default="")


class Shipment(Row, Base):
    __tablename__ = "commerce_shipment"
    order_id: Mapped[int] = mapped_column(unique=True)
    carrier: Mapped[str] = mapped_column(String(64))
    tracking_no: Mapped[str] = mapped_column(String(80))
    sync_state: Mapped[str] = mapped_column(String(16), default="pending")
    error: Mapped[str] = mapped_column(Text, default="")


class LogisticsQuery(Base):
    __tablename__ = "commerce_logistics_query"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), default="")
    token: Mapped[str] = mapped_column(String(32), default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    queried_at: Mapped[datetime | None] = mapped_column(nullable=True)
    next_query_at: Mapped[datetime | None] = mapped_column(nullable=True)
    error: Mapped[str] = mapped_column(String(255), default="")


class AfterSale(Row, Base):
    __tablename__ = "commerce_aftersale"
    order_id: Mapped[int] = mapped_column(index=True)
    item_id: Mapped[int] = mapped_column(index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    quantity: Mapped[int] = mapped_column()
    amount_fen: Mapped[int] = mapped_column()
    reason: Mapped[str] = mapped_column(String(255))
    images: Mapped[list] = mapped_column(JSON, default=list)
    state: Mapped[str] = mapped_column(String(24), default="requested")
    return_carrier: Mapped[str] = mapped_column(String(64), default="")
    return_tracking: Mapped[str] = mapped_column(String(80), default="")
    remark: Mapped[str] = mapped_column(String(255), default="")
    refund_no: Mapped[str] = mapped_column(String(32), unique=True)
    restocked: Mapped[bool] = mapped_column(default=False)


class Attachment(Row, Base):
    __tablename__ = "commerce_attachment"
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id, ondelete="RESTRICT"), index=True)
    key: Mapped[str] = mapped_column(String(80))


class Event(Row, Base):
    __tablename__ = "commerce_event"
    subject: Mapped[str] = mapped_column(String(80), index=True)
    action: Mapped[str] = mapped_column(String(80))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    operator: Mapped[str] = mapped_column(String(80), default="")


class Job(Row, Base):
    __tablename__ = "commerce_job"
    key: Mapped[str] = mapped_column(String(128), unique=True)
    kind: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    run_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    lease_until: Mapped[datetime | None] = mapped_column(nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")


class WorkerHeartbeat(Row, Base):
    __tablename__ = "commerce_worker_heartbeat"
    worker_id: Mapped[str] = mapped_column(String(64), unique=True)
    hostname: Mapped[str] = mapped_column(String(255), index=True)
    queue: Mapped[str] = mapped_column(String(24), default="all")
    last_seen: Mapped[datetime] = mapped_column(index=True)
    active_job_id: Mapped[int | None] = mapped_column(nullable=True)
    job_started_at: Mapped[datetime | None] = mapped_column(nullable=True)
