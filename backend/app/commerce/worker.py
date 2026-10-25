"""独立任务进程：python -m app.commerce.worker；重试与租约均持久化。"""
import time
from datetime import datetime, timedelta
from sqlalchemy import or_, update

from app.database import SessionLocal
from .common import LeaseLost, RetryLater, guard_claim, migrated, record
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
            guard_claim(db)
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


def discard(db):
    db.rollback()
    ident, attempt, lease_until = db.info["commerce_claim"]
    record(db, f"job:{ident}", "lease_lost", {"attempt": attempt,
        "lease_until": lease_until.isoformat(), "reason": "租约失效，旧执行结果已丢弃"})
    db.commit()


def complete(db, outcome, error=""):
    """归属校验与任务状态、资产状态、审计在同一事务内完成。"""
    try:
        guard_claim(db)
    except LeaseLost:
        discard(db)
        return False
    ident = db.info["commerce_claim"][0]
    job = db.get(Job, ident)
    payload = job.payload if isinstance(job.payload, dict) else {}
    job.error, job.lease_until = error[:1500], None
    if outcome == "done":
        job.state = "done"
        record(db, f"job:{ident}", "done", {"kind": job.kind})
    elif outcome == "waiting":
        job.state, job.attempts = "pending", max(0, job.attempts - 1)
        job.run_at = datetime.utcnow() + timedelta(seconds=60)
        record(db, f"job:{ident}", "waiting", {"reason": job.error})
    else:
        job.state = "failed" if job.attempts >= 3 else "pending"
        job.run_at = datetime.utcnow() + timedelta(seconds=60 * job.attempts)
        if job.kind == "media":
            asset = db.get(MediaAsset, payload["asset_id"]) if payload.get("asset_id") is not None else None
            if asset and asset.state != "ready":
                asset.state, asset.error = ("failed" if job.state == "failed" else "processing"), job.error
        if job.kind == "shipping":
            shipment = db.get(Shipment, payload["shipment_id"]) if payload.get("shipment_id") is not None else None
            if shipment and shipment.sync_state != "synced":
                shipment.sync_state, shipment.error = "failed", job.error
        record(db, f"job:{ident}", job.state, {"error": job.error})
    db.commit()
    return True


def run_one(sessions=SessionLocal, monitor=None, queue="all"):
    if queue not in ("all", "media", "transactions"):
        raise ValueError("未知任务队列")
    with sessions() as db:
        if not migrated(db):
            return False
        now = datetime.utcnow()
        eligible = or_(Job.state == "pending", (Job.state == "running") &
            or_(Job.lease_until.is_(None), Job.lease_until < now))
        candidate = db.query(Job).filter(Job.run_at <= now,
            eligible)
        if queue == "media":
            candidate = candidate.filter(Job.kind == "media")
        elif queue == "transactions":
            candidate = candidate.filter(Job.kind != "media")
        job = candidate.order_by(Job.run_at, Job.id).first()
        if not job:
            return False
        ident, attempt = job.id, job.attempts + 1
        # MySQL DATETIME 为秒级；明确对齐精度，以便跨事务精确比较执行归属。
        lease_until = now.replace(microsecond=0) + timedelta(hours=2)
        claimed = db.execute(update(Job).where(Job.id == ident, Job.run_at <= now,
            Job.attempts == attempt - 1, eligible)
            .values(state="running", attempts=attempt, lease_until=lease_until)).rowcount
        if not claimed:
            db.rollback()
            return False
        db.commit()
        db.info["commerce_claim"] = (ident, attempt, lease_until)
        if monitor:
            monitor.active(ident)
        try:
            guard_claim(db)
            # 首次验证后释放行锁，外部网络与长转码期间不占据任务锁。
            db.commit()
            job = db.get(Job, ident)
            perform(db, job)
            complete(db, "done")
        except LeaseLost:
            discard(db)
        except RetryLater as exc:
            db.rollback()
            complete(db, "waiting", str(exc))
        except Exception as exc:
            db.rollback()
            complete(db, "error", str(exc))
        finally:
            db.info.pop("commerce_claim", None)
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
