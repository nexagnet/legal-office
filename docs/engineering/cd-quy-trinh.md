# Quy trình CD (triển khai) của Legal Office

CD = đưa bản mới lên server. Ở repo này CD **luôn do người bấm**, không tự chạy khi merge. Lý do: server nhỏ (2GB), chỉ chạy 1 bản API, migration chạy thẳng vào dữ liệu thật.

## Bức tranh chung
| Môi trường | Chạy ở đâu | Ai/cái gì kích hoạt | Cần duyệt |
|---|---|---|---|
| **dev (Northflank)** | Northflank, dữ liệu giả | Tự deploy từ `main` (ngoài GitHub Actions) | Không |
| **dev (Tencent)** | Server Tencent 2vCPU/2GB (tạm coi là dev) | Bấm tay workflow `deploy`, chọn `dev` | Không |
| **production** | Server thật của khách | Bấm tay workflow `deploy`, chọn `production` | Có: Environment `production` (người duyệt, chỉ nhánh `main`) |

Chưa có chuyển production sang server mới (Mắt Bão, lưu file ổ đĩa). Khi có, chỉ đổi bí mật của Environment `production` (xem dưới), workflow giữ nguyên.

## Các bước của workflow `deploy` (`.github/workflows/deploy.yml`)
1. **kiem-tra-ci-xanh**: kiểm 5 check bắt buộc của `ci` (`bootstrap-verify`, `bootstrap-safety`, `app-verify`, `audit`, `db-integration`) đã xanh trên **đúng commit** sắp deploy. Chưa xanh thì dừng. `e2e-smoke` không bắt buộc vì đôi khi chập chờn.
2. **build-push-deploy (dev|production)**: nếu là `production`, dừng chờ người duyệt. Sau đó build 3 image (api, web, ocr) trên GitHub, đẩy GHCR, SSH vào server chạy `deploy/scripts/deploy.sh <tag>`. Script tự kiểm `/health`, lỗi thì tự quay lại bản cũ.
3. Cuối run có phần **Summary**: môi trường, commit, image, người bấm, kết quả, cách quay lại tay.

Chỉ chạy được trên nhánh `main`. Hai lần deploy cùng môi trường không chạy song song.

## Cách deploy
Actions > deploy > Run workflow > nhánh `main` > chọn `dev` hoặc `production` > Run. Với `production`, người duyệt vào run bấm Approve.

## Vì sao dev Tencent không tự chạy khi `ci` xanh
Mỗi lần merge là một lần build 3 image và khởi động lại API trên server 2GB, có thể đúng lúc người dùng thử đang làm việc; migration lỗi sẽ chặn cả máy. Đề xuất giữ chạy tay. Nếu sau này muốn tự động, thêm `workflow_run` của `ci` cho riêng `dev` (không đổi gì ở production).

## Việc người chủ dự án tự làm trên GitHub (Claude không đổi settings/secrets)
- [ ] Environment `production`: kiểm đã có **Required reviewers** và **Deployment branches = main**.
- [ ] Environment `dev`: không cần bảo vệ gì; GitHub tự tạo khi chạy lần đầu (hoặc tạo trước ở Settings > Environments).
- [ ] Bí mật `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`: hiện đặt ở cấp repo nên `dev` và `production` **cùng trỏ một server**. Khi có server production riêng, đặt bốn bí mật này vào Environment `production` (giá trị ở Environment ghi đè cấp repo) và để cấp repo cho `dev`. Trước lúc đó, chọn `production` sẽ deploy lên chính server Tencent.

## Quay lại bản cũ
Trên server: `/opt/legal-office/deploy/scripts/deploy.sh "$(cat /opt/legal-office/.previous-tag)"`. Migration đã áp không tự lùi (migration tương thích ngược, xem `docs/handover/07-quy-uoc-lam-viec.md`).

## Liên quan
- Chi tiết server và cài một lần: `deploy-tencent.md`.
- Dev Northflank: `northflank-deploy.md` (một phần đã lỗi thời).
- Bản lưu file ổ đĩa (7 PR, #504...) có thể sửa `deploy/docker-compose.yml` và `deploy.sh`; PR này chỉ sửa `deploy.yml` và thêm tài liệu nên không chồng tệp.
