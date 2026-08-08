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
    Role,
    Track,
    User,
)
from app.permissions import ALL_PERMISSIONS, SUPER_ROLE_NAME
from app.security import hash_password

# 五行配置（与小程序 constants/wuxing.ts 对齐）
#
# ⚠️ desc / sleep_tip 走「音乐气质 / 适合直播讲法 / 情绪转化方向」的口径，
# 不写「疏肝理气」「柔肝宁神」这类治疗动宾结构——平台会判为养生医疗宣称。
# meta 是文化对照维度，内容基准见 docs/WUXING-REFERENCE.md。
ELEMENTS = [
    {
        "id": "木", "en": "WOOD", "icon": "sprout",
        "primary": "#84cc16", "accent": "#bef264", "glow": "rgba(132,204,22,0.25)",
        "bg": "radial-gradient(ellipse at 25% 15%, #0a1a08 0%, #050a04 50%, #020503 100%)",
        "note": "角", "note_pinyin": "Jué", "organ": "肝胆", "season": "春", "quality": "生发",
        "desc": "清新生发 · 舒展流动",
        "sleep_tip": "角音像春天的风，让人慢慢舒展开。从郁结到舒展，适合心里绷着一股劲的夜晚。",
        "sort": 0,
        "meta": {
            "temperament": "生发、舒展、条达", "direction": "东", "climate": "风", "phase": "生",
            "colorName": "青 / 绿", "taste": "酸", "smell": "臊",
            "notation": "3 / mi", "mode": "角调式",
            "musicMood": "清新、生发、舒展、流动", "keywords": "疏展、春天、成长、郁结舒开",
            "organZang": "肝", "organFu": "胆", "sense": "目", "tissue": "筋",
            "bloom": "爪", "fluid": "泪", "emotion": "怒", "spirit": "魂", "voice": "呼",
            "imbalance": "易怒、郁闷、憋屈、紧绷", "transform": "从郁结到舒展",
            "virtue": "仁", "virtueFeel": "生生之德", "beast": "青龙", "star": "岁星",
            "gan": "甲乙", "zhi": "寅卯", "gua": "震、巽",
            "timeFeel": "清晨、生发", "spaceFeel": "林、风、竹、山间新绿",
            "imagery": "竹林、春风、绿植、舒展身体",
            "mnemonic": "木主生发，音为角，脏为肝，志为怒，色为青，季为春。",
        },
        "tracks": [
            ("竹林晨露", "38:20", 2300, "324Hz", "深度睡眠", "12.4k", False),
            ("春风过陌", "45:00", 2700, "角调", "舒展流动", "8.9k", True),
            ("新芽初绿", "52:15", 3135, "324Hz", "助眠冥想", "6.2k", True),
        ],
    },
    {
        "id": "火", "en": "FIRE", "icon": "flame",
        "primary": "#f97316", "accent": "#fdba74", "glow": "rgba(249,115,22,0.25)",
        "bg": "radial-gradient(ellipse at 70% 20%, #1a0a02 0%, #0d0502 50%, #050201 100%)",
        "note": "徵", "note_pinyin": "Zhǐ", "organ": "心小肠", "season": "夏", "quality": "明亮",
        "desc": "明亮热烈 · 振奋外放",
        "sleep_tip": "徵音像一束光，把人的状态点亮。从沉闷到明亮，适合提不起劲的时候听。",
        "sort": 1,
        "meta": {
            "temperament": "炎上、明亮、温热", "direction": "南", "climate": "暑 / 热", "phase": "长",
            "colorName": "赤 / 红", "taste": "苦", "smell": "焦",
            "notation": "5 / sol", "mode": "徵调式",
            "musicMood": "明亮、热烈、振奋、外放", "keywords": "点亮、心气、热情、表达",
            "organZang": "心", "organFu": "小肠", "sense": "舌", "tissue": "脉 / 血脉",
            "bloom": "面", "fluid": "汗", "emotion": "喜", "spirit": "神", "voice": "笑",
            "imbalance": "亢奋、烦躁、心神不宁", "transform": "从沉闷到明亮",
            "virtue": "礼", "virtueFeel": "光明之德", "beast": "朱雀", "star": "荧惑",
            "gan": "丙丁", "zhi": "巳午", "gua": "离",
            "timeFeel": "正午、旺盛", "spaceFeel": "日光、火焰、灯、红墙",
            "imagery": "烛火、阳光、红色织物、笑容",
            "mnemonic": "火主明亮，音为徵，脏为心，志为喜，色为赤，季为夏。",
        },
        "tracks": [
            ("暖阳归处", "40:00", 2400, "396Hz", "安心助眠", "15.7k", False),
            ("晚霞余温", "36:30", 2190, "徵调", "明亮振奋", "11.2k", True),
            ("炉火细语", "48:45", 2925, "396Hz", "冥想放松", "9.8k", True),
        ],
    },
    {
        "id": "土", "en": "EARTH", "icon": "mountain",
        "primary": "#eab308", "accent": "#fde047", "glow": "rgba(234,179,8,0.25)",
        "bg": "radial-gradient(ellipse at 50% 70%, #1a1305 0%, #0d0903 50%, #050402 100%)",
        "note": "宫", "note_pinyin": "Gōng", "organ": "脾胃", "season": "长夏", "quality": "承载",
        "desc": "平稳厚重 · 安定包容",
        "sleep_tip": "宫音像大地，把散乱的心慢慢托住。从散乱到安定，适合睡前收心。",
        "sort": 2,
        "meta": {
            "temperament": "承载、稳定、化生", "direction": "中", "climate": "湿", "phase": "化",
            "colorName": "黄", "taste": "甘", "smell": "香",
            "notation": "1 / do", "mode": "宫调式",
            "musicMood": "平稳、厚重、安定、包容", "keywords": "安住、稳定、中心、承托",
            "organZang": "脾", "organFu": "胃", "sense": "口", "tissue": "肉 / 肌肉",
            "bloom": "唇", "fluid": "涎", "emotion": "思", "spirit": "意", "voice": "歌",
            "imbalance": "过度思虑、纠结、担忧", "transform": "从散乱到安定",
            "virtue": "信", "virtueFeel": "厚载之德", "beast": "黄龙 / 麒麟", "star": "镇星",
            "gan": "戊己", "zhi": "辰戌丑未", "gua": "坤、艮",
            "timeFeel": "午后、转化", "spaceFeel": "大地、陶土、茶席、中庭",
            "imagery": "茶席、陶器、黄土、稳定构图",
            "mnemonic": "土主承载，音为宫，脏为脾，志为思，色为黄，季为长夏。",
        },
        "tracks": [
            ("黄土大地", "42:00", 2520, "528Hz", "深度睡眠", "18.3k", False),
            ("麦浪轻摇", "39:15", 2355, "宫调", "安定承托", "13.5k", True),
            ("稻香归田", "55:00", 3300, "528Hz", "冥想放松", "10.1k", True),
        ],
    },
    {
        "id": "金", "en": "METAL", "icon": "gem",
        "primary": "#cbd5e1", "accent": "#f1f5f9", "glow": "rgba(203,213,225,0.2)",
        "bg": "radial-gradient(ellipse at 80% 25%, #0e131a 0%, #070a0f 50%, #030507 100%)",
        "note": "商", "note_pinyin": "Shāng", "organ": "肺大肠", "season": "秋", "quality": "收敛",
        "desc": "清肃空灵 · 收敛克制",
        "sleep_tip": "商音像秋天的风，帮你把情绪收一收、清一清。从沉重到释放，适合心里堵得慌的时候。",
        "sort": 3,
        "meta": {
            "temperament": "收敛、清肃、秩序", "direction": "西", "climate": "燥", "phase": "收",
            "colorName": "白", "taste": "辛", "smell": "腥",
            "notation": "2 / re", "mode": "商调式",
            "musicMood": "清肃、空灵、收敛、克制", "keywords": "清理、边界、秩序、断舍离",
            "organZang": "肺", "organFu": "大肠", "sense": "鼻", "tissue": "皮 / 皮毛",
            "bloom": "毛", "fluid": "涕", "emotion": "悲 / 忧", "spirit": "魄", "voice": "哭",
            "imbalance": "悲伤、失落、压抑、孤独", "transform": "从沉重到释放",
            "virtue": "义", "virtueFeel": "清正之德", "beast": "白虎", "star": "太白",
            "gan": "庚辛", "zhi": "申酉", "gua": "乾、兑",
            "timeFeel": "傍晚、收束", "spaceFeel": "月光、金石、白墙、秋风",
            "imagery": "白瓷、金属、留白、秋景",
            "mnemonic": "金主收敛，音为商，脏为肺，志为悲，色为白，季为秋。",
        },
        "tracks": [
            ("白露秋霜", "44:30", 2670, "741Hz", "助眠减压", "14.6k", False),
            ("金风玉露", "37:00", 2220, "商调", "空灵清肃", "9.4k", True),
            ("霜叶无声", "50:20", 3020, "741Hz", "深度冥想", "7.8k", True),
        ],
    },
    {
        "id": "水", "en": "WATER", "icon": "droplets",
        "primary": "#38bdf8", "accent": "#7dd3fc", "glow": "rgba(56,189,248,0.25)",
        "bg": "radial-gradient(ellipse at 15% 80%, #021018 0%, #01080f 50%, #000408 100%)",
        "note": "羽", "note_pinyin": "Yǔ", "organ": "肾膀胱", "season": "冬", "quality": "收藏",
        "desc": "深沉幽远 · 静谧内省",
        "sleep_tip": "羽音像夜里的水，适合慢下来，往内走。从焦虑到沉静，一路归藏。",
        "sort": 4,
        "meta": {
            "temperament": "下行、收藏、滋润", "direction": "北", "climate": "寒", "phase": "藏",
            "colorName": "黑 / 玄", "taste": "咸", "smell": "腐",
            "notation": "6 / la", "mode": "羽调式",
            "musicMood": "深沉、幽远、静谧、内省", "keywords": "入静、沉潜、睡前、归藏",
            "organZang": "肾", "organFu": "膀胱", "sense": "耳", "tissue": "骨",
            "bloom": "发", "fluid": "唾", "emotion": "恐 / 惊", "spirit": "志", "voice": "呻",
            "imbalance": "恐惧、不安、无力、退缩", "transform": "从焦虑到沉静",
            "virtue": "智", "virtueFeel": "深藏之德", "beast": "玄武", "star": "辰星",
            "gan": "壬癸", "zhi": "亥子", "gua": "坎",
            "timeFeel": "夜晚、收藏", "spaceFeel": "水面、夜色、深潭、雪、黑瓦",
            "imagery": "水波、夜色、黑白、静坐",
            "mnemonic": "水主收藏，音为羽，脏为肾，志为恐，色为黑，季为冬。",
        },
        "tracks": [
            ("深海之息", "60:00", 3600, "174Hz", "深度睡眠", "22.1k", False),
            ("冬雪无声", "48:00", 2880, "羽调", "静谧内省", "16.8k", True),
            ("潜流暗涌", "53:30", 3210, "174Hz", "冥想放松", "12.3k", True),
        ],
    },
]

