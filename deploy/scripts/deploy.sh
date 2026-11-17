#!/usr/bin/env bash
# Chạy trên server (do GitHub Actions gọi qua SSH): kéo image theo TAG, cập nhật, kiểm /health, tự quay lại bản cũ nếu lỗi.
#   deploy.sh <tag>
# Cần đã `docker login ghcr.io` trước (workflow tự đăng nhập bằng token tạm rồi đăng xuất sau khi pull).
set -euo pipefail
TAG="${1:?usage: deploy.sh <tag>}"
APP=/opt/legal-office
COMPOSE=(docker compose --env-file "$APP/.env" -f "$APP/deploy/docker-compose.yml")
cd "$APP"
prev="$(cat "$APP/.current-tag" 2>/dev/null || true)"
echo "Deploy ${TAG} (hien tai: ${prev:-none})"
TAG="$TAG" "${COMPOSE[@]}" pull
TAG="$TAG" "${COMPOSE[@]}" up -d --remove-orphans

ok=0
for _ in $(seq 1 40); do   # toi da ~200 giay (migration co the mat thoi gian)
  if curl -fsS -m 3 http://127.0.0.1:3001/health >/dev/null 2>&1 && curl -fsS -m 5 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then ok=1; break; fi
  sleep 5
done
if [ "$ok" != 1 ]; then
  echo "LOI: /health khong len sau deploy ${TAG}" >&2
  "${COMPOSE[@]}" logs --tail=60 api web >&2 || true
  if [ -n "$prev" ]; then
    echo "Quay lai ${prev}" >&2
    TAG="$prev" "${COMPOSE[@]}" up -d --remove-orphans
  fi
  exit 1
fi
echo "$TAG" > "$APP/.current-tag"
[ -n "$prev" ] && echo "$prev" > "$APP/.previous-tag"
"$APP/deploy/scripts/warmup.sh" || true
# Dọn ổ đĩa: mỗi tag chiếm ~2,8GB (web+ocr+api). Chỉ giữ tag mới ($TAG) và tag trước ($prev, để quay lại nhanh); xoá các tag cũ hơn.
# `docker rmi` từ chối xoá image đang được container dùng nên an toàn; lỗi ở đây không làm hỏng deploy.
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '/legal-office-(api|web|ocr):' \
  | grep -v -e ":${TAG}\$" ${prev:+-e ":${prev}\$"} | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
echo "Deploy ${TAG} xong"
