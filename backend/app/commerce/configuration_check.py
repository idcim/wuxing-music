"""仅返回固定字段名称与存在性，帮助核对实际进程加载的配置；不调用外部渠道。"""
from app.config import settings
from app.routers.mp import _mp_cfg, _pay_cfg
from .logistics_settings import load as logistics_account


def report(db):
    mp, pay = _mp_cfg(db), _pay_cfg(db)

    def server(*names):
        return [dict(name=name.upper(), present=bool(getattr(settings, name)), source="服务器配置") for name in names]

    def stored(config, names, source):
        return [dict(name=name, present=bool(config.get(name)), source=source) for name in names]

    def group(key, label, checks, note):
        return dict(key=key, label=label, complete=all(item["present"] for item in checks), checks=checks, note=note)

    physical = server("commerce_public_base", "commerce_wxpay_public_key", "commerce_wxpay_public_key_id")
    physical += stored(pay, ("enabled", "wx_mch_id", "wx_key_pem", "wx_cert_serial", "wx_api_key"), "后台支付配置")
    physical += stored(mp, ("app_id",), "后台小程序配置")
    course = server("commerce_public_base", "commerce_virtual_approved", "commerce_virtual_offer_id",
                    "commerce_virtual_app_key", "commerce_push_token", "commerce_push_aes_key")
    course += stored(mp, ("app_id", "app_secret"), "后台小程序配置")
    account = logistics_account(db)
    account_source = "后台快递100配置" if account["source"] == "admin" else "服务器配置"
    logistics = [dict(name=name, present=bool(account.get(key)), source=account_source) for key, name in (
        ("enabled", "物流查询已启用"), ("customer", "Customer"), ("key", "Key"))]
    return dict(verified_external=False, groups=[
        group("physical_payment", "实物支付", physical,
              "商户参数复用现有后台支付配置；2.0 通知验签公钥与回调域名仍需服务器配置。"),
        group("course_payment", "课程数字支付", course,
              "数字支付与音乐会员的普通微信支付独立，批准标记不会因旧会员支付可用而自动开启。"),
        group("course_ios", "iOS 数字支付许可", server("commerce_virtual_ios_approved"),
              "这里只检查许可标记是否启用；iOS 课程购买还要求数字支付参数完整。"),
        group("private_media", "私有课程 OSS", server("commerce_private_endpoint", "commerce_private_bucket",
              "commerce_private_key_id", "commerce_private_key_secret"),
              "使用独立私有课程桶，不回退到公开图片或音乐桶；权限、版本控制与播放仍需实际验证。"),
        group("shipping", "微信发货与收货同步", server("commerce_shipping_approved") + stored(mp,
              ("app_id", "app_secret"), "后台小程序配置"),
              "复用现有小程序身份，仍需显式启用已验证的发货能力标记。"),
        group("logistics", "快递100", logistics,
              "后台账号配置优先；此处只检查账号加载情况，不发起付费查询。"),
    ])
