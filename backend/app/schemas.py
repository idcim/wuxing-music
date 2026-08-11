from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, Field, model_validator

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
    captcha_id: str = ""      # GET /api/admin/captcha 返回的 id
    captcha_code: str = ""    # 用户填的 4 位验证码


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
# 一个商户号 + 两个 appid：小程序端用 wx_app_id + 小程序 openid，
# H5（微信内）用 h5_app_id + user.oa_openid 走公众号 JSAPI。两个 appid 都必须
# 在商户平台「APPID 授权管理」里与该商户号绑定，否则统一下单报 appid 不匹配。
class PaySettingIn(BaseModel):
    wx_app_id: str = ""           # 小程序 AppID
    wx_mch_id: str = ""
    wx_api_key: str = ""          # APIv3 密钥（脱敏）
    notify_url: str = ""
    enabled: bool = False         # 总开关：关掉两端都不能下单
    # ── H5（微信内 · 公众号 JSAPI）──
    h5_enabled: bool = True       # 单独关停 H5 售卖用；默认开，行为与加此字段之前一致
    h5_app_id: str = ""           # 留空则回退公众号配置（oa_config.app_id）
    # 微信支付 API 证书（商户私钥/证书 PEM 文本 + 证书序列号）
    wx_cert_serial: str = ""
    wx_cert_pem: str = ""         # apiclient_cert.pem（脱敏）
    wx_key_pem: str = ""          # apiclient_key.pem（脱敏，敏感）


# ── 站点设置 ──
# 前端所有品牌名/副标题（导航标题、启动页、分享文案、海报、锁屏专辑名）都取这里，
# 不再各自硬编码。改名只需在后台改一处。
class SiteSettingIn(BaseModel):
    site_name: str = "五行律音"
    site_slogan: str = "按体质定制的助眠音律"   # 副标题：分享描述 / 海报品牌行
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


# ── 微信开放平台配置 ──
# ⚠️ 目前**不参与任何登录逻辑**：unionid 是把小程序/公众号绑到开放平台后，
# 微信自己在 jscode2session / oauth2/access_token 里下发的，拿不到也用不上这里的
# appid/secret（详见 docs/OPEN-PLATFORM.md 第三节）。这份配置有两个用处：
#   1. 把运营侧的绑定状态记进系统，避免"到底绑没绑"只存在于某个人脑子里；
#   2. 将来做 App 端微信登录时，移动应用的 appid/secret 就落在这里。
class OpenSettingIn(BaseModel):
    app_id: str = ""            # 开放平台 AppID（移动应用/网站应用）
    app_secret: str = ""        # AppSecret（脱敏）
    principal: str = ""         # 认证主体名称，用于核对与小程序/公众号是否同主体
    bound_weapp: bool = False   # 已在开放平台绑定小程序
    bound_oa: bool = False      # 已在开放平台绑定公众号


# ── 短信配置 ──
class SmsSettingIn(BaseModel):
    provider: str = "aliyun"    # 短信服务商（目前实现 aliyun）
    access_key_id: str = ""
    access_key_secret: str = ""  # 脱敏
    sign_name: str = ""         # 短信签名
    template_code: str = ""     # 验证码模板 CODE（模板变量名约定为 code）
    enabled: bool = False


# ── 代理分成设置 ──
class AgentSettingIn(BaseModel):
    enabled: bool = False              # 总开关，默认关（关闭时连分成记录都不产生）
    default_rate: float = Field(default=0.2, ge=0, le=1)
    # 上级加成比例：基数同为**订单金额**，由平台额外支出，不从下级那份里扣。
    # 键名从 default_rate2 改过来（v1.6.0），旧键语义相反，不能复用。
    default_bonus_rate: float = Field(default=0.05, ge=0, le=1)
    freeze_days: int = Field(default=7, ge=0, le=365)
    min_withdraw: float = Field(default=10, ge=0)
    payout_mode: str = "manual"        # manual 线下打款 | wxpay 微信商家转账

    @model_validator(mode="after")
    def _check_total(self):
        # 加法模型下两个比例是真的相加：配成 60% + 60% 平台每单倒贴。
        # 单个代理的覆盖值挡不住（两个数分属两个代理行），这里只守住全局默认；
        # 真正的硬保证在 agent_service.record_commission 的运行时钳制。
        if self.default_rate + self.default_bonus_rate > 1:
            raise ValueError("一级分成比例 + 上级加成比例不能超过 100%")
        return self


# ── 退款 ──
class RefundIn(BaseModel):
    reason: str = ""
    amount: Optional[float] = None   # 不传则全额退


# ── 分页 ──
class PageOut(BaseModel):
    total: int
    items: list
