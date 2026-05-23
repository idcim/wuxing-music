from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    data: Optional[T] = None
    msg: str = "ok"


def ok(data: Any = None, msg: str = "ok") -> dict:
    return {"code": 0, "data": data, "msg": msg}


# ── 认证 ──
class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    token: str
    nickname: str


# ── 套餐 ──
class PlanIn(BaseModel):
    id: str
    name: str
    en: str = ""
    price: float = 0
    original: str = ""
    unit: str = ""
    badge: str = ""
    duration_days: int = 0
    features: list[str] = Field(default_factory=list)
    featured: bool = False
    is_active: bool = True
    sort: int = 0


class PlanOut(PlanIn):
    pass


# ── 歌曲 ──
class TrackIn(BaseModel):
    element_id: str
    title: str
    duration: str = "00:00"
    duration_sec: int = 0
    hz: str = ""
    tag: str = ""
    plays: str = "0"
    audio_url: str = ""
    cover_url: str = ""
    is_premium: bool = True
    preview_sec: int = 30
    is_online: bool = True
    sort: int = 0


class TrackOut(TrackIn):
    id: int


# ── CDKEY ──
class CdkeyGenerateIn(BaseModel):
    plan_type: str            # month/year/trial
    duration_days: int
    plan_name: str
    count: int = Field(ge=1, le=1000)
    prefix: str = "WUXING"
    expire_at: Optional[str] = None
    remark: str = ""


class CdkeyOut(BaseModel):
    id: int
    code: str
    batch_id: str
    plan_type: str
    duration_days: int
    plan_name: str
    status: str
    used_by: Optional[int]
    remark: str

    model_config = {"from_attributes": True}


# ── 测评 ──
class QuizQuestionIn(BaseModel):
    q: str
    options: list[dict] = Field(default_factory=list)  # [{text, score:{}}]
    sort: int = 0
    is_active: bool = True


class QuizQuestionOut(QuizQuestionIn):
    id: int


# ── 支付设置 ──
class PaySettingIn(BaseModel):
    wx_app_id: str = ""
    wx_mch_id: str = ""
    wx_api_key: str = ""
    notify_url: str = ""
    enabled: bool = False


# ── 分页 ──
class PageOut(BaseModel):
    total: int
    items: list
