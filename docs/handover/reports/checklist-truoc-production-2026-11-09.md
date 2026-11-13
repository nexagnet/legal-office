# Checklist trước khi lên production (9/11/2026)

## Quyết định đã chốt (9/11, phungviet)

- Giá rẻ nhất là ưu tiên. **OVH VPS-1** (vị trí không quan trọng), **tự chạy Postgres trên VPS**, **tệp giữ trên R2**, chấp nhận downtime vài giây, không yêu cầu dữ liệu ở trong nước.
- Domain: **thihanhandansuhaibatrung.vn**. Người dùng tự mua VPS và domain; Claude ssh vào VPS để deploy và tạo CD trên GitHub.
- 200GB: nhận ổ cứng về, chạy `lo-import` trên PC của người dùng cùng Claude; **chuyển OVH trước, nhập 200GB sau**; giữ Bucket Lock; làm thẳng trên production; không loại thư mục, không quét virus; có văn bản đồng ý của khách; OCR/tìm kiếm toàn bộ (cũ và mới), Claude chọn thời điểm; trả ổ cho khách ngay sau khi xác nhận đủ tệp.
- **Lưu ý:** "xóa R2 làm lại" **không đúng với `legacy/`**: Bucket Lock vô thời hạn (xóa trả 409) và `dms_legacy_files` bất biến. Nhập nhầm là không gỡ được trừ khi gỡ lock. Xem 2.9.
- VPS-1 (2 vCore, 4GB, 40GB) chạy được app + Postgres; **OCR hàng loạt 200GB không chạy trên VPS-1** (thuê máy ngắn hạn); chỉ mục tìm kiếm thêm ~3–5GB, theo dõi ổ 40GB, nâng VPS-2 nếu đầy.

## Cập nhật 9/11 (chiều)

| Trạng thái | Việc |
|---|---|
| ✅ Xong | Bucket Lock R2 cho `legacy/` (đã thử 409); chọn OVH VPS Singapore + mua backup VPS; PR #429 (tải tài liệu cũ + OCR; `LEGACY_OCR_ENABLED`/`LEGACY_SEARCH_ENABLED` mặc định tắt) và PR #428 (Văn thư xem 4 nghiệp vụ) đã merge |
| ⬜ Bạn còn | Token R2 backend giới hạn `lo-files` Object Read & Write (không dùng token Admin); CORS R2 (4.4); xin khách văn bản đồng ý (7.4); chốt mục 11 kế hoạch OVH và kế hoạch 200GB; cất khóa giải mã + `.env` ở 2 nơi; thử khôi phục backup OVH (2.4); khóa/mở rộng Bucket Lock cho scan mới (2.7) |
| ⬜ Claude còn | Toàn bộ cột Claude trong bảng dưới chưa làm (đang chỉ lập checklist) |

Biện pháp khôi phục rút gọn còn 3 việc: thử khôi phục backup OVH, khóa/mở rộng Bucket Lock, cất khóa giải mã + `.env` ở 2 nơi. Chi tiết: `bien-phap-khoi-phuc-du-lieu-2026-11-09.md`, `ke-hoach-chuyen-production-ovhcloud-2026-11-09.md`, `ke-hoach-chuyen-200gb-khach-2026-11-09.md`.

Chỉ là checklist, chưa thay đổi hệ thống. Dựa trên: `docs/engineering/go-live-checklist.md` (đã có, toàn bộ chưa tick), `northflank-deploy.md`, `ocr.md`, `legacy-import.md`, `bao-cao-e2e-dms.md`, báo cáo repo 5/11, kế hoạch tìm kiếm 200GB. Mục nào là suy luận của tôi (không có sẵn trong repo) được đánh dấu *(đề xuất)*.

**Ký hiệu:** 🔴 = bắt buộc trước khi có dữ liệu thật · 🟡 = nên có (làm trong 2 tuần đầu cũng được) · thứ tự = số trong ngoặc, làm từ nhỏ đến lớn. Mỗi mục có cột **Claude** (tôi làm được trong repo/CI/tài liệu) và **Bạn** (chỉ bạn làm được: mua, khóa, bí mật, đăng nhập dịch vụ, quyết định pháp lý, dữ liệu thật).

