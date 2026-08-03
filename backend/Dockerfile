# 五行律音 · 管理后端
FROM python:3.13-slim

# 避免生成 pyc、日志实时输出
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 系统依赖（bcrypt/cryptography 的运行时；slim 镜像需补 libffi）
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 先装依赖，利用构建缓存
COPY requirements.txt .
RUN pip install -r requirements.txt

# 拷贝应用代码
COPY app ./app

# 数据库连接由 compose / .env 的 DATABASE_URL 注入（外部 MySQL）

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:8000/api/health || exit 1

# --proxy-headers + --forwarded-allow-ips：信任前置 nginx 传来的 X-Forwarded-Proto。
# 不加的话 request.base_url 恒为 http://，上传接口回给后台的 full_url 就是 http，
# 在 HTTPS 页面里会被浏览器当混合内容拦掉（音频试听/封面预览全黑）。
# 容器只经由同一 compose 网络内的 nginx 访问，故允许全部来源。
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
