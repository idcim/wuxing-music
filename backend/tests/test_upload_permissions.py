"""后台上传的角色边界；全部使用临时数据库与存储替身。"""
import json
import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.models import Base, Role
from app.routers import upload
from app.security import get_current_admin


class UploadPermissionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False},
            poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            for ident, perms in enumerate(("commerce:content", "commerce:ship", "settings:edit", "tracks:edit"), 1):
                db.add(Role(id=ident, name=perms, permissions=json.dumps([perms])))
            db.commit()
        self.role_id = 1
        app = FastAPI()
        app.include_router(upload.router)

        def session():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = session
        app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(is_super=False, role_id=self.role_id)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def send(self, name):
        with patch.object(upload.storage, "save_stream", new_callable=AsyncMock, return_value={"url": "/uploads/test"}) as save:
            response = self.client.post("/api/admin/upload", files={"file": (name, b"sample", "application/octet-stream")})
        return response, save

    def test_content_editor_can_upload_image_but_shipping_role_cannot(self):
        response, save = self.send("cover.png")
        self.assertEqual(response.status_code, 200, response.text)
        save.assert_awaited_once()
        self.role_id = 2
        response, save = self.send("cover.png")
        self.assertEqual(response.status_code, 403)
        save.assert_not_awaited()
        self.role_id = 3
        response, save = self.send("site-logo.png")
        self.assertEqual(response.status_code, 200, response.text)
        save.assert_awaited_once()

    def test_only_track_editor_can_upload_audio_or_sign_direct_upload(self):
        for role_id in (1, 3):
            self.role_id = role_id
            response, save = self.send("track.mp3")
            self.assertEqual(response.status_code, 403)
            save.assert_not_awaited()
            response = self.client.post("/api/admin/upload/oss-sign", json={"filename": "track.mp3"})
            self.assertEqual(response.status_code, 403)
        self.role_id = 4
        response, save = self.send("track.mp3")
        self.assertEqual(response.status_code, 200, response.text)
        save.assert_awaited_once()
        with patch.object(upload.storage, "build_oss_post_policy", return_value={"key": "test"}) as sign:
            response = self.client.post("/api/admin/upload/oss-sign", json={"filename": "track.mp3"})
        self.assertEqual(response.status_code, 200, response.text)
        sign.assert_called_once()

    def test_svg_upload_is_rejected_before_storage(self):
        response, save = self.send("cover.svg")
        self.assertEqual(response.status_code, 400)
        save.assert_not_awaited()
        response = self.client.post("/api/admin/upload/oss-sign", json={"filename": "cover.svg"})
        self.assertEqual(response.status_code, 400)
        from app.routers.mp import mp_upload
        with Session(self.engine) as db:
            request = Request({"type": "http", "scheme": "https", "server": ("localhost", 443), "path": "/api/mp/upload"})
            file = UploadFile(filename="avatar.svg", file=io.BytesIO(b"<svg/>"))
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(mp_upload(request, file, SimpleNamespace(id=1), db))
        self.assertEqual(caught.exception.status_code, 400)
