import io
import unittest
import zipfile
from unittest.mock import patch, Mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base
from app import app_packages
from app.routers import app_releases as api


class AppReleaseTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        api.save_config(api.AppConfig(enabled=True), self.db, None)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def asset(self, code=2000002, package='cn.azureglow.wuxing.preview'):
        key = str(code)
        api.write(self.db, 'app_asset_' + key, dict(asset_id=key, ready=True,
                  key=f'apps/{key}.apk', bucket='test', endpoint='https://oss.test',
                  size=100, sha256='a' * 64, version_name=f'2.0.{code}',
                  version_code=code, package_name=package))
        self.db.commit()
        return key

    def draft(self, code=2000002, **kwargs):
        return api.create_release(api.ReleaseIn(asset_id=self.asset(code), notes='新版本', **kwargs), self.db, None)['data']

    def test_draft_not_public_published_version_and_upgrade_code(self):
        draft = self.draft(force_update=True)
        self.assertIsNone(api.public_info('preview', 1, 'cn.azureglow.wuxing.preview', self.db)['data']['latest'])
        api.publish_release(draft['id'], self.db, None)
        info = api.public_info('preview', 2000001, 'cn.azureglow.wuxing.preview', self.db)['data']
        self.assertTrue(info['update_available'])
        self.assertTrue(info['force_update'])
        self.assertNotIn('key', info['latest'])
        self.assertFalse(api.public_info('preview', 2000002, 'cn.azureglow.wuxing.preview', self.db)['data']['force_update'])
        self.assertIsNone(api.public_info('stable', 1, '', self.db)['data']['latest'])
        self.assertIsNone(api.public_info('preview', 1, 'different.package', self.db)['data']['latest'])

    def test_withdraw_and_disable_remove_download(self):
        d = self.draft()
        api.publish_release(d['id'], self.db, None)
        api.withdraw_release(d['id'], self.db, None)
        with self.assertRaises(HTTPException):
            api.download(d['id'], self.db)
        self.assertIsNone(api.public_info('preview', 1, '', self.db)['data']['latest'])
        newer = self.draft(2000003)
        api.publish_release(newer['id'], self.db, None)
        api.save_config(api.AppConfig(enabled=False), self.db, None)
        with self.assertRaises(HTTPException):
            api.download(newer['id'], self.db)

    def test_publish_requires_verified_matching_asset_and_increasing_code(self):
        with self.assertRaises(HTTPException):
            api.create_release(api.ReleaseIn(asset_id='missing'), self.db, None)
        first = self.draft()
        api.publish_release(first['id'], self.db, None)
        older = self.draft(2000001)
        with self.assertRaises(HTTPException):
            api.publish_release(older['id'], self.db, None)
        with self.assertRaises(HTTPException):
            api.create_release(api.ReleaseIn(asset_id=self.asset(3000000, 'other.app')), self.db, None)
        with self.assertRaises(HTTPException):
            api.edit_release(first['id'], api.ReleaseEdit(notes='改写'), self.db, None)

    def test_public_html_escapes_content_and_does_not_show_drafts(self):
        api.save_config(api.AppConfig(enabled=True, title='<script>evil</script>'), self.db, None)
        self.draft()
        html = api.download_page('preview', self.db).body.decode()
        self.assertNotIn('<script>evil', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('/api/app/download/', html)

    def test_direct_upload_policy_restricts_key_type_and_size(self):
        cfg = dict(provider='oss', oss_access_key_id='id', oss_access_key_secret='secret',
                   oss_endpoint='https://oss.test', oss_bucket='test')
        ticket = app_packages.sign_package(cfg, 'test.apk')
        import json, base64
        policy = json.loads(base64.b64decode(ticket['fields']['policy']))
        self.assertIn(['eq', '$key', ticket['key']], policy['conditions'])
        self.assertIn(['content-length-range', 1, app_packages.MAX_BYTES], policy['conditions'])
        self.assertNotIn('secret', str(ticket))
        with self.assertRaises(ValueError):
            app_packages.sign_package(cfg, 'bad.html')

    def test_download_signs_only_unchanged_published_oss_object(self):
        draft = self.draft()
        asset = api.read(self.db, 'app_asset_' + draft['asset_id'])
        asset['etag'] = 'original'
        api.write(self.db, 'app_asset_' + draft['asset_id'], asset)
        self.db.commit()
        api.publish_release(draft['id'], self.db, None)
        bucket = Mock()
        bucket.head_object.return_value = Mock(etag='original', content_length=100)
        bucket.sign_url.return_value = 'https://test.oss.test/apps/test.apk?signature=short-lived'
        cfg = dict(oss_bucket='test', oss_endpoint='https://oss.test')
        with patch.object(api.storage, 'get_storage_cfg', return_value=cfg), patch.object(api.storage, '_oss_bucket', return_value=bucket):
            result = api.download(draft['id'], self.db)
            self.assertEqual(result.status_code, 302)
            self.assertEqual(result.headers['cache-control'], 'no-store')
            self.assertEqual(bucket.sign_url.call_args.args[2], 300)
            bucket.head_object.return_value = Mock(etag='modified', content_length=100)
            with self.assertRaises(HTTPException) as caught:
                api.download(draft['id'], self.db)
            self.assertEqual(caught.exception.status_code, 503)

    def test_apk_metadata_reads_real_existing_apk_and_rejects_fake(self):
        import pathlib
        apk = pathlib.Path(__file__).parents[2] / 'artifacts/android/wuxing-music-2.0.0-rc.2-android-preview.1.apk'
        if not apk.exists():
            self.skipTest('本地 APK 不存在，二进制解析另有构造数据测试')
        with apk.open('rb') as f:
            data = app_packages.inspect_apk(f)
        self.assertEqual(data['package_name'], 'cn.azureglow.wuxing.preview')
        self.assertGreater(data['version_code'], 0)
        with self.assertRaises(ValueError):
            app_packages.inspect_apk(io.BytesIO(b'not an APK'))

    def test_complete_reads_oss_and_does_not_trust_client_metadata(self):
        import pathlib
        apk = pathlib.Path(__file__).parents[2] / 'artifacts/android/wuxing-music-2.0.0-rc.2-android-preview.1.apk'
        if not apk.exists():
            self.skipTest('本地 APK 不存在')
        content = apk.read_bytes()
        asset = {'key': 'apps/test.apk', 'bucket': 'test', 'endpoint': 'https://oss.test'}
        bucket = Mock()
        bucket.head_object.return_value = Mock(content_length=len(content), etag='original')
        bucket.get_object.return_value = io.BytesIO(content)
        with patch.object(app_packages.storage, 'get_storage_cfg', return_value={'oss_bucket': 'test', 'oss_endpoint': 'https://oss.test'}), patch.object(app_packages.storage, '_oss_bucket', return_value=bucket):
            verified = app_packages.verify_package(self.db, asset)
        import hashlib
        self.assertEqual(verified['sha256'], hashlib.sha256(content).hexdigest())
        self.assertEqual(verified['size'], len(content))

    def test_http_auth_boundaries_and_anonymous_page(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.database import get_db
        from app.security import get_current_admin
        from app.models import Admin
        app = FastAPI()
        app.include_router(api.router)
        app.dependency_overrides[get_db] = lambda: self.db
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/app/info').status_code, 200)
            self.assertEqual(client.get('/download').status_code, 200)
            self.assertEqual(client.get('/api/admin/apps/config').status_code, 401)
            app.dependency_overrides[get_current_admin] = lambda: Admin(username='viewer', is_super=False)
            self.assertEqual(client.put('/api/admin/apps/config', json={}).status_code, 403)
            self.assertEqual(client.post('/api/admin/apps/packages/sign', json={'filename': 'test.apk'}).status_code, 403)

    def test_binary_manifest_parser_with_constructed_utf8_pool(self):
        import struct
        words = ['manifest', 'package', 'versionCode', 'versionName', 'test.app', '1.2.3']
        payload, offsets = b'', []
        for word in words:
            offsets.append(len(payload))
            raw = word.encode()
            payload += bytes([len(raw), len(raw)]) + raw + b'\0'
        start = 28 + len(words) * 4
        pool = struct.pack('<HHIIIIII', 1, 28, start + len(payload), len(words), 0, 0x100, start, 0) + struct.pack('<' + 'I' * len(words), *offsets) + payload
        attrs = b''
        for name, raw, dtype, value in [(1, 4, 3, 4), (2, 0xffffffff, 0x10, 42), (3, 5, 3, 5)]:
            attrs += struct.pack('<IIIHBBI', 0xffffffff, name, raw, 8, 0, dtype, value)
        element = struct.pack('<HHIII', 0x102, 16, 36 + len(attrs), 1, 0xffffffff) + struct.pack('<IIHHHHHH', 0xffffffff, 0, 20, 20, 3, 0, 0, 0) + attrs
        manifest = struct.pack('<HHI', 3, 8, 8 + len(pool) + len(element)) + pool + element
        file = io.BytesIO()
        with zipfile.ZipFile(file, 'w') as apk:
            apk.writestr('AndroidManifest.xml', manifest)
        file.seek(0)
        self.assertEqual(app_packages.inspect_apk(file), dict(package_name='test.app', version_code=42, version_name='1.2.3'))
