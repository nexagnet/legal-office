#!/usr/bin/env bash
# Bản lưu tệp trên ổ đĩa không có Bucket Lock, nên "khóa" tài liệu cũ bằng cờ bất biến của hệ tệp (chattr +i):
# tệp dưới t/<tenant>/legacy/ không xóa, không ghi đè, không đổi tên được, kể cả root, cho tới khi chủ dự án chạy `chattr -i` tay.
# Chạy bằng ROOT từ cron mỗi 5 phút:  */5 * * * * /opt/legal-office/deploy/scripts/seal-legacy.sh
# Yếu hơn Bucket Lock: ai có root vẫn gỡ được cờ. Bản này KHÔNG có bản sao ngoài máy chủ (quyết định của chủ dự án).
set -uo pipefail
ENV_FILE="${ENV_FILE:-/opt/legal-office/.env}"
DIR="$(sed -n 's/^FILE_STORE_HOST_DIR=//p' "$ENV_FILE" 2>/dev/null | tail -1)"
DIR="${FILE_STORE_HOST_DIR:-${DIR:-/srv/legal-office/files}}"
LOG=/var/log/legal-office/alerts.log
[ -d "$DIR" ] || exit 0
MARK="$DIR/.seal-mark"   # tệp dấu: chỉ xét tệp mới hơn lần chạy trước (SEAL_FULL=1 để quét toàn bộ)
newer=(-newer "$MARK")
{ [ -f "$MARK" ] && [ -z "${SEAL_FULL:-}" ]; } || newer=()
# Bỏ tệp tạm của API (tên bắt đầu bằng dấu chấm) và tệp mới ghi < 2 phút (có thể đang đổi tên).
fail=0
while IFS= read -r -d '' f; do
  chattr +i -- "$f" 2>/dev/null || fail=$((fail + 1))
done < <(find "$DIR" -path '*/legacy/*' -type f ! -name '.*' -mmin +2 "${newer[@]}" -print0)
if [ "$fail" -gt 0 ]; then
  echo "$(date -u +%FT%TZ) [legal-office $(hostname)] seal-legacy: khong khoa duoc ${fail} tep (he tep khong ho tro chattr +i?)" >> "$LOG"
  exit 1
fi
# Dấu lùi 3 phút để lần sau xét lại cả tệp mới ghi (đã bị bỏ qua vì < 2 phút).
touch -d '3 minutes ago' "$MARK"
