import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Setting
from app.schemas import ok

router = APIRouter(prefix="/api/site", tags=["site-public"])

SITE_KEY = "site_config"


@router.get("/info")
def site_info(db: Session = Depends(get_db)):
    """小程序公开读取站点信息（免登录）。"""
    row = db.query(Setting).filter(Setting.key == SITE_KEY).first()
    cfg = json.loads(row.value) if row and row.value else {}
    return ok({
        # 前端的品牌名与副标题都以这两项为准（未配置时兜底，与 SiteSettingIn 的默认值一致）
        "site_name": cfg.get("site_name") or "五行律音",
        "site_slogan": cfg.get("site_slogan") or "按体质定制的助眠音律",
        "logo_url": cfg.get("logo_url", ""),
        "icp_no": cfg.get("icp_no", ""),
        "contact_email": cfg.get("contact_email", ""),
        "contact_phone": cfg.get("contact_phone", ""),
        "about_us": cfg.get("about_us", ""),
        "service_terms": cfg.get("service_terms", ""),
    })