# v1.6.0 及更早的五行文案，用于存量库判断「运营没改过」才覆盖（见 _migrate_wuxing_content）。
LEGACY_ELEMENT_COPY = {
    "木": ("疏肝理气 · 调和情志", "春木升发，肝气易郁。角调音律帮助疏泄郁结，柔肝宁神。", "生发"),
    "火": ("养心安神 · 清热除烦", "心火扰神则难寐。徵调音律引火归元，宁心定志。", "温煦"),
    "土": ("健脾和胃 · 安中定志", "土居中宫，脾健则思虑少。宫调音律培土宁心，稳定入眠。", "运化"),
    "金": ("润肺敛神 · 收引归精", "秋金主降，肃降则神安。商调音律顺应敛降之性。", "收敛"),
    "水": ("滋肾填精 · 镇静安眠", "水主藏精，肾精充则神宁。羽调音律引气归肾，深度助眠。", "藏精"),
}

# 曲目标签里的治疗口吻旧值 → 合规说法（v1.8.0）。
# 与 element 文案不同，这里**按 tag 值全局匹配、不看是哪个元素也不看是不是运营新建的**：
# 这五个串本身就是要清掉的东西，运营新建的曲目若也填了同样的串，一样得换。
# 其余 tag（深度睡眠 / 冥想放松 / 助眠减压…）一律不动。
LEGACY_TRACK_TAGS = {
    "舒肝解郁": "舒展流动",
    "清热宁神": "明亮振奋",
    "健脾安神": "安定承托",
    "润肺宁神": "空灵清肃",
    "滋肾安神": "静谧内省",
}

