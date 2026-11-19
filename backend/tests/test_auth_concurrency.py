"""身份并发回归：独立连接、真实文件库，不调用短信或微信。"""
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import Setting, SmsCode, User
from app.routers import app_wechat, mp
from app.user_delete import deactivate_user
from app.user_merge import merge_users


class AuthConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.engine = create_engine('sqlite:///' + str(Path(self.directory.name) / 'auth.sqlite'),
                                    connect_args={'check_same_thread': False})
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine)
        self.app = FastAPI()
        self.app.include_router(mp.router)
        self.app.include_router(app_wechat.router)
        def database():
            with self.factory() as db:
                yield db
        self.app.dependency_overrides[get_db] = database
        self.client = TestClient(self.app)
        # 仅供本地格式校验及身份隔离的合成 AppID，不对应实际微信应用。
        self.cfg = dict(enabled=True, app_id='wx' + '0' * 16, app_secret='server-only',
                        android_package='cn.azureglow.wuxing.preview', android_signature='a'*32,
                        privacy_policy='隐私政策')
        with self.factory() as db:
            db.add(Setting(key=app_wechat.CONFIG_KEY, value=json.dumps(self.cfg)))
            db.commit()

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.directory.cleanup()

    def sms(self, code):
        return SmsCode(phone='13800138000', code=code, scene='login',
                       expire_at=datetime.utcnow()+timedelta(minutes=5))

    def test_stale_cancellation_refreshes_later_binding_and_releases_recursive_aliases(self):
        with self.factory() as db:
            user = User(openid='phone:13800138000', phone='13800138000')
            db.add(user)
            db.commit()
            uid = user.id
            first = User(openid='legacy-middle', merged_into=uid)
            db.add(first)
            db.flush()
            db.add(User(openid='legacy-leaf', merged_into=first.id))
            db.commit()
        with self.factory() as stale:
            stale_user = stale.get(User, uid)
            descendants = stale.query(User).filter(User.id != uid).all()
            self.assertIsNone(stale_user.app_openid)
            headers = {'Authorization': 'Bearer ' + mp.create_user_token(uid)}
            challenge = self.client.post('/api/app/wechat/bind/challenge', headers=headers).json()['data']
            with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified', 'unionid': 'union-ok'}):
                response = self.client.post('/api/app/wechat/bind', headers=headers, json={**challenge, 'code': 'real'})
            self.assertEqual(response.status_code, 200, response.text)
            # 另一连接在 stale 会话缓存之后写入递归别名，注销必须刷新而非相信旧的 None。
            with self.factory() as writer:
                writer.get(User, descendants[-1].id).app_openid = 'app:legacy-leaf-alias'
                writer.commit()
            deactivate_user(stale, stale_user)
        with self.factory() as db:
            self.assertTrue(db.get(User, uid).deleted_at)
            self.assertEqual(db.get(User, uid).unionid, '')
            self.assertEqual(db.query(User).filter(User.app_openid.isnot(None)).count(), 0)
        challenge = self.client.post('/api/app/wechat/challenge').json()['data']
        with patch.object(app_wechat, 'exchange_code', return_value={'openid': 'verified', 'unionid': 'union-ok'}):
            response = self.client.post('/api/app/wechat/login', json={**challenge, 'code': 'new'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotEqual(response.json()['data']['user']['id'], uid)

    def test_two_connections_can_consume_one_sms_code_only_once(self):
        with self.factory() as db:
            db.add(self.sms('123456'))
            db.commit()
        barrier = threading.Barrier(2)
        def after_read(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith('SELECT') and 'FROM sms_code' in statement:
                barrier.wait(timeout=5)
        event.listen(self.engine, 'after_cursor_execute', after_read)
        def consume(_):
            with self.factory() as db:
                try:
                    mp._consume_sms_code(db, '13800138000', '123456', 'login')
                    return 200
                except HTTPException as exc:
                    return exc.status_code
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                statuses = sorted(pool.map(consume, [0, 1]))
        finally:
            event.remove(self.engine, 'after_cursor_execute', after_read)
        self.assertEqual(statuses, [200, 400])
        with self.factory() as db:
            self.assertTrue(db.query(SmsCode).one().used)

    def test_stale_cancellation_rejects_account_merged_before_locked_refresh(self):
        with self.factory() as db:
            source = User(openid='phone:source', phone='13800138000', app_openid='app:source')
            survivor = User(openid='mini:survivor')
            db.add_all([source, survivor])
            db.commit()
            source_id, survivor_id = source.id, survivor.id
        with self.factory() as stale:
            stale_source = stale.get(User, source_id)
            self.assertIsNone(stale_source.merged_into)
            with self.factory() as writer:
                merge_users(writer, writer.get(User, survivor_id), writer.get(User, source_id))
                writer.commit()
            with self.assertRaises(HTTPException) as rejected:
                deactivate_user(stale, stale_source)
            self.assertEqual(rejected.exception.status_code, 409)
        with self.factory() as db:
            self.assertIsNone(db.get(User, source_id).deleted_at)
            self.assertIsNone(db.get(User, survivor_id).deleted_at)
            self.assertEqual(db.get(User, survivor_id).phone, '13800138000')
            self.assertEqual(db.get(User, survivor_id).app_openid, 'app:source')

    def test_two_valid_sms_logins_create_one_phone_account_without_unique_phone(self):
        with self.factory() as db:
            db.add_all([self.sms('111111'), self.sms('222222')])
            db.commit()
        first_consumed, barrier = threading.Event(), threading.Barrier(2)
        original = mp._consume_sms_code
        def consume_then_pause(db, phone, code, scene):
            if code == '111111':
                self.assertTrue(first_consumed.wait(timeout=5))
            original(db, phone, code, scene)
            if code == '222222':
                first_consumed.set()
            barrier.wait(timeout=5)
        def login(code):
            return self.client.post('/api/mp/login/phone', json={'phone': '13800138000', 'code': code})
        with patch.object(mp, '_consume_sms_code', side_effect=consume_then_pause), ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(login, ['111111', '222222']))
        self.assertEqual([response.status_code for response in responses], [200, 200])
        self.assertEqual(responses[0].json()['data']['user']['id'], responses[1].json()['data']['user']['id'])
        with self.factory() as db:
            self.assertEqual(db.query(User).filter_by(phone='13800138000').count(), 1)

    def test_parallel_wrong_codes_count_every_attempt_and_lock_code_at_five(self):
        with self.factory() as db:
            db.add(self.sms('123456'))
            db.commit()
        barrier = threading.Barrier(5)
        def after_read(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith('SELECT') and 'FROM sms_code' in statement:
                barrier.wait(timeout=5)
        event.listen(self.engine, 'after_cursor_execute', after_read)
        def attempt(_):
            with self.factory() as db:
                try:
                    mp._consume_sms_code(db, '13800138000', 'wrong', 'login')
                    return 200
                except HTTPException as exc:
                    return exc.status_code
        try:
            with ThreadPoolExecutor(max_workers=5) as pool:
                statuses = list(pool.map(attempt, range(5)))
        finally:
            event.remove(self.engine, 'after_cursor_execute', after_read)
        self.assertEqual(statuses, [400]*5)
        with self.factory() as db:
            row = db.query(SmsCode).one()
            self.assertEqual(row.attempts, 5)
            self.assertTrue(row.used)
            with self.assertRaises(HTTPException):
                mp._consume_sms_code(db, '13800138000', '123456', 'login')


if __name__ == '__main__':
    unittest.main()
