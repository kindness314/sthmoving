#!/usr/bin/env bash
# 健康巡检：探测 /health，异常与恢复各记录一次，可选推送企业微信 webhook。
#
# 用法：
#   HEALTH_URL=https://域名/health \
#   HEALTH_ALERT_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx \
#   ./scripts/check-health.sh
#
# 建议 cron 每 5 分钟执行一次。告警只在状态翻转（正常->异常、异常->恢复）时推送，
# 持续异常只落日志不刷屏。状态文件默认放在 $HOME/.sthmoving-health-state。
# 在服务器本机巡检时设 HEALTH_RESOLVE=127.0.0.1，绕过公共 DNS 直接探测本机服务
#（域名被 hold / DNS 故障时仍能区分「服务挂了」与「域名解析挂了」）。
set -uo pipefail

url="${HEALTH_URL:?缺少环境变量 HEALTH_URL}"
webhook="${HEALTH_ALERT_WEBHOOK:-}"
state_file="${HEALTH_STATE_FILE:-${HOME}/.sthmoving-health-state}"

resolve_args=()
if [ -n "${HEALTH_RESOLVE:-}" ]; then
  host_port="$(printf '%s' "${url}" | sed -E 's|^https?://([^/:]+)(:([0-9]+))?/.*|\1:\3|')"
  case "${host_port}" in *:) host_port="${host_port}443" ;; esac
  resolve_args=(--resolve "${host_port}:${HEALTH_RESOLVE}")
fi

status_code="$(
  curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
    "${resolve_args[@]}" "${url}" || true
)"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
previous="$(cat "${state_file}" 2>/dev/null || echo ok)"

notify() {
  echo "$1"
  if [ -n "${webhook}" ]; then
    curl --silent --max-time 10 --request POST "${webhook}" \
      --header 'Content-Type: application/json' \
      --data "{\"msgtype\":\"text\",\"text\":{\"content\":\"$1\"}}" || true
  fi
}

if [ "${status_code}" = '200' ]; then
  if [ "${previous}" != 'ok' ]; then
    notify "sthmoving 已恢复:${url} 返回 200(${now})"
  fi
  echo ok >"${state_file}"
else
  message="sthmoving 异常:${url} 返回 ${status_code:-连接失败}(${now})"
  if [ "${previous}" = 'ok' ]; then
    notify "${message}"
  else
    echo "${message}(持续异常,不重复推送)"
  fi
  echo fail >"${state_file}"
fi