# 同上：被替换掉的旧测评题（问身体症状，有养生医疗风险），按题干精确匹配后整题替换。
LEGACY_QUIZ_Q = [
    "您平时睡眠状况如何？",
    "您的情绪状态偏向？",
    "您身体哪方面最需要调理？",
    "您更偏爱哪种音乐氛围？",
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
        "features": ["无限曲目播放", "完整五行测评报告", "个性化推荐算法", "睡眠质量追踪"],
        "featured": False, "sort": 1,
    },
    {
        "id": "year", "name": "年藏", "en": "ANNUAL", "price": 128, "unit": "/ 年",
        "original": "216", "badge": "省 ¥88", "duration_days": 365,
        "features": ["全部月悦权益", "离线下载 无限", "专属导引冥想课", "五行调理方案", "1v1 体质咨询 ×2", "新曲首发优先"],
        "featured": True, "sort": 2,
    },
]

# 测评题库（与 src/constants/quiz.ts 对齐）。
# ⚠️ 只问情绪状态与感受偏好，不问身体症状——问诊式题干会被判为养生医疗。
# 题干取材见 docs/WUXING-REFERENCE.md 的「情绪失衡表现 / 情绪转化方向 / 音乐气质 / 适合画面」。
QUIZ = [
    {
        "q": "夜里睡不着的时候，你更接近哪种状态？",
        "options": [
            {"text": "心里绷着一股劲，越想越憋屈", "score": {"木": 3}},
            {"text": "脑子停不下来，心神不宁", "score": {"火": 3}},
            {"text": "反复想白天的事，纠结放不下", "score": {"土": 3}},
            {"text": "一阵阵失落，觉得有点孤单", "score": {"金": 3}},
            {"text": "莫名不安，整个人提不起力气", "score": {"水": 3}},
        ],
    },
    {
        "q": "你最希望自己往哪个方向走一走？",
        "options": [
            {"text": "从郁结到舒展", "score": {"木": 3}},
            {"text": "从沉闷到明亮", "score": {"火": 3}},
            {"text": "从散乱到安定", "score": {"土": 3}},
            {"text": "从沉重到释放", "score": {"金": 3}},
            {"text": "从焦虑到沉静", "score": {"水": 3}},
        ],
    },
    {
        "q": "哪一种声音氛围最能让你放松？",
        "options": [
            {"text": "清新舒展 · 像流动的风", "score": {"木": 2}},
            {"text": "明亮温暖 · 像一束光", "score": {"火": 2}},
            {"text": "平稳厚重 · 像大地回响", "score": {"土": 2}},
            {"text": "空灵清冷 · 像秋夜留白", "score": {"金": 2}},
            {"text": "深沉幽远 · 像夜里的水", "score": {"水": 2}},
        ],
    },
    {
        "q": "闭上眼，你最先想到的画面是？",
        "options": [
            {"text": "竹林春风，一片新绿", "score": {"木": 2}},
            {"text": "烛火日光，暖色织物", "score": {"火": 2}},
            {"text": "茶席陶器，一方黄土", "score": {"土": 2}},
            {"text": "白瓷金石，秋景留白", "score": {"金": 2}},
            {"text": "水波夜色，独自静坐", "score": {"水": 2}},
        ],
    },
]

