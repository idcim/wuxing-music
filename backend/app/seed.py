import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Admin,
    Cdkey,
    Element,
    Order,
    Plan,
    QuizQuestion,
    Track,
    User,
)
from app.security import hash_password

# 五行配置（与小程序 constants/wuxing.ts 对齐）
ELEMENTS = [
    {
        "id": "木", "en": "WOOD", "icon": "sprout",
        "primary": "#84cc16", "accent": "#bef264", "glow": "rgba(132,204,22,0.25)",
        "bg": "radial-gradient(ellipse at 25% 15%, #0a1a08 0%, #050a04 50%, #020503 100%)",
        "note": "角", "note_pinyin": "Jué", "organ": "肝胆", "season": "春", "quality": "生发",
        "desc": "疏肝理气 · 调和情志",
        "sleep_tip": "春木升发，肝气易郁。角调音律帮助疏泄郁结，柔肝宁神。", "sort": 0,
        "tracks": [
            ("竹林晨露", "38:20", 2300, "324Hz", "深度睡眠", "12.4k", False),
            ("春风过陌", "45:00", 2700, "角调", "舒肝解郁", "8.9k", True),
            ("新芽初绿", "52:15", 3135, "324Hz", "助眠冥想", "6.2k", True),
        ],
    },
    {
        "id": "火", "en": "FIRE", "icon": "flame",
        "primary": "#f97316", "accent": "#fdba74", "glow": "rgba(249,115,22,0.25)",
        "bg": "radial-gradient(ellipse at 70% 20%, #1a0a02 0%, #0d0502 50%, #050201 100%)",
        "note": "徵", "note_pinyin": "Zhǐ", "organ": "心小肠", "season": "夏", "quality": "温煦",
        "desc": "养心安神 · 清热除烦",
        "sleep_tip": "心火扰神则难寐。徵调音律引火归元，宁心定志。", "sort": 1,
        "tracks": [
            ("暖阳归处", "40:00", 2400, "396Hz", "安心助眠", "15.7k", False),
            ("晚霞余温", "36:30", 2190, "徵调", "清热宁神", "11.2k", True),
            ("炉火细语", "48:45", 2925, "396Hz", "冥想放松", "9.8k", True),
        ],
    },
    {
        "id": "土", "en": "EARTH", "icon": "mountain",
        "primary": "#eab308", "accent": "#fde047", "glow": "rgba(234,179,8,0.25)",
        "bg": "radial-gradient(ellipse at 50% 70%, #1a1305 0%, #0d0903 50%, #050402 100%)",
        "note": "宫", "note_pinyin": "Gōng", "organ": "脾胃", "season": "长夏", "quality": "运化",
        "desc": "健脾和胃 · 安中定志",
        "sleep_tip": "土居中宫，脾健则思虑少。宫调音律培土宁心，稳定入眠。", "sort": 2,
        "tracks": [
            ("黄土大地", "42:00", 2520, "528Hz", "深度睡眠", "18.3k", False),
            ("麦浪轻摇", "39:15", 2355, "宫调", "健脾安神", "13.5k", True),
            ("稻香归田", "55:00", 3300, "528Hz", "冥想放松", "10.1k", True),
        ],
    },
    {
        "id": "金", "en": "METAL", "icon": "gem",
        "primary": "#cbd5e1", "accent": "#f1f5f9", "glow": "rgba(203,213,225,0.2)",
        "bg": "radial-gradient(ellipse at 80% 25%, #0e131a 0%, #070a0f 50%, #030507 100%)",
        "note": "商", "note_pinyin": "Shāng", "organ": "肺大肠", "season": "秋", "quality": "收敛",
        "desc": "润肺敛神 · 收引归精",
        "sleep_tip": "秋金主降，肃降则神安。商调音律顺应敛降之性。", "sort": 3,
        "tracks": [
            ("白露秋霜", "44:30", 2670, "741Hz", "助眠减压", "14.6k", False),
            ("金风玉露", "37:00", 2220, "商调", "润肺宁神", "9.4k", True),
            ("霜叶无声", "50:20", 3020, "741Hz", "深度冥想", "7.8k", True),
        ],
    },
    {
        "id": "水", "en": "WATER", "icon": "droplets",
        "primary": "#38bdf8", "accent": "#7dd3fc", "glow": "rgba(56,189,248,0.25)",
        "bg": "radial-gradient(ellipse at 15% 80%, #021018 0%, #01080f 50%, #000408 100%)",
        "note": "羽", "note_pinyin": "Yǔ", "organ": "肾膀胱", "season": "冬", "quality": "藏精",
        "desc": "滋肾填精 · 镇静安眠",
        "sleep_tip": "水主藏精，肾精充则神宁。羽调音律引气归肾，深度助眠。", "sort": 4,
        "tracks": [
            ("深海之息", "60:00", 3600, "174Hz", "深度睡眠", "22.1k", False),
            ("冬雪无声", "48:00", 2880, "羽调", "滋肾安神", "16.8k", True),
            ("潜流暗涌", "53:30", 3210, "174Hz", "冥想放松", "12.3k", True),
        ],
    },
]

