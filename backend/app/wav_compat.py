"""WAV 24-bit PCM → 16-bit PCM 转换（纯 Python，无新依赖）。

起因：PC 微信（Windows/Mac）的小程序音频栈解不了 24-bit WAV，
报「Unable to decode audio data」；手机端原生播放器能解，所以同一首曲子
手机能放、PC 不能放。16-bit PCM 是所有端都能解码的公分母。

转换是有损的（砍掉每个采样的最低字节），但对助眠聆听场景无感；
24-bit 母版由运营侧自行保留，这里的产物是线上播放用文件。

Python 3.13 已移除 audioop，这里用 memoryview 的跨步切片做整块拷贝，
速度足够（数百 MB 文件秒级完成）。
"""
import os
import struct

# RIFF 块头超过这个大小属于异常文件，拒绝处理
_MAX_CHUNK_SCAN = 1024 * 1024


def read_wav_info(path: str) -> dict | None:
    """读取 WAV 头信息。非 WAV / 结构异常返回 None。
    返回 {format, channels, sample_rate, bits, data_size}。"""
    try:
        with open(path, "rb") as f:
            # fmt 之前可能有 JUNK 等填充块（实测线上文件 fmt 在第 88 字节），多读一点
            head = f.read(64 * 1024)
        if len(head) < 44 or head[:4] != b"RIFF" or head[8:12] != b"WAVE":
            return None
        pos = 12
        info: dict = {}
        while pos + 8 <= len(head):
            cid = head[pos : pos + 4]
            csize = struct.unpack_from("<I", head, pos + 4)[0]
            if cid == b"fmt " and pos + 8 + 16 <= len(head):
                (fmt, channels, rate, _br, _ba, bits) = struct.unpack_from("<HHIIHH", head, pos + 8)
                info = {"format": fmt, "channels": channels, "sample_rate": rate, "bits": bits}
            elif cid == b"data":
                info["data_size"] = csize
                break
            pos += 8 + csize + (csize & 1)
            if pos > _MAX_CHUNK_SCAN:
                return None
        return info if "format" in info else None
    except OSError:
        return None


def needs_pcm16_downmix(path: str) -> bool:
    """只有「PCM(1) 且 24bit」才需要降位深；其余（16bit PCM、float、非 WAV）都不动。"""
    info = read_wav_info(path)
    return bool(info and info["format"] == 1 and info["bits"] == 24 and info["channels"] in (1, 2))


def convert_24_to_16(src: str, dst: str) -> None:
    """把 24-bit PCM WAV 流式转成 16-bit PCM WAV。调用方先用 needs_pcm16_downmix 判定。
    非 data 块（JUNK/LIST 等）原样保留；fmt 的位深/字节率/块对齐随动。
    """
    with open(src, "rb") as f:
        riff = f.read(12)
        if riff[:4] != b"RIFF" or riff[8:12] != b"WAVE":
            raise ValueError("不是 WAV 文件")

        chunks: list[tuple[bytes, bytes]] = []  # (id, payload)
        data_payload_len = 0
        data_src_offset = 0
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            cid, csize = hdr[:4], struct.unpack("<I", hdr[4:])[0]
            if cid == b"fmt ":
                payload = bytearray(f.read(csize))
                fmt, channels, rate, _br, _ba, _bits = struct.unpack_from("<HHIIHH", payload, 0)
                if fmt != 1:
                    raise ValueError(f"不是 PCM（format={fmt}），拒绝转换")
                # 位深 24→16，字节率与块对齐同步
                struct.pack_into("<H", payload, 14, 16)
                struct.pack_into("<I", payload, 8, rate * channels * 2)
                struct.pack_into("<H", payload, 12, channels * 2)
                chunks.append((cid, bytes(payload)))
            elif cid == b"data":
                data_payload_len = csize
                data_src_offset = f.tell()
                f.seek(csize + (csize & 1), os.SEEK_CUR)  # 含偶对齐的填充字节
            else:
                payload = f.read(csize)
                chunks.append((cid, payload))
                if csize & 1:
                    f.read(1)

    new_data_len = (data_payload_len // 3) * 2
    body = bytearray()
    for cid, payload in chunks:
        body += cid + struct.pack("<I", len(payload)) + payload
        if len(payload) & 1:
            body += b"\x00"
    body += b"data" + struct.pack("<I", new_data_len)
    riff_size = 4 + len(body) + new_data_len

    with open(src, "rb") as fin, open(dst, "wb") as fout:
        fout.write(b"RIFF" + struct.pack("<I", riff_size) + b"WAVE")
        fout.write(bytes(body))
        # 流式转换 data 块：每 3 字节取高 2 字节（小端，砍最低有效字节）
        fin.seek(data_src_offset)
        remaining = data_payload_len
        tail = b""
        while remaining > 0:
            raw = fin.read(min(4 * 1024 * 1024, remaining))
            if not raw:
                break
            remaining -= len(raw)
            buf = tail + raw
            n = (len(buf) // 3) * 3
            tail = buf[n:]
            mv = memoryview(buf[:n])
            out = bytearray((n // 3) * 2)
            out[0::2] = mv[1::3]
            out[1::2] = mv[2::3]
            fout.write(bytes(out))
    # tail 里不足一个采样的残余直接丢弃（源文件 data 块不是 3 的倍数本就异常）
