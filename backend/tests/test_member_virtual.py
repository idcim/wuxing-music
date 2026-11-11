import unittest
from unittest.mock import patch
from xml.etree import ElementTree as ET
import base64
import hashlib
import struct
import time
from types import SimpleNamespace

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app import member_ledger, member_virtual, refund_service
from app.commerce import callbacks
from app.commerce.models import Base as CommerceBase, Job
from app.models import Base, Cdkey, MemberGrant, MemberLedger, Order, Plan, User
from app.models import Setting


class MemberVirtualTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        CommerceBase.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.user = User(openid="openid-1")
        self.plan = Plan(id="month", name="月悦", price=18, duration_days=30,
            virtual_product="music-month", virtual_price_synced=True)
        self.db.add_all([self.user, self.plan])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def order(self, gift=False):
        order = Order(order_no="M202611110001" + str(int(gift)), user_id=self.user.id,
            plan_id="month", plan_name="月悦", amount=18, amount_fen=1800,
            duration_days=30, payment_product="music-month", payer_openid="openid-1",
            provider="virtual", status="pending", is_gift=gift)
        self.db.add(order)
        self.db.commit()
        return order

    def test_membership_settlement_is_idempotent_and_uses_snapshot(self):
        order = self.order()
        self.plan.duration_days = 90
        with patch("app.agent_service.record_commission"):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-1"})
            first_expiry = self.user.membership_expire_at
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-1"})
        self.assertEqual(self.user.membership_expire_at, first_expiry)
        self.assertTrue(29 <= (first_expiry - order.paid_at).days <= 30)
        self.assertEqual(self.db.query(Job).filter_by(kind="member_delivery").count(), 1)

    def test_wrong_amount_cannot_grant(self):
        order = self.order()
        with self.assertRaises(HTTPException):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1799, "transaction_id": "tx-2"})
        self.assertEqual(order.status, "pending")
        self.assertIsNone(self.user.membership_expire_at)

    def test_gift_settlement_issues_one_code_without_granting_buyer(self):
        order = self.order(gift=True)
        with patch("app.agent_service.record_commission"):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-3"})
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-3"})
        self.assertEqual(self.db.query(Cdkey).count(), 1)
        self.assertEqual(self.db.query(Cdkey).one().code, order.gift_code)
        self.assertIsNone(self.user.membership_expire_at)

    def test_channel_order_amount_must_match_before_grant(self):
        order = self.order()
        data = {"order": {"status": 2, "order_id": order.order_no,
            "order_fee": 1800, "paid_fee": 1799, "wx_order_id": "tx"}}
        with patch("app.commerce.providers.virtual_request", return_value=data):
            with self.assertRaises(HTTPException):
                member_virtual.query(self.db, order)

    def test_push_product_and_openid_must_match(self):
        order = self.order()
        data = {"paid": True, "amount_fen": 1800, "transaction_id": "tx"}
        with patch("app.member_virtual.query", return_value=data):
            for openid, product in [("other", "music-month"), ("openid-1", "other")]:
                message = ET.fromstring(f"<xml><OpenId>{openid}</OpenId><GoodsInfo>"
                    f"<ProductId>{product}</ProductId><Quantity>1</Quantity></GoodsInfo></xml>")
                with self.assertRaises(HTTPException):
                    member_virtual.receive(self.db, order, "xpay_goods_deliver_notify", message)
        self.assertEqual(order.status, "pending")

    def test_weapp_purchase_fails_closed_without_virtual_channel(self):
        from app.routers.mp import CreateOrderIn, mp_create_order
        with self.assertRaises(HTTPException) as caught:
            mp_create_order(CreateOrderIn(planId="month", channel="weapp"), self.user, self.db)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.db.query(Order).count(), 0)

    def test_purchase_status_identifies_virtual_channel_to_new_weapp(self):
        from app.routers.mp import mp_purchase_status
        cfg = SimpleNamespace(commerce_virtual_ios_approved=True)
        with patch("app.routers.mp._pay_cfg", return_value={"purchase_enabled": True}), \
                patch("app.member_virtual.ready", return_value=(True, cfg)):
            result = mp_purchase_status("weapp", "android", self.db)
        self.assertEqual(result["data"]["provider"], "virtual")
        self.assertTrue(result["data"]["enabled"])

    def test_virtual_payment_params_require_matching_wechat_identity(self):
        from types import SimpleNamespace
        order = self.order()
        cfg = SimpleNamespace(commerce_virtual_ios_approved=True,
            commerce_virtual_offer_id="offer", commerce_virtual_app_key="app-key")
        response = SimpleNamespace(json=lambda: {"openid": "another-user", "session_key": "session"},
            raise_for_status=lambda: None)
        with patch("app.member_virtual.ready", return_value=(True, cfg)), \
                patch("app.routers.mp._mp_cfg", return_value={"app_id": "app", "app_secret": "secret"}), \
                patch("app.member_virtual.httpx.get", return_value=response):
            with self.assertRaises(HTTPException) as caught:
                member_virtual.create_params(self.db, order, "code", "android")
        self.assertEqual(caught.exception.status_code, 401)
        self.assertFalse(order.refund_credential)

    def test_h5_purchase_keeps_ordinary_payment(self):
        import json
        from app.routers.mp import CreateOrderIn, mp_create_order
        self.user.oa_openid = "oa-user"
        self.db.add(Setting(key="pay_config", value=json.dumps({"enabled": True,
            "wx_mch_id": "merchant", "wx_key_pem": "test-key", "h5_app_id": "oa-app"})))
        self.db.commit()
        with patch("app.routers.mp.wxpay.create_jsapi_order", return_value={"package": "prepay_id=test"}):
            result = mp_create_order(CreateOrderIn(planId="month", channel="h5"), self.user, self.db)
        self.assertEqual(result["data"]["payParams"]["package"], "prepay_id=test")
        self.assertEqual(self.db.query(Order).one().provider, "wxpay")

    def test_virtual_refund_removes_only_its_granted_days(self):
        first = self.order()
        second = Order(order_no="M202611110002", user_id=self.user.id, plan_id="month",
            plan_name="月悦", amount=18, amount_fen=1800, duration_days=30,
            payment_product="music-month", payer_openid="openid-1", provider="virtual", status="pending")
        self.db.add(second)
        self.db.commit()
        with patch("app.agent_service.record_commission"), patch("app.agent_service.void_commission"):
            member_virtual.settle(self.db, first, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-4"})
            member_virtual.settle(self.db, second, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-5"})
            refund_service.finalize_refund(self.db, first, "test")
        self.assertEqual(self.user.membership_type, "month")
        self.assertTrue(29 <= (self.user.membership_expire_at - second.paid_at).days <= 30)

    def test_refunding_earlier_plan_removes_its_days_after_upgrading(self):
        month = self.order()
        year = Order(order_no="M202611110003", user_id=self.user.id, plan_id="year",
            plan_name="年藏", amount=199, amount_fen=19900, duration_days=365,
            payment_product="music-year", payer_openid="openid-1", provider="virtual", status="pending")
        self.db.add(year)
        self.db.commit()
        with patch("app.agent_service.record_commission"), patch("app.agent_service.void_commission"):
            member_virtual.settle(self.db, month, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-month"})
            member_virtual.settle(self.db, year, {"paid": True, "amount_fen": 19900, "transaction_id": "tx-year"})
            refund_service.finalize_refund(self.db, month, "test")
        self.assertEqual(self.user.membership_type, "year")
        self.assertTrue(364 <= (self.user.membership_expire_at - year.paid_at).days <= 365)

    def test_refund_after_cdkey_redeem_preserves_only_cdkey_days(self):
        from starlette.requests import Request
        from app.routers.mp import RedeemIn, mp_redeem
        order = self.order()
        key = Cdkey(code="MIXED-SOURCE-60", plan_type="year", plan_name="年藏", duration_days=60)
        self.db.add(key)
        self.db.commit()
        with patch("app.agent_service.record_commission"), patch("app.agent_service.void_commission"):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-mixed"})
            request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
            mp_redeem(RedeemIn(code=key.code), request, self.user, self.db)
            refund_service.finalize_refund(self.db, order, "test")
        self.assertEqual(self.user.membership_type, "year")
        self.assertEqual(self.user.membership_source, "cdkey")
        self.assertTrue(59 <= (self.user.membership_expire_at - key.used_at).days <= 60)

    def test_reset_archives_grants_so_later_refund_does_not_remove_new_gift(self):
        order = self.order()
        with patch("app.agent_service.record_commission"), patch("app.agent_service.void_commission"):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-reset"})
            member_ledger.reset(self.db, self.user)
            self.user.membership_type, self.user.membership_name = "free", "听闻"
            self.user.membership_expire_at, self.user.membership_source = None, ""
            member_ledger.admin_grant(self.db, self.user, days=15, plan_type="year", plan_name="年藏")
            self.db.commit()
            gifted_expiry = self.user.membership_expire_at
            refund_service.finalize_refund(self.db, order, "test")
        self.assertEqual(self.user.membership_expire_at, gifted_expiry)
        self.assertEqual(self.user.membership_source, "gift")
        self.assertEqual(self.db.query(MemberLedger).count(), 2)
        self.assertIsNotNone(self.db.query(MemberGrant).filter_by(source_ref=str(order.id)).one().revoked_at)

    def test_merge_keeps_later_membership_ledger_for_future_refunds(self):
        from app.user_merge import merge_users
        order = self.order()
        keep = User(openid="keep-openid")
        self.db.add(keep)
        self.db.commit()
        with patch("app.agent_service.record_commission"), patch("app.agent_service.void_commission"):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "tx-merge"})
            merge_users(self.db, keep, self.user)
            self.db.commit()
            refund_service.finalize_refund(self.db, order, "test")
        self.assertEqual(keep.membership_type, "free")
        self.assertIsNone(keep.membership_expire_at)
        self.assertEqual(self.db.query(MemberLedger).filter_by(user_id=keep.id).count(), 1)

    def test_legacy_refund_preserves_new_cdkey_grant(self):
        from datetime import datetime, timedelta
        from starlette.requests import Request
        from app.routers.mp import RedeemIn, mp_redeem
        old = self.order()
        old.provider, old.status = "wxpay", "paid"
        self.user.membership_type, self.user.membership_name = "month", "月悦"
        self.user.membership_source = "purchase"
        self.user.membership_expire_at = datetime.utcnow() + timedelta(days=30)
        key = Cdkey(code="LEGACY-KEY-20", plan_type="year", plan_name="年藏", duration_days=20)
        self.db.add(key)
        self.db.commit()
        request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
        with patch("app.agent_service.void_commission"):
            mp_redeem(RedeemIn(code=key.code), request, self.user, self.db)
            refund_service.finalize_refund(self.db, old, "test")
        self.assertEqual(self.user.membership_source, "cdkey")
        self.assertTrue(19 <= (self.user.membership_expire_at - key.used_at).days <= 20)

    def test_gift_refund_does_not_remove_buyers_own_membership(self):
        gift = self.order(gift=True)
        self.user.membership_type = "month"
        self.user.membership_source = "purchase"
        from datetime import datetime, timedelta
        self.user.membership_expire_at = datetime.utcnow() + timedelta(days=30)
        self.db.commit()
        with patch("app.agent_service.void_commission"):
            refund_service.finalize_refund(self.db, gift, "test")
        self.assertEqual(self.user.membership_type, "month")

    def test_signed_virtual_push_settles_member_order_through_shared_callback(self):
        order = self.order()
        key = b"0123456789abcdef0123456789abcdef"
        token, appid = "synthetic-token", "synthetic-appid"
        message = ET.tostring(ET.fromstring(f"<xml><Event>xpay_goods_deliver_notify</Event>"
            f"<OutTradeNo>{order.order_no}</OutTradeNo><OpenId>openid-1</OpenId>"
            "<GoodsInfo><ProductId>music-month</ProductId><Quantity>1</Quantity></GoodsInfo></xml>"))
        plain = b"0123456789abcdef" + struct.pack("!I", len(message)) + message + appid.encode()
        pad = 32 - len(plain) % 32
        encryptor = Cipher(algorithms.AES(key), modes.CBC(key[:16])).encryptor()
        encrypted = base64.b64encode(encryptor.update(plain + bytes([pad]) * pad) + encryptor.finalize()).decode()
        raw = ET.tostring(ET.fromstring(f"<xml><Encrypt>{encrypted}</Encrypt></xml>"))
        timestamp, nonce = str(int(time.time())), "synthetic-nonce"
        signature = hashlib.sha1("".join(sorted([token, timestamp, nonce, encrypted])).encode()).hexdigest()
        params = {"timestamp": timestamp, "nonce": nonce, "msg_signature": signature}
        cfg = SimpleNamespace(commerce_push_token=token, commerce_push_aes_key=base64.b64encode(key).decode().rstrip("="))
        paid = {"paid": True, "amount_fen": 1800, "transaction_id": "tx-push"}
        with patch("app.commerce.callbacks.resolve", return_value=cfg), \
                patch("app.commerce.callbacks._mp_cfg", return_value={"app_id": appid}), \
                patch("app.member_virtual.query", return_value=paid), \
                patch("app.agent_service.record_commission"):
            response = callbacks.accept_virtual(raw, params, self.db)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(order.status, "paid")
            expiry = self.user.membership_expire_at
            callbacks.accept_virtual(raw, params, self.db)
            self.assertEqual(self.user.membership_expire_at, expiry)
            with self.assertRaises(HTTPException):
                callbacks.accept_virtual(raw, {**params, "msg_signature": "bad"}, self.db)

    def test_channel_initiated_full_refund_revokes_member_once(self):
        order = self.order()
        order.payment_platform = "ios"
        with patch("app.agent_service.record_commission"), patch("app.agent_service.void_commission"):
            member_virtual.settle(self.db, order, {"paid": True, "amount_fen": 1800, "transaction_id": "apple-tx"})
            message = ET.fromstring("<xml><OpenId>openid-1</OpenId></xml>")
            result = {"refunded": True, "transaction_id": "apple-tx"}
            with patch("app.member_virtual.query", return_value=result):
                member_virtual.receive(self.db, order, "xpay_refund_notify", message)
                member_virtual.receive(self.db, order, "xpay_refund_notify", message)
        self.assertEqual(order.status, "refunded")
        self.assertEqual(self.user.membership_type, "free")
        self.assertEqual(order.refund_amount, 18)


class MemberMigrationTests(unittest.TestCase):
    def test_existing_music_orders_keep_ordinary_provider(self):
        from app import main
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE app_order (id INTEGER PRIMARY KEY, order_no VARCHAR(64), amount FLOAT)"))
            conn.execute(text("INSERT INTO app_order (id, order_no, amount) VALUES (1, 'OLD', 18)"))
            conn.execute(text("CREATE TABLE plan (id VARCHAR(16) PRIMARY KEY, price FLOAT)"))
            conn.execute(text("INSERT INTO plan (id, price) VALUES ('month', 18)"))
        with patch.object(main, "engine", engine):
            main._auto_migrate()
        self.assertIn("provider", {c["name"] for c in inspect(engine).get_columns("app_order")})
        with engine.connect() as conn:
            self.assertEqual(conn.execute(text("SELECT provider FROM app_order WHERE id=1")).scalar(), "wxpay")
            self.assertEqual(conn.execute(text("SELECT virtual_price_synced FROM plan WHERE id='month'")).scalar(), 0)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
