#!/usr/bin/env bash
# 五行律音 · 自动部署（单次幂等，供 1Panel「计划任务」定时调用）
# ================================================================
# 作用：检查 git 远程，只要有新提交就 拉取 → 重建 → 重启 docker compose
#       服务（wuxing-backend + wuxing-admin + wuxing-h5）→ 健康检查 → 失败自动回滚。
#       无更新则直接退出（幂等，可高频调用）；带文件锁防并发重入。
#
# 用法（1Panel）：计划任务 → 创建 → 类型「Shell 脚本」→ 周期如每 1 分钟 →
#   脚本内容：
#       export WUXING_REPO_DIR=/opt/1panel/www/sites/app/index/wuxing-music
#       bash /opt/1panel/www/sites/app/index/wuxing-music/scripts/auto-deploy.sh
#   手动验证一次：  ./scripts/auto-deploy.sh
#
# 前提：服务器已 git clone 本仓库、配好 backend/.env（未跟踪，安全）、
#       装好 git / docker（含 compose 插件）/ curl；外部 MySQL 已就绪。
# 详见 docs/DEPLOY.md。
# ================================================================
set -uo pipefail

# ── 可配置项（环境变量覆盖，在 1Panel 计划任务里 export 即可）──
REPO_DIR="${WUXING_REPO_DIR:-/opt/1panel/www/sites/app/index/wuxing-music}"   # 仓库路径（1Panel 站点目录）
BRANCH="${WUXING_BRANCH:-master}"                                # 部署分支
HEALTH_URL="${WUXING_HEALTH_URL:-http://127.0.0.1:8000/api/health}"
LOG_FILE="${WUXING_LOG:-/var/log/wuxing-deploy.log}"
LOCK_FILE="${WUXING_LOCK:-/tmp/wuxing-deploy.lock}"
HEALTH_RETRIES="${WUXING_HEALTH_RETRIES:-20}"                    # 健康检查重试次数
HEALTH_INTERVAL="${WUXING_HEALTH_INTERVAL:-3}"                   # 每次间隔（秒）
ROLLBACK_ON_FAIL="${WUXING_ROLLBACK:-1}"                         # 部署失败是否回滚（1=是）
PRUNE_IMAGES="${WUXING_PRUNE:-1}"                                # 部署后清理悬空镜像省磁盘

# 计划任务的 PATH 可能很精简，补上常见 bin 目录
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:${PATH:-}"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

# 可选：部署结果通知（Telegram/钉钉/企业微信 webhook）。默认只写日志。
notify() {
  :  # local msg="$1"
  #   curl -fsS -m 10 -X POST "https://your-webhook" \
  #     -H 'Content-Type: application/json' \
  #     -d "{\"text\":\"[五行律音部署] $1\"}" >/dev/null 2>&1 || true
}

# 选择 compose 命令（新版插件 / 旧版二进制）
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "❌ 找不到 docker compose，请先安装 docker 及 compose 插件。" >&2; exit 1
fi

health_ok() {
  local i
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

# ── 单实例锁：拿不到说明上次部署还在跑（构建慢于调用间隔），本次跳过 ──
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "已有部署进程在运行，跳过本次。"; exit 0
fi

cd "$REPO_DIR" || { log "❌ 仓库目录不存在：$REPO_DIR"; exit 1; }

# ── 有更新才部署 ─────────────────────────────────────────────
git fetch --quiet origin "$BRANCH" || { log "⚠️ git fetch 失败，稍后重试。"; exit 1; }
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$LOCAL" = "$REMOTE" ] && exit 0   # 无更新，安静退出

log "发现更新：${LOCAL:0:7} → ${REMOTE:0:7}，部署分支 $BRANCH。"
OLD_SHA="$LOCAL"

# 对齐到远程目标版本（干净重置）。注意：丢弃对「已跟踪文件」的本地改动；
# backend/.env 未跟踪，安全。
git reset --hard "origin/$BRANCH"
log "代码已更新到 $(git rev-parse --short HEAD)。重建并重启容器…"

if $COMPOSE up -d --build >>"$LOG_FILE" 2>&1 && health_ok; then
  log "✅ 部署成功，健康检查通过（$(git rev-parse --short HEAD)）。"
  notify "部署成功 → $(git rev-parse --short HEAD)"
  [ "$PRUNE_IMAGES" = "1" ] && docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

log "❌ 构建/启动或健康检查失败。"
if [ "$ROLLBACK_ON_FAIL" = "1" ]; then
  log "↩️ 回滚到旧版本 ${OLD_SHA:0:7} 并重建…"
  git reset --hard "$OLD_SHA"
  if $COMPOSE up -d --build >>"$LOG_FILE" 2>&1 && health_ok; then
    log "✅ 已回滚到旧版本，服务恢复。"; notify "部署失败已回滚到 ${OLD_SHA:0:7}"
  else
    log "🔥 回滚后仍不健康，请立即人工介入！"; notify "部署+回滚均失败，需人工介入！"
  fi
fi
exit 1