Phụ thuộc lớn nhất: **quyết định hạ tầng (OVHcloud hay Northflank/BizFly)** ở mục 3 chặn mục 2, 4, 5, 8. Làm mục 3 trước.

---

## 0. Quyết định cần bạn chốt trước (chặn mọi thứ khác)

| # | Việc | Ưu tiên | Ai |
|---|---|---|---|
| 0.1 | Chốt nơi chạy production (OVHcloud theo thread kế hoạch riêng; ngân sách trần bao nhiêu/tháng) | 🔴 (1) | Bạn |
| 0.2 | Chốt tên miền chính thức (dùng `nexagnet.com`? tên miền riêng cho khách?) và ai giữ tài khoản domain | 🔴 (1) | Bạn |
| 0.3 | Chốt 6 câu hỏi còn mở trong handoff: hồ sơ không có tài liệu có được ghi sổ không; quy tắc cột Tổ chức THA ở N-09; xác nhận thay MISA gate (D-2); mẫu Excel gốc N-09/N-10 của khách | 🔴 (2) | Bạn quyết, Claude sửa code sau khi có quyết định |
| 0.4 | ✅ Phạm vi: OCR/tìm toàn bộ cũ + mới, Claude chọn thời điểm (sau nhập và đo 6.6). Bật `LEGACY_OCR_ENABLED`/`LEGACY_SEARCH_ENABLED` ngay lúc lên hay để sau | 🟡 (6) | Bạn |

---

## 1. Bảo mật & phân quyền

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 1.1 | Kiểm RLS: vai `legal_app` không đọc được dòng khi chưa đặt `app.tenant_id`; viết thành test tích hợp chạy trong CI nếu chưa có | 🔴 (3) | Làm | Xem kết quả |
| 1.2 | Ma trận phân quyền từng vai (Admin, Trưởng VP, THV, Thư ký, Văn thư, Kế toán): thấy/không thấy gì, cross-branch, cross-tenant. E2E mới test Admin; mục này báo cáo E2E ghi "chưa test" | 🔴 (3) | Viết test E2E + chạy trên môi trường thử | Cung cấp tài khoản thử từng vai (hoặc cho tôi tạo bằng seed trên staging) |
| 1.3 | Xác nhận ép buộc phía máy chủ: lý do điều chỉnh lô bắt buộc (E2E 3.6 mới thấy ở trình duyệt); hồ sơ đã ghi sổ không sửa/xóa trực tiếp kể cả Admin; Thư ký không gọi được API quản trị | 🔴 (3) | Làm | — |
| 1.4 | Chống dò mật khẩu: giới hạn số lần đăng nhập sai/khóa tạm theo tài khoản + IP, giới hạn tần suất "Quên mật khẩu". Kiểm `hardening.ts` đã có gì, bổ sung phần thiếu *(đề xuất)* | 🔴 (4) | Rà và làm | — |
| 1.5 | Cookie phiên `Secure`, `HttpOnly`, `SameSite=Strict`; header bảo mật (HSTS, CSP, X-Frame-Options); `AUTH_MODE=synthetic-test` bị từ chối khi production (đã có, test lại) | 🔴 (4) | Làm | — |
| 1.6 | Quét lỗ hổng phụ thuộc (`pnpm audit`/Dependabot) và quét bí mật trong repo (`check-tracked-file-safety.mjs` đã có; thêm secret scanning) | 🟡 (7) | Làm | Bật Dependabot/secret scanning trong GitHub repo settings |
| 1.7 | MFA/2FA cho Admin *(đề xuất)*: hiện chỉ mật khẩu ≥12 ký tự. Với dữ liệu pháp lý nhạy cảm nên có ít nhất cho Admin/THV | 🟡 (8) | Thiết kế + làm nếu bạn đồng ý | Quyết định có làm không |
| 1.8 | Kiểm thử xâm nhập cơ bản (IDOR, tải tệp scan của văn phòng khác, đoán URL ký sẵn R2) | 🟡 (8) | Tự rà bằng test | Thuê bên ngoài nếu muốn (tốn tiền, tùy ngân sách) |
| 1.9 | Đổi mật khẩu Admin khởi tạo ngay lần đăng nhập đầu (đã có), kiểm chính sách mật khẩu cho tài khoản nhân viên thật | 🔴 (9) | Kiểm | Tự đặt mật khẩu mạnh, dùng trình quản lý mật khẩu |

