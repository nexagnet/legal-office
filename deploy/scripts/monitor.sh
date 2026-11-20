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
# Không dùng `systemctl is-active postgresql`: unit tổng đó luôn "active (exited)" kể cả khi cụm Postgres đã chết.
pg_isready -q -h 127.0.0.1 -p 5432 || problems+=("postgresql khong nhan ket noi")
BK=/var/log/legal-office/backup.ok
# Chưa có dấu = chưa từng sao lưu thành công; cũng cảnh báo (an toàn dữ liệu là ưu tiên 1).
# Bản không R2 (chưa đặt khoá sao lưu): không cảnh báo, vì chủ dự án đã quyết định không sao lưu.
if [ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ] && [ -z "$(find "$BK" -mmin -1560 2>/dev/null)" ]; then problems+=("khong co ban sao luu thanh cong trong 26 gio"); fi
# Kho tệp trên ổ đĩa: cảnh báo sớm khi đầy (API tự từ chối tệp mới khi ổ trống dưới FILE_STORE_MIN_FREE_PERCENT, mặc định 10%).
if [ "${FILE_STORE:-}" = local ] && [ -d "${FILE_STORE_HOST_DIR:-/srv/legal-office/files}" ]; then
  fdisk="$(df --output=pcent "${FILE_STORE_HOST_DIR:-/srv/legal-office/files}" | tail -1 | tr -dc '0-9')"
  [ "${fdisk:-0}" -ge 80 ] && problems+=("o chua tep ${fdisk}% day")
fi
if [ "${#problems[@]}" -gt 0 ]; then
  msg="[legal-office $(hostname)] $(IFS='; '; echo "${problems[*]}")"
  echo "$(date -u +%FT%TZ) $msg" >> "$LOG"
  [ -n "${ALERT_WEBHOOK_URL:-}" ] && curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"text\":\"${msg}\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1
  exit 1
fi
