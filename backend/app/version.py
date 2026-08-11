"""后端版本信息，由 GET /api/health 公开出去（免鉴权）。

**为什么不读根目录的 `version.json`**：后端镜像的构建上下文是 `./backend`
（见 `docker-compose.yml`），根目录的 `version.json` 根本进不到容器里。
所以这里手写一份常量，**发版时必须与 `version.json` 一起改**——
`CLAUDE.md` 的发版清单已把本文件列为第五处。

`GIT_COMMIT` / `BUILT_AT` 由部署时注入（`scripts/auto-deploy.sh` → compose 环境变量），
本地跑没有就是空。**判断线上有没有部署成功要看 commit 而不是 version**：
文档类改动不会 bump 版本号，只看 version 会误判成"没上去"。
"""

import os
from datetime import datetime

# ⚠️ 与根 version.json 的 current.app / current.api 保持一致
APP_VERSION = "1.11.0"
API_VERSION = "1.3.0"

# 部署时注入；本地为空字符串
GIT_COMMIT = os.getenv("GIT_COMMIT", "")
BUILT_AT = os.getenv("BUILT_AT", "")

# 进程启动时刻——容器重建过没有，看这个最直接
STARTED_AT = datetime.utcnow().isoformat(timespec="seconds") + "Z"


def version_info() -> dict:
    return {
        "version": APP_VERSION,
        "api": API_VERSION,
        "commit": GIT_COMMIT,
        "builtAt": BUILT_AT,
        "startedAt": STARTED_AT,
    }
