from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置，可由 .env 覆盖。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "五行律音 · 管理后端"
    # 生产连接外部 MySQL；本地开发可在 .env 改回 sqlite:///./wuxing.db
    database_url: str = "mysql+pymysql://wuxing:wuxingpass@host.docker.internal:3306/wuxing?charset=utf8mb4"

    # 数据库连接池（仅 MySQL 生效）
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 3600  # 秒，小于 MySQL wait_timeout

    # JWT
    jwt_secret: str = "change-me-in-production-please"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 天

    # 种子管理员
    admin_username: str = "admin"
    admin_password: str = "admin123"

    # CORS 允许的后台前端地址
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()
