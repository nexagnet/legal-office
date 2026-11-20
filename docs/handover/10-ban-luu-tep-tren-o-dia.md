# Bản lưu tệp trên ổ đĩa (không dùng R2)

Viết ngày 20/11/2026. Cùng một mã nguồn chạy được hai kiểu lưu tệp, chọn bằng `.env`. Bản R2 (mặc định) giữ nguyên.

## Quyết định của chủ dự án (20/11/2026) và hệ quả

- **Bản lưu ổ đĩa KHÔNG có bản sao tệp ngoài máy chủ. Khách hàng không cần, đó là quyết định của chủ dự án.** Hệ quả cần biết: mất ổ, máy chủ bị khóa hoặc xóa nhầm thì mất tệp, không khôi phục được. Không có `rclone`, bucket hay dịch vụ nào sao lưu tệp cho bản này. Nếu sau này cần, phải làm việc mới (đích sao lưu nằm ngoài nhà cung cấp máy chủ).
- Sao lưu DB: mã sẵn có (`backup.sh`, `restore-test.sh`) vẫn đích R2 `lo-backup` và **chỉ chạy nếu cấu hình `BACKUP_R2_*`**; không mở rộng thêm cho bản ổ đĩa. `monitor.sh` không báo thiếu bản sao khi chưa có khoá sao lưu.
- Server dự kiến: ổ 100GB (nhà cung cấp Mắt Bão, mua 20/11/2026). Không đưa 200GB tài liệu cũ lên; **chấp nhận ổ 100GB không chứa nổi 200GB**. Ước (chưa đo): sau hệ điều hành, Docker, DB và chỗ trống còn khoảng 55–65GB cho tệp, khoảng 40–50 nghìn tệp cỡ tài liệu cũ.
- Trần 200MB mỗi tệp tải lên (`LEGACY_LOCAL_MAX_BYTES`).

## Cách bật

1. Tạo thư mục tệp (một lần, trên máy chủ): `sudo install -d -o 1000 -g 1000 -m 750 /srv/legal-office/files` (uid 1000 là user `node` trong container).
2. `.env`: `FILE_STORE=local`. Tùy chọn: `FILE_STORE_HOST_DIR` (mặc định `/srv/legal-office/files`), `FILE_STORE_MIN_FREE_PERCENT` (mặc định 10; ổ trống dưới mức này API trả 507 cho tệp mới).
3. `deploy.sh` thấy `FILE_STORE=local` thì tự thêm `deploy/docker-compose.local-files.yml` (gắn cùng thư mục vào `api` ghi và `ocr` chỉ đọc). Thiếu thư mục thì dừng với lỗi rõ.
4. Caddy: đã có đường `PUT /api/dms/legacy/batches/<id>/files/content` đi thẳng tới API (210MB, chờ 15 phút). Chạy `caddy validate` trước khi nạp (**chưa kiểm**).
5. Khóa bất biến (xem dưới): thêm cron của root.

## Cách hoạt động trong mã

- `apps/api/src/storage/file-store.ts`: `LocalFileStore` có `head`, `getStream`, `putStream`. `putStream` ghi tệp tạm, đếm byte và băm sha256 khi nhận, đúng kích thước và sha256 mới `link` vào khoá thật (nguyên tử). **Không bao giờ ghi đè** (khoá có rồi thì `EXISTS`, API trả 409).
- Tài liệu cũ: `prepare` trả đường PUT tới chính API thay cho liên kết ký sẵn của R2, nên giao diện tải lên dùng nguyên. `PUT .../files/content` kiểm quyền bằng hàm DB `dms_legacy_can_import` (migration 0137, đợt phải đang MỞ), kiểm Content-Length/kích thước/sha256. Tải xuống phát theo luồng.
- Hồ sơ/scan thường đi qua cổng `FileStore` như cũ (đọc/ghi đĩa).
- Test: `file-store.test.ts` (đơn vị) và `dms-legacy-local.http.itest.ts` (đầu-cuối với Postgres).

## Bù mất Bucket Lock

- Ứng dụng không có đường xóa/ghi đè tài liệu cũ; kho đĩa từ chối khoá đã tồn tại.
- `deploy/scripts/seal-legacy.sh` (cron root, 5 phút/lần): đặt `chattr +i` cho tệp dưới `t/<tenant>/legacy/` đã ghi quá 2 phút: không xóa, không đổi tên, không ghi đè được kể cả root. Gỡ tay bằng `chattr -i`. Cài: `*/5 * * * * /opt/legal-office/deploy/scripts/seal-legacy.sh`. Cần hệ tệp hỗ trợ cờ (ext4/xfs); lỗi sẽ ghi `/var/log/legal-office/alerts.log`. Quét lại toàn bộ: `SEAL_FULL=1`.
- **Yếu hơn Bucket Lock**: ai có root vẫn gỡ được cờ; và vẫn không có bản sao ngoài máy chủ.

## Chưa kiểm chứng

Chưa chạy thật trên Docker/server (volume bind, `link()` trên volume, statfs); chưa chạy `caddy validate`; chưa thử tải 200MB qua Caddy; chưa đo RAM API khi nhiều người tải song song; chưa kiểm hệ tệp của Mắt Bão có hỗ trợ `chattr +i`; băng thông, loại ổ, snapshot của Mắt Bão chưa biết (cần họ xác nhận).
