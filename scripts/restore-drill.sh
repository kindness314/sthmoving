#!/usr/bin/env bash
# 恢复演练：把指定备份（默认最新一份）恢复到一次性 PostgreSQL 容器，
# 核对各表行数、磁盘文件数与 files 登记表是否一致，全程不触碰生产服务。
# 用法：restore-drill.sh [备份目录]
set -euo pipefail

backup_root="${BACKUP_DIR:-/srv/backups}"
directory="${1:-$(ls -1dt "${backup_root}"/* | head -1)}"
container="sthmoving-restore-drill"
files_tmp=""

cleanup() {
  docker rm -f "${container}" >/dev/null 2>&1 || true
  if [ -n "${files_tmp}" ]; then
    rm -rf "${files_tmp}"
  fi
}
trap cleanup EXIT

echo "演练备份：${directory}"
for required in database.dump files.tar.gz; do
  if [ ! -f "${directory}/${required}" ]; then
    echo "备份目录缺少 ${required}" >&2
    exit 1
  fi
done

docker rm -f "${container}" >/dev/null 2>&1 || true
docker run -d --name "${container}" \
  -e POSTGRES_USER=sthmoving \
  -e POSTGRES_PASSWORD=drill \
  -e POSTGRES_DB=sthmoving \
  -v "${directory}":/backup:ro \
  postgres:17-alpine >/dev/null

echo "等待数据库就绪..."
ready=no
for _ in $(seq 1 30); do
  if docker exec "${container}" pg_isready -U sthmoving -d sthmoving >/dev/null 2>&1; then
    ready=yes
    break
  fi
  sleep 1
done
if [ "${ready}" != "yes" ]; then
  echo "演练数据库 30 秒内未就绪" >&2
  exit 1
fi

docker exec "${container}" \
  pg_restore --no-owner -U sthmoving -d sthmoving /backup/database.dump

echo "== 行数核对 =="
for table in users join_requests categories items item_labels \
  item_operation_logs outbound_requests sessions files; do
  count="$(docker exec "${container}" \
    psql -U sthmoving -d sthmoving -t -A -c "SELECT count(*) FROM ${table}")"
  printf '%-22s %s\n' "${table}" "${count}"
done

files_tmp="$(mktemp -d)"
tar --extract --gzip --file "${directory}/files.tar.gz" --directory "${files_tmp}"
disk_count="$(find "${files_tmp}" -type f | wc -l)"
db_count="$(docker exec "${container}" \
  psql -U sthmoving -d sthmoving -t -A -c 'SELECT count(*) FROM files')"
echo "磁盘文件 ${disk_count} / files 表 ${db_count}"
if [ "${disk_count}" != "${db_count}" ]; then
  echo "文件数与登记表不一致" >&2
  exit 1
fi

echo "恢复演练通过"
