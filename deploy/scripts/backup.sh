#!/usr/bin/env bash
# Sao lưu đêm: pg_dump -> zstd -> bucket R2 riêng (BACKUP_R2_*), không ghi tệp lớn xuống ổ.
# Chạy từ cron của user dev:  15 2 * * * /opt/legal-office/deploy/scripts/backup.sh >> /var/log/legal-office/backup.log 2>&1
# Cần: pg_dump, zstd, rclone (apt install zstd rclone). Bí mật lấy từ /opt/legal-office/.env, không in ra.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/legal-office/.env}"
set -a; . "$ENV_FILE"; set +a
: "${DATABASE_URL:?}" "${BACKUP_R2_ACCOUNT_ID:?}" "${BACKUP_R2_BUCKET:?}" "${BACKUP_R2_ACCESS_KEY_ID:?}" "${BACKUP_R2_SECRET_ACCESS_KEY:?}"

export RCLONE_CONFIG_BK_TYPE=s3 RCLONE_CONFIG_BK_PROVIDER=Cloudflare
export RCLONE_CONFIG_BK_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_BK_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BK_ENDPOINT="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_BK_NO_CHECK_BUCKET=true

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
dest="BK:${BACKUP_R2_BUCKET}/db/legal_office-${stamp}.dump.zst"
echo "[$(date -u +%FT%TZ)] backup bat dau -> db/legal_office-${stamp}.dump.zst"
# Dump bằng vai chủ DB (đọc được mọi bảng, kể cả có RLS). -Fc: định dạng custom, khôi phục chọn lọc được.
pg_dump --format=custom --compress=0 --no-owner "$DATABASE_URL" | zstd -3 -T1 -q | rclone rcat "$dest" --s3-no-head
size="$(rclone size --json "$dest" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p' || true)"
if [ -z "${size}" ] || [ "${size}" -lt 10000 ]; then
  echo "[$(date -u +%FT%TZ)] LOI: ban sao qua nho hoac khong doc duoc (size=${size:-?})" >&2
  exit 1
fi
echo "[$(date -u +%FT%TZ)] backup xong, ${size} byte"
