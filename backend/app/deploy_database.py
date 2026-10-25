"""Compose 初始化任务：生成临时客户端配置，校验备份凭据后迁移。

凭证只在专用 Docker volume 中短暂存在，不通过命令行或日志输出。
"""
import os
from pathlib import Path
import secrets
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


DIRECTORY = Path("/run/deploy-database")


def option(value):
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + '"'


def prepare(directory=DIRECTORY):
    from app.config import settings
    url = make_url(settings.database_url)
    if url.get_backend_name() != "mysql" or not url.database or not url.username or not url.host:
        raise ValueError("自动备份需要已配置的 MySQL 数据库")
    if url.database.startswith("-") or any(c in url.database for c in "\r\n\x00"):
        raise ValueError("数据库名称不支持自动备份")
    # 未识别的连接选项不能在备份客户端中静默丢弃（尤其 TLS 约束）。
    if set(url.query) - {"charset"}:
        raise ValueError("备份尚不支持此数据库连接选项，请先适配后发布")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            nontransactional = connection.execute(text(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=:name AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB'"
            ), {"name": url.database}).first()
            if nontransactional:
                raise ValueError("存在非 InnoDB 表，不能使用事务快照备份")
    finally:
        engine.dispose()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    for name in ("backup.ok", "client.cnf", "database", "token"):
        (directory / name).unlink(missing_ok=True)
    content = "[client]\n" + "\n".join(f"{key}={option(value)}" for key, value in {
        "host": url.host, "port": url.port or 3306, "user": url.username,
        "password": url.password or "", "default-character-set": url.query.get("charset", "utf8mb4"),
    }.items()) + "\n"
    for name, value in (("client.cnf", content), ("database", url.database + "\n"),
                        ("token", secrets.token_hex(32) + "\n")):
        with (directory / name).open("x", encoding="utf-8") as output:
            os.chmod(directory / name, 0o600)
            output.write(value)
    print("数据库备份配置已就绪（凭证不写入日志）", flush=True)


def migrate(directory=DIRECTORY):
    token = (directory / "token").read_text().strip()
    if not token or (directory / "backup.ok").read_text().strip() != token:
        raise ValueError("本次发布的数据库备份尚未成功，拒绝迁移")
    from app.database import engine
    from app.commerce.migrate import upgrade
    from app.commerce.models import SCHEMA_VERSION
    upgrade(engine)
    print(f"数据库备份已确认；commerce schema v{SCHEMA_VERSION} 迁移完成", flush=True)


def main():
    try:
        {"prepare": prepare, "migrate": migrate}[sys.argv[1]]()
    except Exception:
        # SQL 驱动异常可能包含连接或数据；不将异常对象写入共享部署日志。
        print("数据库部署步骤失败；请检查数据库连接、备份权限、空间及迁移状态。凭证未输出。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