# 测试兑换码（CLAUDE.md 开发期）
TEST_CDKEYS = [
    ("WUXING-2026-FREE-30D", "month", 30, "月悦体验卡"),
    ("MOON-LIGHT-VIP-365", "year", 365, "年藏会员卡"),
    ("ZEROER-GIFT-7DAY", "trial", 7, "7日体验卡"),
]


def _migrate_wuxing_content(db: Session) -> None:
    """存量库的五行内容升级（v1.7.0）：补 meta，并把没被运营改过的旧文案换成合规口径。

    幂等：meta 只在为空时写；desc / sleep_tip / quality 只在**恰好等于旧种子值**时覆盖——
    运营在后台改过的一律不动，否则一次发版就把人家写的文案冲掉了。
    """
    for e in ELEMENTS:
        row = db.query(Element).filter(Element.id == e["id"]).first()
        if not row:
            continue

        # meta：新列，存量行是 NULL / 空串 / "{}"，都视为未填
        try:
            cur_meta = json.loads(row.meta or "{}")
        except ValueError:
            cur_meta = {}
        if not cur_meta:
            row.meta = json.dumps(e["meta"], ensure_ascii=False)

        legacy = LEGACY_ELEMENT_COPY.get(e["id"])
        if not legacy:
            continue
        old_desc, old_tip, old_quality = legacy
        if (row.desc or "").strip() == old_desc:
            row.desc = e["desc"]
        if (row.sleep_tip or "").strip() == old_tip:
            row.sleep_tip = e["sleep_tip"]
        if (row.quality or "").strip() == old_quality:
            row.quality = e["quality"]


