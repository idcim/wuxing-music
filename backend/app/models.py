from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now() -> datetime:
    return datetime.utcnow()


class Role(Base):
    """后台角色：一组权限点的集合，管理员通过 role_id 绑定。"""

    __tablename__ = "role"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    remark: Mapped[str] = mapped_column(String(255), default="")
    # 权限点 JSON 数组，取值见 app/permissions.py 的 ALL_PERMISSIONS
    permissions: Mapped[str] = mapped_column(Text, default="[]")
    # 内置角色（超级管理员）：禁止删除与改权限，避免把自己锁在门外
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Admin(Base):
    __tablename__ = "admin"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(64), default="管理员")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 绑定角色；超管可不绑（is_super 已覆盖全部权限）
    role_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 超级管理员旁路开关：恒定拥有全部权限，不依赖 role 表内容
    is_super: Mapped[bool] = mapped_column(Boolean, default=False)
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
    # 文化对照维度（五志/五神/简谱/调式/时间感…），JSON 字符串。
    # 三十多个维度只做展示与文案取材，塞一个 JSON 列而不是各加一列，
    # 否则 ElementIn 与后台表单会被撑成三十多个输入框。基准见 docs/WUXING-REFERENCE.md。
    meta: Mapped[str] = mapped_column(Text, default="{}")
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
    unionid: Mapped[str] = mapped_column(String(64), default="", index=True)
    oa_openid: Mapped[str] = mapped_column(String(64), default="", index=True)  # 公众号 openid（H5 网页授权/JSAPI 支付 payer）
    phone: Mapped[str] = mapped_column(String(20), default="", index=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")         # 手机号密码登录（bcrypt）
    nickname: Mapped[str] = mapped_column(String(64), default="律音用户")
    avatar: Mapped[str] = mapped_column(Text, default="")
    element: Mapped[str] = mapped_column(String(2), default="")
    element_scores: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    quiz_completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)          # 公历生日
    # 出生钟点 0-23（可空）。存钟点而非「时辰序号」：子时跨 23:00-00:59 两个自然日，
    # 存序号会丢掉「到底是哪一天的子时」这个信息。
    birth_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 代理归因：首次扫码永久绑定，一旦有值不再改绑（见 agent_service.bind_agent）。
    # 不建独立绑定表——「永久且唯一」的关系放两列就够，多一张表反而要处理"哪条才算数"。
    agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    agent_bound_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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
    transaction_id: Mapped[str] = mapped_column(String(64), default="")  # 微信支付单号
    is_gift: Mapped[bool] = mapped_column(Boolean, default=False)        # 是否买卡送人
    gift_code: Mapped[str] = mapped_column(String(32), default="")       # 礼物 CDKEY（支付后生成）
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


