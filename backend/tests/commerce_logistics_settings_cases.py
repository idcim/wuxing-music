"""后台物流凭证配置回归：仅合成密钥，禁止访问真实快递100。"""
import hashlib
import json
from types import SimpleNamespace
from unittest.mock import patch

from app.config import settings
from app.models import Role, Setting
from app.security import get_current_admin
from app.commerce import logistics, logistics_settings
from app.commerce.migrate import upgrade
from app.commerce.models import Event, SCHEMA_VERSION, SchemaVersion

PATH = "/api/admin/commerce/logistics/settings"


class LogisticsSettingsCases:
    def logistics_account_body(self, revision=0, **updates):
        return {"enabled": True, "customer": "db-customer-synthetic", "key": "db-key-synthetic", "revision": revision, **updates}

    def test_logistics_admin_account_is_encrypted_masked_and_used_immediately(self):
        with self.logistics_config():
            response = self.client.post(PATH, json=self.logistics_account_body())
            self.assertEqual(response.status_code, 200, response.text)
            value = response.json()["data"]
            self.assertTrue(value["configured"])
            self.assertTrue(value["key_set"])
            self.assertEqual((value["customer"], value["key"]), ("", ""))
            self.assertNotIn("db-key-synthetic", self.client.get(PATH).text)
            public = self.client.get("/api/mp/v2/config")
            self.assertTrue(public.json()["data"]["capabilities"]["logistics"])
            self.assertNotIn("db-customer-synthetic", public.text)
            self.assertNotIn("db-key-synthetic", public.text)
            with self.sessions() as db:
                raw = db.get(Setting, logistics_settings.SETTING_KEY).value
                self.assertNotIn("db-key-synthetic", raw)
                self.assertNotIn("db-customer-synthetic", raw)
                self.assertEqual(json.loads(raw)["history"][-1]["operator"], "tester")
                self.assertEqual(db.query(Event).filter_by(action="logistics_account_saved").one().operator, "tester")
            ident, _ = self.logistics_order()
            def send(url, data, timeout):
                self.assertEqual(data["customer"], "db-customer-synthetic")
                expected = hashlib.md5((data["param"] + "db-key-synthetic" + data["customer"]).encode()).hexdigest().upper()
                self.assertEqual(data["sign"], expected)
                return self.logistics_response()
            with patch.object(logistics.httpx, "post", side_effect=send):
                self.assertEqual(self.client.get(f"/api/mp/v2/orders/{ident}/logistics").status_code, 200)

    def test_logistics_blank_preserves_keys_and_disable_overrides_environment(self):
        with self.logistics_config():
            self.assertEqual(self.client.post(PATH, json=self.logistics_account_body()).status_code, 200)
            changed = self.client.post(PATH, json=self.logistics_account_body(1, customer="", key="", enabled=False))
            self.assertEqual(changed.status_code, 200, changed.text)
            self.assertFalse(changed.json()["data"]["configured"])
            with self.sessions() as db:
                account = logistics_settings.load(db)
                self.assertEqual(account["key"], "db-key-synthetic")
                self.assertFalse(account["enabled"])
            self.assertFalse(self.client.get("/api/mp/v2/config").json()["data"]["capabilities"]["logistics"])
            ident, _ = self.logistics_order()
            with patch.object(logistics.httpx, "post", side_effect=AssertionError("已关闭不能调用")):
                self.assertEqual(self.client.get(f"/api/mp/v2/orders/{ident}/logistics").status_code, 409)
            stale = self.client.post(PATH, json=self.logistics_account_body(1))
            self.assertEqual(stale.status_code, 409)
            rotated = self.client.post(PATH, json=self.logistics_account_body(2, customer="", key="rotated-synthetic-key"))
            self.assertEqual(rotated.status_code, 200, rotated.text)
            with self.sessions() as db:
                self.assertEqual(logistics_settings.load(db)["customer"], "db-customer-synthetic")
            incomplete = self.client.post(PATH, json=self.logistics_account_body(3, customer="another-customer", key=""))
            self.assertEqual(incomplete.status_code, 409)

    def test_logistics_config_validation_and_permissions_never_echo_credentials(self):
        secret = "do-not-echo-secret"
        for body in ({**self.logistics_account_body(), "key": secret + "\ninvalid"},
                     {**self.logistics_account_body(), "key": secret, "unknown": True},
                     {"enabled": True, "customer": secret, "key": secret, "revision": "bad"},
                     [secret], {**self.logistics_account_body(), "key": secret * 900}):
            response = self.client.post(PATH, json=body)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn(secret, response.text)
        with self.sessions() as db:
            db.add(Role(id=99, name="物流只读", permissions=json.dumps(["commerce:view"])))
            db.commit()
        self.app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(is_super=False, role_id=99, username="readonly")
        self.assertEqual(self.client.get(PATH).status_code, 403)
        self.assertEqual(self.client.post(PATH, json=self.logistics_account_body()).status_code, 403)
        with self.sessions() as db:
            self.assertIsNone(db.get(Setting, logistics_settings.SETTING_KEY))

    def test_logistics_account_can_be_saved_before_commerce_initialization(self):
        with self.sessions() as db:
            db.delete(db.get(SchemaVersion, SCHEMA_VERSION)); db.commit()
        Event.__table__.drop(self.engine)
        try:
            self.assertEqual(self.client.get(PATH).status_code, 200)
            saved = self.client.post(PATH, json=self.logistics_account_body())
            self.assertEqual(saved.status_code, 200, saved.text)
            status = self.client.get("/api/admin/commerce/status").json()["data"]
            self.assertFalse(status["migrated"])
            self.assertTrue(status["capabilities"]["logistics"])
            with self.sessions() as db:
                history = json.loads(db.get(Setting, logistics_settings.SETTING_KEY).value)["history"]
                self.assertEqual(history[-1]["revision"], 1)
        finally:
            upgrade(self.engine)

    def test_logistics_cipher_rotation_fails_closed_and_can_be_repaired_in_admin(self):
        self.client.post(PATH, json=self.logistics_account_body())
        with patch.object(settings, "jwt_secret", "different-synthetic-server-key"):
            response = self.client.get(PATH).json()["data"]
            self.assertFalse(response["configured"])
            self.assertTrue(response["error"])
            self.assertFalse(self.client.get("/api/mp/v2/config").json()["data"]["capabilities"]["logistics"])
            fixed = self.client.post(PATH, json=self.logistics_account_body(response["revision"]))
            self.assertEqual(fixed.status_code, 200, fixed.text)
            self.assertTrue(fixed.json()["data"]["configured"])
