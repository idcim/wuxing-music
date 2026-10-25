"""音频任务回归：只使用临时 SQLite/文件，不连接配置中的数据库或 OSS。

运行：python -m unittest discover -s tests -v
"""
import os
import math
import shutil
import struct
import sys
import tempfile
import threading
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import audio_norm, storage
from app.database import Base, get_db
from app.models import Track
from app.routers import tracks, upload
from app.security import get_current_admin


class AudioPipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{self.tmp.name}/test.db", connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        self.patches = [
            patch.object(audio_norm, "SessionLocal", self.sessions),
            patch.object(storage, "UPLOAD_DIR", self.tmp.name),
            patch.object(storage, "get_storage_cfg", return_value={"provider": "local"}),
        ]
        for p in self.patches:
            p.start()
        audio_norm._queue.clear()
        audio_norm._results.clear()
        audio_norm._worker = None
        app = FastAPI()
        app.include_router(tracks.router)
        app.include_router(upload.router)

        def db_override():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(is_super=True)
        self.client = TestClient(app)

    def tearDown(self):
        worker = audio_norm._worker
        if worker:
            worker.join(timeout=10)
            self.assertFalse(worker.is_alive(), "后台任务未退出")
        self.client.close()
        for p in reversed(self.patches):
            p.stop()
        self.engine.dispose()
        self.tmp.cleanup()

    def create(self, **kwargs):
        # 入队保持持久化，但由测试决定何时启动 worker。
        with patch.object(audio_norm, "enqueue"):
            response = self.client.post("/api/admin/tracks", json={
                "element_id": "木", "title": "测试曲目", "audio_url": "/uploads/source.wav",
                **kwargs,
            })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["data"]["id"]

    def wait_worker(self):
        worker = audio_norm._worker
        if worker:
            worker.join(timeout=10)
            self.assertFalse(worker.is_alive())

    def test_upload_does_not_run_conversion(self):
        async def save(*args, **kwargs):
            return {"url": "/uploads/source.wav"}

        with patch.object(storage, "save_stream", side_effect=save), patch.object(
            audio_norm, "process_track", side_effect=AssertionError("上传不应转换"),
        ):
            r = self.client.post("/api/admin/upload", files={"file": ("source.wav", b"x" * 2048)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"]["url"], "/uploads/source.wav")

    def test_save_returns_while_worker_is_busy(self):
        entered, release = threading.Event(), threading.Event()

        def process(*args):
            entered.set()
            if not release.wait(5):
                raise RuntimeError("测试未释放 worker")
            return "done:preview"

        try:
            with patch.object(audio_norm, "process_track", side_effect=process):
                r = self.client.post("/api/admin/tracks", json={
                    "element_id": "木", "title": "异步上传", "audio_url": "/uploads/source.wav",
                })
                self.assertEqual(r.status_code, 200)
                self.assertTrue(entered.wait(3))
                # 转换仍被阻塞时，保存和列表请求都已经可以完成。
                items = self.client.get("/api/admin/tracks").json()["data"]["items"]
                self.assertEqual(items[0]["process_state"], "processing")
                release.set()
                self.wait_worker()
        finally:
            release.set()

    def test_restart_recovers_persisted_pending(self):
        track_id = self.create()
        with patch.object(audio_norm, "process_track", return_value="done:preview") as process:
            audio_norm.recover_pending()
            self.wait_worker()
        self.assertEqual(process.call_count, 1)
        with self.sessions() as db:
            self.assertFalse(db.get(Track, track_id).audio_pending)

    def test_failure_retries_then_persists_error(self):
        track_id = self.create()
        with patch.object(audio_norm, "process_track", return_value="error:转码失败") as process, patch.object(
            audio_norm.time, "sleep",
        ):
            audio_norm.enqueue(track_id, persist=False)
            self.wait_worker()
        self.assertEqual(process.call_count, 3)
        with self.sessions() as db:
            track = db.get(Track, track_id)
            self.assertFalse(track.audio_pending)
            self.assertEqual(track.audio_error, "转码失败")
            self.assertEqual(track.audio_attempts, 3)
        row = self.client.get("/api/admin/tracks").json()["data"]["items"][0]
        self.assertEqual(row["process_state"], "error")
        self.assertEqual(row["process_error"], "转码失败")
        with patch.object(audio_norm, "process_track", return_value="done:preview"):
            self.assertEqual(self.client.post(f"/api/admin/tracks/{track_id}/normalize").status_code, 200)
            self.wait_worker()
        with self.sessions() as db:
            self.assertEqual(db.get(Track, track_id).audio_error, "")

    def test_transient_failure_recovers_without_upload(self):
        track_id = self.create()
        with patch.object(audio_norm, "process_track", side_effect=["error:网络中断", "done:preview"]) as process, patch.object(
            audio_norm.time, "sleep",
        ):
            audio_norm.recover_pending()
            self.wait_worker()
        self.assertEqual(process.call_count, 2)
        with self.sessions() as db:
            track = db.get(Track, track_id)
            self.assertFalse(track.audio_pending)
            self.assertEqual(track.audio_error, "")

    def source_file(self):
        path = os.path.join(self.tmp.name, "source.wav")
        with open(path, "wb") as f:
            f.write(b"x" * 2048)

    def test_replacing_source_during_conversion_rejects_old_result(self):
        track_id = self.create()
        self.source_file()

        def encode(src, dst, **kwargs):
            with open(dst, "wb") as f:
                f.write(b"encoded")
            with patch.object(audio_norm, "enqueue"):
                r = self.client.put(f"/api/admin/tracks/{track_id}", json={
                    "element_id": "木", "title": "已换音源", "audio_url": "/uploads/new.wav",
                })
            self.assertEqual(r.status_code, 200)

        with self.sessions() as db, patch.object(audio_norm.shutil, "which", return_value="ffmpeg"), patch.object(
            audio_norm, "_probe_audio",
        ), patch.object(audio_norm, "_encode_aac", side_effect=encode):
            result = audio_norm.process_track(db, {"provider": "local"}, db.get(Track, track_id))
        self.assertTrue(result.startswith("skip:曲目已更新"), result)
        with self.sessions() as db:
            track = db.get(Track, track_id)
            self.assertEqual(track.audio_url, "/uploads/new.wav")
            self.assertEqual(track.preview_url, "")
            self.assertTrue(track.audio_pending)

    def test_missing_ffmpeg_is_reported_instead_of_ready(self):
        track_id = self.create()
        self.source_file()
        with self.sessions() as db, patch.object(audio_norm.shutil, "which", return_value=None):
            result = audio_norm.process_track(db, {"provider": "local"}, db.get(Track, track_id))
        self.assertTrue(result.startswith("error:"), result)

    def test_worker_exception_also_retries_and_records_failure(self):
        track_id = self.create()
        with patch.object(audio_norm, "process_track", side_effect=RuntimeError("存储暂时不可用")) as process, patch.object(
            audio_norm.time, "sleep",
        ):
            audio_norm.recover_pending()
            self.wait_worker()
        self.assertEqual(process.call_count, 3)
        with self.sessions() as db:
            track = db.get(Track, track_id)
            self.assertFalse(track.audio_pending)
            self.assertEqual(track.audio_error, "存储暂时不可用")

    def test_batch_over_fifty_tracks_keeps_accurate_results_and_history(self):
        ids = [self.create(title=f"曲目 {i}") for i in range(65)]

        def process(db, cfg, track):
            return "error:单曲损坏" if track.id == ids[0] else "done:preview"

        with patch.object(audio_norm, "process_track", side_effect=process), patch.object(audio_norm.time, "sleep"):
            job = audio_norm.enqueue(None)
            self.wait_worker()
        # 模拟服务重启：清空全部内存结果，历史和批次汇总仍从数据库恢复。
        audio_norm._results.clear()
        audio_norm._seq = 0
        audio_norm._current_job = 0
        state = self.client.get("/api/admin/tracks/normalize-audio").json()["data"]
        self.assertEqual(state["batch"], {
            "job": job, "total": 65, "done": 65, "success": 64,
            "failed": 1, "skipped": 0, "finished": True,
        })
        failed = self.client.get("/api/admin/tracks/audio-history", params={"outcome": "error", "job": job}).json()["data"]
        self.assertEqual(failed["total"], 1)
        self.assertEqual(failed["items"][0]["trackId"], ids[0])
        page = self.client.get("/api/admin/tracks/audio-history", params={"page": 2, "size": 20}).json()["data"]
        self.assertEqual(page["total"], 67)  # 65 最终结果 + 2 次自动重试
        self.assertEqual(len(page["items"]), 20)
        self.assertGreater(page["latestSeq"], 50)

    def test_partial_failure_keeps_finished_stage_and_retries_only_missing_output(self):
        track_id = self.create()
        self.source_file()
        calls = []

        def encode(src, dst, **kwargs):
            calls.append(kwargs.get("clip_sec", 0))
            if len(calls) == 2:
                raise RuntimeError("试听暂时失败")
            with open(dst, "wb") as f:
                f.write(b"encoded")

        with patch.object(audio_norm.shutil, "which", return_value="ffmpeg"), patch.object(
            audio_norm, "_probe_audio",
        ), patch.object(audio_norm, "_encode_aac", side_effect=encode):
            with self.sessions() as db:
                result = audio_norm.process_track(db, {"provider": "local", "aac_enabled": True}, db.get(Track, track_id))
            self.assertTrue(result.startswith("error:"), result)
            with self.sessions() as db:
                self.assertTrue(db.get(Track, track_id).aac_url)
                self.assertEqual(db.get(Track, track_id).preview_url, "")
                result = audio_norm.process_track(db, {"provider": "local", "aac_enabled": True}, db.get(Track, track_id))
            self.assertEqual(result, "done:preview")
        self.assertEqual(calls, [0, 30, 30])

    def test_oss_download_uses_authenticated_source_and_retries(self):
        calls = []
        bucket = object()
        target = os.path.join(self.tmp.name, "master.wav")

        def download(got_bucket, key, dst, **kwargs):
            calls.append((got_bucket, key, dst, kwargs))
            if len(calls) == 1:
                raise RuntimeError("temporary disconnect")
            with open(dst, "wb") as f:
                f.write(b"master bytes")

        sdk = SimpleNamespace(resumable_download=download, ResumableDownloadStore=lambda **kwargs: kwargs)
        with patch.dict(sys.modules, {"oss2": sdk}), patch.object(storage, "_oss_bucket", return_value=bucket), patch.object(audio_norm.time, "sleep"):
            audio_norm._download_oss({"provider": "oss"}, "audio/master.wav", target)
        self.assertEqual(len(calls), 2)
        self.assertIs(calls[0][0], bucket)
        self.assertEqual(calls[0][1], "audio/master.wav")
        self.assertEqual(calls[0][3]["num_threads"], 2)
        with open(target, "rb") as f:
            self.assertEqual(f.read(), b"master bytes")

    @unittest.skipUnless(shutil.which("ffmpeg"), "本地无 ffmpeg")
    def test_real_ffmpeg_generates_aac_and_preview_without_changing_master(self):
        track_id = self.create(preview_sec=1)
        source = os.path.join(self.tmp.name, "source.wav")
        with wave.open(source, "wb") as f:
            f.setparams((1, 2, 44100, 0, "NONE", "not compressed"))
            f.writeframes(b"".join(
                struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / 44100)))
                for i in range(88200)
            ))
        with open(source, "rb") as f:
            original = f.read()
        with patch.object(storage, "get_storage_cfg", return_value={"provider": "local", "aac_enabled": True}):
            audio_norm.recover_pending()
            self.wait_worker()
        with self.sessions() as db:
            track = db.get(Track, track_id)
            self.assertFalse(track.audio_pending)
            self.assertEqual(track.audio_error, "")
            self.assertEqual(track.play_url, "")
            for url in (track.aac_url, track.preview_url):
                self.assertTrue(url)
                path = os.path.join(self.tmp.name, url.removeprefix("/uploads/"))
                self.assertGreater(os.path.getsize(path), 0)
                audio_norm._probe_audio(path)
        with open(source, "rb") as f:
            self.assertEqual(f.read(), original)


if __name__ == "__main__":
    unittest.main()
