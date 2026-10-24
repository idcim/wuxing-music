"""播放地址签发与流式输出——版权保护的核心层。

目录接口（/api/mp/elements 等）不再返回任何音频地址。播放时客户端先调
`/api/mp/tracks/{id}/play-url` 换一张短时效 token，再用
`/api/mp/stream/{token}` 真正拉流：OSS 走 302 到签名地址，本地存储走
Range 流式输出。token 即凭证（音频播放器带不了 Authorization 头），
HMAC 签名防伪造，10 分钟过期防传播。

诚实的边界：能播就能被录（模拟孔洞），这层防的是「批量爬目录 + 链接长期传播」。
会员曲目对非会员只发 30 秒试听剪辑（preview_url，管线生成），
连完整文件的字节都不出服务器。
"""
import hashlib
import hmac
import os
import time

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.config import settings

TOKEN_TTL = 600  # 播放地址 10 分钟有效

RENDITION_FULL = "full"
RENDITION_PREVIEW = "preview"


def sign_stream_token(track_id: int, rendition: str, fmt: str, uid: str = "") -> str:
    """payload: <track_id>:<rendition>:<fmt>:<exp>:<uid>，末尾接 HMAC 摘要。"""
    exp = int(time.time()) + TOKEN_TTL
    payload = f"{track_id}:{rendition}:{fmt}:{exp}:{uid or '-'}"
    sig = hmac.new(settings.jwt_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}:{sig}"


def verify_stream_token(token: str) -> tuple[int, str, str] | None:
    """验签 + 过期校验。合法返回 (track_id, rendition, fmt)，否则 None。"""
    try:
        tid, rendition, fmt, exp, uid, sig = token.split(":")
        payload = f"{tid}:{rendition}:{fmt}:{exp}:{uid}"
        expect = hmac.new(
            settings.jwt_secret.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()[:32]
        if not hmac.compare_digest(expect, sig):
            return None
        if int(exp) < int(time.time()):
            return None
        return int(tid), rendition, fmt
    except (ValueError, AttributeError):
        return None


def stream_local(path: str, request: Request, media_type: str = "application/octet-stream"):
    """本地文件流式输出，支持 Range（音频拖动必备）。
    starlette StaticFiles 对 Range 的支持版本间反复，这里自己实现。"""
    size = os.path.getsize(path)
    start, end = 0, size - 1
    status = 200
    range_h = request.headers.get("range", "")
    if range_h.startswith("bytes="):
        try:
            s, _, e = range_h[6:].partition("-")
            start = int(s) if s else 0
            end = min(int(e), size - 1) if e else size - 1
            if 0 <= start <= end:
                status = 206
            else:
                start, end = 0, size - 1
        except ValueError:
            start, end = 0, size - 1
    length = end - start + 1

    def gen():
        with open(path, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(1024 * 1024, left))
                if not chunk:
                    break
                left -= len(chunk)
                yield chunk

    headers = {"Accept-Ranges": "bytes", "Content-Length": str(length)}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(gen(), status_code=status, headers=headers, media_type=media_type)
