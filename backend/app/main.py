import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import Base, SessionLocal, engine

logger = logging.getLogger("uvicorn.error")


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
from app.routers import (
    auth,
    cdkeys,
    elements,
    plans,
    quiz,
    settings as settings_router,
    tracks,
    users,
)
from app.seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.get("/api/health")
def health():
    return {"code": 0, "data": {"status": "ok"}, "msg": "ok"}