---

## 2. Dữ liệu, backup & chống xóa nhầm

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 2.1 | Production là tenant MỚI: không chạy `tools/seed-demo`, không dùng lại DB dev. Thêm chốt chặn trong code/CI: `seed-demo` từ chối chạy khi `NODE_ENV=production` *(đề xuất)* | 🔴 (5) | Làm | — |
| 2.2 | Tạo văn phòng + Admin đầu tiên bằng `bootstrap-tenant.cli` | 🔴 (10) | Hướng dẫn từng lệnh | Chạy lệnh, nhập email/mật khẩu thật (không gửi mật khẩu cho tôi) |
| 2.3 | ✅ phần mua: đã mua backup VPS của OVH. Còn: `pg_dump` mã hóa hằng ngày làm lớp thứ hai (theo `bien-phap-khoi-phuc-du-lieu`); **cất khóa giải mã và `.env` ở 2 nơi** | 🔴 (5) | Viết script backup + mã hóa, tài liệu hóa | **Chưa xong:** cất khóa giải mã + `.env` ở 2 nơi (không để trong repo) |
| 2.4 | ⬜ **Thử khôi phục backup OVH một lần** (vào VPS/DB tạm, đăng nhập được), ghi ngày vào go-live-checklist | 🔴 (11) | Viết quy trình + script kiểm | **Chưa xong:** chạy khôi phục, duyệt kết quả |
| 2.5 | ~~Bật versioning R2~~ **R2 không có versioning**, thay bằng Bucket Lock (2.7). Bucket `lo-files` riêng tư, không bật public access | 🔴 (5) | Hướng dẫn | Kiểm bucket không public |
| 2.6 | Chống xóa nhầm: kiểm xóa mềm scan (30 ngày), `SCAN_PURGE_SCHEDULE=on` đúng tenant, hồ sơ ghi sổ bất biến; thêm nhật ký kiểm toán cho mọi xóa/tải xuống scan *(đề xuất)* | 🔴 (6) | Kiểm + test + bổ sung | — |
| 2.7 | Bảo vệ R2: ✅ **Bucket Lock đã bật** cho `lo-files`, rule `legacy-<8 ký tự đầu tenant>`, prefix `t/<TENANT_ID_VP_HBT>/legacy/`, vô thời hạn, đã thử xóa bị 409. ⬜ **Scan mới (`t/<tenant>/dms/`) chưa khóa**: cân nhắc rule 30 ngày, phải kiểm tài liệu Cloudflare vì có thể xung đột với dọn scan sau 30 ngày. ⬜ Token R2 backend chỉ Object Read & Write cho `lo-files`, không dùng token Admin | 🔴 (8) | Kiểm tài liệu Cloudflare, đề xuất rule | **Chưa xong:** tạo token backend giới hạn; khóa/mở rộng Bucket Lock |
| 2.8 | Dung lượng DB/ổ đĩa: ước lượng tăng trưởng, cảnh báo khi >80% | 🟡 (8) | Ước lượng + cảnh báo | — |
| 2.9 | Nhập 200GB (sau khi OVH chạy ổn), làm thẳng trên production nhưng **lô đầu chỉ 50–100 tệp thật, đối chiếu số tệp/checksum rồi mới chạy full**, vì Bucket Lock + DB bất biến khiến nhập nhầm không gỡ được. Muốn có đường lùi thì tạm gỡ lock cho lô thử rồi bật lại | 🟡 (12) | Chuẩn bị kịch bản, đối chiếu, báo cáo | Nối ổ cứng vào PC, cùng chạy; trả ổ sau khi đủ tệp; **quyết định giữ hay tạm gỡ lock cho lô thử** |

---

