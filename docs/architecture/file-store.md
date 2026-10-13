# Kho tệp và tải bản scan cuối

Chủ chọn **Cloudflare R2** làm kho tệp (quyết định 2026-10-13). Nghiệp vụ không biết tệp nằm ở đâu: chỉ dùng cổng `FileStore`
(`apps/api/src/storage/file-store.ts`) với `put`, `get`, `delete` theo khoá đối tượng.

## Cấu hình (biến môi trường, bí mật không bao giờ vào repo)

| `FILE_STORE` | Cần thêm | Dùng cho |
|---|---|---|
| `r2` | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Triển khai thật (R2 qua S3 API, endpoint `https://<account>.r2.cloudflarestorage.com`) |
| `local` | `FILE_STORE_DIR` | Dev, test, hoặc máy có ổ đĩa bền |
| (bỏ trống) | — | Các thao tác cần tệp trả **503** `FILE_STORE_NOT_CONFIGURED`, không giả vờ lưu |

Thiếu biến của `r2` thì API **không khởi động** và nêu rõ biến nào thiếu. Bucket R2 phải để **riêng tư**, không bật truy cập công khai.

## Tải bản scan cuối

`POST /vibang/cases/:id/final-scan`, thân yêu cầu là chính tệp, `Content-Type: application/pdf`.

- Máy chủ kiểm tra: đúng content-type, bắt đầu bằng `%PDF-`, không rỗng, tối đa **25 MB** (413 nếu vượt).
- Máy chủ **tự tính** sha256, kích thước và khoá đối tượng `t/<tenant>/vibang/<hồ sơ>/final-scan/<uuid>.pdf`. Client không được chọn khoá.
- Ghi tệp trước, rồi gọi `vibang_add_document` (DB quyết định quyền, đòi đã đóng dấu, ghi audit). Nếu DB từ chối hoặc lỗi,
  tệp vừa ghi bị xoá để không để lại tệp mồ côi.
- Siêu dữ liệu ở `vibang_documents` bất biến (append-only); bản scan cuối khoá hash như đã mô tả ở `legal-evidence.md`.

## Bằng chứng tống đạt (N-02)

`POST /service-of-documents/documents/:id/served`, thân yêu cầu là chính tệp (PDF, JPEG hoặc PNG; tối đa 25 MB).
Cùng cách làm với bản scan cuối: máy chủ kiểm tra chữ ký đầu tệp, tự tính sha256 và khoá `t/<tenant>/td/<văn bản>/evidence/<uuid>.<đuôi>`,
ghi tệp rồi gọi `td_record_attempt(SERVED, ...)`; DB từ chối (không phải THV phụ trách, chưa giao THV, văn bản đã kết thúc) thì xoá tệp.
**Giả định cần xác nhận:** định dạng bằng chứng cho phép (PDF/JPEG/PNG) là lựa chọn kỹ thuật của tôi vì chưa có quy định nghiệp vụ.
Đường cũ `documents/:id/attempts` vẫn nhận `evidenceKey` do client gửi (dùng cho các kết quả không thành công); chỉ `served` đi qua kho tệp.

## Xác minh và thi hành án

Cùng bộ nhận tệp và cùng quy tắc dọn tệp mồ côi (`storage/evidence.ts`, PDF/JPEG/PNG, tối đa 25 MB):

| Đường | Ghi vào | Hàm DB quyết định |
|---|---|---|
| `POST /verification/rounds/:id/source-files?kind&confidentiality&purpose` | `vx_sources` | `vx_add_source` (THV phụ trách, Admin, Trưởng VP) |
| `POST /enforcement-cases/obligations/:id/event-files?kind&note&idempotencyKey` | `th_obligation_events` | `th_record_event` (THV phụ trách, Admin, Trưởng VP) |
| `POST /enforcement-cases/:id/completion-file` | `th_cases.completion_evidence_*` | `th_complete_case` (chỉ Admin, Trưởng VP; mọi nghĩa vụ đã hoàn tất) |

Công văn (module Văn phòng) dùng cùng cơ chế:

