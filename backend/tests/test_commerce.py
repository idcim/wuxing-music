"""交易回归仅使用临时 SQLite、临时文件与伪造渠道响应，不接触实际资金或配置数据库。"""
import base64
import io
import json
import os
import sys
import uuid
import hashlib
import math
import shutil
import struct
import wave
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable
from PIL import Image

from app.database import Base as LegacyBase, get_db
from app.models import Role, Setting, User
from app.security import get_current_admin
from app.routers.mp import get_current_user
from app.commerce import admin, aftersales, attachments, callbacks, catalog, common, lifecycle, providers, public, schemas, trading, worker
from app.commerce.migrate import upgrade
from app.commerce.models import Address, AfterSale, Base, Course, Enrollment, Job, Lesson, MediaAsset, Order, OrderItem, Payment, Product, Progress, Sku


class CommerceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mysql_engine = None
        test_mysql = os.getenv("COMMERCE_TEST_MYSQL_URL", "")
        if not test_mysql:
            return
        url = make_url(test_mysql)
        if url.host not in ("127.0.0.1", "localhost") or url.database != "wuxing_v2_test":
            raise RuntimeError("仅允许显式指定本机一次性 wuxing_v2_test 测试实例")
        cls.mysql_database = "wuxing_v2_test_" + uuid.uuid4().hex
        cls.mysql_admin = create_engine(url.set(database=None))
        with cls.mysql_admin.begin() as connection:
            connection.execute(text(f"CREATE DATABASE `{cls.mysql_database}` CHARACTER SET utf8mb4"))
        cls.mysql_engine = create_engine(url.set(database=cls.mysql_database))
        LegacyBase.metadata.create_all(cls.mysql_engine)
        upgrade(cls.mysql_engine)

    @classmethod
    def tearDownClass(cls):
        if cls.mysql_engine:
            cls.mysql_engine.dispose()
            with cls.mysql_admin.begin() as connection:
                connection.execute(text(f"DROP DATABASE `{cls.mysql_database}`"))
            cls.mysql_admin.dispose()

    def setUp(self):
        from app import ratelimit
        with ratelimit._lock:
            ratelimit._hits.clear()
        self.tmp = tempfile.TemporaryDirectory()
        test_mysql = os.getenv("COMMERCE_TEST_MYSQL_URL", "")
        if test_mysql:
            self.engine = self.mysql_engine
            with self.engine.begin() as connection:
                connection.execute(text("SET FOREIGN_KEY_CHECKS=0"))
                try:
                    for table in [*Base.metadata.tables.values(), *LegacyBase.metadata.tables.values()]:
                        connection.execute(table.delete())
                finally:
                    connection.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        else:
            self.engine = create_engine(f"sqlite:///{self.tmp.name}/commerce.db", connect_args={"check_same_thread": False})
            LegacyBase.metadata.create_all(self.engine)
        upgrade(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        with self.sessions() as db:
            db.add_all([User(id=1, openid="test-openid"), User(id=2, openid="other-openid")])
            db.flush()
            db.add(Setting(key="commerce_config", value=json.dumps({**common.DEFAULTS,
                "courses_visible": True, "shop_visible": True, "courses_sale": True, "shop_sale": True,
                "provinces": ["湖北省"], "shipping_fen": 600, "free_shipping_fen": 20000})))
            db.add(Address(id=1, user_id=1, name="测试", phone="13800000000", province="湖北省", city="武汉市", detail="测试地址"))
            db.add(Product(id=100, title="测试茶", status="published", cover="/tea.jpg", intro="茶"))
            db.add(Sku(id=100, product_id=100, name="一盒", price_fen=1000, stock=5))
            db.add(Course(id=100, title="测试课", price_fen=2000, status="published", access_days=30,
                payment_product="course-100", revision=1, payment_synced_revision=1))
            db.add(MediaAsset(id=100, kind="video", name="paid.mp4", state="ready", duration=100, playback_key="private/paid.mp4"))
            db.add_all([Lesson(id=100, course_id=100, title="付费章节", media_id=100),
                Lesson(id=101, course_id=100, title="独立预览章节", media_id=100, preview=True)])
            db.commit()
        app = FastAPI()
        for router in (public.router, admin.router, callbacks.router, attachments.router):
            app.include_router(router)

        def db_override():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
        app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(id=1, username="tester", is_super=True)
        self.client = TestClient(app)
        self.app = app
        self.private_dir = patch.object(attachments, "PRIVATE_DIR", Path(self.tmp.name) / "evidence")
        self.private_dir.start()
        self.credentials = patch.object(providers, "refresh_refund_credential")
        self.credentials.start()

    def tearDown(self):
        self.client.close()
        self.private_dir.stop()
        self.credentials.stop()
        if not os.getenv("COMMERCE_TEST_MYSQL_URL", ""):
            self.engine.dispose()
        self.tmp.cleanup()

    def order(self, key="request-001", quantity=1, kind="physical"):
        return self.client.post("/api/mp/v2/orders", json={"kind": kind, "request_key": key,
            **({"course_id": 100, "quoted_fen": 2000} if kind == "course" else
               {"items": [{"sku_id": 100, "quantity": quantity}], "address_id": 1, "quoted_fen": 1000 * quantity + 600})})

    def paid(self, ident):
        with self.sessions() as db:
            trading.settle_paid(db, ident, f"transaction-{ident}", db.get(Order, ident).amount_fen)
            db.commit()

    def test_migration_reentrant_drafts_and_mysql_ddl(self):
        upgrade(self.engine)
        with self.sessions() as db:
            self.assertEqual(db.query(Product).filter_by(status="draft").count(), 5)
            self.assertEqual(db.query(Sku).filter_by(stock=0).count(), 5)
            self.assertEqual(db.query(Course).filter_by(status="draft").count(), 1)
        for table in Base.metadata.sorted_tables:
            self.assertTrue(str(CreateTable(table).compile(dialect=mysql.dialect())))

    def test_quote_address_region_threshold_and_tampering(self):
        payload = dict(kind="physical", items=[dict(sku_id=100, quantity=1)], address_id=1)
        result = self.client.post("/api/mp/v2/checkout", json=payload).json()["data"]
        self.assertEqual(result["amount_fen"], 1600)
        self.assertEqual(self.client.post("/api/mp/v2/orders", json={**payload, "quoted_fen": 1, "request_key": "tampered-001"}).status_code, 409)
        with self.sessions() as db:
            db.get(Address, 1).user_id = 2
            db.commit()
        self.assertEqual(self.client.post("/api/mp/v2/checkout", json=payload).status_code, 404)
        with self.sessions() as db:
            a = db.get(Address, 1)
            a.user_id, a.province = 1, "北京市"
            db.commit()
        self.assertEqual(self.client.post("/api/mp/v2/checkout", json=payload).status_code, 409)

    def test_idempotent_order_payment_and_snapshots(self):
        first = self.order().json()["data"]
        self.assertEqual(self.order().json()["data"]["id"], first["id"])
        self.assertEqual(self.order(quantity=2).status_code, 409)
        with self.sessions() as db:
            db.get(Product, 100).title = "改名"
            db.get(Address, 1).detail = "改地址"
            self.assertEqual(db.get(Sku, 100).reserved, 1)
            db.commit()
        self.paid(first["id"])
        self.paid(first["id"])
        with self.sessions() as db:
            sku = db.get(Sku, 100)
            self.assertEqual((sku.stock, sku.reserved), (4, 0))
        result = self.client.get(f"/api/mp/v2/orders/{first['id']}").json()["data"]
        self.assertEqual(result["items"][0]["title"], "测试茶")
        self.assertEqual(result["address"]["detail"], "测试地址")
        self.assertNotIn("payer_openid", result)

    def test_stock_reservations_and_repeat_close(self):
        first = self.order(quantity=4).json()["data"]
        self.assertEqual(self.order(key="request-002", quantity=2).status_code, 409)
        self.assertEqual(self.client.post(f"/api/mp/v2/orders/{first['id']}/cancel").status_code, 200)
        with self.sessions() as db:
            trading.release_closed(db, db.get(Order, first["id"]))
            db.commit()
            self.assertEqual(db.get(Sku, 100).reserved, 0)
            with self.assertRaises(HTTPException):
                trading.settle_paid(db, first["id"], "late-payment", first["amount_fen"])

    def test_inflight_payment_cannot_release_inventory(self):
        order = self.order().json()["data"]
        with self.sessions() as db:
            db.query(Payment).filter_by(order_id=order["id"]).one().state = "initiating"
            db.commit()
            with patch.object(providers, "query_payment", return_value=dict(paid=False, closed=True)):
                with self.assertRaisesRegex(RuntimeError, "不确定"):
                    worker.perform(db, SimpleNamespace(kind="close", payload={"order_id": order["id"]}))
            db.rollback()
            self.assertEqual(db.get(Sku, 100).reserved, 1)
            self.assertEqual(db.get(Order, order["id"]).status, "pending")

    def test_configuration_failure_does_not_mark_initiating(self):
        ident = self.order().json()["data"]["id"]
        with patch.object(providers, "preflight", side_effect=HTTPException(409, "未配置")):
            self.assertEqual(self.client.post(f"/api/mp/v2/orders/{ident}/pay", json={}).status_code, 409)
        with self.sessions() as db:
            self.assertEqual(db.query(Payment).filter_by(order_id=ident).one().state, "created")

    def test_course_access_separate_progress_and_refund_sources(self):
        with self.sessions() as db:
            self.assertFalse(catalog.has_access(db, 1, 100))
            with self.assertRaises(HTTPException):
                catalog.playable(db, 1, 100)
            self.assertEqual(catalog.playable(db, 1, 101)[0].id, 101)
        ident = self.order(kind="course").json()["data"]["id"]
        self.paid(ident)
        result = self.client.post("/api/mp/v2/lessons/100/progress", json={"position": 99})
        self.assertTrue(result.json()["data"]["completed"])
        self.client.post("/api/mp/v2/lessons/100/progress", json={"position": 20})
        with self.sessions() as db:
            row = db.query(Progress).one()
            self.assertEqual((row.position, row.furthest), (20, 99))
            db.get(Course, 100).status = "offline"
            trading.grant(db, 1, 100, "independent-gift", None)
            db.commit()
            self.assertEqual(catalog.playable(db, 1, 100)[0].id, 100)
        item = self.client.get(f"/api/mp/v2/orders/{ident}").json()["data"]["items"][0]
        sale = self.client.post(f"/api/mp/v2/orders/{ident}/aftersales", json=dict(item_id=item["id"], quantity=1, kind="refund", reason="申请退款")).json()["data"]
        with self.sessions() as db:
            aftersales.review(db, sale["id"], schemas.ReviewIn(action="approve"), "tester")
            aftersales.finalize(db, sale["id"])
            db.commit()
            aftersales.finalize(db, sale["id"])
            db.commit()
            self.assertTrue(catalog.has_access(db, 1, 100))
            self.assertEqual(db.get(Order, ident).refund_fen, 2000)
            self.assertEqual(db.query(Progress).count(), 1)

    def test_partial_refund_quantity_and_freight_once(self):
        order = self.order(quantity=2).json()["data"]
        self.paid(order["id"])
        item_id = order["items"][0]["id"]
        payload = dict(item_id=item_id, quantity=1, kind="refund", reason="不再需要")
        sales = [self.client.post(f"/api/mp/v2/orders/{order['id']}/aftersales", json=payload).json()["data"] for _ in range(2)]
        self.assertEqual(self.client.post(f"/api/mp/v2/orders/{order['id']}/aftersales", json=payload).status_code, 409)
        with self.sessions() as db:
            for sale in sales:
                aftersales.review(db, sale["id"], schemas.ReviewIn(action="approve"), "tester")
                aftersales.finalize(db, sale["id"])
                db.commit()
            freight = db.query(AfterSale).filter_by(kind="shipping_refund").one()
            aftersales.finalize(db, freight.id)
            db.commit()
            aftersales.finalize(db, freight.id)
            db.commit()
            self.assertEqual(db.get(Order, order["id"]).refund_fen, 2600)
            self.assertEqual(db.get(Order, order["id"]).status, "refunded")
            self.assertEqual(db.get(Sku, 100).stock, 5)

    def test_return_does_not_automatically_restock(self):
        order = self.order().json()["data"]
        self.paid(order["id"])
        with self.sessions() as db:
            db.get(Order, order["id"]).fulfillment = "shipped"
            db.commit()
            sale = aftersales.request_sale(db, 1, db.get(Order, order["id"]), schemas.AfterSaleIn(
                item_id=order["items"][0]["id"], quantity=1, kind="return_refund", reason="申请退货"))
            aftersales.review(db, sale.id, schemas.ReviewIn(action="approve"), "tester")
            sale.state, sale.return_tracking = "returning", "TEST123"
            db.commit()
            aftersales.review(db, sale.id, schemas.ReviewIn(action="received", restock=False), "tester")
            aftersales.finalize(db, sale.id)
            db.commit()
            self.assertEqual(db.get(Sku, 100).stock, 4)
            self.assertEqual(db.query(AfterSale).filter_by(kind="shipping_refund").count(), 0)

    def test_worker_recovers_expired_lease_and_keeps_failure_history(self):
        with self.sessions() as db:
            db.query(Job).delete()
            db.add(Job(key="recovery", kind="unknown", state="running", attempts=2,
                run_at=datetime.utcnow() - timedelta(minutes=2), lease_until=datetime.utcnow() - timedelta(minutes=1)))
            db.commit()
        self.assertTrue(worker.run_one(self.sessions))
        with self.sessions() as db:
            job = db.query(Job).one()
            self.assertEqual((job.state, job.attempts), ("failed", 3))
            self.assertIn("未知任务类型", job.error)
        self.assertEqual(len(self.client.get("/api/admin/commerce/jobs").json()["data"]), 1)

    def test_private_evidence_upload_ownership_and_signature(self):
        data = io.BytesIO()
        Image.new("RGB", (8, 8), "red").save(data, format="PNG")
        response = self.client.post("/api/mp/v2/aftersales/images", files={"file": ("test.png", data.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 200)
        evidence = response.json()["data"]
        self.assertEqual(self.client.get(evidence["url"]).status_code, 200)
        self.assertEqual(self.client.get(f"/api/mp/v2/attachments/{evidence['id']}?token=fake").status_code, 403)
        with self.sessions() as db:
            with self.assertRaises(HTTPException):
                attachments.normalize(db, 2, [evidence["url"]])

    def test_notification_rsa_signature_tampering(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        timestamp, nonce, body = str(int(time.time())), "nonce", b'{"event":"test"}'
        signature = key.sign(f"{timestamp}\n{nonce}\n".encode() + body + b"\n", padding.PKCS1v15(), hashes.SHA256())
        headers = {"wechatpay-timestamp": timestamp, "wechatpay-nonce": nonce, "wechatpay-serial": "test-id",
            "wechatpay-signature": base64.b64encode(signature).decode()}
        with patch.object(providers.settings, "commerce_wxpay_public_key", pem), patch.object(providers.settings, "commerce_wxpay_public_key_id", "test-id"):
            providers.verify_notification(headers, body)
            with self.assertRaises(HTTPException):
                providers.verify_notification(headers, body + b"tamper")

    def test_merge_preserves_order_payer_and_delete_blockers(self):
        ident = self.order(kind="course").json()["data"]["id"]
        self.paid(ident)
        with self.sessions() as db:
            lifecycle.merge(db, 2, 1)
            db.commit()
            self.assertEqual(db.get(Order, ident).payer_openid, "test-openid")
            self.assertEqual(db.get(Order, ident).user_id, 2)
            self.assertTrue(catalog.has_access(db, 2, 100))
            self.assertTrue(lifecycle.blockers(db, 2))
            lifecycle.erase_profile(db, 2)
            db.commit()
            self.assertEqual(db.query(Address).filter_by(user_id=2).count(), 0)

    def test_concurrent_checkout_never_oversells(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda key: self.order(key=key, quantity=4), ["race-request-001", "race-request-002"]))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 409])
        with self.sessions() as db:
            self.assertEqual(db.get(Sku, 100).reserved, 4)
            self.assertEqual(db.query(Order).count(), 1)

    def test_permissions_separate_content_stock_and_refund(self):
        with self.sessions() as db:
            db.add(Role(id=100, name="content-editor", permissions=json.dumps(["commerce:view", "commerce:content"])))
            db.commit()
        self.app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(id=2, username="editor", is_super=False, role_id=100)
        self.assertEqual(self.client.get("/api/admin/commerce/catalog/products").status_code, 200)
        self.assertEqual(self.client.post("/api/admin/commerce/skus/100/stock", json={"delta": 1, "reason": "违规调库存"}).status_code, 403)
        self.assertEqual(self.client.post("/api/admin/commerce/settings", json={}).status_code, 403)
        self.assertEqual(self.client.post("/api/admin/commerce/catalog/skus/100", json={"product_id": 100, "name": "一盒", "price_fen": 1}).status_code, 403)

    def test_signed_encrypted_payment_callback_and_duplicate(self):
        ident = self.order().json()["data"]["id"]
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        api_key = "0" * 32
        with self.sessions() as db:
            number = db.get(Order, ident).order_no

        def notify(amount):
            data = dict(appid="test-app", mchid="test-merchant", out_trade_no=number, transaction_id="callback-transaction",
                trade_state="SUCCESS", payer={"openid": "test-openid"}, amount={"total": amount, "currency": "CNY"})
            nonce = b"nonce1234567"
            content = AESGCM(api_key.encode()).encrypt(nonce, json.dumps(data).encode(), b"test")
            raw = json.dumps({"resource": {"ciphertext": base64.b64encode(content).decode(), "nonce": nonce.decode(), "associated_data": "test"}}).encode()
            timestamp = str(int(time.time()))
            signed = key.sign(timestamp.encode() + b"\nnotify-nonce\n" + raw + b"\n", padding.PKCS1v15(), hashes.SHA256())
            headers = {"wechatpay-timestamp": timestamp, "wechatpay-nonce": "notify-nonce", "wechatpay-serial": "test-id", "wechatpay-signature": base64.b64encode(signed).decode()}
            return self.client.post("/api/mp/v2/callbacks/wxpay", content=raw, headers=headers)

        with patch.object(providers.settings, "commerce_wxpay_public_key", pem), patch.object(providers.settings, "commerce_wxpay_public_key_id", "test-id"), patch.object(providers, "pay_cfg", return_value={"wx_app_id": "test-app", "wx_mch_id": "test-merchant", "wx_api_key": api_key}):
            self.assertEqual(notify(1).status_code, 409)
            self.assertEqual(notify(1600).status_code, 204)
            self.assertEqual(notify(1600).status_code, 204)
        with self.sessions() as db:
            self.assertEqual(db.get(Sku, 100).stock, 4)

    def test_channel_refund_reclaims_only_paid_course_right(self):
        ident = self.order(kind="course").json()["data"]["id"]
        self.paid(ident)
        with self.sessions() as db:
            trading.grant(db, 1, 100, "independent", None)
            db.commit()
            sale = aftersales.channel_course_refund(db, db.get(Order, ident))
            aftersales.finalize(db, sale.id)
            db.commit()
            aftersales.finalize(db, aftersales.channel_course_refund(db, db.get(Order, ident)).id)
            db.commit()
            self.assertTrue(catalog.has_access(db, 1, 100))
            self.assertTrue(db.query(Enrollment).filter_by(source=db.get(Order, ident).order_no).one().revoked)
            self.assertEqual(db.query(AfterSale).count(), 1)

    def test_channel_receipt_required_and_verified(self):
        from app.commerce import shipping
        ident = self.order().json()["data"]["id"]
        self.paid(ident)
        with self.sessions() as db:
            order = db.get(Order, ident)
            order.fulfillment = "shipped"
            db.commit()
            with patch.object(shipping, "call", return_value={"order": {"transaction_id": order.transaction_id, "openid": "test-openid", "paid_amount": 1600, "order_state": 2}}):
                with self.assertRaises(RuntimeError):
                    shipping.confirm_receipt(db, order)
            self.assertEqual(order.fulfillment, "shipped")
            with patch.object(shipping, "call", return_value={"order": {"transaction_id": order.transaction_id, "openid": "test-openid", "paid_amount": 1600, "order_state": 3}}):
                shipping.confirm_receipt(db, order)
            self.assertEqual(order.fulfillment, "received")

    def test_virtual_encrypted_push_and_channel_refund(self):
        ident = self.order(kind="course").json()["data"]["id"]
        with self.sessions() as db:
            number = db.get(Order, ident).order_no
        aes_key, token = b"v" * 32, "local-push-token"

        def push(event):
            xml = f"<xml><Event>{event}</Event><OpenId>test-openid</OpenId><OutTradeNo>{number}</OutTradeNo><GoodsInfo><ProductId>course-100</ProductId><Quantity>1</Quantity></GoodsInfo></xml>".encode()
            plain = b"r" * 16 + struct.pack("!I", len(xml)) + xml + b"test-app"
            pad = 32 - len(plain) % 32
            encryptor = Cipher(algorithms.AES(aes_key), modes.CBC(aes_key[:16])).encryptor()
            encrypted = base64.b64encode(encryptor.update(plain + bytes([pad]) * pad) + encryptor.finalize()).decode()
            timestamp, nonce = str(int(time.time())), "nonce"
            signature = hashlib.sha1("".join(sorted([token, timestamp, nonce, encrypted])).encode()).hexdigest()
            return self.client.post(f"/api/mp/v2/callbacks/virtual?timestamp={timestamp}&nonce={nonce}&msg_signature={signature}", content=f"<xml><Encrypt>{encrypted}</Encrypt></xml>")

        with patch.object(callbacks.settings, "commerce_push_token", token), patch.object(callbacks.settings, "commerce_push_aes_key", base64.b64encode(aes_key).decode().rstrip("=")), patch.object(callbacks, "_mp_cfg", return_value={"app_id": "test-app"}):
            with patch.object(providers, "query_payment", return_value={"paid": True, "transaction_id": "virtual-transaction", "amount_fen": 2000}):
                self.assertEqual(push("xpay_goods_deliver_notify").status_code, 200)
                self.assertEqual(push("xpay_goods_deliver_notify").status_code, 200)
            with patch.object(providers, "query_payment", return_value={"paid": False, "refunded": False}):
                self.assertEqual(push("xpay_refund_notify").status_code, 409)
            with patch.object(providers, "query_payment", return_value={"paid": False, "refunded": True, "transaction_id": "virtual-transaction", "amount_fen": 2000}):
                self.assertEqual(push("xpay_refund_notify").status_code, 200)
                self.assertEqual(push("xpay_refund_notify").status_code, 200)
        with self.sessions() as db:
            self.assertFalse(catalog.has_access(db, 1, 100))
            self.assertEqual(db.query(Enrollment).count(), 1)
            self.assertEqual(db.get(Order, ident).refund_fen, 2000)

    def test_merge_does_not_extend_right_from_revoked_source(self):
        with self.sessions() as db:
            end = (datetime.utcnow() + timedelta(days=3)).replace(microsecond=0)
            db.add_all([Enrollment(user_id=1, course_id=100, source="free", revoked=True),
                Enrollment(user_id=2, course_id=100, source="free", expires_at=end)])
            db.commit()
            lifecycle.merge(db, 2, 1)
            db.commit()
            self.assertEqual(db.query(Enrollment).one().expires_at, end)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "本机缺少 ffmpeg/ffprobe")
    def test_course_audio_real_transcode_stays_private(self):
        from app.commerce import media
        source = Path(self.tmp.name) / "source.wav"
        target = Path(self.tmp.name) / "play.m4a"
        with wave.open(str(source), "wb") as file:
            file.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            file.writeframes(b"".join(struct.pack("<h", int(math.sin(i * 2 * math.pi * 440 / 16000) * 3000)) for i in range(32000)))
        store = SimpleNamespace(head_object=lambda key: SimpleNamespace(content_length=source.stat().st_size),
            get_object_acl=lambda key: SimpleNamespace(acl="private"))
        with self.sessions() as db:
            db.add(MediaAsset(id=200, kind="audio", name="source.wav", source_key="course/source/test.wav", state="processing"))
            db.commit()
            fake_oss = SimpleNamespace(resumable_download=lambda bucket, key, path: shutil.copyfile(source, path),
                resumable_upload=lambda bucket, key, path, headers: (self.assertEqual(headers["x-oss-object-acl"], "private"), shutil.copyfile(path, target)))
            with patch.object(media, "bucket", return_value=store), patch.dict(sys.modules, {"oss2": fake_oss}):
                media.process(db, 200)
            asset = db.get(MediaAsset, 200)
            self.assertEqual(asset.state, "ready")
            self.assertEqual(asset.duration, 2)
            self.assertTrue(asset.playback_key.startswith("course/play/"))
            self.assertGreater(target.stat().st_size, 100)

    def test_refund_user_signature_and_encrypted_credential(self):
        import hmac
        key = "test-session-key"
        encrypted = providers.credential_cipher().encrypt(key.encode()).decode()
        self.assertNotIn(key, encrypted)
        self.assertEqual(providers.credential_cipher().decrypt(encrypted.encode()).decode(), key)
        response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"errcode": 0})
        body = {"order_id": "test-order", "refund_reason": "3", "env": 0}
        with patch.object(providers.settings, "commerce_virtual_app_key", "test-app-key"), patch.object(providers.settings, "commerce_virtual_offer_id", "test-offer"), patch.object(providers, "_get_access_token", return_value="test-access-token"), patch.object(providers.httpx, "post", return_value=response) as post:
            providers.virtual_request(None, "/xpay/refund_order", body, session_key=key)
            payload = post.call_args.kwargs["content"]
            self.assertEqual(post.call_args.kwargs["params"]["signature"], hmac.new(key.encode(), payload, hashlib.sha256).hexdigest())


if __name__ == "__main__":
    unittest.main()
