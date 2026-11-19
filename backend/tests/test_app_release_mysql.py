"""显式指定独立临时 MySQL 才运行；不会读取项目数据库配置。"""
import os
import threading
import unittest
import uuid

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.models import Setting
from app.routers import app_releases as api


@unittest.skipUnless(os.getenv('APP_RELEASE_TEST_MYSQL_URL'), '未提供独立临时 MySQL')
class AppReleaseMysqlTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(os.environ['APP_RELEASE_TEST_MYSQL_URL'])
        Setting.__table__.create(self.engine, checkfirst=True)
        self.db = Session(self.engine)
        api.save_config(api.AppConfig(), self.db, None)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def draft(self, code):
        asset = uuid.uuid4().hex
        api.write(self.db, 'app_asset_' + asset, dict(ready=True, version_name=str(code), version_code=code,
                  package_name='cn.azureglow.wuxing.preview', size=1, sha256='a'*64))
        self.db.commit()
        return api.create_release(api.ReleaseIn(asset_id=asset), self.db, None)['data']['id']

    def test_repeatable_read_waiter_rejects_duplicate_code_and_published_edit(self):
        self.assertEqual(self.db.execute(text('SELECT @@transaction_isolation')).scalar(), 'REPEATABLE-READ')
        code = 10000 + len(api.releases(self.db))
        first, duplicate = self.draft(code), self.draft(code)
        self.db.commit()
        with Session(self.engine) as waiter:
            # 模拟鉴权/读草稿在争锁之前已经建立一致性快照。
            api.get_release(waiter, duplicate)
            self.db.execute(text('SELECT 1'))
            api.lock_config(self.db)
            outcome, attempting = [], threading.Event()
            def run():
                attempting.set()
                try:
                    api.publish_release(duplicate, waiter, None)
                    outcome.append('incorrectly published')
                except HTTPException as exc:
                    outcome.append(exc.status_code)
                finally:
                    waiter.rollback()
            thread = threading.Thread(target=run)
            thread.start()
            self.assertTrue(attempting.wait(2))
            api.publish_release(first, self.db, None)
            thread.join(8)
            self.assertFalse(thread.is_alive())
            self.assertEqual(outcome, [400])

        editable = self.draft(code + 1)
        with Session(self.engine) as waiter:
            self.assertEqual(api.get_release(waiter, editable)['status'], 'draft')
            api.lock_config(self.db)
            outcome, attempting = [], threading.Event()
            def edit():
                attempting.set()
                try:
                    api.edit_release(editable, api.ReleaseEdit(notes='late edit'), waiter, None)
                    outcome.append('incorrectly edited')
                except HTTPException as exc:
                    outcome.append(exc.status_code)
                finally:
                    waiter.rollback()
            thread = threading.Thread(target=edit)
            thread.start()
            self.assertTrue(attempting.wait(2))
            api.publish_release(editable, self.db, None)
            thread.join(8)
            self.assertFalse(thread.is_alive())
            self.assertEqual(outcome, [400])
