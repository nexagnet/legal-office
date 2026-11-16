#!/usr/bin/env bash
# Diễn tập khôi phục: kéo bản sao mới nhất về, nạp vào database tạm, đối chiếu số hàng, rồi xoá database tạm.
# Chạy trên PC (hoặc server nếu đủ chỗ): cần PG_ADMIN_URL và khoá ĐỌC của bucket lo-backup.
# PG_ADMIN_URL PHẢI là superuser (vd. vai postgres): bản sao có `CREATE EXTENSION pg_trgm`, vai thường (kể cả chủ DB) bị từ chối
# "permission denied to create extension" và pg_restore dừng giữa chừng. Script kiểm tra điều này ngay từ đầu.
#   BACKUP_R2_ACCOUNT_ID=... BACKUP_R2_BUCKET=lo-backup BACKUP_R2_ACCESS_KEY_ID=... BACKUP_R2_SECRET_ACCESS_KEY=... \
#   PG_ADMIN_URL=postgres://postgres@127.0.0.1:5432/postgres ./restore-test.sh
set -euo pipefail
: "${PG_ADMIN_URL:?}" "${BACKUP_R2_ACCOUNT_ID:?}" "${BACKUP_R2_BUCKET:?}" "${BACKUP_R2_ACCESS_KEY_ID:?}" "${BACKUP_R2_SECRET_ACCESS_KEY:?}"
[ "$(psql "$PG_ADMIN_URL" -Atc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user")" = t ] \
  || { echo "PG_ADMIN_URL phai la superuser (vd. postgres) de khoi phuc extension" >&2; exit 1; }
export RCLONE_CONFIG_BK_TYPE=s3 RCLONE_CONFIG_BK_PROVIDER=Other RCLONE_CONFIG_BK_REGION=auto
export RCLONE_CONFIG_BK_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_BK_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BK_ENDPOINT="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_BK_NO_CHECK_BUCKET=true

latest="$(rclone lsf "BK:${BACKUP_R2_BUCKET}/db/" | sort | tail -n 1)"
[ -n "$latest" ] || { echo "Khong co ban sao nao trong bucket" >&2; exit 1; }
echo "Ban sao moi nhat: $latest"
tmp="$(mktemp -d)"; db="restore_test_$(date +%s)"
cleanup() { psql "$PG_ADMIN_URL" -qc "DROP DATABASE IF EXISTS ${db}" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
rclone copyto "BK:${BACKUP_R2_BUCKET}/db/${latest}" "$tmp/dump.zst"
zstd -dq "$tmp/dump.zst" -o "$tmp/dump"
psql "$PG_ADMIN_URL" -qc "CREATE DATABASE ${db}"
base="${PG_ADMIN_URL%/*}"
pg_restore --no-owner --dbname "${base}/${db}" "$tmp/dump"
echo "== Doi chieu so hang (so voi bang goc tren server) =="
psql "${base}/${db}" -Atc "SELECT 'tenants', count(*) FROM tenants" 2>/dev/null || true
psql "${base}/${db}" -Atc "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10"
echo "Khoi phuc thanh cong vao database tam ${db} (se xoa)"