def _migrate_track_tags(db: Session) -> None:
    """存量库的曲目标签合规化（v1.8.0）。

    v1.7.0 只给 element 写了迁移，漏了 track——而曲目卡上的 tag 走后端数据优先，
    于是「舒肝解郁 / 清热宁神」这类治疗口吻一直挂在首页和探律的每张卡上，
    是全站曝光量最高的位置。

    幂等：只替换 LEGACY_TRACK_TAGS 里的精确旧值，跑几遍结果一样。
    """
    rows = db.query(Track).filter(Track.tag.in_(list(LEGACY_TRACK_TAGS))).all()
    for t in rows:
        t.tag = LEGACY_TRACK_TAGS[t.tag]


def _migrate_quiz_content(db: Session) -> None:
    """存量库的测评题升级（v1.7.0）：把旧的「问身体症状」题库整体换成情绪口径。

    只在库里**四道题原封不动全是旧题**时才替换——只要运营动过任何一题（改了题干、
    加了题、删了题），就整体跳过，人工处理。宁可不改，也不能把运营编排的题库冲了。
    """
    rows = db.query(QuizQuestion).order_by(QuizQuestion.sort).all()
    if len(rows) != len(LEGACY_QUIZ_Q):
        return
    if [r.q.strip() for r in rows] != LEGACY_QUIZ_Q:
        return

    for row, q in zip(rows, QUIZ):
        row.q = q["q"]
        row.options = json.dumps(q["options"], ensure_ascii=False)


def seed(db: Session) -> None:
    # 内置「超级管理员」角色：每次启动同步为全量权限，新增模块自动覆盖
    super_role = db.query(Role).filter(Role.name == SUPER_ROLE_NAME).first()
    perms_json = json.dumps(ALL_PERMISSIONS, ensure_ascii=False)
    if not super_role:
        super_role = Role(
            name=SUPER_ROLE_NAME,
            remark="内置角色，拥有全部权限，不可删除或修改",
            permissions=perms_json,
            is_builtin=True,
        )
        db.add(super_role)
        db.flush()  # 拿到 super_role.id
    else:
        super_role.permissions = perms_json
        super_role.is_builtin = True

    # 管理员
    if not db.query(Admin).filter(Admin.username == settings.admin_username).first():
        db.add(Admin(
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            role_id=super_role.id,
            is_super=True,
        ))
        db.flush()

    # 存量兜底：老库升级后 is_super 新列默认为 0，若一个超管都没有，
    # 就把现存管理员全部提为超管，避免所有人被锁在后台之外。
    # 条件天然幂等——只要已存在任意超管就永不再执行，因此不会误提日后新建的普通管理员。
    if db.query(Admin).filter(Admin.is_super.is_(True)).count() == 0:
        for a in db.query(Admin).all():
            a.is_super = True
            if not a.role_id:
                a.role_id = super_role.id

    # 五行 + 曲目
    if db.query(Element).count() == 0:
        for e in ELEMENTS:
            data = {k: v for k, v in e.items() if k != "tracks"}
            data["meta"] = json.dumps(data.get("meta") or {}, ensure_ascii=False)
            db.add(Element(**data))
            for i, (title, dur, sec, hz, tag, plays, premium) in enumerate(e["tracks"]):
                db.add(Track(
                    element_id=e["id"], title=title, duration=dur, duration_sec=sec,
                    hz=hz, tag=tag, plays=plays, is_premium=premium,
                    preview_sec=30, sort=i,
                ))
    else:
        _migrate_wuxing_content(db)
        _migrate_track_tags(db)

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
    else:
        _migrate_quiz_content(db)

    # 测试兑换码：仅开发态植入（含 365 天年藏卡）。生产（debug=false）不植入，
    # 避免公开测试码被白嫖领取会员。
    if settings.debug and db.query(Cdkey).count() == 0:
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

    # 存量用户补昵称后缀：把恰好叫「律音用户」（无后缀）的老用户改成可区分的名字
    import random
    _ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    legacy = db.query(User).filter(User.nickname == "律音用户").all()
    for u in legacy:
        suffix = "".join(random.choice(_ALPHABET) for _ in range(4))
        u.nickname = f"律音用户·{suffix}"

    db.commit()
