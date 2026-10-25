#!/usr/bin/env bash
# 在官方 MySQL 客户端容器中执行；不读取或输出宿主机 .env。
set -euo pipefail
umask 077
credentials="${DEPLOY_DATABASE_DIR:-/run/deploy-database}"
backups="${DEPLOY_BACKUP_DIR:-/backups}"
partial=""
cleanup() {
  rm -f "$credentials/client.cnf" "$credentials/database"
  [ -z "$partial" ] || rm -f "$partial"
}
trap cleanup EXIT
mkdir -p "$backups"
chmod 700 "$backups"
rm -f "$credentials/backup.ok"
database="$(cat "$credentials/database")"
test -n "$database"
case "$database" in -*|*$'\n'*|*$'\r'*) exit 1 ;; esac
token="$(cat "$credentials/token")"
[[ "$token" =~ ^[a-f0-9]{64}$ ]]
filename="database-$(date -u +%Y%m%dT%H%M%SZ)-${token:0:12}.sql.gz"
partial="$backups/$filename.partial"
# 事务快照包含当前业务库的表、触发器、存储过程与事件；不备份其他数据库。
# 原始错误仅存专用凭证卷，不能进入可能包含连接信息的部署日志。
if ! timeout "${DEPLOY_BACKUP_TIMEOUT:-1800}" mysqldump --defaults-extra-file="$credentials/client.cnf" \
    --single-transaction --quick --routines --events --triggers --hex-blob \
    --set-gtid-purged=OFF --column-statistics=0 --no-tablespaces --databases "$database" \
    2>"$credentials/backup-error.log" | gzip >"$partial"; then
  echo "数据库备份失败，发布停止；请在服务器检查备份权限与空间。" >&2
  exit 1
fi
gzip -t "$partial"
mv "$partial" "$backups/$filename"
partial=""
(cd "$backups" && sha256sum "$filename" >"$filename.sha256")
printf '%s\n' "$token" >"$credentials/backup.ok"
rm -f "$credentials/backup-error.log"
echo "数据库备份成功：$filename（已校验压缩文件并生成 SHA-256）"
