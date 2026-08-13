#!/usr/bin/env bash
set -euo pipefail

target="${1:?用法：backup.sh <备份目录>}"
database_url="${DATABASE_URL:?缺少环境变量 DATABASE_URL}"
storage_root="${STORAGE_ROOT:-storage}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
directory="${target}/${stamp}"
mkdir -p "${directory}"

pg_dump --format=custom --file="${directory}/database.dump" "${database_url}"
tar --create --gzip --file "${directory}/files.tar.gz" --directory "${storage_root}" .

echo "备份完成：${directory}"
