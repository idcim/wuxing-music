"""仅上传 OSS 原文件：禁止下载、探测及转码，保留私有授权和旧任务历史。"""
import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from app.commerce import common, media, worker
from app.commerce.models import Event, Job, MediaAsset


class MediaCases:
    def test_original_upload_policy_binds_private_non_overwriting_object(self):
        config = SimpleNamespace(commerce_private_bucket="private-test", commerce_private_endpoint="https://oss.example.test",
                                 commerce_private_key_id="test-id", commerce_private_key_secret="synthetic-test-secret")
        with patch.object(media, "bucket", return_value=object()), patch.object(media, "settings", config):
            tickets = [self.client.post("/api/admin/commerce/media/sign", json={"name": "lesson.mp4", "kind": "video"}).json()["data"] for _ in range(2)]
        self.assertNotEqual(tickets[0]["fields"]["key"], tickets[1]["fields"]["key"])
        for ticket in tickets:
            fields = ticket["fields"]
            conditions = json.loads(base64.b64decode(fields["policy"]))["conditions"]
            for key, value in (("key", fields["key"]), ("x-oss-object-acl", "private"), ("x-oss-forbid-overwrite", "true")):
                self.assertEqual(fields[key], value)
                self.assertIn(["eq", "$" + key, value], conditions)
            expected = base64.b64encode(hmac.new(config.commerce_private_key_secret.encode(), fields["policy"].encode(), hashlib.sha1).digest()).decode()
            self.assertEqual(fields["Signature"], expected)

    def test_course_original_ready_without_conversion_or_worker(self):
        for ident, kind, extension in ((200, "video", "mp4"), (201, "audio", "wav")):
            with self.subTest(kind=kind):
                key = f"course/source/original-{ident}.{extension}"
                with self.sessions() as db:
                    db.add(MediaAsset(id=ident, name=f"original.{extension}", kind=kind, source_key=key))
                    db.commit()
                store = SimpleNamespace(head_object=lambda _: SimpleNamespace(content_length=1024),
                                        get_object_acl=lambda _: SimpleNamespace(acl="private"),
                                        sign_url=lambda method, object_key, ttl: f"https://private.test/{object_key}?signed=1")
                with patch.object(media, "bucket", return_value=store), patch("subprocess.run", side_effect=AssertionError("不得运行转码或探测")):
                    response = self.client.post(f"/api/admin/commerce/media/{ident}/complete", json={"duration": 123})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()["data"]["state"], "ready")
                    with self.sessions() as db:
                        asset = db.get(MediaAsset, ident)
                        self.assertEqual((asset.playback_key, asset.duration, asset.size), (key, 123, 1024))
                        self.assertIn(key, media.signed_url(asset))
                        self.assertEqual(db.query(Job).filter_by(kind="media").count(), 0)
                    again = self.client.post(f"/api/admin/commerce/media/{ident}/complete", json={"duration": 99})
                    self.assertEqual(again.json()["data"]["duration"], 123)
                items = self.client.get("/api/admin/commerce/media").json()["data"]["items"]
                self.assertTrue(all("source_key" not in item and "playback_key" not in item for item in items))

    def test_original_confirmation_fences_old_running_conversion(self):
        lease = datetime.utcnow().replace(microsecond=0) + timedelta(hours=1)
        with self.sessions() as db:
            asset = db.get(MediaAsset, 100)
            asset.state, asset.source_key = "processing", "course/source/old.mp4"
            job = Job(key="media:100", kind="media", payload={"asset_id": 100}, state="running", attempts=1, lease_until=lease)
            db.add(job); db.commit(); ident = job.id
        store = SimpleNamespace(head_object=lambda _: SimpleNamespace(content_length=50), get_object_acl=lambda _: SimpleNamespace(acl="private"))
        with patch.object(media, "bucket", return_value=store):
            response = self.client.post("/api/admin/commerce/media/100/complete", json={"duration": 42})
            self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            self.assertEqual(db.get(Job, ident).state, "done")
            self.assertIsNone(db.get(Job, ident).lease_until)
            self.assertTrue(db.query(Event).filter_by(subject=f"job:{ident}", action="transcoding_stopped").first())
            db.info["commerce_claim"] = (ident, 1, lease)
            with self.assertRaises(common.LeaseLost):
                media.process(db, 100)
            self.assertEqual(db.get(MediaAsset, 100).playback_key, "course/source/old.mp4")

    def test_legacy_media_queue_stops_without_storage_or_encoding(self):
        with self.sessions() as db:
            db.get(MediaAsset, 100).state = "processing"
            db.add(Job(key="media:100", kind="media", payload={"asset_id": 100}, run_at=datetime.utcnow()-timedelta(minutes=1)))
            db.commit()
        with patch.object(media, "bucket", side_effect=AssertionError("旧任务不应访问 OSS")), patch("subprocess.run", side_effect=AssertionError("不应转码")):
            self.assertTrue(worker.run_one(self.sessions, queue="media"))
        with self.sessions() as db:
            self.assertEqual(db.get(MediaAsset, 100).state, "uploading")
            self.assertIn("转码已停用", db.get(MediaAsset, 100).error)
            self.assertEqual(db.query(Job).filter_by(key="media:100").one().state, "done")

    def test_original_upload_checks_size_privacy_format_and_duration(self):
        with self.sessions() as db:
            asset = db.get(MediaAsset, 100)
            asset.state, asset.source_key = "uploading", "course/source/test.mp4"
            db.commit()
        for size, acl, expected in ((0, "private", 422), (50, "public-read", 409)):
            with self.subTest(size=size, acl=acl), patch.object(media, "bucket", return_value=SimpleNamespace(
                head_object=lambda _: SimpleNamespace(content_length=size), get_object_acl=lambda _: SimpleNamespace(acl=acl))):
                self.assertEqual(self.client.post("/api/admin/commerce/media/100/complete", json={"duration": 10}).status_code, expected)
        self.assertEqual(self.client.post("/api/admin/commerce/media/100/complete", json={"duration": 0}).status_code, 422)
        with patch.object(media, "bucket", return_value=object()):
            self.assertEqual(self.client.post("/api/admin/commerce/media/sign", json={"name": "test.mkv", "kind": "video"}).status_code, 422)
