"""真实视频转码与持久任务回归；OSS 使用本地文件替身。"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

from app.commerce import media, worker
from app.commerce.models import Job, MediaAsset


class MediaCases:
    def test_course_video_worker_handles_odd_dimensions_and_silent_video(self):
        for ident, dimensions, with_audio in ((200, "321x241", True), (201, "320x240", False)):
            with self.subTest(dimensions=dimensions, audio=with_audio):
                source = Path(self.tmp.name) / f"video-{ident}.mkv"
                target = Path(self.tmp.name) / f"play-{ident}.mp4"
                command = ["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i",
                           f"testsrc=size={dimensions}:rate=12:duration=2"]
                if with_audio:
                    command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2"]
                command += ["-c:v", "ffv1", "-pix_fmt", "yuv444p"]
                if with_audio:
                    command += ["-c:a", "pcm_s16le", "-shortest"]
                subprocess.run([*command, str(source)], check=True, capture_output=True, timeout=30)
                original = hashlib.sha256(source.read_bytes()).hexdigest()
                store = SimpleNamespace(head_object=lambda key: SimpleNamespace(content_length=source.stat().st_size),
                                        get_object_acl=lambda key: SimpleNamespace(acl="private"))

                def upload(bucket, key, path, headers):
                    self.assertTrue(key.startswith("course/play/"))
                    self.assertTrue(key.endswith(".mp4"))
                    self.assertEqual(headers["x-oss-object-acl"], "private")
                    shutil.copyfile(path, target)

                fake_oss = SimpleNamespace(resumable_download=lambda bucket, key, path: shutil.copyfile(source, path),
                                           resumable_upload=upload)
                with self.sessions() as db:
                    db.add(MediaAsset(id=ident, kind="video", name=source.name,
                                      source_key=f"course/source/{source.name}", state="uploading"))
                    db.commit()
                with patch.object(media, "bucket", return_value=store), patch.dict(sys.modules, {"oss2": fake_oss}):
                    response = self.client.post(f"/api/admin/commerce/media/{ident}/complete")
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()["data"]["state"], "processing")
                    self.assertFalse(target.exists(), "上传完成请求不得执行转码")
                    self.assertTrue(worker.run_one(self.sessions, queue="media"))
                with self.sessions() as db:
                    asset = db.get(MediaAsset, ident)
                    task = db.query(Job).filter_by(key=f"media:{ident}").one()
                    self.assertEqual(asset.state, "ready", task.error)
                    self.assertEqual(task.state, "done", task.error)
                    self.assertEqual(asset.duration, 2)
                    self.assertTrue(asset.playback_key.startswith("course/play/"))
                info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(target)],
                                                 check=True, capture_output=True, text=True, timeout=30).stdout)
                video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
                self.assertEqual(video["codec_name"], "h264")
                self.assertEqual(video["pix_fmt"], "yuv420p")
                width, height = map(int, dimensions.split("x"))
                self.assertGreaterEqual(video["width"], width)
                self.assertGreaterEqual(video["height"], height)
                self.assertEqual(video["width"] % 2, 0)
                self.assertEqual(video["height"] % 2, 0)
                audio = [stream for stream in info["streams"] if stream["codec_type"] == "audio"]
                self.assertEqual(len(audio), int(with_audio))
                if audio:
                    self.assertEqual(audio[0]["codec_name"], "aac")
                output = target.read_bytes()
                self.assertGreater(output.find(b"moov"), 0)
                self.assertGreater(output.find(b"mdat"), output.find(b"moov"), "MP4 索引必须提前以便在线播放")
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original)
