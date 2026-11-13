#!/usr/bin/env bash
# Dừng stack E2E và xóa DB tạm. An toàn khi chạy lại.
cd "$(dirname "$0")/.."
if [ -f e2e/.stack.pids ]; then xargs -r kill <e2e/.stack.pids 2>/dev/null || true; rm -f e2e/.stack.pids; fi
if [ -f e2e/.stack.env ] && [ -n "${DATABASE_URL:-}" ]; then
  DB="$(sed -n 's/^E2E_DB=//p' e2e/.stack.env)"
  [ -n "$DB" ] && psql "$DATABASE_URL" -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1 || true
fi
rm -rf e2e/.stack.env e2e/.tmp
