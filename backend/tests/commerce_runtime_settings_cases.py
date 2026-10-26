"""渠道配置只用合成凭证，验证 API/Worker 同源读取与敏感值边界。"""
import base64
import hashlib
import hmac
import json
import sys
import time
from types import SimpleNamespace
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import HTTPException

from app.config import settings
from app.models import Role, Setting
from app.security import get_current_admin
from app.commerce import logistics, providers, shipping, runtime_settings as channel
from app.commerce.models import Event, Shipment, SchemaVersion, SCHEMA_VERSION

PATH = "/api/admin/commerce/channel/settings"


class RuntimeSettingsCases:
    def channel_data(self, revision=0):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.channel_rsa = key
        return dict(revision=revision, public_base="https://api.example.test", wxpay_public_key_id="PUB_KEY_ID_TEST",
            wxpay_public_key=key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode(),
            virtual_approved=True, virtual_ios_approved=True, virtual_offer_id="123456789",
            virtual_app_key="synthetic-virtual-key-never-echo", push_token="synthetic-push-token-never-echo",
            push_aes_key=base64.b64encode(b"S" * 32).decode().rstrip("="),
            private_endpoint="https://oss-cn-hangzhou.aliyuncs.com", private_bucket="private-course-test",
            private_key_id="synthetic-access-id-never-echo", private_key_secret="synthetic-oss-secret-never-echo",
            shipping_approved=True)

    def channel_save(self, data):
        response = self.client.post(PATH, json=data)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["data"]

    def channel_form(self):
        data = self.client.get(PATH).json()["data"]
        return {"revision": data["revision"], **{field["name"]: field["value"] for field in data["fields"]}}

    def test_channel_secrets_encrypted_and_shared_across_sessions_without_mutating_environment(self):
        body = self.channel_data()
        before = settings.commerce_virtual_app_key
        result = self.channel_save(body)
        self.assertEqual(result["source"], "admin")
        self.assertEqual(result["revision"], 1)
        with self.sessions() as db:
            raw = db.get(Setting, channel.SETTING_KEY).value
            audit = json.dumps([event.detail for event in db.query(Event)])
            for name in channel.SECRETS:
                self.assertNotIn(body[name], raw)
                self.assertNotIn(body[name], json.dumps(result))
                self.assertNotIn(body[name], audit)
            self.assertTrue(all(providers.capabilities(db)[name] for name in (
                "physical_payment", "course_payment", "course_ios", "private_media", "shipping")))
            self.assertEqual(channel.resolve(db).commerce_virtual_app_key, body["virtual_app_key"])
        self.assertEqual(settings.commerce_virtual_app_key, before)
        public = self.client.get("/api/mp/v2/config").text
        for name in channel.SECRETS:
            self.assertNotIn(body[name], public)

    def test_channel_blank_preserves_clear_disables_and_stale_write_rejected(self):
        body = self.channel_data()
        self.channel_save(body)
        blank = self.channel_form()
        self.channel_save(blank)
        self.assertEqual(self.client.post(PATH, json=blank).status_code, 409)
        clear = self.channel_form()
        clear["clear_fields"] = ["private_key_secret"]
        self.channel_save(clear)
        with patch.object(settings, "commerce_private_key_secret", "environment-must-not-return"), self.sessions() as db:
            self.assertEqual(channel.resolve(db).commerce_private_key_secret, "")
            self.assertFalse(providers.capabilities(db)["private_media"])
            self.assertEqual(channel.resolve(db).commerce_virtual_app_key, body["virtual_app_key"])

    def test_channel_permission_and_before_migration_access(self):
        with self.sessions() as db:
            db.delete(db.get(SchemaVersion, SCHEMA_VERSION))
            db.add(Role(id=98, name="view-only", permissions=json.dumps(["commerce:view"])))
            db.commit()
        self.channel_save(self.channel_data())
        self.app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(is_super=False, role_id=98, username="viewer")
        self.assertEqual(self.client.get(PATH).status_code, 403)
        self.assertEqual(self.client.post(PATH, json={}).status_code, 403)
        self.assertEqual(self.client.get("/api/mp/v2/channel/settings").status_code, 404)

    def test_channel_validation_never_echoes_input_and_rejects_unsafe_endpoints(self):
        marker = "synthetic-sensitive-input-never-return"
        body = self.channel_data()
        for changes in ({"virtual_app_key": marker * 100}, {"unknown": marker}, {"private_endpoint": "http://127.0.0.1"},
                        {"public_base": "https://user:password@example.test"}, {"public_base": "https://example.test/path"},
                        {"wxpay_public_key": marker}, {"push_aes_key": marker}, {"virtual_approved": "true"}):
            response = self.client.post(PATH, json={**body, **changes})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertNotIn(marker, response.text)
        response = self.client.post(PATH, content=marker * 2000, headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(marker, response.text)

    def test_channel_key_rotation_fails_closed_and_can_be_repaired(self):
        body = self.channel_data()
        self.channel_save(body)
        with patch.object(settings, "jwt_secret", "different-encryption-root"):
            data = self.client.get(PATH).json()["data"]
            self.assertTrue(data["error"])
            with self.sessions() as db:
                self.assertFalse(providers.capabilities(db)["course_payment"])
                self.assertEqual(channel.resolve(db).commerce_virtual_app_key, "")
            self.channel_save({**body, "revision": 1})
            self.assertFalse(self.client.get(PATH).json()["data"]["error"])

    def test_channel_cannot_switch_storage_or_offer_with_existing_business_data(self):
        self.channel_save(self.channel_data())
        form = self.channel_form()
        for changes in ({"private_bucket": "another-private-bucket"}, {"private_endpoint": "https://oss-cn-beijing.aliyuncs.com"}):
            self.assertEqual(self.client.post(PATH, json={**form, **changes}).status_code, 409)
        self.assertEqual(self.order(kind="course").status_code, 200)
        self.assertEqual(self.client.post(PATH, json={**form, "virtual_offer_id": "987654321"}).status_code, 409)

    def test_channel_database_keys_drive_notification_and_push_verification(self):
        self.channel_save(self.channel_data())
        timestamp, body = str(int(time.time())), b'{"synthetic":true}'
        signed = timestamp.encode() + b"\nnonce\n" + body + b"\n"
        headers = {"wechatpay-timestamp": timestamp, "wechatpay-nonce": "nonce", "wechatpay-serial": "PUB_KEY_ID_TEST",
            "wechatpay-signature": base64.b64encode(self.channel_rsa.sign(signed, padding.PKCS1v15(), hashes.SHA256())).decode()}
        with self.sessions() as db:
            providers.verify_notification(headers, body, db)
            with self.assertRaises(HTTPException):
                providers.verify_notification(headers, body + b"tamper", db)
        token = "synthetic-push-token-never-echo"
        signature = hashlib.sha1("".join(sorted([token, timestamp, "nonce"])).encode()).hexdigest()
        response = self.client.get("/api/mp/v2/callbacks/virtual", params={"timestamp": timestamp, "nonce": "nonce", "signature": signature, "echostr": "challenge"})
        self.assertEqual((response.status_code, response.text), (200, "challenge"))

    def test_channel_worker_provider_requests_use_saved_credentials_and_flags(self):
        body = self.channel_data()
        self.channel_save(body)
        fake = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"errcode": 0})
        with self.sessions() as db, patch.object(providers, "_get_access_token", return_value="synthetic-token"), \
                patch.object(shipping, "_get_access_token", return_value="synthetic-token"), patch("httpx.post", return_value=fake) as post:
            providers.virtual_request(db, "/xpay/query_order", {"env": 0})
            args = post.call_args.kwargs
            expected = hmac.new(body["virtual_app_key"].encode(), ("/xpay/query_order&" + args["content"].decode()).encode(), hashlib.sha256).hexdigest()
            self.assertEqual(args["params"]["pay_sig"], expected)
            shipping.call(db, "wxa/sec/order/get_order", {"transaction_id": "synthetic"})
        form = self.channel_form()
        self.channel_save({**form, "shipping_approved": False})
        with self.sessions() as db, patch("httpx.post", side_effect=AssertionError("disabled shipping must not call provider")):
            with self.assertRaises(HTTPException):
                shipping.call(db, "wxa/sec/order/get_order", {})

    def test_channel_database_oss_drives_upload_policy_and_private_playback(self):
        body = self.channel_data()
        self.channel_save(body)
        store = SimpleNamespace(get_bucket_acl=lambda: SimpleNamespace(acl="private"),
            head_object=lambda key: SimpleNamespace(headers={}), get_object_acl=lambda key: SimpleNamespace(acl="private"),
            sign_url=lambda *args, **kwargs: "https://private.example.test/synthetic-signed")
        auth, bucket = Mock(), Mock(return_value=store)
        with patch.dict(sys.modules, {"oss2": SimpleNamespace(Auth=auth, Bucket=bucket)}):
            response = self.client.post("/api/admin/commerce/media/sign", json={"name": "lesson.mp4", "kind": "video"})
            self.assertEqual(response.status_code, 200, response.text)
            ticket = response.json()["data"]
            self.assertEqual(ticket["host"], "https://private-course-test.oss-cn-hangzhou.aliyuncs.com")
            expected = base64.b64encode(hmac.new(body["private_key_secret"].encode(), ticket["fields"]["policy"].encode(), hashlib.sha1).digest()).decode()
            self.assertEqual(ticket["fields"]["Signature"], expected)
            self.assertEqual(self.client.get("/api/mp/v2/lessons/101/play").json()["data"]["url"], "https://private.example.test/synthetic-signed")
            auth.assert_called_with(body["private_key_id"], body["private_key_secret"])
            self.assertEqual(bucket.call_args.args[1:], (body["private_endpoint"], body["private_bucket"]))

    def test_channel_reuses_music_callback_domain_and_does_not_modify_music_or_sales(self):
        pay = {"notify_url": "https://music.example.test/api/mp/pay/callback", "wx_mch_id": "synthetic-existing"}
        with self.sessions() as db:
            db.add(Setting(key="pay_config", value=json.dumps(pay)))
            sales = db.get(Setting, "commerce_config").value
            db.commit()
        before = self.client.get(PATH).json()["data"]
        self.assertEqual(next(field["value"] for field in before["fields"] if field["name"] == "public_base"), "https://music.example.test")
        self.channel_save(self.channel_data())
        with self.sessions() as db:
            self.assertEqual(json.loads(db.get(Setting, "pay_config").value), pay)
            self.assertEqual(db.get(Setting, "commerce_config").value, sales)

    def test_channel_custom_carrier_mapping_uses_database_and_validates_shape(self):
        self.channel_save({**self.channel_data(), "logistics_carriers": '{"CUSTOM":"shunfeng"}'})
        ident, shipment_id = self.logistics_order()
        with self.sessions() as db:
            db.get(Shipment, shipment_id).carrier = "CUSTOM"
            db.commit()
        with self.logistics_config(), patch.object(logistics.httpx, "post", return_value=self.logistics_response()) as post:
            response = self.client.get(f"/api/mp/v2/orders/{ident}/logistics")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(json.loads(post.call_args.kwargs["data"]["param"])["com"], "shunfeng")
        form = self.channel_form()
        self.assertEqual(self.client.post(PATH, json={**form, "logistics_carriers": '["invalid"]'}).status_code, 422)

    def test_channel_existing_environment_bucket_can_move_to_admin_without_changing_location(self):
        with patch.object(settings, "commerce_private_bucket", "private-course-test"), \
                patch.object(settings, "commerce_private_endpoint", "oss-cn-hangzhou.aliyuncs.com"):
            self.channel_save(self.channel_data())

    def test_channel_long_history_does_not_overflow_mysql_text_or_drop_current_credentials(self):
        body = self.channel_data()
        self.channel_save(body)
        form = self.channel_form()
        with self.sessions() as db:
            row = db.get(Setting, channel.SETTING_KEY)
            payload = json.loads(row.value)
            payload["history"] = []
            while len(json.dumps(payload, ensure_ascii=False).encode()) < 61000:
                payload["history"].append({"operator": "合成审计" * 20, "fields_changed": sorted(channel.NAMES)})
            row.value = json.dumps(payload, ensure_ascii=False)
            db.commit()
        self.channel_save(form)
        with self.sessions() as db:
            self.assertLessEqual(len(db.get(Setting, channel.SETTING_KEY).value.encode()), 60000)
            self.assertEqual(channel.resolve(db).commerce_virtual_app_key, body["virtual_app_key"])
