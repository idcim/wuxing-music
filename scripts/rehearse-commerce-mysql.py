"""独立临时 MySQL 的迁移/备份恢复演练；仅合成数据，不接受部署库连接。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timedelta
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def isolated_directory():
    previous = Path.cwd()
    with tempfile.TemporaryDirectory(prefix="wuxing-v2-rehearsal-") as temporary:
        os.chdir(temporary)
        try:
            yield Path(temporary)
        finally:
            os.chdir(previous)


def docker(*args, **kwargs):
    result = subprocess.run(["docker", *args], stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        # 不回显命令、容器环境变量、连接串或 SQL 数据。
        raise RuntimeError(f"Docker {args[0]} 失败，退出码 {result.returncode}")
    return result


def snapshot(engine, names=None):
    from sqlalchemy import MetaData, Table, inspect, select
    result = {}
    with engine.connect() as connection:
        for name in sorted(names or inspect(engine).get_table_names()):
            table = Table(name, MetaData(), autoload_with=connection)
            query = select(table).order_by(*table.primary_key.columns)
            digest, count = hashlib.sha256(), 0
            for row in connection.execute(query).mappings():
                encoded = json.dumps(dict(row), sort_keys=True, ensure_ascii=False,
                                     default=str, separators=(",", ":")).encode("utf-8")
                digest.update(encoded + b"\n")
                count += 1
            result[name] = {"rows": count, "sha256": digest.hexdigest()}
    return result


def check_equal(actual, expected, phase):
    if actual != expected:
        changed = sorted(name for name in actual.keys() | expected.keys() if actual.get(name) != expected.get(name))
        raise RuntimeError(f"{phase} 数据不一致，涉及表：{', '.join(changed)}")


def seed_legacy(engine):
    from sqlalchemy.orm import Session
    from app.database import Base
    from app.models import Cdkey, CdkeyRedeemLog, Order, Plan, Setting, User
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(id=1, openid="rehearsal-not-a-real-openid", nickname="恢复演练用户",
                    membership_type="year", membership_name="演练年卡",
                    membership_expire_at=datetime(2030, 1, 1)))
        db.add(Plan(id="year", name="演练年卡", price=199, duration_days=365))
        db.add(Setting(key="site", value=json.dumps({"brand": "恢复演练"}, ensure_ascii=False)))
        db.add(Order(order_no="REHEARSAL-LEGACY", user_id=1, plan_id="year", plan_name="演练年卡",
                     amount=199, status="paid", transaction_id="not-a-real-transaction"))
        db.add(Cdkey(id=1, code="REHEARSAL-ONLY", plan_type="year", duration_days=365,
                     plan_name="演练年卡", status="used", used_by=1))
        db.add(CdkeyRedeemLog(user_id=1, cdkey_id=1))
        db.commit()


def seed_commerce(engine):
    from sqlalchemy.orm import Session
    from app.models import Setting
    from app.commerce import aftersales, common, schemas, trading
    from app.commerce.models import (Address, Course, Event, Job, Lesson, MediaAsset,
                                     Order, Product, Progress, Shipment, Sku)
    with Session(engine) as db:
        cfg = {**common.DEFAULTS, "courses_visible": True, "courses_sale": True,
               "shop_visible": True, "shop_sale": True, "provinces": ["湖北省"], "shipping_fen": 600}
        db.add(Setting(key="commerce_config", value=json.dumps(cfg)))
        db.add(Address(id=100, user_id=1, name="演练", phone="13800000000", province="湖北省",
                       city="武汉市", detail="合成地址，无真实收件人"))
        db.add(Product(id=100, title="演练茶", cover="/synthetic-tea.jpg", intro="合成商品", status="published"))
        db.add(Sku(id=100, product_id=100, name="一盒", price_fen=1000, stock=5))
        db.add(Course(id=100, title="演练课程", price_fen=2000, access_days=365,
                      status="published", payment_product="synthetic-course", payment_synced_revision=1))
        db.add(MediaAsset(id=100, kind="audio", name="synthetic.mp3", state="ready", duration=100,
                          playback_key="private/synthetic.mp3"))
        db.add(Lesson(id=100, course_id=100, title="演练章节", media_id=100))
        db.commit()
        physical = trading.create_order(db, 1, schemas.OrderIn(kind="physical", request_key="rehearsal-physical",
            address_id=100, items=[schemas.CartIn(sku_id=100, quantity=2)], quoted_fen=2600))
        course = trading.create_order(db, 1, schemas.OrderIn(kind="course", course_id=100,
            request_key="rehearsal-course", quoted_fen=2000))
        trading.settle_paid(db, physical.id, "synthetic-paid-physical", 2600)
        trading.settle_paid(db, course.id, "synthetic-paid-course", 2000)
        db.commit()
        item = trading.order_dict(db, physical)["items"][0]
        sale = aftersales.request_sale(db, 1, physical, schemas.AfterSaleIn(
            item_id=item["id"], quantity=1, kind="refund", reason="合成退款演练"))
        aftersales.review(db, sale.id, schemas.ReviewIn(action="approve"), "rehearsal")
        # 仅构造已确认退款状态，绝不调用支付渠道。
        aftersales.finalize(db, sale.id)
        physical.fulfillment = "shipped"
        db.add(Shipment(order_id=physical.id, carrier="SF", tracking_no="SYNTHETIC001", sync_state="synced"))
        db.add(Progress(user_id=1, lesson_id=100, position=37, furthest=50))
        db.commit()
        pending = trading.create_order(db, 1, schemas.OrderIn(kind="physical", request_key="rehearsal-unpaid",
            address_id=100, items=[schemas.CartIn(sku_id=100, quantity=1)], quoted_fen=1600))
        now = datetime.utcnow().replace(microsecond=0)
        # 唯一到期任务：模拟备份时 Worker 中断，恢复后重领并关闭未发起支付的订单。
        for job in db.query(Job):
            job.state, job.run_at = "done", now + timedelta(days=1)
        closing = db.query(Job).filter_by(key=f"close:{pending.id}").one()
        closing.state, closing.attempts = "running", 1
        closing.run_at, closing.lease_until = now - timedelta(minutes=5), now - timedelta(minutes=1)
        pending.expires_at = now - timedelta(minutes=5)
        db.add(MediaAsset(id=101, kind="video", name="failed-synthetic.mp4", state="failed",
                          error="演练失败历史，不连接存储"))
        db.add(Job(key="media:rehearsal-failed", kind="media", payload={"asset_id": 101}, state="failed",
                   attempts=3, error="演练失败历史，不连接存储"))
        db.add(Event(subject="job:rehearsal", action="failed", detail={"reason": "合成历史"}))
        # 运营已编辑的草稿，重复迁移不能覆盖它。
        db.query(Product).filter(Product.id != 100).first().title = "运营已修改的演练草稿"
        db.commit()
        return pending.id


def rehearse(folder, container, password, port):
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import URL
    url = URL.create("mysql+pymysql", username="root", password=password, host="127.0.0.1", port=port)
    engines = []
    admin = create_engine(url, connect_args={"connect_timeout": 2})
    engines.append(admin)
    deadline = time.monotonic() + 150
    while True:
        try:
            with admin.connect() as connection:
                version = connection.execute(text("SELECT VERSION()")).scalar_one()
            break
        except Exception:
            if time.monotonic() >= deadline:
                raise RuntimeError("临时 MySQL TCP 登录就绪超时") from None
            time.sleep(1)
    names = ["wuxing_rehearsal_source", "wuxing_rehearsal_legacy_restore", "wuxing_rehearsal_v2_restore"]
    with admin.begin() as connection:
        for name in names:
            connection.execute(text(f"CREATE DATABASE `{name}` CHARACTER SET utf8mb4"))
    for name in names:
        engines.append(create_engine(url.set(database=name)))
    source, legacy_restore, v2_restore = engines[1:]
    # 导入应用前离开仓库工作目录，明确覆盖数据库地址，不读取仓库 .env。
    os.environ["DATABASE_URL"] = url.set(database=names[0]).render_as_string(hide_password=False)
    sys.path.insert(0, str(ROOT / "backend"))
    from app.commerce.migrate import upgrade
    from app.commerce.models import SCHEMA_VERSION, Job, Order, Progress, SchemaVersion, Sku
    from app.commerce import worker
    from sqlalchemy.orm import Session, sessionmaker

    def copy_database(source_name, target_name, path):
        prefix = ["exec", "-e", f"MYSQL_PWD={password}"]
        with path.open("wb") as output:
            docker(*prefix, container, "mysqldump", "-uroot", "--single-transaction", "--quick",
                   "--skip-lock-tables", "--set-gtid-purged=OFF", "--no-tablespaces", "--hex-blob",
                   "--default-character-set=utf8mb4", source_name, stdout=output)
        with path.open("rb") as input_file:
            docker(*prefix, "-i", container, "mysql", "-uroot", "--default-character-set=utf8mb4",
                   target_name, stdin=input_file, stdout=subprocess.PIPE)
        return {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

    try:
        print("MySQL 已就绪；备份恢复旧业务数据并执行真实迁移", flush=True)
        seed_legacy(source)
        old = snapshot(source)
        legacy_dump = copy_database(names[0], names[1], folder / "legacy.sql")
        check_equal(snapshot(legacy_restore), old, "旧库备份恢复")
        upgrade(legacy_restore)
        check_equal(snapshot(legacy_restore, old), old, "迁移后旧业务")
        migrated = snapshot(legacy_restore)
        upgrade(legacy_restore)
        check_equal(snapshot(legacy_restore), migrated, "重复迁移")
        print("旧库恢复升级与重复迁移通过；备份恢复 2.0 交易与任务", flush=True)
        unpaid_id = seed_commerce(legacy_restore)
        # 模拟已运营的 v2：实际移除新增列和版本记录，再验证 v3 ALTER 与重入。
        before_upgrade = snapshot(legacy_restore)
        with legacy_restore.begin() as connection:
            old_media = list(connection.execute(text("SELECT id, state, duration, playback_key FROM course_media ORDER BY id")))
            connection.exec_driver_sql("ALTER TABLE course_media DROP COLUMN playback_version")
            connection.execute(text("DELETE FROM commerce_schema_version WHERE version = 3"))
        upgrade(legacy_restore)
        upgrade(legacy_restore)
        unchanged = set(before_upgrade) - {"course_media", "commerce_schema_version"}
        check_equal(snapshot(legacy_restore, unchanged), {name: before_upgrade[name] for name in unchanged}, "v2 升级 v3 非媒体业务")
        with legacy_restore.begin() as connection:
            restored_media = list(connection.execute(text("SELECT id, state, duration, playback_key FROM course_media ORDER BY id")))
            if old_media != restored_media or connection.execute(text("SELECT COUNT(*) FROM course_media WHERE playback_version <> ''")).scalar():
                raise RuntimeError("v2 升级 v3 改写了已有课件")
            connection.execute(text("UPDATE course_media SET playback_version = 'synthetic-pinned-version' WHERE id = 100"))
        current = snapshot(legacy_restore)
        v2_dump = copy_database(names[1], names[2], folder / "commerce.sql")
        check_equal(snapshot(v2_restore), current, "2.0 完整备份恢复")
        upgrade(v2_restore)
        check_equal(snapshot(v2_restore), current, "2.0 恢复后重复迁移")
        with Session(v2_restore) as db:
            if not db.get(SchemaVersion, SCHEMA_VERSION) or db.query(Progress).one().position != 37:
                raise RuntimeError("结构版本或学习进度恢复失败")
            if db.get(Sku, 100).reserved != 1:
                raise RuntimeError("库存预占恢复失败")
        if not worker.run_one(sessionmaker(bind=v2_restore, autoflush=False), queue="transactions"):
            raise RuntimeError("恢复后的到期任务没有被领取")
        with Session(v2_restore) as db:
            if db.get(Order, unpaid_id).status != "closed" or db.get(Sku, 100).reserved != 0:
                raise RuntimeError("恢复后关单或预占库存释放失败")
            if db.query(Job).filter_by(key="media:rehearsal-failed").one().state != "failed":
                raise RuntimeError("失败任务历史被错误处理")
        return {"result": "passed", "mysql_version": version, "schema_version": SCHEMA_VERSION,
                "data_source": "synthetic_only", "production_copy_rehearsed": False,
                "legacy_backup": legacy_dump, "commerce_backup": v2_dump,
                "legacy_tables": old, "commerce_tables": current,
                "checks": ["legacy_restore_exact", "migration_preserves_legacy", "migration_reentrant",
                           "v2_restore_exact", "v2_migration_preserves_operations", "progress_restored",
                           "expired_lease_recovers", "unpaid_order_closed", "reserved_inventory_released",
                           "failed_history_preserved", "v2_media_version_upgrade", "v2_upgrade_preserves_other_domains"]}
    finally:
        for engine in engines:
            engine.dispose()


def main():
    # 管道输出在 Windows 也统一 UTF-8，避免演练日志乱码。
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, help="可选 JSON 报告（新文件；只含摘要，不含行数据或密钥）")
    args = parser.parse_args()
    report_path = args.report.resolve() if args.report else None
    if report_path and (report_path.exists() or not report_path.parent.is_dir()):
        parser.error("报告必须为现有目录下尚不存在的新文件")
    container = "wuxing-v2-rehearsal-" + uuid.uuid4().hex[:12]
    password = secrets.token_hex(24)
    try:
        with isolated_directory() as temporary:
            print("启动独立临时 MySQL；不挂载宿主目录，不连接部署数据库", flush=True)
            docker("run", "--detach", "--rm", "--name", container, "--label", "wuxing.local-rehearsal=true",
                   "--publish", "127.0.0.1::3306", "--env", "MYSQL_ROOT_PASSWORD", "--env", "MYSQL_ROOT_HOST=%",
                   "mysql:8.0", "--innodb-buffer-pool-size=128M", stdout=subprocess.PIPE,
                   env={**os.environ, "MYSQL_ROOT_PASSWORD": password})
            binding = docker("port", container, "3306/tcp", stdout=subprocess.PIPE).stdout.decode().strip()
            host, raw_port = binding.rsplit(":", 1)
            if host != "127.0.0.1":
                raise RuntimeError("临时 MySQL 端口未限制在本机")
            report = rehearse(Path(temporary), container, password, int(raw_port))
            if report_path:
                with report_path.open("x", encoding="utf-8") as output:
                    json.dump(report, output, ensure_ascii=False, indent=2)
            print(f"演练通过：MySQL {report['mysql_version']}，{len(report['checks'])} 项检查；仅合成数据。", flush=True)
    finally:
        # 精确停止本次创建的容器；--rm 删除其临时卷，不接触其他实例。
        subprocess.run(["docker", "stop", "--time", "10", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
