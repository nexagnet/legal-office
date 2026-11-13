#!/usr/bin/env bash
# Giám sát cơ bản, chạy mỗi 5 phút từ cron:  */5 * * * * /opt/legal-office/deploy/scripts/monitor.sh
# Ghi cảnh báo vào /var/log/legal-office/alerts.log; nếu có ALERT_WEBHOOK_URL (Slack/Discord/Teams-compatible JSON) thì gửi thêm.
set -uo pipefail
ENV_FILE="${ENV_FILE:-/opt/legal-office/.env}"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
LOG=/var/log/legal-office/alerts.log
problems=()
disk="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
[ "${disk:-0}" -ge 75 ] && problems+=("o dia ${disk}% day")
avail="$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)"
[ "${avail:-9999}" -lt 150 ] && problems+=("RAM available ${avail}MB (<150MB)")
swap_used="$(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {printf "%d", (t-f)/1024}' /proc/meminfo)"
[ "${swap_used:-0}" -ge 1500 ] && problems+=("swap dung ${swap_used}MB (>=1500MB)")
curl -fsS -m 5 http://127.0.0.1:3001/health >/dev/null 2>&1 || problems+=("API /health loi")
curl -fsS -m 8 -o /dev/null http://127.0.0.1:3000/ 2>&1 || problems+=("web khong tra loi")
systemctl is-active --quiet postgresql || problems+=("postgresql khong active")
BK=/var/log/legal-office/backup.log
if [ -f "$BK" ] && [ -z "$(find "$BK" -mmin -1560 2>/dev/null)" ]; then problems+=("backup dem chua chay trong 26 gio"); fi
if [ "${#problems[@]}" -gt 0 ]; then
  msg="[legal-office $(hostname)] $(IFS='; '; echo "${problems[*]}")"
  echo "$(date -u +%FT%TZ) $msg" >> "$LOG"
  [ -n "${ALERT_WEBHOOK_URL:-}" ] && curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"text\":\"${msg}\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1
  exit 1
fi