class PlayHistory(Base):
    """聆听历史。"""

    __tablename__ = "play_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    track_id: Mapped[int] = mapped_column(Integer, index=True)
    played_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class Agent(Base):
    """渠道代理：实体店（店内印刷推广码）/ 网络推手（分享海报链接）。

    **两级分销，到此为止。** 红线是「计酬层级不得达到三级」，不是不能有二级——
    但 parent_id 只用于往上走一跳，record_commission 绝不递归，模型上也不再加第三级字段。
    """

    __tablename__ = "agent"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 推广码：进小程序码 scene / H5 链接的 ?a=，字符集同 CDKEY（去掉易混的 0/O/1/I）
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(16), default="store")  # store 实体店 | promoter 网络推手
    # 关联的用户账号：代理中心据此认人。可空表示还没绑账号（后台先建档、代理稍后注册）
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), default="", index=True)
    real_name: Mapped[str] = mapped_column(String(64), default="")   # 打款收款人姓名校验用
    contact: Mapped[str] = mapped_column(String(255), default="")
    remark: Mapped[str] = mapped_column(String(255), default="")
    # None 表示用全局默认比例（agent_config.default_rate）——这就是「可覆盖」的实现，
    # 用 0 表示"不分成"，因此不能拿 0 当"未设置"的哨兵。
    commission_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    # 上级代理。用户被提升为代理时按其 user.agent_id 自动落定，之后**不可改**
    #（"下级永远是上级的"）。只允许为空时补填，不允许改指向。
    parent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # 作为**上级**时，下级每成一单额外拿订单额的多少。None = 跟随全局 default_bonus_rate。
    # 语义：配在上级身上（"我发展的下级，每单我多拿多少"）；由平台额外支出，
    # 不从下级那份里扣，下级实拿不受影响。（列名沿用 rate2，语义 v1.6.0 已改。）
    commission_rate2: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)  # active | disabled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Commission(Base):
    """一笔成交产生的分成。金额与比例都是成交时点的快照——
    事后改代理比例不影响历史记录，否则对账永远对不平。

    一单最多两条：level=1 直推代理（订单额 × 自己的比例，恒定拿满），
    level=2 其上级（订单额 × 上级的加成比例，平台额外支出）。
    两条各自独立取整，**没有跨行不变量**；对账按单汇总 amount 即可。
    """

    __tablename__ = "commission"
    # 一单两条，所以唯一性是 (order_id, level) 而非 order_id 单列。
    # ⚠️ 存量库里 order_id 上还挂着旧的单列唯一索引，_auto_migrate 不碰索引，
    #    由 main.py::_fix_commission_index 单独换掉。
    __table_args__ = (
        UniqueConstraint("order_id", "level", name="uq_commission_order_level"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, index=True)
    order_id: Mapped[int] = mapped_column(Integer, index=True)
    # 1=直推，2=上级抽成。封顶就是 2，没有 3。
    level: Mapped[int] = mapped_column(Integer, default=1, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    order_amount: Mapped[float] = mapped_column(Float, default=0)
    # 本单平台总支出 = 直推分成 + 上级加成。两条记录都存同一个值，
    # 对账时一眼看出「这单总共出了多少、怎么分的」。加法模型下总支出会随
    # 有没有上级浮动，没法再从 rate 反推，所以这个列反而更有用了。
    base_amount: Mapped[float] = mapped_column(Float, default=0)
    # level=1 存直推比例，level=2 存上级加成比例——**两者基数都是订单额**
    rate: Mapped[float] = mapped_column(Float, default=0)
    amount: Mapped[float] = mapped_column(Float, default=0)
    # 仅 level=2 有值：这笔加成来自哪个下级代理
    source_agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # pending(冻结中) → available(可提现) → withdrawing → paid；void = 退款冲正
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    # 冻结到期时间。不设定时任务解冻：查询余额时按 available_at <= now 判定，
    # 少一个 cron 就少一处会悄悄停掉的组件。
    available_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    withdrawal_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # 分成已付款之后订单才退款：钱追不回来，标记出来由人工向代理追讨
    clawback: Mapped[bool] = mapped_column(Boolean, default=False)
    void_reason: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Withdrawal(Base):
    """提现单：代理申请 → 后台审核 → 打款（线下标记 / 微信商家转账）。"""

    __tablename__ = "withdrawal"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, index=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    # pending(待审核) → approved(待打款) → paid；rejected / failed
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    payout_mode: Mapped[str] = mapped_column(String(16), default="manual")  # manual | wxpay
    transfer_no: Mapped[str] = mapped_column(String(64), default="")   # 商户转账单号（幂等键）
    wx_transfer_id: Mapped[str] = mapped_column(String(64), default="")
    fail_reason: Mapped[str] = mapped_column(String(255), default="")
    reviewed_by: Mapped[str] = mapped_column(String(64), default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    remark: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SmsCode(Base):
    """短信验证码：手机号登录/注册用，10 分钟有效、一次性。"""

    __tablename__ = "sms_code"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code: Mapped[str] = mapped_column(String(8))
    scene: Mapped[str] = mapped_column(String(16), default="login")  # login/bind/...
    expire_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)  # 校验失败次数，达上限即作废（防暴力）
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
