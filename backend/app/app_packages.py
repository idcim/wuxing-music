"""APP 安装包：限定 OSS 直传、从真实 APK 读取元数据，不信任浏览器申报。"""
import base64
import hashlib
import hmac
import json
import struct
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta

from app import storage

MAX_BYTES = 500 * 1024 * 1024
CONTENT_TYPE = 'application/vnd.android.package-archive'


def sign_package(cfg: dict, filename: str) -> dict:
    if not filename.lower().endswith('.apk'):
        raise ValueError('请选择 Android APK 安装包')
    if cfg.get('provider') != 'oss':
        raise ValueError('请先在站点设置中启用 OSS 存储')
    if not all(cfg.get(f) for f in ('oss_access_key_id', 'oss_access_key_secret', 'oss_endpoint', 'oss_bucket')):
        raise ValueError('OSS 配置不完整，请在站点设置中补齐')
    key = 'apps/' + uuid.uuid4().hex + '.apk'
    policy = base64.b64encode(json.dumps({
        'expiration': (datetime.utcnow() + timedelta(minutes=30)).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'conditions': [['eq', '$key', key], ['eq', '$Content-Type', CONTENT_TYPE],
                       ['content-length-range', 1, MAX_BYTES]],
    }).encode()).decode()
    host = cfg['oss_endpoint'].replace('https://', '').replace('http://', '').rstrip('/')
    return {'key': key, 'host': f'https://{cfg["oss_bucket"]}.{host}', 'fields': {
        'key': key, 'policy': policy, 'OSSAccessKeyId': cfg['oss_access_key_id'],
        'signature': base64.b64encode(hmac.new(cfg['oss_access_key_secret'].encode(), policy.encode(), hashlib.sha1).digest()).decode(),
        'Content-Type': CONTENT_TYPE, 'success_action_status': '200',
    }}


def _manifest_attributes(data: bytes) -> dict:
    """解析 Android binary XML string pool 及 manifest 根属性。"""
    if len(data) < 8 or struct.unpack_from('<H', data)[0] != 3:
        raise ValueError('APK manifest 不是有效的 Android 二进制 XML')
    strings = []
    offset = 8
    while offset + 8 <= len(data):
        kind, header, size = struct.unpack_from('<HHI', data, offset)
        if size < header or size < 8 or offset + size > len(data):
            raise ValueError('APK manifest 数据损坏')
        if kind == 1:
            count, _, flags, start, _ = struct.unpack_from('<IIIII', data, offset + 8)
            if count > 100000 or header + count * 4 > size:
                raise ValueError('APK 字符串池异常')
            def length(pos, utf8):
                n = data[pos] if utf8 else struct.unpack_from('<H', data, pos)[0]
                step, mask = (1, 0x80) if utf8 else (2, 0x8000)
                if n & mask:
                    m = data[pos + step] if utf8 else struct.unpack_from('<H', data, pos + step)[0]
                    return ((n & (mask - 1)) << (7 if utf8 else 16)) | m, pos + step * 2
                return n, pos + step
            for i in range(count):
                pos = offset + start + struct.unpack_from('<I', data, offset + header + i * 4)[0]
                utf8 = bool(flags & 0x100)
                n, pos = length(pos, utf8)
                if utf8:
                    n, pos = length(pos, True)
                strings.append(data[pos:pos + n * (1 if utf8 else 2)].decode('utf-8' if utf8 else 'utf-16-le'))
        elif kind == 0x102:
            name = struct.unpack_from('<I', data, offset + 20)[0]
            if strings[name] == 'manifest':
                start, attr_size, count = struct.unpack_from('<HHH', data, offset + 24)
                if attr_size < 20 or 16 + start + attr_size * count > size:
                    raise ValueError('APK manifest 属性异常')
                result = {}
                for i in range(count):
                    pos = offset + 16 + start + i * attr_size
                    _, attr, raw = struct.unpack_from('<III', data, pos)
                    dtype, value = data[pos + 15], struct.unpack_from('<I', data, pos + 16)[0]
                    result[strings[attr]] = strings[raw] if raw != 0xffffffff else strings[value] if dtype == 3 else value
                return result
        offset += size
    raise ValueError('APK 缺少 manifest')


def inspect_apk(file) -> dict:
    try:
        with zipfile.ZipFile(file) as apk:
            info = apk.getinfo('AndroidManifest.xml')
            if info.file_size > 4 * 1024 * 1024:
                raise ValueError('APK manifest 过大')
            attrs = _manifest_attributes(apk.read(info))
        package, name, code = attrs.get('package'), attrs.get('versionName'), attrs.get('versionCode')
        if not isinstance(package, str) or not isinstance(name, str) or not isinstance(code, int) or not 0 < code <= 2100000000:
            raise ValueError('APK 缺少有效包名、versionName 或 versionCode')
        if len(package) > 180 or len(name) > 120:
            raise ValueError('APK 版本信息过长')
        return {'package_name': package, 'version_name': name, 'version_code': code}
    except (KeyError, IndexError, struct.error, UnicodeError, zipfile.BadZipFile) as exc:
        raise ValueError('文件不是有效的 Android APK') from exc


def verify_package(db, asset: dict) -> dict:
    cfg = storage.get_storage_cfg(db)
    if cfg.get('oss_bucket') != asset['bucket'] or cfg.get('oss_endpoint') != asset['endpoint']:
        raise ValueError('OSS 配置已改变，请重新上传安装包')
    bucket = storage._oss_bucket(cfg)
    meta = bucket.head_object(asset['key'])
    if not 0 < meta.content_length <= MAX_BYTES:
        raise ValueError('安装包大小不符合要求')
    # 未发布之前只能凭后台权限签名读取；不要求 OSS 公共读。
    digest, total = hashlib.sha256(), 0
    response = bucket.get_object(asset['key'])
    try:
        with tempfile.TemporaryFile() as file:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError('安装包超过 500MB')
                digest.update(chunk)
                file.write(chunk)
            if total != meta.content_length:
                raise ValueError('安装包尚未上传完整，请重新上传')
            file.seek(0)
            data = inspect_apk(file)
    finally:
        response.close()
    # ETag 用于下载前检测对象是否被覆写；SHA256 展示给用户校验。
    return {**data, 'size': total, 'sha256': digest.hexdigest(), 'etag': meta.etag}
