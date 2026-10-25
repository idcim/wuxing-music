"""快递100查询使用合成运单及传输替身，不发送真实收件信息或产生查询费用。"""
import hashlib
import json
from contextlib import contextmanager
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from sqlalchemy import update

from app.routers.mp import get_current_user
from app.commerce import common, logistics
from app.commerce.migrate import upgrade
from app.commerce.models import Event, LogisticsQuery, Order, SchemaVersion, Shipment


class LogisticsCases:
    @contextmanager
    def logistics_config(self):
        with patch.object(logistics.settings, "commerce_logistics_customer", "synthetic-customer"), \
             patch.object(logistics.settings, "commerce_logistics_key", "synthetic-key"), \
             patch.object(logistics.settings, "commerce_logistics_provider", "kuaidi100"), \
             patch.object(logistics.settings, "commerce_logistics_carriers", {}):
            yield

    def logistics_order(self, key="logistics-order", number="SF12345678", phone="13800000000"):
        response = self.order(key=f"tracking-{key}").json()["data"]
        ident = response["id"]
        self.paid(ident)
        with self.sessions() as db:
            order = db.get(Order, ident)
            order.fulfillment = "shipped"
            order.address = {**order.address, "phone": phone}
            row = Shipment(order_id=ident, carrier="SF", tracking_no=number, sync_state="synced")
            db.add(row); db.commit()
            return ident, row.id

    def logistics_response(self, number="SF12345678", state="3", **overrides):
        value = {"status": "200", "com": "shunfeng", "nu": number, "state": state,
                 "data": [{"time": "2026-10-26 10:00:00", "context": "合成签收轨迹"}], **overrides}
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: value)

    def expire_logistics_queries(self):
        with self.sessions() as db:
            db.execute(update(LogisticsQuery).values(next_query_at=datetime.utcnow() - timedelta(seconds=1)))
            db.commit()

    def test_logistics_signs_server_snapshot_and_caches_without_confirming_receipt(self):
        ident, _ = self.logistics_order()
        def send(url, data, timeout):
            self.assertEqual((url, timeout), (logistics.ENDPOINT, 15))
            param = json.loads(data["param"])
            self.assertEqual((param["com"], param["num"], param["phone"]), ("shunfeng", "SF12345678", "13800000000"))
            expected = hashlib.md5((data["param"] + "synthetic-key" + "synthetic-customer").encode()).hexdigest().upper()
            self.assertEqual(data["sign"], expected)
            return self.logistics_response()
        with self.logistics_config(), patch.object(logistics.httpx, "post", side_effect=send) as post:
            first = self.client.get(f"/api/mp/v2/orders/{ident}/logistics")
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json()["data"]["trace"]["state_label"], "已签收")
            again = self.client.get(f"/api/mp/v2/orders/{ident}/logistics")
            self.assertTrue(again.json()["data"]["trace"]["cached"])
            self.assertEqual(post.call_count, 1)
            self.assertTrue(self.client.get("/api/mp/v2/config").json()["data"]["capabilities"]["logistics"])
        with self.sessions() as db:
            self.assertEqual(db.get(Order, ident).fulfillment, "shipped")
            serialized = json.dumps([event.detail for event in db.query(Event)], ensure_ascii=False)
            self.assertNotIn("synthetic-key", serialized)

    def test_logistics_owner_and_configuration_are_checked_before_external_request(self):
        ident, _ = self.logistics_order()
        with patch.object(logistics.httpx, "post", side_effect=AssertionError("不得访问服务商")):
            with patch.object(logistics.settings, "commerce_logistics_key", ""):
                self.assertEqual(self.client.get(f"/api/mp/v2/orders/{ident}/logistics").status_code, 409)
                body = self.client.get("/api/mp/v2/config").json()["data"]
                self.assertFalse(body["capabilities"]["logistics"])
                self.assertNotIn("commerce_logistics_key", json.dumps(body))
            self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2)
            self.assertEqual(self.client.get(f"/api/mp/v2/orders/{ident}/logistics").status_code, 404)

    def test_logistics_failure_preserves_previous_result_without_leaking_provider_error(self):
        ident, _ = self.logistics_order()
        with self.logistics_config(), patch.object(logistics.httpx, "post", return_value=self.logistics_response()):
            self.assertEqual(self.client.get(f"/api/mp/v2/orders/{ident}/logistics").status_code, 200)
        self.expire_logistics_queries()
        with self.logistics_config(), patch.object(logistics.httpx, "post", side_effect=httpx.ReadTimeout("synthetic-key secret-url phone")) as post:
            response = self.client.get(f"/api/mp/v2/orders/{ident}/logistics")
            trace = response.json()["data"]["trace"]
            self.assertTrue(trace["error"])
            self.assertEqual(trace["events"][0]["context"], "合成签收轨迹")
            self.assertNotIn("synthetic-key", response.text)
            self.client.get(f"/api/mp/v2/orders/{ident}/logistics")
            self.assertEqual(post.call_count, 1)
        with self.sessions() as db:
            failure = db.query(Event).filter_by(action="logistics_query_failed").one()
            self.assertEqual(failure.detail["reason"], "network_error")

    def test_logistics_empty_invalid_and_wrong_waybill_never_become_fake_transit(self):
        ident, _ = self.logistics_order()
        for result in ({"status": "500"}, {"status": "503", "message": "synthetic-key"},
                       {"nu": "OTHER12345"}, {"data": []}, {"data": "invalid"}):
            self.expire_logistics_queries()
            with self.subTest(result=result), self.logistics_config(), patch.object(logistics.httpx, "post", return_value=self.logistics_response(**result)):
                response = self.client.get(f"/api/mp/v2/orders/{ident}/logistics")
                trace = response.json()["data"]["trace"]
                self.assertEqual(trace["events"], [])
                self.assertNotEqual(trace["state_label"], "运输中")
                self.assertNotIn("synthetic-key", response.text)

    def test_logistics_account_limit_and_waybill_limit_are_persistent_and_private(self):
        first, _ = self.logistics_order(key="one")
        same, _ = self.logistics_order(key="same", phone="13900000000")
        other, _ = self.logistics_order(key="other", number="SF87654321")
        instant = datetime.utcnow()
        clock = SimpleNamespace(utcnow=lambda: instant)
        with self.logistics_config(), patch.object(logistics, "datetime", clock), patch.object(logistics.httpx, "post", return_value=self.logistics_response()) as post:
            self.client.get(f"/api/mp/v2/orders/{first}/logistics")
            trace = self.client.get(f"/api/mp/v2/orders/{same}/logistics").json()["data"]["trace"]
            self.assertEqual(trace["events"], [])
            self.assertIn("查询间隔", trace["message"])
            trace = self.client.get(f"/api/mp/v2/orders/{other}/logistics").json()["data"]["trace"]
            self.assertIn("繁忙", trace["message"])
            self.assertEqual(post.call_count, 1)

    def test_logistics_old_response_cannot_overwrite_new_claim_or_changed_waybill(self):
        ident, shipment_id = self.logistics_order()
        def changed(*args, **kwargs):
            with self.sessions() as db:
                db.get(Shipment, shipment_id).tracking_no = "NEW12345678"
                row = db.get(LogisticsQuery, f"shipment:{shipment_id}")
                row.token, row.data = "replacement-claim", {"events": [{"time": "new", "context": "新查询结果"}]}
                db.commit()
            return self.logistics_response()
        with self.logistics_config(), patch.object(logistics.httpx, "post", side_effect=changed):
            self.assertEqual(self.client.get(f"/api/mp/v2/orders/{ident}/logistics").status_code, 409)
        with self.sessions() as db:
            row = db.get(LogisticsQuery, f"shipment:{shipment_id}")
            self.assertEqual(row.token, "replacement-claim")
            self.assertEqual(row.data["events"][0]["context"], "新查询结果")

    def test_v3_upgrade_adds_logistics_cache_and_preserves_media_and_orders(self):
        ident, _ = self.logistics_order()
        with self.sessions() as db:
            db.delete(db.get(SchemaVersion, 4)); db.commit()
        LogisticsQuery.__table__.drop(self.engine)
        self.assertFalse(self.client.get("/api/admin/commerce/status").json()["data"]["migrated"])
        upgrade(self.engine); upgrade(self.engine)
        with self.sessions() as db:
            self.assertTrue(common.migrated(db))
            self.assertEqual(db.query(LogisticsQuery).count(), 0)
            self.assertEqual(db.get(Order, ident).fulfillment, "shipped")
            self.assertIsNotNone(db.get(SchemaVersion, 3))
