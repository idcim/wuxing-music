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
    wx_api_key: str = ""          # APIv3 密钥（脱敏）
    notify_url: str = ""
    enabled: bool = False
    # 微信支付 API 证书（商户私钥/证书 PEM 文本 + 证书序列号）
    wx_cert_serial: str = ""
    wx_cert_pem: str = ""         # apiclient_cert.pem（脱敏）
    wx_key_pem: str = ""          # apiclient_key.pem（脱敏，敏感）


# ── 站点设置 ──
class SiteSettingIn(BaseModel):
    site_name: str = "五行律音"
    logo_url: str = ""
    icp_no: str = ""             # 备案号
    contact_email: str = ""
    contact_phone: str = ""
    about_us: str = ""          # 关于我们（富文本/纯文本）
    service_terms: str = ""     # 服务条款


# ── 存储设置 ──
class StorageSettingIn(BaseModel):
    provider: str = "local"     # local | oss
    oss_endpoint: str = ""
    oss_bucket: str = ""
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""  # 脱敏
    oss_base_url: str = ""      # 自定义域名/CDN 前缀


# ── 小程序配置 ──
class MpSettingIn(BaseModel):
    app_id: str = ""            # 小程序 AppID（公开）
    app_secret: str = ""        # AppSecret（脱敏，后端 code→openid 用）
    original_id: str = ""       # 原始 ID（gh_xxx）
    mp_name: str = ""           # 小程序名称
    customer_service: str = ""  # 客服号/方式
    env_version: str = "release"  # release | trial | develop


# ── 公众号配置（H5 网页授权 / JSSDK / JSAPI 支付）──
class OaSettingIn(BaseModel):
    app_id: str = ""            # 公众号 AppID（公开）
    app_secret: str = ""        # 公众号 AppSecret（脱敏，网页授权/access_token 用）
    original_id: str = ""       # 原始 ID（gh_xxx）
    oa_name: str = ""           # 公众号名称


# ── 短信配置 ──
class SmsSettingIn(BaseModel):
    provider: str = "aliyun"    # 短信服务商（目前实现 aliyun）
    access_key_id: str = ""
    access_key_secret: str = ""  # 脱敏
    sign_name: str = ""         # 短信签名
    template_code: str = ""     # 验证码模板 CODE（模板变量名约定为 code）
    enabled: bool = False


# ── 退款 ──
class RefundIn(BaseModel):
    reason: str = ""
    amount: Optional[float] = None   # 不传则全额退


# ── 分页 ──
class PageOut(BaseModel):
    total: int
    items: list
