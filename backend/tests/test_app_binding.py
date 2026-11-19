"""APP 手机账号绑定微信：临时数据库，外部换码与短信通道均不联网。"""
import json
import unittest
import tempfile
import threading
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from fastapi import HTTPException
from app import ratelimit
from app.database import Base, get_db
from app.models import Setting, SmsCode, User, PlayHistory
from app.routers import app_wechat, mp
from app.user_merge import merge_users
from app.user_delete import deactivate_user, test_user_candidates
from app.commerce import models as commerce_models
import test_app_wechat as existing_tests


class AppBindingTests(unittest.TestCase):
    def setUp(self):
        existing_tests.AppWechatTests.setUp(self)
        ratelimit._hits.clear()
        self.app.include_router(mp.router)
        commerce_models.Base.metadata.create_all(self.engine)
        self.user = User(openid='phone:13800138000', phone='13800138000', nickname='手机用户')
        self.db.add(self.user)
        self.db.commit()
        self.headers = {'Authorization': 'Bearer ' + mp.create_user_token(self.user.id)}

    def tearDown(self):
        existing_tests.AppWechatTests.tearDown(self)

    def challenge(self):
        return existing_tests.AppWechatTests.challenge(self)

    def bind_challenge(self, headers=None):
        response = self.client.post('/api/app/wechat/bind/challenge', headers=headers or self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['data']

    def bind(self, challenge=None, identity=None, headers=None):
        challenge = challenge or self.bind_challenge(headers)
        with patch.object(app_wechat, 'exchange_code', return_value=identity or {'openid': 'verified', 'unionid': 'union-ok'}):
            return self.client.post('/api/app/wechat/bind', headers=headers or self.headers,
                                    json={**challenge, 'code': 'real-code'})

    def test_binding_endpoints_require_authentication(self):
        self.assertEqual(self.client.get('/api/app/wechat/binding').status_code, 401)
        self.assertEqual(self.client.post('/api/app/wechat/bind/challenge').status_code, 401)
        self.assertEqual(self.client.post('/api/app/wechat/bind', json={'state': 'a'*32, 'proof': 'p', 'code': 'c'}).status_code, 401)

    def test_sms_readiness_exposes_only_enabled_supported_real_provider(self):
        for cfg, expected in [({}, False), ({'enabled': True}, False),
                ({'enabled': True, 'provider': 'unsupported', 'access_key_id': 'id', 'access_key_secret': 'secret', 'sign_name': 'sign', 'template_code': 'template'}, False),
                ({'enabled': True, 'provider': 'aliyun', 'access_key_id': 'id', 'access_key_secret': 'secret', 'sign_name': 'sign', 'template_code': 'template'}, True)]:
            row = self.db.get(Setting, 'sms_config')
            if row is None:
                row = Setting(key='sms_config')
                self.db.add(row)
            row.value = json.dumps(cfg)
            self.db.commit()
            with patch.object(mp.settings, 'debug', False):
                response = self.client.get('/api/app/auth/config')
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['data'], {'sms_enabled': expected})

    def test_binding_preserves_account_and_sms_and_wechat_login_reuse_it_without_unionid(self):
        self.user.membership_type = 'year'
        self.user.membership_expire_at = datetime.utcnow() + timedelta(days=30)
        self.db.add_all([PlayHistory(user_id=self.user.id, track_id=5),
                        commerce_models.Enrollment(user_id=self.user.id, course_id=7, source='paid')])
        self.db.commit()
        self.assertEqual(self.client.get('/api/app/wechat/binding', headers=self.headers).json()['data'], {'bound': False})
        response = self.bind(identity={'openid': 'verified'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['data']['user']['id'], self.user.id)
        self.assertEqual(self.client.get('/api/app/wechat/binding', headers=self.headers).json()['data'], {'bound': True})
        self.db.add(SmsCode(phone=self.user.phone, code='123456', scene='login', expire_at=datetime.utcnow()+timedelta(minutes=5)))
        self.db.commit()
        phone = self.client.post('/api/mp/login/phone', json={'phone': self.user.phone, 'code': '123456'})
        self.assertEqual(phone.json()['data']['user']['id'], self.user.id)
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified'}):
            login = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'real-code'})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()['data']['user']['id'], self.user.id)
        self.assertEqual(self.db.query(User).count(), 1)
        self.assertEqual(self.db.query(PlayHistory).one().user_id, self.user.id)
        self.assertEqual(self.db.query(commerce_models.Enrollment).one().user_id, self.user.id)
        self.assertEqual(login.json()['data']['user']['membership']['type'], 'year')

    def test_challenges_cannot_cross_purpose_or_user(self):
        login_challenge = self.challenge()
        binding = self.bind_challenge()
        other = User(openid='phone:13900139000', phone='13900139000')
        self.db.add(other)
        self.db.commit()
        other_headers = {'Authorization': 'Bearer ' + mp.create_user_token(other.id)}
        with patch.object(app_wechat, 'exchange_code') as exchange:
            for path, value, headers in [('/api/app/wechat/bind', login_challenge, self.headers),
                    ('/api/app/wechat/login', binding, {}), ('/api/app/wechat/bind', binding, other_headers)]:
                response = self.client.post(path, json={**value, 'code': 'real-code'}, headers=headers)
                self.assertEqual(response.status_code, 400, response.text)
            self.assertFalse(exchange.called)
        self.assertEqual(self.bind(binding).status_code, 200)

    def test_bind_challenge_is_consumed_before_exchange_even_when_exchange_fails(self):
        challenge = self.bind_challenge()
        with patch.object(app_wechat, 'exchange_code', side_effect=HTTPException(503, 'offline')):
            self.assertEqual(self.bind_response(challenge).status_code, 503)
        with patch.object(app_wechat, 'exchange_code') as exchange:
            self.assertEqual(self.bind_response(challenge).status_code, 400)
            self.assertFalse(exchange.called)

    def bind_response(self, challenge):
        return self.client.post('/api/app/wechat/bind', headers=self.headers, json={**challenge, 'code': 'code'})

    def test_bind_rejects_existing_app_identity_and_union_owner_without_merging(self):
        legacy = 'app:' + app_wechat.hashlib.sha256((self.cfg['app_id'] + ':taken').encode()).hexdigest()[:56]
        owner = User(openid=legacy, unionid='taken-union')
        self.db.add(owner)
        self.db.commit()
        for identity in [{'openid': 'taken'}, {'openid': 'different', 'unionid': 'taken-union'}]:
            response = self.bind(identity=identity)
            self.assertEqual(response.status_code, 409, response.text)
            self.db.refresh(self.user)
            self.db.refresh(owner)
            self.assertIsNone(self.user.merged_into)
            self.assertIsNone(owner.merged_into)
            self.assertEqual(self.user.unionid, '')

    def test_existing_binding_is_idempotent_and_cannot_be_replaced(self):
        self.assertEqual(self.bind().status_code, 200)
        self.assertEqual(self.bind().status_code, 200)
        self.assertEqual(self.bind(identity={'openid': 'different', 'unionid': 'union-ok'}).status_code, 409)
        self.assertEqual(self.bind(identity={'openid': 'verified', 'unionid': 'different'}).status_code, 409)

    def test_merge_keeps_alias_and_cancellation_releases_it(self):
        self.assertEqual(self.bind(identity={'openid': 'verified'}).status_code, 200)
        keep = User(openid='mini-verified', nickname='keeper')
        self.db.add(keep)
        self.db.commit()
        merge_users(self.db, keep, self.user)
        self.db.commit()
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified'}):
            login = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'one'})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()['data']['user']['id'], keep.id)
        self.db.add(SmsCode(phone='13800138000', code='123456', scene='login', expire_at=datetime.utcnow()+timedelta(minutes=5)))
        self.db.commit()
        phone = self.client.post('/api/mp/login/phone', json={'phone': '13800138000', 'code': '123456'})
        self.assertEqual(phone.json()['data']['user']['id'], keep.id)
        deactivate_user(self.db, keep)
        self.assertEqual(self.client.get('/api/app/wechat/binding', headers=self.headers).status_code, 401)
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified'}):
            login = self.client.post('/api/app/wechat/login', json={**self.challenge(), 'code': 'two'})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertNotIn(login.json()['data']['user']['id'], [keep.id, self.user.id])

    def test_verified_app_alias_is_not_test_cleanup_candidate(self):
        self.user.phone = ''
        self.user.nickname = '律音用户123'
        self.db.commit()
        self.assertEqual(self.bind(identity={'openid': 'verified'}).status_code, 200)
        self.assertEqual(test_user_candidates(self.db), [])

    def test_production_unconfigured_sms_does_not_send_or_return_dev_code(self):
        with patch.object(mp.settings, 'debug', False), patch.object(mp.sms, 'send_code') as send:
            response = self.client.post('/api/mp/sms/send', json={'phone': self.user.phone})
        self.assertEqual(response.status_code, 500)
        self.assertFalse(send.called)
        self.assertNotIn('devCode', response.text)
        self.assertEqual(self.db.query(SmsCode).count(), 0)

    def test_bind_expired_wrong_proof_wrong_app_are_rejected_before_exchange(self):
        challenge = self.bind_challenge()
        row = self.db.get(Setting, 'appwx:' + challenge['state'])
        record = json.loads(row.value)
        with patch.object(app_wechat, 'exchange_code') as exchange:
            for changes in [{'expires': 1}, {'app_id': 'wx' + '1' * 16}, {'proof': 'bad'}]:
                row.value = json.dumps({**record, **changes})
                self.db.commit()
                self.assertEqual(self.bind_response(challenge).status_code, 400)
            self.assertFalse(exchange.called)

    def test_deleted_or_merged_account_during_exchange_cannot_be_bound(self):
        challenge = self.bind_challenge()
        def cancel_during_exchange(cfg, code):
            deactivate_user(self.db, self.user)
            return {'openid': 'verified'}
        with patch.object(app_wechat, 'exchange_code', side_effect=cancel_during_exchange):
            response = self.bind_response(challenge)
        self.assertEqual(response.status_code, 409)
        self.db.refresh(self.user)
        self.assertIsNone(self.user.app_openid)

    def test_parallel_bindings_claim_openid_and_unionid_once_and_prevent_replacement(self):
        # 独立连接与真实文件库，不能用共享 Session 假装并发。
        for mode in ('openid', 'unionid', 'replace', 'replay'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                engine = create_engine('sqlite:///' + directory + '/binding.db', connect_args={'check_same_thread': False})
                Base.metadata.create_all(engine)
                factory = sessionmaker(bind=engine)
                with factory() as db:
                    db.add(Setting(key=app_wechat.CONFIG_KEY, value=json.dumps(self.cfg)))
                    users = [User(openid='phone:13800138001'), User(openid='phone:13800138002')]
                    db.add_all(users)
                    db.commit()
                    ids = [u.id for u in users]
                def database():
                    with factory() as db:
                        yield db
                self.app.dependency_overrides[get_db] = database
                headers = [{'Authorization': 'Bearer ' + mp.create_user_token(uid)} for uid in ids]
                if mode in ('replace', 'replay'):
                    headers[1] = headers[0]
                challenges = [self.bind_challenge(header) for header in headers]
                if mode == 'replay':
                    challenges[1] = challenges[0]
                barrier = threading.Barrier(2)
                def exchange(cfg, code):
                    if mode != 'replay':
                        barrier.wait(timeout=5)
                    return {'openid': 'same' if mode in ('openid', 'replay') else code,
                            'unionid': 'same-union' if mode == 'unionid' else ''}
                def submit(index):
                    return self.client.post('/api/app/wechat/bind', headers=headers[index],
                        json={**challenges[index], 'code': str(index)}).status_code
                try:
                    with patch.object(app_wechat, 'exchange_code', side_effect=exchange), ThreadPoolExecutor(max_workers=2) as pool:
                        statuses = sorted(pool.map(submit, [0, 1]))
                    self.assertEqual(statuses, [200, 400 if mode == 'replay' else 409])
                    with factory() as db:
                        self.assertEqual(db.query(User).filter(User.app_openid.isnot(None)).count(), 1)
                        self.assertEqual(db.query(User).filter(User.merged_into.isnot(None)).count(), 0)
                finally:
                    self.app.dependency_overrides[get_db] = lambda: self.db
                    engine.dispose()


class AppIdentityMigrationTests(unittest.TestCase):
    def test_legacy_schema_upgrade_is_repeatable_and_unique_for_real_aliases(self):
        from app.app_identity_migrate import upgrade, is_current
        engine = create_engine('sqlite://')
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql('CREATE TABLE user (id INTEGER PRIMARY KEY, openid VARCHAR(64) NOT NULL UNIQUE)')
                connection.exec_driver_sql("INSERT INTO user (id, openid) VALUES (1, 'phone:one'), (2, 'phone:two')")
            Setting.__table__.create(engine)
            self.assertFalse(is_current(engine))
            upgrade(engine)
            upgrade(engine)
            self.assertTrue(is_current(engine))
            self.assertIn('app_openid', {c['name'] for c in inspect(engine).get_columns('user')})
            with engine.begin() as connection:
                connection.execute(text("UPDATE user SET app_openid='app:unique' WHERE id=1"))
            from sqlalchemy.exc import IntegrityError
            with self.assertRaises(IntegrityError), engine.begin() as connection:
                connection.execute(text("UPDATE user SET app_openid='app:unique' WHERE id=2"))
            with engine.connect() as connection:
                self.assertEqual(connection.execute(text('SELECT openid FROM user ORDER BY id')).scalars().all(), ['phone:one', 'phone:two'])
        finally:
            engine.dispose()

    def test_deploy_requires_current_backup_ack_and_preserves_local_backup(self):
        from app import deploy_database
        from app.app_identity_migrate import is_current
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database_file = root / 'legacy.sqlite'
            backup_file = root / 'verified-backup.sqlite'
            engine = create_engine('sqlite:///' + str(database_file))
            try:
                with engine.begin() as connection:
                    connection.exec_driver_sql('CREATE TABLE user (id INTEGER PRIMARY KEY, openid VARCHAR(64) NOT NULL UNIQUE)')
                    connection.exec_driver_sql("INSERT INTO user (id, openid) VALUES (12, 'phone:existing')")
                Setting.__table__.create(engine)
                (root / 'token').write_text('this-release')
                (root / 'backup.ok').write_text('previous-release')
                with patch('app.database.engine', engine):
                    with self.assertRaises(ValueError):
                        deploy_database.migrate(root)
                    self.assertFalse(is_current(engine))
                    # 临时本地旧库先备份，再确认本次发布备份令牌，真实生产库不参与测试。
                    shutil.copy2(database_file, backup_file)
                    (root / 'backup.ok').write_text('this-release')
                    deploy_database.migrate(root)
                    deploy_database.migrate(root)
                self.assertTrue(is_current(engine))
                with engine.connect() as connection:
                    self.assertEqual(connection.execute(text('SELECT id, openid FROM user')).all(), [(12, 'phone:existing')])
                backup = create_engine('sqlite:///' + str(backup_file))
                try:
                    self.assertFalse(is_current(backup))
                    with backup.connect() as connection:
                        self.assertEqual(connection.execute(text('SELECT id, openid FROM user')).all(), [(12, 'phone:existing')])
                finally:
                    backup.dispose()
            finally:
                engine.dispose()


if __name__ == '__main__':
    unittest.main()
