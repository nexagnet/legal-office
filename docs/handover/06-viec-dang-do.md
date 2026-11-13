# 06. Việc còn dang dở (tính đến 13/11/2026)

Ký hiệu: 🧑 = chủ dự án (phungviet) hoặc bên ngoài làm; 🤖 = Claude/AI làm được trong repo, CI hoặc trên server; ⚖ = cần người có chuyên môn pháp lý. Thứ tự trong mỗi nhóm là thứ tự nên làm.

## A. Đưa production lên chạy (chặn dữ liệu thật)

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| A1 | **R2:** tạo token backend cho `lo-files` (Object Read & Write, chỉ bucket đó), bucket `lo-backup` + token writer + token reader; **CORS** cho `lo-files`; đưa khóa vào `.env` trên server bằng `read -s` | 🧑 (🤖 hướng dẫn, kiểm ghi/đọc thử và đặt cron) | Hướng dẫn từng bước đã soạn ở thread Tencent (tệp 03 mục 5). Chưa làm tính đến 13/11 sáng |
| A2 | **GitHub Secrets** `DEPLOY_HOST`, `DEPLOY_USER` (`dev`), `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` | 🧑 (🤖 hướng dẫn tạo khóa ed25519 riêng) | Sau đó 🤖 chạy thử workflow `deploy` lần đầu (chưa từng chạy) |
| A3 | **DNS** `thihanhandansuhaibatrung.vn` bản ghi A (TTL thấp) về server; đặt `SITE_ADDRESS` ở Caddy; `WEB_ORIGIN`, `PUBLIC_WEB_URL`, CORS dùng đúng tên miền | 🧑 DNS, 🤖 cấu hình | Chủ dự án nói DNS để sau |
| A4 | **SMTP** (quên mật khẩu, nhắc hạn): thông tin máy chủ mail, SPF/DKIM/DMARC cho domain; nhập ở Quản trị > Cài đặt văn phòng; hoặc quyết định tạm không bật | 🧑 | Chưa có SMTP thì "Quên mật khẩu" không gửi được thư (Admin vẫn đặt lại mật khẩu được) |
| A5 | **`bootstrap-tenant`**: tên văn phòng, các chi nhánh (Trụ sở chính, Đông Anh, Bắc Ninh), email + họ tên + CCCD (tùy chọn) của Admin đầu tiên; đặt `TENANT_ID`, `TENANT_NAME` vào `.env` | 🧑 cung cấp, 🤖 chạy | Mật khẩu Admin do chủ dự án tự đặt, không gửi cho AI. Ghi lại `OFFICE_ID` cho `lo-import` |
| A6 | Bật lịch nền cho đúng tenant: `SCAN_PURGE_SCHEDULE=on` + `SCAN_PURGE_TENANT_IDS`, `REMINDERS_SCHEDULE=on` + `REMINDER_TENANT_IDS` | 🤖 | **Đã sửa (13/11):** `deploy/docker-compose.yml` nay truyền hai biến danh sách, mặc định bằng `TENANT_ID`; chỉ cần `.env` có `TENANT_ID` đúng sau `bootstrap-tenant` |
| A7 | **Cron** backup/monitor/warmup trên server; cài `zstd`, `rclone` | 🤖 | Theo `docs/engineering/deploy-tencent.md` |
| A8 | **Diễn tập khôi phục** (`restore-test.sh`), ghi ngày vào `go-live-checklist.md` | 🤖 chạy, 🧑 xem kết quả | Bắt buộc trước dữ liệu thật; chưa từng làm |
| A9 | **Cất khóa giải mã backup + `.env` ở 2 nơi** ngoài máy chủ (trình quản lý mật khẩu + bản cất két) | 🧑 | Mất khóa thì mọi bản sao vô dụng |
| A10 | **Gia cố SSH** (khóa, tắt mật khẩu, fail2ban), giám sát uptime ngoài miễn phí | 🤖 | |
| A11 | **Bucket Lock cho scan mới** (`dms/`): quyết có rule 30 ngày không (kiểm xung đột với `scan-purge`) | 🧑 quyết, 🤖 kiểm tài liệu Cloudflare | Tùy chọn |
| A12 | **OCR scan mới** trên production: chọn cách chạy (cron có giới hạn trên server, hoặc worker trên PC) | 🤖 đề xuất, 🧑 duyệt | `compose` chưa có service OCR |
| A13 | **Cắt chuyển:** chọn giờ ít người dùng, runbook từng bước và rollback, chỉ định người trực tuần đầu | 🤖 runbook, 🧑 chọn | |
| A14 | **Quyết định pháp lý về nơi đặt dữ liệu**: server ở Singapore, tệp trên R2 (Mỹ/toàn cầu); chủ dự án nói không yêu cầu dữ liệu trong nước (9/11) nhưng cần ⚖ xác nhận theo Luật BVDLCN 91/2025/QH15 | 🧑 ⚖ | **Đánh dấu rủi ro (suy đoán của Claude)**, chưa có ý kiến pháp lý |

