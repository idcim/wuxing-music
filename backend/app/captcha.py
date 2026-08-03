"""后台登录图形验证码。

存储与 ratelimit.py 一样是**进程内**的：单容器部署没问题，
**多实例部署必须换 Redis**，否则 A 实例发的码到 B 实例校验不过。

不需要往镜像里放字体：Pillow ≥10.1 的 ImageFont.load_default(size=) 返回可缩放字体。
Pillow 已随 qrcode[pil] 进入依赖，本模块不新增任何包。
"""
from __future__ import annotations

import base64
import io
import random
import threading
import time
import uuid

# 去掉容易看混的 0/O/1/I，与仓库里 CDKEY / 默认昵称后缀的字符集口径一致
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 4
TTL_SEC = 300           # 5 分钟
MAX_STORE = 5000        # 兜底上限，防止被刷爆内存

_lock = threading.Lock()
# id -> (code_upper, expire_at)
_store: dict[str, tuple[str, float]] = {}


def _prune(now: float) -> None:
    """清掉过期项。调用方需持锁。"""
    for k in [k for k, (_, exp) in _store.items() if exp <= now]:
        _store.pop(k, None)


def generate() -> tuple[str, str]:
    """生成验证码，返回 (captcha_id, data-URI PNG)。"""
    code = "".join(random.choice(ALPHABET) for _ in range(CODE_LEN))
    cid = uuid.uuid4().hex
    now = time.time()

    with _lock:
        _prune(now)
        # 被刷爆时先清空再放行，宁可让已发出的码失效，也不能把内存吃干
        if len(_store) >= MAX_STORE:
            _store.clear()
        _store[cid] = (code.upper(), now + TTL_SEC)

    return cid, _render(code)


def verify(cid: str, code: str) -> bool:
    """校验并**一次性消费**——无论对错都作废，防止同一张图反复试。"""
    if not cid or not code:
        return False
    now = time.time()
    with _lock:
        _prune(now)
        item = _store.pop(cid, None)
    if not item:
        return False
    expected, exp = item
    if exp <= now:
        return False
    return code.strip().upper() == expected


def _render(code: str) -> str:
    """把验证码画成 PNG，返回 data URI。"""
    from PIL import Image, ImageDraw, ImageFont

    w, h = 120, 44
    img = Image.new("RGB", (w, h), (245, 246, 250))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=28)

    # 干扰线
    for _ in range(5):
        draw.line(
            [
                (random.randint(0, w), random.randint(0, h)),
                (random.randint(0, w), random.randint(0, h)),
            ],
            fill=(random.randint(150, 210), random.randint(150, 210), random.randint(150, 210)),
            width=1,
        )
    # 噪点
    for _ in range(120):
        draw.point(
            (random.randint(0, w), random.randint(0, h)),
            fill=(random.randint(120, 200), random.randint(120, 200), random.randint(120, 200)),
        )
    # 字符：逐个画并上下抖动，避免整体等距便于切分
    step = w // (CODE_LEN + 1)
    for i, ch in enumerate(code):
        draw.text(
            (step * (i + 1) - 10 + random.randint(-3, 3), random.randint(2, 12)),
            ch,
            font=font,
            fill=(random.randint(20, 90), random.randint(20, 90), random.randint(90, 160)),
        )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
