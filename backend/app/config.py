from pydantic_settings import BaseSettings, SettingsConfigDict

# JWT 默认密钥（仅开发占位）。生产必须在 .env 覆盖为随机长串，
# 否则 debug=false 时 main.py 会拒绝启动（见 lifespan 守卫）。
DEFAULT_JWT_SECRET = "change-me-in-production-please"


class Settings(BaseSettings):
    """应用配置，可由 .env 覆盖。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "五行律音 · 管理后端"

    # 调试/开发开关（env: DEBUG）。为真时保留 dev 兜底（短信回传明文码、
    # 支付未配即免付开通、登录游客兜底），便于无外部密钥联调。
    # 生产务必置 false：未配真实密钥时后端改为「拒绝」而非「放行」。
    debug: bool = True
    # 生产连接外部 MySQL；本地开发可在 .env 改回 sqlite:///./wuxing.db
    database_url: str = "mysql+pymysql://wuxing:wuxingpass@host.docker.internal:3306/wuxing?charset=utf8mb4"

    # 数据库连接池（仅 MySQL 生效）
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 3600  # 秒，小于 MySQL wait_timeout

    # JWT
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 天

    # 种子管理员
    admin_username: str = "admin"
    admin_password: str = "admin123"

    # CORS 允许的后台前端地址
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # H5 端（Taro h5 dev 默认端口 10086）；生产部署需在此补充 H5 部署域名
        "http://localhost:10086",
        "http://127.0.0.1:10086",
    ]


settings = Settings()