## B. Chuyển 200GB (sau khi A xong)

1. 🧑 Xác nhận với khách văn bản đồng ý **có gồm OCR toàn bộ** không.
2. 🧑 Mang ổ cứng của khách cắm vào PC; 🤖+🧑 chạy `lo-import scan` rồi lô thử 50–100 tệp, rồi chạy đầy đủ (tệp 04).
3. 🧑 cung cấp **300–500 trang scan mẫu thật** → 🤖 đo OCR trên PC (chất lượng, giây/trang) → quyết bật OCR/tìm tài liệu cũ.
4. 🤖 OCR hàng loạt trên PC, nạp vào DB production theo lô (tắt trigger, `ANALYZE`, `dms_index_ensure`), bật `LEGACY_SEARCH_ENABLED`.
5. 🧑 khách nghiệm thu, sau đó trả ổ.
- Chưa thử **R2 thật + Windows thật** với `lo-import`: rủi ro lớn nhất của nhập 200GB.

## C. Sản phẩm

| # | Việc | Ai | Trạng thái |
|---|---|---|---|
| C1 | **Thiết kế lại vùng lọc** của danh sách 4 nghiệp vụ (bỏ ô tìm trùng header, 3 hàng có nhãn Hồ sơ / Việc cần làm / Bộ lọc, hàng "Đang lọc", "+ Tạo hồ sơ" đầu trang, ⋯ chứa Xuất sổ/Cột hiển thị/Hiển thị gọn) | 🧑 duyệt → 🤖 code | **Đang chờ chủ dự án duyệt** bản vẽ HTML (Figma hết hạn mức). Thread riêng đang giữ việc này, rồi sẽ viết lại hướng dẫn |
| C2 | **Viết lại hướng dẫn sử dụng** (PDF có ảnh, khớp giao diện mới, có phần lọc) | 🤖 | Làm sau C1. PR #435 (hướng dẫn v2, dựa trên bản cũ) sẽ đóng khi bản mới xong |
| C3 | **Nút "Thử lại OCR"** cho tệp OCR lỗi (tối đa 3 lần tự thử) | 🤖 | **Đã làm (13/11, migration 0127):** `POST /dms/files/:id/ocr-retry` → `dms_ocr_retry` (chỉ tệp FAILED, cùng quyền thêm tài liệu, có nhật ký); nút hiện cạnh chữ "OCR lỗi" ở tab Tài liệu |
| C4 | **Chip "Quá hạn"** ở bộ lọc | 🤖 | **Đã làm cho Tống đạt (13/11, migration 0128):** quá hạn = đã ghi sổ, chưa tích "Đã trả KQ", và quá 2 ngày làm việc (lịch văn phòng) kể từ "Ngày tống đạt" (Điều 25.2/26, chưa đối chiếu bản gốc). **Giả định:** "Đã trả KQ" = đã báo kết quả cho cơ quan yêu cầu. Vi bằng, Xác minh, Tổ chức **chưa có** vì sổ không có ô ngày có cấu trúc (ngày ký hợp đồng, ngày chấm dứt THA...): cần thêm ô ngày vào form mục A rồi mới làm. Hạn lưu trong `dms_case_index.due_at`, đổi lịch nghỉ không tự tính lại hạn cũ |
| C5 | **Cache ngắn hạn cho truy vấn đếm bộ lọc "mọi miền"** (1,1–1,6s trên 150k hồ sơ) | 🤖 | Tùy chọn, chưa làm |
| C6 | Câu hỏi nghiệp vụ mở: hồ sơ không có tài liệu có được ghi sổ không (đang cho phép, chỉ cảnh báo); quy tắc đếm cột Tổ chức THA ở N-09; xác nhận MISA gate cũ đã bị thay (D-2); mẫu Excel gốc N-09/N-10 của khách | 🧑 | ❓ mở |
| C7 | Kiểm hộp thoại in PDF sổ trên máy thật; người có chuyên môn của văn phòng duyệt từng sổ in ra so với TT 08 | 🧑 ⚖ | Chưa xác nhận |
| C8 | Kiểm E2E còn thiếu | 🤖 | **Một phần (13/11):** test HTTP mới `dms-c8.http.itest.ts` (chạy trong job `db-integration`): xuất JSON/CSV/PDF đủ 7 sổ sau khi ghi sổ, hủy nháp (cần lý do, giữ lịch sử, không ghi sổ sau hủy), ma trận quyền 4 vai, thử lại OCR, đường đọc `ocr-status` và `thv/options`. **Tìm ra lỗi thật:** `GET /dms/files/ocr-status`, `GET /dms/thv/options`, đường tìm/trạng thái OCR tài liệu cũ và 2 đường phụ lục/đính kèm hợp đồng cũ trả 500 vì tên hàm DB thiếu trong danh sách cho phép của `repo.rows` (đã sửa + test quét mọi lời gọi). **Smoke trình duyệt (13/11):** gói `e2e/` (Playwright 1.63.0) + job CI `e2e-smoke`: dựng DB tạm, văn phòng giả, API (đăng nhập mật khẩu) và web thật rồi chạy đăng nhập, đổi mật khẩu lần đầu, tạo nháp Vi bằng, ghi sổ (001/2026/VB-THV), thấy ở danh sách, đăng xuất. Chạy cục bộ: `pnpm build`, `DATABASE_URL=... bash e2e/start-stack.sh`, `pnpm --filter @legal-office/e2e test:e2e`, `bash e2e/stop-stack.sh`. Job chưa là check bắt buộc (đổi ruleset là bước R3 riêng). **LỖI ĐANG MỞ (13/11): smoke chập chờn đỏ.** Khoảng 1/5 lần (CI main #1014 và dưới tải CPU cục bộ) API ghi sổ trả 200 (`CASE_RECORDED`, dữ liệu đã ghi: tải lại trang thấy "Đã ghi sổ") nhưng trang chi tiết vẫn hiện bản Nháp sau `router.refresh()` trong 30 giây; yêu cầu RSC làm mới có phát ra và trả về trang đầy đủ (~20 KB). Nghi: đua của bộ định tuyến Next 15.5.28 (yêu cầu prefetch cùng URL còn đang bay khi bấm lưu) hoặc RSC trả dữ liệu cũ; chưa chốt. Đây có thể là lỗi người dùng thật (50 chỗ gọi `router.refresh()` trong `components/`). Cách tái hiện: chạy vòng lặp `start-stack` + `test:e2e` khi 6 tiến trình ăn CPU. Hướng thử tiếp: in nội dung RSC làm mới (mã tìm thấy "Bản nháp" hay "Nội dung sổ S-02"), thử `router.refresh()` trong `startTransition` hoặc điều hướng cứng sau ghi sổ; ngắn hạn có thể tải lại trang trong smoke. **Còn thiếu:** OCR PDF nhiều trang tống đạt bằng engine thật, ma trận quyền theo đúng nhóm quyền mẫu của khách |
| C9 | **Mẫu sổ mới bắt buộc từ 01/01/2027** (TT 08 Điều 38): rà lại xuất sổ cho kịp | 🤖 ⚖ | Cần kiểm trước năm 2027 |
| C10 | Dọn kho: 7+ PR cũ mở (#386, #224, #198, #193, #176, #166, #160, #435, #427) và nhiều nhánh `claude/*` đã squash-merge; xóa không hoàn lại nên hỏi chủ dự án | 🤖 đề xuất, 🧑 duyệt | Chưa làm |
| C11 | Gỡ route/trang duyệt đề xuất quyền kiểu cũ (`/quan-tri/phan-quyen/de-xuat`, `POST /dms/permission-requests/:id/review`) khi không còn dòng PENDING | 🤖 | Không chặn production |
| C12 | **Rà giao diện quá tải** theo [ui-overload-audit](reports/ui-overload-audit-2026-10-27.md) (viết 27/10, trước khi chuyển sang DMS nên **nhiều trang đã bị thay**; chỉ dùng làm tham khảo) | 🤖 | Lỗi thời một phần |
| C13 | **OCR PDF scan nhiều trang hết giờ trên dev** (tệp 13 trang, 2,9 MB, hồ sơ Vi bằng 038/2026/VB-TPL báo "OCR lỗi"; hai tệp khác cùng hồ sơ cũng lỗi) | 🤖 | **Nguyên nhân (13/11, từ log job `lo-ocr` trên Northflank dev):** job chạy cron mỗi 10 phút, 0.2 vCPU/512MB (gói miễn phí Northflank không cho lớn hơn, production sẽ chuyển Tencent nên không nâng gói dev). Mỗi lần thử dừng đúng ~120 giây rồi ghi `ENGINE_ERROR` (3 lần: 08:12, 08:14, 08:16) = `execFile` hết giờ 120s ở `pdftoppm` 300 dpi hoặc `tesseract`; sau 3 lần thì `FAILED`. Job vẫn exit 0 nên Northflank báo SUCCESS. Chưa loại hẳn OOM-kill (chưa đọc metric RAM), nhưng mốc 2 phút chỉ hợp với hết giờ. Không phải lỗi tải R2 (sẽ là `FILE_MISSING`) hay thiếu gói `vie` (tệp nhỏ vẫn OCR được). Lỗi 500 của `ocr-status` (PR #453) là lỗi riêng, không gây "OCR lỗi". **Cách sửa (PR #457, đang chờ CI/merge):** dựng ảnh từng trang, timeout theo trang (`OCR_PAGE_TIMEOUT_SECONDS`, mặc định 240), 200 dpi (`OCR_PDF_DPI`), `OMP_THREAD_LIMIT=1`, mã lỗi `OCR_TIMEOUT`/`OCR_KILLED`/`OCR_TOOL_MISSING`/`PDF_NO_PAGES`. **Còn lại:** (1) merge #457 khi CI xanh (lưu ý: `git push` cục bộ bị hook pre-push chặn vì máy dev chạy Node 26, repo cần Node 22; chủ dự án cho phép bỏ qua hook cho lần đẩy này, CI vẫn là cổng); (2) sau khi deploy dev, bấm "Thử lại OCR" cho 3 tệp và đo giây/trang thật trên 0.2 vCPU (13 trang có thể vẫn mất hơn một lượt cron 10 phút; nếu vẫn lỗi thì cân nhắc lưu tiến độ từng trang để lần sau làm tiếp, chưa làm vì cần migration); (3) đọc metric RAM của `lo-ocr` để loại trừ OOM. Truy cập log dev: CLI Northflank với `USERPROFILE=C:
| C15 | **Bỏ "Loại tài liệu" và luồng tải lên phức tạp (13/11, theo yêu cầu chủ dự án):** hết bộ lọc Loại tài liệu (danh sách, tìm kiếm, chip, URL `lt`, API `kind`; bộ lọc đã lưu cũ bị bỏ qua khi mở), hết mục "Tải thêm scan cho tài liệu này"; hộp thoại Tải lên chỉ chọn nhiều tệp (đổi tên được), mọi tệp vào tài liệu chung "Tài liệu khác" và tính là bản scan. Cột DB `dms_documents.kind`, `dms_case_index.doc_kinds` và tham số `p_kind` giữ nguyên (không mất dữ liệu). **Đã xử lý "Việc còn dở" của Tổ chức THA (13/11, migration 0130):** hết dựa vào loại N-08; dùng ô tích sau ghi sổ (cùng cờ `dms_case_returned` với "Đã trả KQ", giao diện Tổ chức gọi là "Đã có N-08"; làm ở danh sách chứ không ở mục C của form vì N-08 là bước sau ghi sổ, dữ liệu sổ bất biến). Còn dở = chưa tích và chưa có tài liệu loại N-08 cũ (suy ra từ dữ liệu cũ). **Nếu PR lọc theo cột (#458) merge sau:** đổi số migration của nó thành 0131 và đưa thay đổi `open_flag` của Tổ chức vào bản `dms_case_index_refresh` của nó, kẻo ghi đè | 🤖 | Xong, nhớ khớp #458 |
fhome` (tài khoản thứ hai), `northflank get job logs --projectId legal-office --jobId lo-ocr --runId <id>` |

## D. Pháp lý, tuân thủ, con người

- ⚖ Đối chiếu tính năng với NĐ 151/2026 và TT 08/2026 (sổ, mẫu, thời hạn lưu, bất biến) do luật sư/văn phòng duyệt: Claude không thay ý kiến pháp lý.
- ⚖ Bảo vệ dữ liệu cá nhân: thông báo xử lý, văn bản đồng ý, đánh giá tác động nếu luật yêu cầu; hợp đồng/điều khoản dịch vụ với khách (SLA, quyền sở hữu dữ liệu, xuất dữ liệu khi chấm dứt). Nói rõ với khách: **chưa có dự phòng nóng**.
- 🧑 **Tập huấn** nhân viên, chỉ định người trực tuần đầu, thống nhất trình duyệt khách dùng (Chrome/Edge/Safari).
- 🧑 MFA cho Admin (đề xuất, chưa quyết); kiểm thử xâm nhập (IDOR, URL ký sẵn) là tùy chọn.

## E. Rủi ro đã biết

1. **RAM 2GB mỏng** (~550MB available lúc tải nặng): theo dõi `monitor.sh`; đường lui nâng 4GB/OVH.
2. **Giá Tencent năm 2** tăng (~$50,40 tham chiếu, không cam kết) và khuyến mãi có thể giới hạn mỗi tài khoản; Oracle free có thể là bản sao thứ ba nhưng không đáng tin.
3. **Cache nguội** sau restart/reboot chậm 1,5–2,6s mỗi truy vấn đầu.
4. **Một máy duy nhất**: server chết = ngừng toàn hệ thống (dữ liệu an toàn nhờ R2/PC nếu backup chạy thật).
5. **Phiên điều khiển server (`claude rc`) có thể offline** làm việc trên server dừng; ưu tiên thread đám mây cho code, ssh/CD cho server.
6. Dữ liệu nhập nhầm vào `legacy/` không gỡ được (Bucket Lock + trigger).