## 3. Hạ tầng & CI/CD

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 3.1 | ✅ Chốt OVH **VPS-1**, tự chạy Postgres, đã mua backup VPS. ⬜ Mua VPS và **mua domain `thihanhandansuhaibatrung.vn`**, cấp SSH key riêng cho Claude (xem 3.9). Nâng VPS-2 nếu ổ/RAM thiếu | 🔴 (1) | Chuẩn bị cấu hình | Mua, tạo user deploy + SSH key |
| 3.2 | Dựng môi trường chạy: Dockerfile đã có; viết `docker-compose`/systemd + reverse proxy (Caddy/Nginx, TLS tự động), Postgres, `lo-api`, `lo-web`, job `lo-ocr`, firewall chỉ mở 80/443/SSH | 🔴 (4) | Viết toàn bộ cấu hình + tài liệu | Chạy trên máy chủ (hoặc cho phép Remote Control) |
| 3.3 | Môi trường staging giống production (có thể là dev hiện tại) để diễn tập cắt chuyển; không dùng chung DB | 🔴 (4) | Cấu hình | Chấp nhận chi phí thêm (hoặc dùng dev.nexagnet.com làm staging) |
| 3.4 | TLS cho tên miền chính thức, http→https, DNS trỏ đúng | 🔴 (6) | Cấu hình proxy | Trỏ DNS ở nơi mua domain |
| 3.5 | CI/CD: tách nhánh triển khai production (tag/release thủ công, không auto-deploy từ `main`), migration chạy có sao lưu trước, bước dừng-chờ-duyệt | 🔴 (6) | Viết workflow | Bật branch protection, bắt buộc CI xanh + review trên `main`; giữ secret deploy trong GitHub Secrets |
| 3.6 | Dọn 7 PR cũ mở và ~100 nhánh `claude/*` đã squash-merge để repo sạch trước release | 🟡 (9) | Đề xuất danh sách | Duyệt xóa (nhánh xóa không hoàn lại) |
| 3.7 | Ghim phiên bản (Node 22, pnpm 9.15.4, image Postgres cố định), build có thể tái lập | 🟡 (8) | Làm | — |
| 3.9 | Claude ssh vào VPS để deploy và tạo CD GitHub Actions: phải kiểm phiên này ra được cổng 22 không; nếu bị chặn thì dùng Remote Control hoặc CD để VPS tự kéo bản build. Khóa deploy riêng, quyền tối thiểu, lưu GitHub Secrets | 🔴 (4) | Kiểm ssh, viết workflow | Tạo user deploy + SSH key riêng, thêm secret GitHub; **không gửi mật khẩu root vào chat** |
| 3.8 | Kiểm tải/chi phí: VPS 2 core/2GB có đủ? Đo p95 với dữ liệu thật trước khi quyết nâng cấu hình | 🟡 (9) | Chạy `measure-latency.mjs` | Duyệt nâng cấu hình nếu cần |

---

## 4. Biến môi trường & bí mật

