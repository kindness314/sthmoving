#!/usr/bin/env bash
# 把本地备份目录同步到腾讯云 COS，实现异地留存。
# 依赖 coscli，凭据放 ~/.cos.yaml（chmod 600，含密钥，不进仓库）：
#   coscli config add -b <桶名-APPID> -r <地域> -i <SecretId> -k <SecretKey>
set -euo pipefail

source_dir="${BACKUP_DIR:-/srv/backups}"
bucket="${COS_BUCKET:?缺少环境变量 COS_BUCKET（形如 sthmoving-backup-1300000000）}"
prefix="${COS_PREFIX:-backups}"

if ! command -v coscli >/dev/null 2>&1; then
  echo "缺少 coscli，请先安装" >&2
  exit 1
fi

coscli sync "${source_dir}" "cos://${bucket}/${prefix}"
echo "异地同步完成：cos://${bucket}/${prefix}"