| Đường | Ghi vào | Hàm DB quyết định |
|---|---|---|
| `POST /office/correspondence/:id/attachment-files?role` | `of_attachments` (`ATTACHMENT`, `FINAL_DOCUMENT`, `SEND_PROOF`) | `of_corr_attach` |
| `POST /office/correspondence/:id/issuance-file?refNo&issuedOn&sendMethod` | chứng từ gửi đi + ban hành | `of_corr_issue` (Admin/Trưởng VP có quyền ký) |

Màn `/cong-van` dùng `FINAL_DOCUMENT` (bắt buộc trước khi trình duyệt) và chứng từ gửi khi ban hành. Bản cuối chỉ nhận PDF/JPEG/PNG
như mọi chứng cứ khác; nếu chủ cần Word cho bản cuối thì phải thêm kiểm tra tệp riêng.

Mô tả (loại nguồn, mục đích, ghi chú) đi theo query vì thân yêu cầu là chính tệp. Hoàn thành vòng xác minh vẫn dùng
`rounds/:id/completion` (cần đã có ít nhất một nguồn). Ghi lại kết quả với cùng `idempotencyKey` vẫn trả thành công
và không tạo bản ghi mới, nhưng tệp của lần gửi lặp đó bị bỏ lại trong kho (tệp mồ côi nhỏ, chưa có việc dọn định kỳ).

## Giới hạn đã biết (chưa làm)

- **Chưa có tải xuống/xem tệp**: cần hàm đọc có kiểm tra quyền theo phạm vi ghi trước, không mở đường đọc không có kiểm soát.
- Chỉ nhận PDF. Quét mã độc/kiểm tra sâu cấu trúc PDF chưa có; tệp khác PDF cần review bảo mật tệp riêng.
- Tệp tải lên chưa mã hoá ở tầng ứng dụng (dựa vào mã hoá lưu trữ của R2).
- Chứng cứ cho Tống đạt (N-02), nguồn của vòng Xác minh và kết quả THA sẽ dùng cùng cổng này ở các lát sau.

## Sổ quyết định

- `GET /office/signers?officeId` liệt kê người có quyền ký pháp lý (Admin/Trưởng VP có `legal_signer`) để chọn người ký; chỉ trả cho thành viên Admin, Trưởng VP, Thư ký, Văn thư của văn phòng.
- `POST /office/decision-files` vào sổ một quyết định kèm bản đã ký (PDF/JPEG/PNG ≤25 MB); các trường đi theo query, máy chủ tự tính hash và khoá `t/<tenant>/of/decisions/…`. Từ chối (trùng số, người ký không có quyền…) thì không để lại tệp.

## Vật tư (đọc tồn kho)

`GET /office/stock?officeId` và `GET /office/batches?officeId` đọc tồn và lô còn hàng qua `of_search_stock`/`of_search_batches` (migration 0019). Phạm vi đọc như công văn: Admin/Trưởng VP/Thư ký thấy cả văn phòng, Văn thư/Kế toán thấy chi nhánh được cấp, THV không thấy dòng tồn. Màn hình `/vat-tu` có bảng tồn, thêm vật tư, nhập/xuất FIFO và kiểm kê lô (Admin/Trưởng VP). Menu hiện mục Vật tư thêm cho Văn thư vì DB cho phép nhập/xuất.

## Biểu mẫu TT06 (tải lên và tải về)

- `GET /office/tt06-forms?officeId` liệt kê bản mới nhất mỗi phụ lục (migration 0020, không trả khoá tệp).
- `POST /office/tt06-form-files?officeId&code&title` đăng ký bản mới kèm tệp (Admin/Trưởng VP; PDF/JPEG/PNG ≤25 MB), khoá do máy chủ dựng.
- `GET /office/tt06-forms/:code/file?officeId` tải bản mới nhất: DB kiểm quyền và ghi audit, máy chủ đọc tệp từ kho (khoá phải thuộc tenant) và trả `attachment`. Đây cũng là mẫu để thêm tải/xem cho các tệp chứng cứ khác.
- Định dạng PDF/JPEG/PNG là lựa chọn kỹ thuật của tôi; nếu cần tải DOCX/XLSX thì mở rộng danh sách loại tệp cho riêng biểu mẫu.
