#!/usr/bin/env bash
# Làm nóng cache Postgres sau khởi động/reboot (đo: truy vấn đầu sau reboot mất 1,5-2,6 giây vì đọc đĩa).
# Chạy sau khi Postgres lên:  /opt/legal-office/deploy/scripts/warmup.sh   (cron @reboot hoặc cuối deploy.sh)
# Dùng pg_prewarm nếu extension đã được tạo (CREATE EXTENSION bằng superuser, xem docs/engineering/deploy-tencent.md);
# nếu chưa có thì đọc tuần tự hai bảng chỉ mục (không làm nóng được index nhưng vẫn kéo heap vào cache), không lỗi.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/legal-office/.env}"
set -a; . "$ENV_FILE"; set +a
: "${APP_DATABASE_URL:?}"
if [ "$(psql "$APP_DATABASE_URL" -Atc "SELECT count(*) FROM pg_extension WHERE extname = 'pg_prewarm'" 2>/dev/null || echo 0)" = 1 ]; then
  psql "$APP_DATABASE_URL" -q -v ON_ERROR_STOP=0 >/dev/null <<'SQL' || true
SELECT pg_prewarm(c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','i')
   AND (c.relname LIKE 'dms\_case\_index%' OR c.relname LIKE 'dms\_ocr\_search\_index%');
SQL
  mode=pg_prewarm
else
  psql "$APP_DATABASE_URL" -q -v ON_ERROR_STOP=0 >/dev/null <<'SQL' || true
SELECT count(*) FROM dms_case_index;
SELECT count(*) FROM dms_ocr_search_index;
SQL
  mode=doc-tuan-tu
fi
echo "[$(date -u +%FT%TZ)] warmup xong (${mode})"
