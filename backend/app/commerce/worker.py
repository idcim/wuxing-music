"""独立任务进程：python -m app.commerce.worker；重试与租约均持久化。"""
import time
from datetime import datetime, timedelta
from sqlalchemy import or_, update

from app.database import SessionLocal
from .common import RetryLater, migrated, record
from .models import Job, MediaAsset, Order, Payment, Shipment


def perform(db, job):
    from . import aftersales, media, providers, shipping, trading
    payload = job.payload
    if job.kind == "media":
        media.process(db, payload["asset_id"])
    elif job.kind == "shipping":
        shipping.sync(db, payload["shipment_id"])
    elif job.kind == "refund":
        aftersales.run_refund(db, payload["sale_id"])
    elif job.kind == "course_delivery":
        providers.confirm_course_delivery(db, db.get(Order, payload["order_id"]))
    elif job.kind == "receipt":
        order = db.get(Order, payload["order_id"])
        if order.fulfillment == "shipped":
            shipping.confirm_receipt(db, order)
    elif job.kind in ("payment", "close"):
        order = db.query(Order).filter_by(id=payload["order_id"]).populate_existing().with_for_update().first()
        if not order or order.status not in ("pending", "closing"):
            return
        payment = db.query(Payment).filter_by(order_id=order.id).one()
        if payment.state == "created":
            if job.kind == "close":
                trading.release_closed(db, order)
                db.commit()
            elif order.expires_at > datetime.utcnow():
                raise RetryLater("等待用户发起支付")
            return
        result = providers.query_payment(db, order)
        if result.get("paid"):
            trading.settle_paid(db, order.id, result["transaction_id"], result["amount_fen"])
            db.commit()
        elif payment.state == "initiating" and not result.get("exists"):
            # 预支付请求可能还在渠道途中。查无订单不能证明它以后不会成功。
            raise RuntimeError("预支付结果不确定，保留库存并等待核对")
        elif result.get("closed"):
            trading.release_closed(db, order)
            db.commit()
        elif job.kind == "close":
            db.execute(update(Order).where(Order.id == order.id, Order.status == "pending").values(status="closing"))
            db.commit()
            if providers.close_payment(db, order):
                trading.release_closed(db, order)
                db.commit()
            else:
                raise RetryLater("渠道尚未确认关闭，保留预占库存")
        else:
            raise RetryLater("支付结果待确认")
    else:
        raise RuntimeError("未知任务类型")


def run_one(sessions=SessionLocal, monitor=None, queue="all"):
    if queue not in ("all", "media", "transactions"):
        raise ValueError("未知任务队列")
    with sessions() as db:
        if not migrated(db):
            return False
        now = datetime.utcnow()
        candidate = db.query(Job).filter(Job.run_at <= now,
            or_(Job.state == "pending", (Job.state == "running") & (Job.lease_until < now)))
        if queue == "media":
            candidate = candidate.filter(Job.kind == "media")
        elif queue == "transactions":
            candidate = candidate.filter(Job.kind != "media")
        job = candidate.order_by(Job.run_at, Job.id).first()
        if not job:
            return False
        claimed = db.execute(update(Job).where(Job.id == job.id,
            or_(Job.state == "pending", (Job.state == "running") & (Job.lease_until < now)))
            .values(state="running", attempts=Job.attempts + 1, lease_until=now + timedelta(hours=2))).rowcount
        if not claimed:
            db.rollback()
            return False
        ident = job.id
        db.commit()
        if monitor:
            monitor.active(ident)
        try:
            job = db.get(Job, ident)
            perform(db, job)
            job.state, job.error, job.lease_until = "done", "", None
            record(db, f"job:{ident}", "done", {"kind": job.kind})
            db.commit()
        except RetryLater as exc:
            db.rollback()
            job = db.get(Job, ident)
            job.state, job.error, job.lease_until = "pending", str(exc)[:1500], None
            job.attempts = max(0, job.attempts - 1)
            job.run_at = datetime.utcnow() + timedelta(seconds=60)
            record(db, f"job:{ident}", "waiting", {"reason": job.error})
            db.commit()
        except Exception as exc:
            db.rollback()
            job = db.get(Job, ident)
            job.state = "failed" if job.attempts >= 3 else "pending"
            job.error = str(exc)[:1500]
            job.run_at, job.lease_until = datetime.utcnow() + timedelta(seconds=60 * job.attempts), None
            if job.kind == "media":
                asset = db.get(MediaAsset, job.payload["asset_id"])
                asset.state, asset.error = ("failed" if job.state == "failed" else "processing"), job.error
            if job.kind == "shipping":
                shipment = db.get(Shipment, job.payload["shipment_id"])
                shipment.sync_state, shipment.error = "failed", job.error
            record(db, f"job:{ident}", job.state, {"error": job.error})
            db.commit()
        finally:
            if monitor:
                monitor.active(None)
        return True


if __name__ == "__main__":
    import argparse
    from .monitor import WorkerMonitor
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", choices=("all", "media", "transactions"), default="all")
    queue = parser.parse_args().queue
    with WorkerMonitor(queue=queue) as monitor:
        while True:
            try:
                if not run_one(monitor=monitor, queue=queue):
                    time.sleep(3)
            except Exception:
                import logging
                logging.exception("commerce worker iteration failed")
                time.sleep(5)
