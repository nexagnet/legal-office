#!/usr/bin/env bash
# next.config.mjs đọc API_URL lúc build (mặc định http://localhost:3001) nên stack này để API ở cổng 3001, build web KHÔNG đặt API_URL.
# Dựng stack thử cho smoke E2E: DB tạm + migration + văn phòng giả + API (AUTH_MODE=password) + web (next start).
# Chạy sau `pnpm build`. Cần DATABASE_URL trỏ tới PostgreSQL tạm (tài khoản chủ DB); KHÔNG dùng cho môi trường thật.
# Ghi TENANT_ID vào e2e/.stack.env và PID vào e2e/.stack.pids để dừng bằng e2e/stop-stack.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL (PostgreSQL tạm, tài khoản chủ DB) là bắt buộc}"

DB="lo_e2e_$$"
ADMIN_URL="$DATABASE_URL"
psql "$ADMIN_URL" -qc "CREATE DATABASE $DB" >/dev/null
psql "$ADMIN_URL" -qtc "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_app') THEN CREATE ROLE legal_app LOGIN; END IF; END \$\$" >/dev/null
OWNER_URL="$(node -e "const u=new URL(process.argv[1]);u.pathname='/'+process.argv[2];console.log(u.toString())" "$ADMIN_URL" "$DB")"
APP_URL="$(node -e "const u=new URL(process.argv[1]);u.username='legal_app';u.password='';console.log(u.toString())" "$OWNER_URL")"

export E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin.e2e@example.invalid}"
export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-E2e-Mat-Khau-Tam-1234}"

(cd apps/api && DATABASE_URL="$OWNER_URL" APP_DB_ROLE=legal_app node dist/db/migrate.cli.js)
psql "$OWNER_URL" -qc "GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_app; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_app" >/dev/null

OUT="$(cd apps/api && DATABASE_URL="$OWNER_URL" TENANT_NAME="Văn phòng E2E" BRANCHES="Trụ sở E2E" \
  ADMIN_EMAIL="$E2E_ADMIN_EMAIL" ADMIN_NAME="Admin E2E" ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD" \
  node dist/auth/bootstrap-tenant.cli.js)"
TENANT_ID="$(printf '%s\n' "$OUT" | sed -n 's/.*TENANT_ID=\([0-9a-f-]\{36\}\).*/\1/p' | head -1)"
[ -n "$TENANT_ID" ] || { echo "Không đọc được TENANT_ID từ bootstrap-tenant:"; echo "$OUT"; exit 1; }

ROOT="$PWD"
mkdir -p "$ROOT/e2e/.tmp/files"
: >"$ROOT/e2e/.stack.pids"
export NODE_ENV=production
cd "$ROOT/apps/api"
DATABASE_URL="$APP_URL" APP_DB_ROLE=legal_app AUTH_MODE=password PORT=3001 \
  WEB_ORIGIN=http://127.0.0.1:3100 FILE_STORE=local FILE_STORE_DIR="$ROOT/e2e/.tmp/files" \
  RATE_LIMIT_AUTH_PER_MIN=1000 RATE_LIMIT_READ_PER_MIN=100000 RATE_LIMIT_WRITE_PER_MIN=100000 \
  node dist/main.js >"$ROOT/e2e/.tmp/api.log" 2>&1 </dev/null &
echo $! >>"$ROOT/e2e/.stack.pids"
cd "$ROOT/apps/web"
API_URL=http://127.0.0.1:3001 TENANT_ID="$TENANT_ID" TENANT_NAME="Văn phòng E2E" PORT=3100 HOSTNAME=127.0.0.1 \
  "$ROOT/apps/web/node_modules/.bin/next" start >"$ROOT/e2e/.tmp/web.log" 2>&1 </dev/null &
echo $! >>"$ROOT/e2e/.stack.pids"
cd "$ROOT"

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1 && curl -fsS -o /dev/null http://127.0.0.1:3100/ 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3001/health >/dev/null || { echo "API không lên"; tail -30 e2e/.tmp/api.log; exit 1; }
printf 'TENANT_ID=%s\nE2E_ADMIN_EMAIL=%s\nE2E_ADMIN_PASSWORD=%s\nE2E_DB=%s\n' "$TENANT_ID" "$E2E_ADMIN_EMAIL" "$E2E_ADMIN_PASSWORD" "$DB" >e2e/.stack.env
echo "Stack E2E sẵn sàng: web http://127.0.0.1:3100, tenant $TENANT_ID"
