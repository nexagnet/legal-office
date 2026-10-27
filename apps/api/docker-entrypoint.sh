#!/bin/sh
# Khởi động API. Nếu có MIGRATE_DATABASE_URL (tài khoản chủ DB) thì áp migration chờ trước, rồi mới bật server.
# - Migration chạy trong tiến trình riêng; biến chủ DB bị gỡ trước khi bật server nên API không bao giờ cầm quyền chủ.
# - migrate.cli có khóa advisory nên nhiều bản cùng khởi động vẫn chỉ một bản chạy; mỗi file nằm trong một transaction.
# - Migration lỗi thì thoát mã khác 0: bản mới không lên, bản cũ vẫn phục vụ (rolling deploy). Không có biến thì bỏ qua bước này.
set -eu
if [ -n "${MIGRATE_DATABASE_URL:-}" ]; then
  DATABASE_URL="$MIGRATE_DATABASE_URL" node dist/db/migrate.cli.js
fi
unset MIGRATE_DATABASE_URL
exec node dist/main.js
