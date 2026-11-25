# Production trên Mắt Bão, chạy chung máy với ứng dụng khác

Viết ngày 25/11/2026. Máy production (2 vCPU, 6GB RAM, ổ 100GB) đã chạy sẵn một ứng dụng khác (app + Postgres 18 + Caddy trong Docker, giữ cổng 80/443). Chủ dự án quyết định (25/11/2026): ứng dụng đó giữ nguyên, Legal Office chạy song song.

## Cách chung máy
- Postgres 17 (apt) trên host, chỉ nghe 127.0.0.1:5432. Postgres của ứng dụng kia nằm trong container, không đụng nhau.
- api/web/ocr chạy mạng host như bản thường (cổng 3000/3001). Web nghe `0.0.0.0` (`WEB_BIND_HOST=0.0.0.0` trong `.env`) để Caddy trong container tới được qua cổng của mạng Docker.
- Caddy của ứng dụng kia giữ 80/443. Một khối riêng cho tên miền Legal Office được **thêm vào cuối** Caddyfile của họ (khối cũ giữ nguyên, có bản sao `.bak-before-legal-office-*` cạnh file), chuyển tới cổng gateway của mạng Docker: :3000 cho web và :3001 cho đường PUT tệp lớn (giống `deploy/Caddyfile`).
- ufw chỉ mở 22/80/443; 3000/3001 chỉ cho dải Docker.

## Rủi ro cần biết
- Nếu quy trình của ứng dụng kia ghi đè Caddyfile, khối Legal Office mất (dữ liệu không mất; thêm lại theo `deploy/Caddyfile`). Địa chỉ gateway đổi nếu mạng Docker của họ bị tạo lại.
- Hai hệ thống chung RAM 6GB; theo dõi bằng `monitor.sh`.
- Bản lưu tệp không có bản sao ngoài máy (xem `10-ban-luu-tep-tren-o-dia.md`).

## DNS
Bản ghi A cho `@` và `www` trỏ về IP máy chủ, TTL 300. Kiểm bằng `nslookup <tên miền>`. Caddy tự cấp HTTPS khi DNS trỏ đúng (tự thử lại). IP máy không ghi vào repo công khai.
