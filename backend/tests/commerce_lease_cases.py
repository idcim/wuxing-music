"""复用交易临时数据库夹具的租约故障注入；不访问实际渠道。"""
import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import update

from app.commerce import aftersales, common, media, shipping, trading, worker
from app.commerce.models import AfterSale, Event, Job, MediaAsset, Order, Shipment, Sku


class LeaseCases:
    def test_task_failure_preserves_completed_media_and_shipping_stages(self):
        paid = self.order(key="completed-shipping").json()["data"]
        self.paid(paid["id"])
        with self.sessions() as db:
            db.get(Order, paid["id"]).fulfillment = "shipped"
            shipment = Shipment(order_id=paid["id"], carrier="SF", tracking_no="COMPLETED", sync_state="synced")
            db.add(shipment)
            db.commit()
            shipment_id = shipment.id
        complete = worker.complete
        for kind, payload in (("media", {"asset_id": 100}), ("shipping", {"shipment_id": shipment_id})):
            with self.subTest(kind=kind):
                with self.sessions() as db:
                    job = Job(key=f"completed-{kind}", kind=kind, payload=payload,
                        run_at=datetime.utcnow() - timedelta(minutes=1))
                    db.add(job)
                    db.commit()
                    ident = job.id

                def fail_completion(db, outcome, error=""):
                    if outcome == "done":
                        raise RuntimeError("任务收尾暂时失败")
                    return complete(db, outcome, error)

                with patch.object(media, "bucket", side_effect=AssertionError("已完成媒体不应重复转码")), \
                        patch.object(shipping, "call", side_effect=AssertionError("已同步发货不应重复上报")):
                    with patch.object(worker, "complete", side_effect=fail_completion):
                        self.assertTrue(worker.run_one(self.sessions))
                    with self.sessions() as db:
                        self.assertEqual(db.get(Job, ident).state, "pending")
                        self.assertEqual(db.get(MediaAsset, 100).state, "ready")
                        self.assertEqual(db.get(Shipment, shipment_id).sync_state, "synced")
                        db.get(Job, ident).run_at = datetime.utcnow() - timedelta(minutes=1)
                        db.commit()
                    self.assertTrue(worker.run_one(self.sessions))
                with self.sessions() as db:
                    self.assertEqual((db.get(Job, ident).state, db.get(Job, ident).attempts), ("done", 2))

    def test_lease_takeover_rejects_old_success_failure_and_waiting(self):
        for outcome in ("done", "error", "waiting"):
            with self.subTest(outcome=outcome):
                with self.sessions() as db:
                    db.get(MediaAsset, 100).state = "processing"
                    job = Job(key=f"takeover-{outcome}", kind="media", payload={"asset_id": 100},
                        run_at=datetime.utcnow() - timedelta(minutes=1))
                    db.add(job)
                    db.commit()
                    ident = job.id
                calls = 0

                def perform(db, job):
                    nonlocal calls
                    calls += 1
                    if calls == 1:
                        with self.sessions() as other:
                            other.get(Job, ident).lease_until = datetime.utcnow() - timedelta(minutes=1)
                            other.commit()
                        self.assertTrue(worker.run_one(self.sessions, queue="media"))
                        if outcome == "error":
                            raise RuntimeError("旧执行迟到的失败")
                        if outcome == "waiting":
                            raise common.RetryLater("旧执行迟到的等待")
                    else:
                        common.guard_claim(db)
                        asset = db.get(MediaAsset, 100)
                        asset.state, asset.error, asset.playback_key = "ready", "", f"winner-{outcome}"
                        db.commit()

                with patch.object(worker, "perform", side_effect=perform):
                    self.assertTrue(worker.run_one(self.sessions, queue="media"))
                with self.sessions() as db:
                    job, asset = db.get(Job, ident), db.get(MediaAsset, 100)
                    self.assertEqual((job.state, job.attempts, job.error), ("done", 2, ""))
                    self.assertEqual((asset.state, asset.playback_key), ("ready", f"winner-{outcome}"))
                    self.assertEqual(db.query(Event).filter_by(subject=f"job:{ident}", action="done").count(), 1)
                    self.assertEqual(db.query(Event).filter_by(subject=f"job:{ident}", action="lease_lost").count(), 1)

    def test_stale_media_publication_cannot_replace_winner(self):
        lease = datetime.utcnow().replace(microsecond=0) + timedelta(hours=2)
        with self.sessions() as db:
            db.get(MediaAsset, 100).state = "processing"
            job = Job(key="media-publication", kind="media", state="running", attempts=1, lease_until=lease)
            db.add(job)
            db.commit()
            ident = job.id

        def takeover(*args, **kwargs):
            with self.sessions() as other:
                other.get(Job, ident).attempts = 2
                asset = other.get(MediaAsset, 100)
                asset.state, asset.playback_key = "ready", "winner-key"
                other.commit()

        takeover()
        with self.sessions() as db:
            db.info["commerce_claim"] = (ident, 1, lease)
            with self.assertRaises(common.LeaseLost):
                media.process(db, 100)
            db.rollback()
        with self.sessions() as db:
            self.assertEqual((db.get(MediaAsset, 100).state, db.get(MediaAsset, 100).playback_key), ("ready", "winner-key"))

    def test_stale_claim_cannot_change_payment_inventory_refund_or_shipping(self):
        paid = self.order(key="lease-paid").json()["data"]
        self.paid(paid["id"])
        pending = self.order(key="lease-pending").json()["data"]
        lease = datetime.utcnow().replace(microsecond=0) + timedelta(hours=2)
        with self.sessions() as db:
            job = Job(key="stale-finance", kind="payment", state="running", attempts=2, lease_until=lease)
            db.add(job)
            sale = AfterSale(order_id=paid["id"], item_id=paid["items"][0]["id"], user_id=1,
                kind="refund", state="refunding", quantity=1, amount_fen=1000, reason="测试", refund_no="LEASE-REFUND")
            shipment = Shipment(order_id=paid["id"], carrier="SF", tracking_no="LEASE-TRACK")
            db.add_all([sale, shipment])
            db.commit()
            ident, sale_id, shipment_id = job.id, sale.id, shipment.id
        with self.sessions() as db:
            db.info["commerce_claim"] = (ident, 1, lease)
            with self.assertRaises(common.LeaseLost):
                trading.settle_paid(db, pending["id"], "stale-transaction", pending["amount_fen"])
            db.rollback()
            with self.assertRaises(common.LeaseLost):
                trading.release_closed(db, db.get(Order, pending["id"]))
            db.rollback()
            with self.assertRaises(common.LeaseLost):
                aftersales.finalize(db, sale_id)
            db.rollback()
            with patch.object(shipping, "call", return_value={}):
                with self.assertRaises(common.LeaseLost):
                    shipping.sync(db, shipment_id)
            db.rollback()
        with self.sessions() as db:
            self.assertEqual(db.get(Order, pending["id"]).status, "pending")
            self.assertEqual((db.get(Sku, 100).stock, db.get(Sku, 100).reserved), (4, 1))
            self.assertEqual(db.get(Order, paid["id"]).refund_fen, 0)
            self.assertEqual(db.get(AfterSale, sale_id).state, "refunding")
            self.assertEqual(db.get(Shipment, shipment_id).sync_state, "pending")

    def test_running_job_without_lease_is_recovered(self):
        with self.sessions() as db:
            db.add(Job(key="missing-lease", kind="unknown", state="running", attempts=2,
                run_at=datetime.utcnow() - timedelta(minutes=1), lease_until=None))
            db.commit()
        self.assertTrue(worker.run_one(self.sessions))
        with self.sessions() as db:
            job = db.query(Job).filter_by(key="missing-lease").one()
            self.assertEqual((job.state, job.attempts), ("failed", 3))

    def test_invalid_media_payload_fails_with_history_instead_of_stranding(self):
        for index, payload in enumerate(({}, [])):
            with self.subTest(payload=payload):
                with self.sessions() as db:
                    job = Job(key=f"invalid-media-{index}", kind="media", payload=payload, attempts=2,
                        run_at=datetime.utcnow() - timedelta(minutes=1))
                    db.add(job)
                    db.commit()
                    ident = job.id
                self.assertTrue(worker.run_one(self.sessions))
                with self.sessions() as db:
                    job = db.get(Job, ident)
                    self.assertEqual((job.state, job.attempts, job.lease_until), ("failed", 3, None))
                    self.assertTrue(job.error)
                    self.assertEqual(db.query(Event).filter_by(subject=f"job:{ident}", action="failed").count(), 1)

    def test_expired_owner_cannot_finalize_before_recovery(self):
        lease = datetime.utcnow().replace(microsecond=0) - timedelta(minutes=1)
        with self.sessions() as db:
            job = Job(key="expired-owner", kind="media", state="running", attempts=1,
                lease_until=lease, run_at=lease)
            db.add(job)
            db.commit()
            ident = job.id
            db.info["commerce_claim"] = (ident, 1, lease)
            self.assertFalse(worker.complete(db, "done"))
        with self.sessions() as db:
            self.assertEqual(db.get(Job, ident).state, "running")
        with patch.object(worker, "perform", return_value=None):
            self.assertTrue(worker.run_one(self.sessions))
        with self.sessions() as db:
            self.assertEqual((db.get(Job, ident).state, db.get(Job, ident).attempts), ("done", 2))

    def test_claim_does_not_ignore_a_concurrently_changed_schedule(self):
        with self.sessions() as db:
            job = Job(key="rescheduled", kind="payment", run_at=datetime.utcnow() - timedelta(minutes=1))
            db.add(job)
            db.commit()
            ident = job.id
        with self.sessions() as db:
            execute = db.execute
            changed = False

            def race(statement, *args, **kwargs):
                nonlocal changed
                if getattr(statement, "is_update", False) and statement.table.name == Job.__tablename__ and not changed:
                    changed = True
                    with self.sessions() as other:
                        other.execute(update(Job).where(Job.id == ident).values(run_at=datetime.utcnow() + timedelta(minutes=5)))
                        other.commit()
                return execute(statement, *args, **kwargs)

            with patch.object(db, "execute", side_effect=race):
                self.assertFalse(worker.run_one(lambda: db))
            self.assertTrue(changed)
        with self.sessions() as db:
            job = db.get(Job, ident)
            self.assertEqual((job.state, job.attempts, job.lease_until), ("pending", 0, None))
            self.assertGreater(job.run_at, datetime.utcnow())
