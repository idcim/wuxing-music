"""只读配置自检：仅用合成值，不查询支付、OSS 或物流渠道。"""
import json
from types import SimpleNamespace
from unittest.mock import patch

from app.config import settings
from app.models import Role, Setting
from app.security import get_current_admin
from app.commerce import configuration_check
from app.commerce.models import SchemaVersion, SCHEMA_VERSION

PATH = "/api/admin/commerce/configuration-check"


class ConfigurationCases:
    def test_configuration_report_has_only_presence_and_preserves_configuration(self):
        marker = "synthetic-configuration-value-never-return"
        server_fields = ["commerce_public_base", "commerce_wxpay_public_key", "commerce_wxpay_public_key_id",
            "commerce_virtual_offer_id", "commerce_virtual_app_key", "commerce_push_token", "commerce_push_aes_key",
            "commerce_private_endpoint", "commerce_private_bucket", "commerce_private_key_id", "commerce_private_key_secret"]
        with self.sessions() as db:
            db.add(Setting(key="mp_config", value=json.dumps({"app_id": marker, "app_secret": marker})))
            db.add(Setting(key="pay_config", value=json.dumps({"enabled": True, **dict.fromkeys(
                ["wx_mch_id", "wx_key_pem", "wx_cert_serial", "wx_api_key"], marker)})))
            db.commit()
        with patch.multiple(settings, **dict.fromkeys(server_fields, marker), commerce_virtual_approved=True,
                            commerce_virtual_ios_approved=False, commerce_shipping_approved=True), \
             patch.object(configuration_check, "logistics_account", return_value={"source": "admin", "enabled": False,
                                                                                   "customer": marker, "key": marker}):
            with self.sessions() as db:
                before = [(row.key, row.value) for row in db.query(Setting).order_by(Setting.key)]
            response = self.client.get(PATH)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn(marker, response.text)
            data = response.json()["data"]
            self.assertFalse(data["verified_external"])
            groups = {row["key"]: row for row in data["groups"]}
            for key in ["physical_payment", "course_payment", "private_media", "shipping"]:
                self.assertTrue(groups[key]["complete"])
            self.assertFalse(groups["course_ios"]["complete"])
            self.assertFalse(groups["logistics"]["complete"])
            for group in groups.values():
                for check in group["checks"]:
                    self.assertEqual(set(check), {"name", "present", "source"})
                    self.assertIsInstance(check["present"], bool)
            with self.sessions() as db:
                self.assertEqual([(row.key, row.value) for row in db.query(Setting).order_by(Setting.key)], before)

    def test_configuration_report_identifies_missing_flags_and_is_admin_only_before_migration(self):
        with self.sessions() as db:
            db.delete(db.get(SchemaVersion, SCHEMA_VERSION))
            db.add(Role(id=99, name="配置只读拒绝", permissions=json.dumps(["commerce:view"])))
            db.commit()
        with patch.object(settings, "commerce_virtual_approved", False), \
             patch.object(settings, "commerce_private_bucket", ""):
            response = self.client.get(PATH)
            self.assertEqual(response.status_code, 200)
            groups = {row["key"]: row for row in response.json()["data"]["groups"]}
            course = {row["name"]: row["present"] for row in groups["course_payment"]["checks"]}
            media = {row["name"]: row["present"] for row in groups["private_media"]["checks"]}
            self.assertFalse(course["COMMERCE_VIRTUAL_APPROVED"])
            self.assertFalse(media["COMMERCE_PRIVATE_BUCKET"])
        self.app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(is_super=False, role_id=99, username="readonly")
        self.assertEqual(self.client.get(PATH).status_code, 403)
        self.assertEqual(self.client.get("/api/mp/v2/configuration-check").status_code, 404)
