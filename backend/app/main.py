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
app.include_router(plans.router)
app.include_router(tracks.router)
app.include_router(cdkeys.router)
app.include_router(quiz.router)
app.include_router(elements.router)
app.include_router(settings_router.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(upload.router)
app.include_router(site.router)
app.include_router(mp.router)

# 本地上传文件的静态托管
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    return {"code": 0, "data": {"status": "ok"}, "msg": "ok"}
