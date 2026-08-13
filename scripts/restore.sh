#!/usr/bin/env bash
set -euo pipefail

directory="${1:?用法：restore.sh <备份目录>}"
database_url="${DATABASE_URL:?缺少环境变量 DATABASE_URL}"
storage_root="${STORAGE_ROOT:-storage}"

for required in database.dump files.tar.gz; do
  if [ ! -f "${directory}/${required}" ]; then
    echo "备份目录缺少 ${required}" >&2
    exit 1
  fi
done

if [ "${FORCE:-no}" != "yes" ]; then
  printf '将覆盖数据库与 %s，确认继续？(yes/no) ' "${storage_root}"
  read -r answer
  if [ "${answer}" != "yes" ]; then
    echo "已取消"
    exit 1
  fi
fi

pg_restore --clean --if-exists --no-owner --dbname="${database_url}" \
  "${directory}/database.dump"
mkdir -p "${storage_root}"
tar --extract --gzip --file "${directory}/files.tar.gz" --directory "${storage_root}"

echo "恢复完成"