Danh sách biến bắt buộc (từ go-live-checklist): `NODE_ENV=production`, `AUTH_MODE=password`, `TRUST_PROXY=1`, `DATABASE_URL` (vai `legal_app`), `MIGRATE_DATABASE_URL`, `APP_DB_ROLE`, `WEB_ORIGIN`, `PUBLIC_WEB_URL`, `FILE_STORE=r2`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MAIL_SETTINGS_KEY`, `API_URL`, `TENANT_ID`, `TENANT_NAME`. Công tắc nền: `SCAN_PURGE_SCHEDULE`, `SCAN_PURGE_TENANT_IDS`, `REMINDERS_SCHEDULE`, `REMINDER_TENANT_IDS`, `OCR_ONCE`, `OCR_TENANT_IDS`, `OCR_LANG`. Tài liệu cũ: `LEGACY_OCR_ENABLED`, `LEGACY_SEARCH_ENABLED` (mặc định TẮT, độc lập nhau; OCR đọc ở cả worker và API).

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 4.1 | Viết `.env.production.example` đầy đủ + script kiểm biến thiếu/sai khi khởi động (fail-fast) | 🔴 (4) | Làm | — |
| 4.2 | Sinh khóa: `MAIL_SETTINGS_KEY` (`openssl rand -base64 32`), mật khẩu DB 2 vai riêng, khóa R2 riêng cho production | 🔴 (7) | Hướng dẫn lệnh | **Tự sinh và tự cất**; không dán vào chat/repo |
| 4.3 | Lưu bí mật ở secret store (GitHub Secrets / file `.env` quyền 600 trên máy chủ), có bản sao dự phòng ngoại tuyến | 🔴 (7) | Hướng dẫn | Thực hiện |
| 4.4 | ⬜ Cấu hình **CORS bucket R2** cho phép PUT từ tên miền web (header `content-type`, `x-amz-checksum-sha256`) — cần cho tải tệp từ trình duyệt; chưa thử R2 thật | 🔴 (7) | Soạn JSON CORS chuẩn | Dán vào Cloudflare R2 > bucket > Settings > CORS |
| 4.5 | SMTP gửi thư (đặt lại mật khẩu, nhắc hạn): chọn nhà cung cấp, SPF/DKIM/DMARC cho domain | 🔴 (8) | Hướng dẫn DNS record | Mua/đăng ký dịch vụ mail, thêm DNS, nhập SMTP ở Quản trị > Cài đặt văn phòng, gửi thử |
| 4.6 | Xoay vòng khóa: quy trình đổi khóa khi nhân sự rời/nghi lộ; không dùng lại khóa dev | 🟡 (9) | Viết quy trình | Thực hiện khi cần |

---

## 5. Giám sát & log

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 5.1 | `/health` (đã có) + giám sát uptime ngoài (UptimeRobot/BetterStack bản miễn phí), cảnh báo qua email/Zalo/Telegram | 🔴 (8) | Hướng dẫn, thêm endpoint kiểm DB/R2 nếu cần | Tạo tài khoản giám sát, nhận cảnh báo |
| 5.2 | Log có cấu trúc, **không ghi dữ liệu cá nhân/nội dung hồ sơ/mật khẩu/token** vào log; xoay vòng log để không đầy ổ | 🔴 (6) | Rà code log + sửa | — |
| 5.3 | Nhật ký kiểm toán trong ứng dụng (ai xem/tải/sửa/xóa scan, đăng nhập thất bại) lưu bền, Admin xem được | 🟡 (8) | Kiểm hiện trạng, bổ sung | — |
| 5.4 | Cảnh báo: job `lo-ocr` kẹt/lỗi, backup thất bại, ổ >80%, cert sắp hết hạn, lỗi 5xx tăng | 🟡 (9) | Viết kiểm tra + cảnh báo | Cung cấp kênh nhận (email/Telegram bot token) |
| 5.5 | Theo dõi bộ nhớ job `lo-ocr` (0,2 vCPU/512MB trên dev; chưa theo dõi được) | 🟡 (9) | Thêm log tài nguyên | — |
| 5.6 | Báo lỗi frontend/API (Sentry bản miễn phí, tắt gửi dữ liệu cá nhân) *(đề xuất)* | 🟡 (10) | Tích hợp | Tạo tài khoản, cấp DSN |

---

## 6. Kiểm thử (E2E, tải, OCR trên scan thật)

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 6.1 | Hoàn tất các ca E2E còn "chưa test" (báo cáo 31/10 mục 4): THV xác nhận hồ sơ Vi bằng rồi ghi sổ; hủy nháp; yêu cầu sửa đổi cần duyệt + tự duyệt sau 48h; xuất CSV/PDF S-01/04/05 và 3 sổ Văn thư; OCR PDF 2 trang tống đạt | 🔴 (5) | Viết/chạy E2E tự động (Playwright) | Cung cấp tài khoản THV/vai khác nếu dùng dev thật |
| 6.2 | Đưa bộ E2E vào CI (smoke test sau mỗi deploy) | 🟡 (8) | Làm | — |
| 6.3 | Kiểm dialog in PDF sổ trên màn hình thật (handoff ghi "chưa xác nhận") | 🔴 (6) | — | Tự in thử trên máy văn phòng, báo kết quả |
| 6.4 | Kiểm nghiệm nội dung sổ S-0x, N-09/N-10 đối chiếu mẫu TT 08/2026 | 🔴 (6) | Đối chiếu với Phụ lục I–IX | **Người có chuyên môn của VP duyệt** từng sổ in ra |
| 6.5 | Kiểm tải: số người dùng đồng thời thực tế (vài chục), tải tệp 200MB qua trình duyệt, p95 tìm kiếm | 🟡 (9) | Chạy k6/script, báo p95 | — |
| 6.6 | **OCR trên scan thật**: lấy 300–500 trang mẫu thật (in, con dấu đè, viết tay, nghiêng), đo độ chính xác, giây/trang. Đây là cổng quyết định bật OCR/tìm kiếm tài liệu cũ | 🟡 (10) | Chạy đo, báo cáo | Cung cấp mẫu thật (đã có đồng ý của khách) |
| 6.7 | Thử R2 thật + Windows thật cho `lo-import` (rủi ro lớn nhất của nhập 200GB) | 🟡 (11) | Chuẩn bị kịch bản | Chạy trên máy Windows khách, báo lỗi |
| 6.8 | Kiểm giao diện theo vai trên mobile 390px; sửa các màn "quá tải" theo `ui-overload-audit.md` ưu tiên Nặng (#1–4) | 🟡 (10) | Làm theo PR nhỏ | Duyệt Figma là bản chuẩn (đang ghi "CHỜ OWNER DUYỆT") |
| 6.9 | Kiểm trình duyệt/máy khách phổ biến của VP (Chrome, Edge, Safari) | 🟡 (10) | Chạy Playwright đa trình duyệt | Cho biết khách dùng gì |

---

## 7. Tuân thủ & pháp lý

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 7.1 | Đối chiếu tính năng với NĐ 151/2026, TT 08/2026 (sổ, mẫu, thời hạn lưu, bất biến hồ sơ) | 🔴 (6) | Lập bảng đối chiếu từng điều khoản | **Luật sư/VP duyệt** — tôi không thay được ý kiến pháp lý |
| 7.2 | Bảo vệ dữ liệu cá nhân (Luật BVDLCN 91/2025/QH15): thông báo xử lý dữ liệu, văn bản đồng ý, đánh giá tác động, nơi lưu dữ liệu (trong/ngoài nước, OVH vùng nào) | 🔴 (6) | Soạn mẫu thông báo/điều khoản + nhật ký xử lý | Quyết định pháp lý, ký với khách, nộp hồ sơ nếu luật yêu cầu |
| 7.3 | Hợp đồng/điều khoản dịch vụ với khách (SLA, trách nhiệm, chủ sở hữu dữ liệu, xuất dữ liệu khi chấm dứt, bảo mật) | 🔴 (8) | Soạn khung tham khảo | Pháp chế/luật sư rà soát, ký |
| 7.4 | ✅ Đã có văn bản đồng ý của khách; còn kiểm có bao gồm OCR toàn bộ không; không gửi nội dung ra dịch vụ OCR bên ngoài nếu chưa có đồng ý | 🔴 trước khi nhập (9) | Soạn mẫu | Khách ký |
| 7.5 | Chính sách lưu trữ & xóa: 30 ngày xóa mềm scan, thời hạn lưu theo TT 08, quyền xuất dữ liệu | 🟡 (9) | Viết tài liệu | Duyệt |
| 7.6 | Phê duyệt chữ ký/dấu số nếu có (hiện chỉ lưu bản scan, không ký số) — xác nhận không cần | 🟡 (10) | — | Xác nhận |

---

## 8. Kế hoạch cắt chuyển & rollback

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 8.1 | Viết runbook cắt chuyển từng bước (giờ nào, ai làm, kiểm gì sau mỗi bước, tiêu chí dừng) | 🔴 (9) | Soạn | Duyệt, chọn khung giờ ít người dùng |
| 8.2 | Diễn tập đầy đủ trên staging: bootstrap tenant → tạo tài khoản → ghi sổ thử → backup → restore → rollback | 🔴 (10) | Chạy và báo cáo | Quan sát, ký xác nhận |
| 8.3 | Rollback ứng dụng: giữ image/tag trước; migration có thể quay lại hoặc chỉ cho phép "chỉ tiến" + restore từ backup trước migration | 🔴 (9) | Phân loại các migration (đến 0121), viết quy trình | Chấp nhận mức rủi ro |
| 8.4 | Chuyển DNS có TTL thấp (≥24h trước), giữ dev/staging chạy song song vài ngày | 🔴 (11) | Hướng dẫn | Đổi DNS |
| 8.5 | Đóng băng thay đổi (code freeze) ≥2 ngày trước giờ G, chỉ sửa lỗi nghiêm trọng | 🟡 (10) | Tuân thủ | Thông báo cho nhóm |
| 8.6 | Danh sách "Go/No-go": toàn bộ mục 🔴 đã tick | 🔴 (12) | Tổng hợp | Quyết định cuối |
| 8.7 | Xác nhận mục kiểm sau deploy: `/health`, đăng nhập email & CCCD, đổi mật khẩu lần đầu, tạo hồ sơ nháp + tải scan, Thư ký không thấy Quản trị, THV chỉ thấy chi nhánh được cấp | 🔴 (13) | Chạy kịch bản smoke tự động | Xác nhận bằng tay |

---

## 9. Vận hành sau lên

| # | Việc | Ưu tiên | Claude | Bạn |
|---|---|---|---|---|
| 9.1 | Đào tạo người dùng; bản hướng dẫn gửi khách (`legal-office-huong-dan-su-dung.pdf`) dựng từ văn phòng minh họa — dựng lại với tên miền thật | 🔴 (13) | Dựng lại hướng dẫn, ảnh chụp | Tổ chức buổi tập huấn |
| 9.2 | Kênh hỗ trợ + người trực tuần đầu; quy trình xử lý sự cố, ai gọi ai | 🔴 (13) | Soạn quy trình sự cố | Chỉ định người, số liên hệ |
| 9.3 | Theo dõi 2 tuần đầu: lỗi, hiệu năng, dung lượng, chi phí R2/VPS so với ngân sách | 🟡 (14) | Báo cáo hàng tuần | Duyệt chi phí |
| 9.4 | Diễn tập khôi phục định kỳ hằng quý; xem báo cáo backup hằng tuần | 🟡 (15) | Lên lịch + script | Xác nhận |
| 9.5 | Bật tìm kiếm/OCR tài liệu cũ theo giai đoạn: `LEGACY_SEARCH_ENABLED` trước, `LEGACY_OCR_ENABLED` sau khi mục 6.6 đạt; OCR hàng loạt trên máy thuê ngắn hạn, không trên VPS | 🟡 (16) | Làm theo kế hoạch 200GB | Duyệt chi phí thuê máy (ước 30–100 USD một lần), thuê máy |
| 9.6 | Bảo trì: cập nhật bảo mật định kỳ (OS, Node, Postgres, thư viện) hằng tháng | 🟡 (15) | Tạo PR cập nhật | Duyệt lịch bảo trì |
| 9.7 | Gỡ code kiểu cũ (route duyệt đề xuất cũ), dọn issue cũ (#1–#24, #85–#89) | 🟡 (17) | Làm | Duyệt đóng issue |

---

## Thứ tự thực hiện đề xuất

1. **Tuần 1:** 0.1–0.3, 3.1, 0.2 (bạn); 1.1–1.5, 2.1, 4.1 (Claude).
2. **Tuần 2:** 3.2–3.5, 2.3, 2.5, 4.2–4.5, 5.1–5.2, 6.1.
3. **Tuần 3:** 7.1–7.4 (song song, chờ pháp lý), 2.4, 6.3–6.4, 8.1–8.3.
4. **Trước giờ G:** diễn tập 8.2, 8.5, 8.6; cắt chuyển 8.4, 8.7; hậu kiểm mục 9.

Ba rủi ro cần nhìn thẳng: (1) backup chưa từng thử khôi phục; (2) R2 thật, CORS và SMTP chưa từng chạy thật; (3) kiểm pháp lý (BVDLCN, đối chiếu TT 08) không do Claude quyết được.
