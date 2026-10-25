"""退款查询、受理不确定与验真通知回归；渠道请求全部由替身处理。"""
import base64
import copy
import json
import time
from datetime import datetime, timedelta
from unittest.mock import patch

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from app import wxpay
from app.commerce import aftersales, providers, schemas, worker
from app.commerce.models import AfterSale, Event, Job, Order, Sku
from app.models import Order as MusicOrder
from app.routers import orders as music_orders


class RefundCases:
    def refund_sale(self, approved=True):
        order = self.order(quantity=2).json()["data"]
        self.paid(order["id"])
        sale = self.client.post(f"/api/mp/v2/orders/{order['id']}/aftersales", json=dict(
            item_id=order["items"][0]["id"], quantity=1, kind="refund", reason="退款回归")).json()["data"]
        if approved:
            with self.sessions() as db:
                aftersales.review(db, sale["id"], schemas.ReviewIn(action="approve"), "tester")
        return order, sale

    def refund_result(self, sale_id, status="SUCCESS"):
        with self.sessions() as db:
            sale = db.get(AfterSale, sale_id)
            order = db.get(Order, sale.order_id)
            return dict(status=status, refund_id=f"wx-refund-{sale_id}", out_refund_no=sale.refund_no,
                out_trade_no=order.order_no, transaction_id=order.transaction_id,
                amount=dict(refund=sale.amount_fen, total=order.amount_fen, currency="CNY"))

    def due_refund(self, sale_id):
        with self.sessions() as db:
            db.query(Job).filter_by(key=f"refund:{sale_id}").one().run_at = datetime.utcnow() - timedelta(minutes=1)
            db.commit()

    def test_refund_query_official_path_and_not_found_classification(self):
        cfg = dict(wx_mch_id="test", wx_key_pem="unused", wx_cert_serial="test")
        with patch.object(wxpay, "_headers", return_value={}), \
                patch.object(wxpay.httpx, "get", return_value=httpx.Response(200, json={})) as get:
            wxpay.query_refund(cfg, out_refund_no="RF|@*")
            self.assertEqual(get.call_args.args[0], "https://api.mch.weixin.qq.com/v3/refund/domestic/refunds/RF%7C%40%2A")
        for status, body, missing in ((404, {"code": "RESOURCE_NOT_EXISTS"}, True),
                (404, {"code": "NOT_FOUND"}, False), (500, {"code": "RESOURCE_NOT_EXISTS"}, False)):
            with self.subTest(status=status, body=body), patch.object(wxpay, "_headers", return_value={}), \
                    patch.object(wxpay.httpx, "get", return_value=httpx.Response(status, json=body)):
                with self.assertRaises(wxpay.WxPayError) as caught:
                    wxpay.query_refund(cfg, out_refund_no="RF-test")
                self.assertEqual(isinstance(caught.exception, wxpay.RefundNotFound), missing)
        with patch.object(wxpay, "_headers", return_value={}), \
                patch.object(wxpay.httpx, "get", side_effect=httpx.ConnectTimeout("test timeout")):
            with self.assertRaises(wxpay.WxPayError) as caught:
                wxpay.query_refund(cfg, out_refund_no="RF-test")
            self.assertNotIsInstance(caught.exception, wxpay.RefundNotFound)

    def test_refund_query_success_reconciles_without_callback(self):
        order, sale = self.refund_sale()
        self.due_refund(sale["id"])
        with patch.object(aftersales, "pay_cfg", return_value={}), \
                patch.object(wxpay, "query_refund", return_value=self.refund_result(sale["id"])) as query, \
                patch.object(wxpay, "refund", side_effect=AssertionError("已受理退款不得重提")):
            self.assertTrue(worker.run_one(self.sessions))
            with self.sessions() as db:
                aftersales.run_refund(db, sale["id"])
            self.assertEqual(query.call_count, 1)
        with self.sessions() as db:
            self.assertEqual(db.get(Order, order["id"]).refund_fen, 1000)
            self.assertEqual(db.get(Sku, 100).stock, 4)
            self.assertEqual(db.get(AfterSale, sale["id"]).state, "refunded")

    def test_refund_transport_and_submission_uncertainty_are_queried_before_retry(self):
        order, sale = self.refund_sale()
        answers = [wxpay.WxPayError("查询超时"), wxpay.RefundNotFound("未受理"),
            self.refund_result(sale["id"], "PROCESSING"), self.refund_result(sale["id"])]
        with patch.object(aftersales, "pay_cfg", return_value={"notify_url": "https://test.invalid/wxpay"}), \
                patch.object(wxpay, "query_refund", side_effect=answers), \
                patch.object(wxpay, "refund", side_effect=wxpay.WxPayError("申请超时，受理结果未知")) as submit:
            for index in range(4):
                self.due_refund(sale["id"])
                self.assertTrue(worker.run_one(self.sessions))
                with self.sessions() as db:
                    self.assertEqual(db.get(Order, order["id"]).refund_fen, 1000 if index == 3 else 0)
            self.assertEqual(submit.call_count, 1)
            self.assertEqual(submit.call_args.kwargs["out_refund_no"], sale["refund_no"])
        with self.sessions() as db:
            self.assertEqual(db.get(Sku, 100).stock, 4)

    def test_missing_refund_is_submitted_with_original_identity_and_checked(self):
        order, sale = self.refund_sale()
        with patch.object(aftersales, "pay_cfg", return_value={"notify_url": "https://test.invalid/wxpay"}), \
                patch.object(wxpay, "query_refund", side_effect=wxpay.RefundNotFound()), \
                patch.object(wxpay, "refund", return_value=self.refund_result(sale["id"])) as submit:
            with self.sessions() as db:
                aftersales.run_refund(db, sale["id"])
            self.assertEqual(submit.call_args.kwargs["out_refund_no"], sale["refund_no"])
            self.assertEqual(submit.call_args.kwargs["refund_fen"], 1000)
            self.assertEqual(submit.call_args.kwargs["total_fen"], order["amount_fen"])
            self.assertEqual(submit.call_args.kwargs["notify_url"], "https://test.invalid/refund")

    def test_mismatched_refund_result_cannot_change_money(self):
        order, sale = self.refund_sale()
        valid = self.refund_result(sale["id"])
        for key, value in (("out_refund_no", "other-refund"), ("out_trade_no", "other-order"),
                ("transaction_id", "other-transaction"), ("refund", 1001), ("total", 1),
                ("currency", "USD"), ("currency", None), ("refund", 1000.0)):
            data = copy.deepcopy(valid)
            target = data["amount"] if key in ("refund", "total", "currency") else data
            if value is None:
                target.pop(key, None)
            else:
                target[key] = value
            with self.subTest(key=key, value=value), patch.object(aftersales, "pay_cfg", return_value={}), \
                    patch.object(wxpay, "query_refund", return_value=data), patch.object(wxpay, "refund") as submit:
                with self.sessions() as db:
                    with self.assertRaises(HTTPException):
                        aftersales.run_refund(db, sale["id"])
                    db.rollback()
                submit.assert_not_called()
        invalid = copy.deepcopy(valid)
        invalid["amount"]["refund"] = 1001
        with patch.object(aftersales, "pay_cfg", return_value={"notify_url": "https://test.invalid/wxpay"}), \
                patch.object(wxpay, "query_refund", side_effect=wxpay.RefundNotFound()), \
                patch.object(wxpay, "refund", return_value=invalid):
            with self.sessions() as db:
                with self.assertRaises(HTTPException):
                    aftersales.run_refund(db, sale["id"])
                db.rollback()
        with self.sessions() as db:
            self.assertEqual(db.get(Order, order["id"]).refund_fen, 0)
            self.assertEqual(db.get(Sku, 100).stock, 3)

    def test_unapproved_sale_cannot_trigger_channel_refund(self):
        _, sale = self.refund_sale(approved=False)
        with patch.object(wxpay, "query_refund") as query, patch.object(wxpay, "refund") as submit:
            with self.sessions() as db:
                with self.assertRaises(RuntimeError):
                    aftersales.run_refund(db, sale["id"])
            query.assert_not_called()
            submit.assert_not_called()

    def test_abnormal_refund_is_trackable_without_resubmitting(self):
        order, sale = self.refund_sale()
        with patch.object(aftersales, "pay_cfg", return_value={}), \
                patch.object(wxpay, "query_refund", return_value=self.refund_result(sale["id"], "ABNORMAL")), \
                patch.object(wxpay, "refund") as submit:
            for _ in range(3):
                self.due_refund(sale["id"])
                self.assertTrue(worker.run_one(self.sessions))
            submit.assert_not_called()
        with self.sessions() as db:
            job = db.query(Job).filter_by(key=f"refund:{sale['id']}").one()
            self.assertEqual(job.state, "failed")
            self.assertIn("ABNORMAL", job.error)
            self.assertEqual(db.get(Order, order["id"]).refund_fen, 0)
            self.assertEqual(db.get(AfterSale, sale["id"]).state, "refunding")

    def test_signed_refund_notification_is_verified_and_idempotent(self):
        order, sale = self.refund_sale()
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        api_key = b"r" * 32
        cfg = dict(wx_mch_id="test-merchant", wx_api_key=api_key.decode())

        def notice(currency=None, tampered=False):
            data = self.refund_result(sale["id"])
            data["refund_status"], data["mchid"] = data.pop("status"), cfg["wx_mch_id"]
            if currency is None:
                data["amount"].pop("currency")
            else:
                data["amount"]["currency"] = currency
            nonce = b"refundnonce1"
            ciphertext = AESGCM(api_key).encrypt(nonce, json.dumps(data).encode(), b"refund")
            raw = json.dumps({"resource": {"nonce": nonce.decode(), "associated_data": "refund", "ciphertext": base64.b64encode(ciphertext).decode()}}).encode()
            stamp, request_nonce = str(int(time.time())), "refund-test"
            message = stamp.encode() + b"\n" + request_nonce.encode() + b"\n" + raw + b"\n"
            signature = key.sign(message, padding.PKCS1v15(), hashes.SHA256())
            headers = {"wechatpay-timestamp": stamp, "wechatpay-nonce": request_nonce,
                "wechatpay-serial": "refund-test-key", "wechatpay-signature": base64.b64encode(signature).decode()}
            return self.client.post("/api/mp/v2/callbacks/refund", content=raw + (b" " if tampered else b""), headers=headers)

        with patch.object(providers, "pay_cfg", return_value=cfg), \
                patch.object(providers.settings, "commerce_wxpay_public_key", pem), \
                patch.object(providers.settings, "commerce_wxpay_public_key_id", "refund-test-key"):
            self.assertEqual(notice(tampered=True).status_code, 401)
            self.assertEqual(notice(currency="USD").status_code, 409)
            self.assertEqual(notice().status_code, 204)
            self.assertEqual(notice().status_code, 204)
        with self.sessions() as db:
            self.assertEqual(db.get(Order, order["id"]).refund_fen, 1000)
            self.assertEqual(db.get(Sku, 100).stock, 4)
            self.assertEqual(db.query(Event).filter_by(subject=order["order_no"], action="refunded").count(), 1)

    def test_legacy_music_refund_sync_preserves_response_contract(self):
        self.app.include_router(music_orders.router)
        cfg = dict(enabled=True, wx_mch_id="test", wx_key_pem="unused", wx_cert_serial="test")
        with self.sessions() as db:
            order = MusicOrder(order_no="LEGACY-REFUND", user_id=1, plan_id="month", amount=18,
                status="refunding", transaction_id="legacy-transaction", refund_amount=18)
            db.add(order)
            db.commit()
            ident = order.id
        path = f"/api/admin/orders/{ident}/refund/sync"
        with patch.object(music_orders, "_pay_cfg", return_value=cfg), patch.object(wxpay, "_headers", return_value={}):
            for status, data, expected in ((404, {"code": "RESOURCE_NOT_EXISTS"}, "NOT_SUBMITTED"),
                    (200, {"status": "PROCESSING"}, "PROCESSING"), (200, {"status": "SUCCESS"}, "SUCCESS")):
                with patch.object(wxpay.httpx, "get", return_value=httpx.Response(status, json=data)) as get:
                    result = self.client.post(path)
                    self.assertEqual(result.status_code, 200, result.text)
                    self.assertEqual(result.json()["data"]["refund_state"], expected)
                    self.assertTrue(get.call_args.args[0].endswith("/refunds/RFLEGACY-REFUND"))
        with self.sessions() as db:
            self.assertEqual(db.get(MusicOrder, ident).status, "refunded")
