"""APP 微信登录只用临时 SQLite 与模拟微信响应。"""
import json
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.models import Setting, User, Admin
from app.security import get_current_admin
from app.routers import app_wechat
from app.user_merge import miniapp_openid


class AppWechatTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.app = FastAPI()
        self.app.include_router(app_wechat.router)
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.app.dependency_overrides[get_current_admin] = lambda: Admin(username='test', is_super=True)
        self.client = TestClient(self.app)
        # 格式校验需要合法形状；用全零合成值，不使用实际应用配置。
        self.cfg = dict(enabled=True, app_id='wx' + '0' * 16, app_secret='server-only', android_package='cn.azureglow.wuxing.preview', android_signature='a'*32, ios_bundle_id='', privacy_policy='测试隐私政策与微信登录资料说明')
        self.db.add(Setting(key=app_wechat.CONFIG_KEY, value=json.dumps(self.cfg)))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def challenge(self):
        response = self.client.post('/api/app/wechat/challenge')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['data']

    def test_config_masks_secret_and_blank_keeps_it(self):
        result = self.client.get('/api/admin/apps/wechat').json()['data']
        self.assertNotIn('app_secret', result)
        self.assertTrue(result['app_secret_set'])
        self.assertEqual(self.client.put('/api/admin/apps/wechat', json={**self.cfg, 'app_secret': ''}).status_code, 200)
        self.assertEqual(app_wechat.configuration(self.db)['app_secret'], 'server-only')
        public = self.client.get('/api/app/wechat/config').json()['data']
        self.assertTrue(public['enabled'])
        self.assertNotIn('app_secret', public)

    def test_disabled_never_developer_fallback(self):
        self.db.query(Setting).filter_by(key=app_wechat.CONFIG_KEY).update({'value': '{}'})
        self.db.commit()
        self.assertFalse(self.client.get('/api/app/wechat/config').json()['data']['enabled'])
        self.assertEqual(self.client.post('/api/app/wechat/challenge').status_code, 503)

    def test_bad_proof_does_not_exchange_and_valid_challenge_only_once(self):
        challenge = self.challenge()
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified', 'unionid': 'union-ok'}) as exchange:
            self.assertEqual(self.client.post('/api/app/wechat/login', json={**challenge, 'proof': 'bad', 'code': 'code'}).status_code, 400)
            self.assertFalse(exchange.called)
            result = self.client.post('/api/app/wechat/login', json={**challenge, 'code': 'real-code', 'openid': 'forged', 'unionid': 'forged'})
            self.assertEqual(result.status_code, 422)  # Client identities are rejected.
            result = self.client.post('/api/app/wechat/login', json={**challenge, 'code': 'real-code'})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertTrue(result.json()['data']['token'])
            self.assertEqual(self.db.query(User).one().unionid, 'union-ok')
            self.assertTrue(self.db.query(User).one().openid.startswith('app:'))
            self.assertEqual(self.client.post('/api/app/wechat/login', json={**challenge, 'code': 'real-code'}).status_code, 400)
            self.assertEqual(exchange.call_count, 1)

    def test_expired_state_wrong_app_and_missing_privacy_remain_closed(self):
        challenge = self.challenge()
        row = self.db.get(Setting, 'appwx:' + challenge['state'])
        record = json.loads(row.value)
        record['expires'] = 1
        row.value = json.dumps(record)
        self.db.commit()
        with patch.object(app_wechat, 'exchange_code') as exchange:
            self.assertEqual(self.client.post('/api/app/wechat/login', json={**challenge, 'code': 'code'}).status_code, 400)
            self.assertFalse(exchange.called)
        invalid = {**self.cfg, 'privacy_policy': ''}
        self.assertEqual(self.client.put('/api/admin/apps/wechat', json=invalid).status_code, 422)

    def test_wechat_rejection_and_network_failure_never_create_users(self):
        import httpx
        with patch.object(app_wechat.httpx, 'get', side_effect=httpx.ConnectError('offline')):
            self.assertEqual(self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'bad'}).status_code, 503)
        from types import SimpleNamespace
        rejection = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'errcode': 40029, 'errmsg': 'invalid code'})
        with patch.object(app_wechat.httpx, 'get', return_value=rejection):
            self.assertEqual(self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'bad'}).status_code, 400)
        self.assertEqual(self.db.query(User).count(), 0)

    def test_admin_configuration_has_server_permission_check(self):
        self.app.dependency_overrides[get_current_admin] = lambda: Admin(username='readonly', is_super=False)
        self.assertEqual(self.client.put('/api/admin/apps/wechat', json=self.cfg).status_code, 403)
        self.assertEqual(self.client.get('/api/admin/apps/wechat').status_code, 403)

    def test_app_identity_is_not_cleanup_candidate_and_cancellation_releases_it(self):
        from app.user_delete import test_user_candidates, deactivate_user
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified'}):
            first = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'one'}).json()['data']['user']
            self.assertEqual(test_user_candidates(self.db), [])
            user = self.db.get(User, first['id'])
            deactivate_user(self.db, user)
            second = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'two'})
            self.assertEqual(second.status_code, 200, second.text)
            self.assertNotEqual(second.json()['data']['user']['id'], first['id'])

    def test_app_previous_identity_merges_with_miniapp_and_keeps_payment_identity(self):
        namespace = 'app:' + app_wechat.hashlib.sha256((self.cfg['app_id'] + ':verified').encode()).hexdigest()[:56]
        app_user = User(openid=namespace, nickname='app-user')
        mini_user = User(openid='mini-verified', mp_openid='mini-verified', unionid='union-ok', nickname='mini-user')
        self.db.add_all([app_user, mini_user])
        self.db.commit()
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified', 'unionid': 'union-ok'}):
            result = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'real-code'})
        self.assertEqual(result.status_code, 200, result.text)
        self.db.refresh(mini_user)
        self.db.refresh(app_user)
        self.assertEqual(mini_user.merged_into, app_user.id)
        self.assertEqual(miniapp_openid(self.db, app_user), 'mini-verified')

    def test_unionid_reuses_existing_user_and_app_identity_not_payment_identity(self):
        user = User(openid='mini-verified', mp_openid='mini-verified', unionid='union-ok', nickname='existing')
        self.db.add(user)
        self.db.commit()
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified', 'unionid': 'union-ok'}):
            result = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'real-code'})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['data']['user']['id'], user.id)
        self.assertEqual(self.db.query(User).count(), 1)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            miniapp_openid(self.db, User(openid='app:' + 'a'*56))


if __name__ == '__main__':
    unittest.main()
