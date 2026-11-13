#!/usr/bin/env bash
# Làm nóng cache Postgres sau khởi động/reboot (đo: truy vấn đầu sau reboot mất 1,5-2,6 giây vì đọc đĩa).
# Chạy sau khi Postgres lên:  /opt/legal-office/deploy/scripts/warmup.sh   (cron @reboot hoặc cuối deploy.sh)
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/legal-office/.env}"
set -a; . "$ENV_FILE"; set +a
: "${APP_DATABASE_URL:?}"
psql "$APP_DATABASE_URL" -q -v ON_ERROR_STOP=0 >/dev/null <<'SQL' || true
SELECT count(*) FROM pg_class;
SELECT pg_prewarm(c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('dms_case_index','dms_ocr_search_index') AND c.relkind IN ('r','i');
SQL
echo "[$(date -u +%FT%TZ)] warmup xong"
