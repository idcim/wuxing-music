import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import DEFAULT_JWT_SECRET, settings
from app.database import Base, SessionLocal, engine
from app.routers import (
    admins,
    agents,
    auth,
    cdkeys,
    elements,
    mp,
    orders,
    plans,
    quiz,
    settings as settings_router,
    site,
    tracks,
    upload,
    users,
)
from app.seed import seed

logger = logging.getLogger("uvicorn.error")

UPLOAD_DIR = "uploads"


def _safe_db_url() -> str:
    """脱敏后的连接串，用于日志。"""
    url = settings.database_url
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        if "@" in rest:
            creds, host = rest.split("@", 1)
            user = creds.split(":", 1)[0]
            return f"{scheme}://{user}:***@{host}"
    return url


def _auto_migrate() -> None:
    """轻量自动迁移：为已存在的表补齐模型新增列（无 Alembic 的开发态用）。
    仅做加列，不改类型/不删列，避免破坏数据。"""
    from sqlalchemy import inspect

    insp = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            try:
                col_type = col.type.compile(dialect=engine.dialect)
                default = ""
                if col.default is not None and getattr(col.default, "arg", None) is not None:
                    arg = col.default.arg
                    if isinstance(arg, str):
                        default = f" DEFAULT '{arg}'"
                    elif isinstance(arg, (int, float)):
                        default = f" DEFAULT {arg}"
                    elif isinstance(arg, bool):
                        default = f" DEFAULT {1 if arg else 0}"
                with engine.begin() as conn:
                    conn.exec_driver_sql(
                        f"ALTER TABLE `{table.name}` ADD COLUMN `{col.name}` {col_type}{default}"
                    )
                logger.info("自动迁移：%s 加列 %s", table.name, col.name)
            except Exception as e:  # noqa: BLE001
                logger.warning("自动迁移 %s.%s 失败（可忽略）：%s", table.name, col.name, e)


def _fix_commission_index() -> None:
    """把 commission 上「order_id 单列唯一」换成「(order_id, level) 复合唯一」。

    起因：v1.4 一单只有一条分成，order_id 建的是唯一索引；v1.5 加了二级抽成后
    一单要落两条（直推 + 上级），旧索引会把第二条直接挡掉。

    _auto_migrate 只加列不碰索引，create_all 也只对不存在的表生效，
    所以存量库必须单独处理这一步。幂等：跑过一次之后每次启动都是空转。
    """
    from sqlalchemy import inspect

    insp = inspect(engine)
    if not insp.has_table("commission"):
        return  # 全新库由 create_all 直接建成正确的样子

    dialect = engine.dialect.name
    try:
        indexes = insp.get_indexes("commission")
    except Exception as e:  # noqa: BLE001
        logger.warning("读取 commission 索引失败（可忽略）：%s", e)
        return

    # 1) 删掉 order_id 上的单列唯一索引
    for idx in indexes:
        if idx.get("unique") and list(idx.get("column_names") or []) == ["order_id"]:
            name = idx.get("name")
            if not name:
                continue
            try:
                with engine.begin() as conn:
                    if dialect == "mysql":
                        conn.exec_driver_sql(f"DROP INDEX `{name}` ON `commission`")
                    else:
                        conn.exec_driver_sql(f'DROP INDEX "{name}"')
                logger.info("迁移：commission 删除单列唯一索引 %s（改为 order_id+level）", name)
            except Exception as e:  # noqa: BLE001
                logger.warning("删除 commission 索引 %s 失败：%s", name, e)

    # 2) 补上复合唯一索引（重新读一次，上面可能刚删过）
    try:
        names = {i.get("name") for i in insp.get_indexes("commission")}
    except Exception:  # noqa: BLE001
        names = set()
    if "uq_commission_order_level" not in names:
        try:
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "CREATE UNIQUE INDEX uq_commission_order_level "
                    "ON commission (order_id, level)"
                )
            logger.info("迁移：commission 建立复合唯一索引 (order_id, level)")
        except Exception as e:  # noqa: BLE001
            logger.warning("建立 commission 复合唯一索引失败：%s", e)

    # 3) order_id 仍需一个普通索引（按订单查分成）
    try:
        cur = insp.get_indexes("commission")
    except Exception:  # noqa: BLE001
        return
    has_order_idx = any(
        list(i.get("column_names") or [])[:1] == ["order_id"] for i in cur
    )
    if not has_order_idx:
        try:
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "CREATE INDEX ix_commission_order_id ON commission (order_id)"
                )
        except Exception as e:  # noqa: BLE001
            logger.warning("建立 commission.order_id 普通索引失败：%s", e)


def _guard_jwt_secret() -> None:
    """JWT 密钥守卫：默认占位密钥可被伪造 token 接管全站。
    生产（debug=false）仍用默认值则拒绝启动；开发态仅告警。"""
    if settings.jwt_secret != DEFAULT_JWT_SECRET:
        return
    if not settings.debug:
        logger.error("=" * 60)
        logger.error("JWT_SECRET 仍为默认占位值，生产环境拒绝启动！")
        logger.error("请在 .env 设置随机长串 JWT_SECRET（例：openssl rand -hex 32）")
        logger.error("=" * 60)
        raise SystemExit(1)
    logger.warning(
        "JWT_SECRET 仍为默认占位值（开发态允许）；生产部署前务必改为随机长串。"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _guard_jwt_secret()
    # 先探活数据库，连不上时给出清晰提示而非整篇 traceback
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError as e:
        logger.error("=" * 60)
        logger.error("数据库连接失败，请检查 .env 的 DATABASE_URL")
        logger.error("当前连接：%s", _safe_db_url())
        logger.error("错误：%s", str(e.orig) if e.orig else str(e))
        logger.error("=" * 60)
        raise SystemExit(1)

    Base.metadata.create_all(bind=engine)
    _auto_migrate()
    _fix_commission_index()   # 一单两条分成后，order_id 不能再是单列唯一
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    logger.info("数据库就绪：%s", _safe_db_url())
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 统一错误响应为 {code, data, msg}
@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "data": None, "msg": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"code": 422, "data": None, "msg": "参数校验失败", "errors": exc.errors()},
    )


app.include_router(auth.router)
app.include_router(admins.router)
app.include_router(plans.router)
app.include_router(tracks.router)
app.include_router(cdkeys.router)
app.include_router(quiz.router)
app.include_router(elements.router)
app.include_router(settings_router.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(agents.router)
app.include_router(upload.router)
app.include_router(site.router)
app.include_router(mp.router)

# 本地上传文件的静态托管
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    return {"code": 0, "data": {"status": "ok"}, "msg": "ok"}