PLANS = [
    {
        "id": "free", "name": "听闻", "en": "EXPLORE", "price": 0, "duration_days": 0,
        "features": ["每日 3 首试听", "基础五行测评", "30秒曲目预览"],
        "featured": False, "sort": 0,
    },
    {
        "id": "month", "name": "月悦", "en": "MONTHLY", "price": 18, "unit": "/ 月",
        "badge": "热门", "duration_days": 30,
        "features": ["无限曲目播放", "完整五行测评报告", "个性化推荐算法", "离线下载 30首", "睡眠质量追踪"],
        "featured": False, "sort": 1,
    },
    {
        "id": "year", "name": "年藏", "en": "ANNUAL", "price": 128, "unit": "/ 年",
        "original": "216", "badge": "省 ¥88", "duration_days": 365,
        "features": ["全部月悦权益", "离线下载 无限", "专属导引冥想课", "五行调理方案", "1v1 体质咨询 ×2", "新曲首发优先"],
        "featured": True, "sort": 2,
    },
]

QUIZ = [
    {
        "q": "您平时睡眠状况如何？",
        "options": [
            {"text": "难以入睡，思虑过多", "score": {"火": 2, "木": 1}},
            {"text": "易醒多梦，心跳加速", "score": {"火": 2, "水": 1}},
            {"text": "嗜睡无力，醒后疲乏", "score": {"土": 2, "金": 1}},
            {"text": "浅眠易惊，腰酸耳鸣", "score": {"水": 2, "金": 1}},
        ],
    },
    {
        "q": "您的情绪状态偏向？",
        "options": [
            {"text": "容易焦虑烦躁，情绪波动大", "score": {"木": 2, "火": 1}},
            {"text": "喜悦外向，但易过度兴奋", "score": {"火": 2}},
            {"text": "多思多虑，难以放下", "score": {"土": 2, "木": 1}},
            {"text": "忧郁寡言，悲观失落", "score": {"金": 2, "水": 1}},
        ],
    },
    {
        "q": "您身体哪方面最需要调理？",
        "options": [
            {"text": "肝胆 · 眼睛 · 筋骨紧张", "score": {"木": 3}},
            {"text": "心脏 · 血压 · 头面潮热", "score": {"火": 3}},
            {"text": "脾胃 · 消化 · 体重管理", "score": {"土": 3}},
            {"text": "肺部 · 皮肤 · 呼吸问题", "score": {"金": 3}},
            {"text": "肾脏 · 腰膝 · 精力不足", "score": {"水": 3}},
        ],
    },
    {
        "q": "您更偏爱哪种音乐氛围？",
        "options": [
            {"text": "清新自然 · 如竹林鸟鸣", "score": {"木": 2}},
            {"text": "温暖明亮 · 如炉火轻语", "score": {"火": 2}},
            {"text": "沉稳厚重 · 如大地回响", "score": {"土": 2}},
            {"text": "空灵清冷 · 如秋月高悬", "score": {"金": 2}},
            {"text": "深沉流动 · 如海潮涌动", "score": {"水": 2}},
        ],
    },
]

# 测试兑换码（CLAUDE.md 开发期）
TEST_CDKEYS = [
    ("WUXING-2026-FREE-30D", "month", 30, "月悦体验卡"),
    ("MOON-LIGHT-VIP-365", "year", 365, "年藏会员卡"),
    ("ZEROER-GIFT-7DAY", "trial", 7, "7日体验卡"),
]


def seed(db: Session) -> None:
    # 管理员
    if not db.query(Admin).filter(Admin.username == settings.admin_username).first():
        db.add(Admin(
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
        ))

    # 五行 + 曲目
    if db.query(Element).count() == 0:
        for e in ELEMENTS:
            tracks = e.pop("tracks")
            db.add(Element(**e))
            for i, (title, dur, sec, hz, tag, plays, premium) in enumerate(tracks):
                db.add(Track(
                    element_id=e["id"], title=title, duration=dur, duration_sec=sec,
                    hz=hz, tag=tag, plays=plays, is_premium=premium,
                    preview_sec=30, sort=i,
                ))

    # 套餐
    if db.query(Plan).count() == 0:
        for p in PLANS:
            data = dict(p)
            data["features"] = json.dumps(p["features"], ensure_ascii=False)
            db.add(Plan(**data))

    # 测评题
    if db.query(QuizQuestion).count() == 0:
        for i, q in enumerate(QUIZ):
            db.add(QuizQuestion(
                q=q["q"],
                options=json.dumps(q["options"], ensure_ascii=False),
                sort=i,
            ))

    # 测试兑换码
    if db.query(Cdkey).count() == 0:
        for code, ptype, days, pname in TEST_CDKEYS:
            db.add(Cdkey(
                code=code, batch_id="seed", plan_type=ptype,
                duration_days=days, plan_name=pname,
            ))

    # 示例用户 + 订单（便于后台订单/退单演示）
    if db.query(Order).count() == 0:
        demo = db.query(User).filter(User.openid == "demo-openid").first()
        if not demo:
            demo = User(
                openid="demo-openid", nickname="示例用户", element="水",
                membership_type="year", membership_name="年藏",
                membership_expire_at=datetime.utcnow() + timedelta(days=365),
                membership_source="purchase",
            )
            db.add(demo)
            db.flush()  # 拿到 demo.id
        now_ = datetime.utcnow()
        db.add(Order(
            order_no="WX" + now_.strftime("%Y%m%d") + "0001", user_id=demo.id,
            plan_id="year", plan_name="年藏", amount=128,
            status="paid", paid_at=now_,
        ))
        db.add(Order(
            order_no="WX" + now_.strftime("%Y%m%d") + "0002", user_id=demo.id,
            plan_id="month", plan_name="月悦", amount=18,
            status="pending",
        ))

    db.commit()
