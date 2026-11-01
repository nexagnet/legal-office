# Tìm kiếm và lọc DMS ở quy mô 200GB

Khách sẽ nhập khoảng 200GB tài liệu cũ. Tài liệu này ghi lại cách tìm kiếm và lọc danh sách được thiết kế để vẫn nhanh ở quy mô đó, cách đo, và những điều cần biết khi vận hành. Mã nguồn: migration `apps/api/drizzle/0098_dms_scale_search.sql`, `apps/api/src/dms/dms-browse.controller.ts`, công cụ đo `apps/api/bench/dms-scale/`.

## Vấn đề trước đây

- Danh sách hồ sơ chỉ tải tối đa 200 dòng từ API rồi web lọc và tìm trong 200 dòng đó. Hồ sơ thứ 201 trở đi không bao giờ hiện ra, ô tìm kiếm chỉ tìm trong 200 dòng.
- Quyền xem (`dms_case_visible`) chạy từng dòng, mỗi lần gọi nhiều truy vấn con vào bảng quyền.
- Facet (Người tạo, Loại tài liệu, Đơn vị) tải về 2000 dòng rồi web lọc.
- Tìm nội dung scan tính `to_tsvector` lại cho từng dòng khớp, nối 5 bảng, kiểm tra quyền từng dòng.

## Thiết kế

1. **Bảng chỉ mục hồ sơ `dms_case_index`**: một dòng cho mỗi hồ sơ gom sẵn miền, trạng thái, chi nhánh, người tạo, năm ghi sổ, số tài liệu, số scan, loại tài liệu, số yêu cầu sửa đổi chờ duyệt và `search_text` đã bỏ dấu (tiêu đề, thuộc tính hồ sơ, tiêu đề và thuộc tính tài liệu). Trigger trên `dms_case_files`, `dms_documents`, `dms_document_files`, `dms_amendment_requests` giữ đồng bộ. Các bảng gốc không đổi, vẫn chỉ ghi thêm.
2. **Quyền xem tính một lần cho mỗi truy vấn** (`dms_visible_scope`) rồi lọc bằng cột. Ngữ nghĩa giữ nguyên như `dms_case_visible`: hồ sơ đã ghi sổ cần quyền đọc miền (all, hoặc own khi là người tạo), hồ sơ nháp chỉ người tạo, và phạm vi chi nhánh (hồ sơ không có chi nhánh chỉ Admin thấy khi văn phòng có chi nhánh). Test `dms-scale.itest.ts` đối chiếu từng tổ hợp vai, miền, trạng thái với `dms_list_cases`.
3. **Tìm chữ**: `dms_fold()` bỏ dấu tiếng Việt (IMMUTABLE, không cần extension `unaccent`), khớp chuỗi con trên `search_text` với chỉ mục trigram `pg_trgm` (số hiệu, tên đương sự, nội dung trích). Mọi từ phải có mặt. Từ khoá chỉ nhận `[a-z0-9/.-]` nên không chèn được ký tự đại diện.
4. **Phân trang keyset** theo `(ngày ghi sổ hoặc tạo, id)` bằng con trỏ do DB cấp (giữ micro giây); vẫn hỗ trợ `offset` cho thanh số trang. Tổng số đếm tối đa 10001 (hiển thị "10.000+").
5. **Facet có đếm** (`dms_case_facet_counts`): mỗi nhóm (người tạo, chi nhánh, loại tài liệu, tình trạng scan, năm) đếm theo mọi bộ lọc đang chọn trừ chính nhóm đó, nên người dùng thấy đổi sang giá trị khác sẽ ra bao nhiêu hồ sơ.
6. **Tìm nội dung scan (OCR)**: bảng phụ `dms_ocr_search_index` giữ `tsvector` lưu sẵn, `case_id`, `file_id`, cờ `is_current` (bỏ phiên bản cũ của tệp). Ba chiến lược theo độ phổ biến của từ khoá: từ phổ biến duyệt hồ sơ từ mới đến cũ và dừng khi đủ trang; từ hiếm lấy qua GIN rồi xếp theo `ts_rank`; vùng giữa lấy qua GIN xếp theo ngày mới nhất.
7. **Bộ lọc đã lưu** (`dms_saved_filters`): của riêng từng người, theo miền, tối đa 30, ghi đè theo tên.

## Điểm bảo mật cần biết: SECURITY DEFINER

Các toán tử tìm chữ (`@@` trên tsvector, `LIKE` trên trigram, `@>` trên mảng) không "leakproof". Với vai ứng dụng chịu RLS, PostgreSQL từ chối dùng chỉ mục GIN cho chúng: đo thực tế tìm nội dung hiếm từ 70ms thành 3,3 giây. Vì vậy ba hàm đọc nặng (`dms_search_cases`, `dms_case_facet_counts`, `dms_search_content`) là `SECURITY DEFINER` với `search_path = public, pg_temp`, và chỉ hai bảng chỉ mục mới (`dms_case_index`, `dms_ocr_search_index`) bật RLS nhưng không FORCE (chủ bảng được miễn). Các bảng cũ không đổi.

Hàm tự bảo đảm an toàn, không dựa vào RLS:
- từ chối nếu `p_tenant` khác `app.tenant_id` của phiên;
- mọi truy vấn đều có điều kiện `tenant_id`;
- phạm vi chi nhánh và quyền xem áp bằng điều kiện SQL từ `dms_visible_scope` (không phải RLS);
- vai ứng dụng truy cập trực tiếp hai bảng chỉ mục vẫn bị RLS chặn như mọi bảng khác.

Test chứng minh: facet và tìm OCR không lộ hồ sơ chi nhánh khác, hồ sơ chưa gắn chi nhánh (chỉ Admin), người bị khoá, người không quyền; tenant không khớp bị từ chối.

## API

- `GET /dms/case-search`: bộ lọc `domain, status, q, year, from, to, branch, creator, kind, scan (missing|complete|empty), pending`, sắp xếp `sort=newest|oldest`, `cursor`, `limit` (tối đa 200), `offset`, `total`. Trả `rows`, `nextCursor`, `total`, `totalCapped`. Gợi ý khi gõ (typeahead) dùng chính endpoint này với `limit=8&total=false`.
- `GET /dms/case-facet-counts`: cùng bộ lọc, trả `creator, branch, kind, scan, year` mỗi nhóm có `{value, label, n}`.
- `GET /dms/search`: tìm nội dung scan, thêm `year, branch, creator, kind, offset`.
- `GET/POST /dms/saved-filters`, `DELETE /dms/saved-filters/:id`.

## Mục tiêu và kết quả đo

Mục tiêu: p95 dưới 500ms cho mọi thao tác tìm và lọc ở quy mô đầy đủ, với cả ba vai (Admin, Văn thư theo chi nhánh, Thừa hành viên chỉ xem hồ sơ của mình).

Bộ dữ liệu giả (không có dữ liệu khách): 150.000 hồ sơ, 300.000 tài liệu, 900.000 tệp và phiên bản, 742.000 trang OCR, 8 chi nhánh, 60 người dùng, 7 miền, trải 2018 đến 2026. Cơ sở dữ liệu khoảng 2,7GB. Máy 4 CPU, PostgreSQL 16, đo bằng vai không phải superuser để RLS có hiệu lực. File kết quả thô: `apps/api/bench/dms-scale/results-baseline.txt` và `results-optimized.txt`.

| Thao tác (Admin) | Trước (p95) | Sau (p95) |
|---|---|---|
| Danh sách chính thức một miền (200 dòng trước, 50 dòng sau) | 14,8 giây | 11 ms |
| Danh sách mọi miền, không lọc | bị ngắt sau 20 giây | 119 ms |
| Trang sâu (offset 100.000 trước, keyset giữa chừng sau) | 17,3 giây | 25 ms |
| Lọc người tạo + loại tài liệu | không có (web lọc tại chỗ trên 200 dòng) | 18 ms |
| Lọc chi nhánh, nháp, thiếu scan | không có | 10 đến 26 ms |
| Tìm tên đương sự trong một miền | không có (chỉ 200 dòng) | 70 ms |
| Tìm số hiệu, mọi miền | không có | 87 ms |
| Facet người tạo, chi nhánh, loại tài liệu (một miền) | 16,2 giây (2000 dòng thô) | 73 ms |
| Facet mọi miền, không lọc | không đo được (quá 20 giây) | 208 ms |
| Tìm nội dung scan, từ phổ biến | quá 20 giây (bị ngắt) | 85 ms |
| Tìm nội dung scan, từ hiếm | quá 20 giây (bị ngắt) | 97 ms |

Toàn bộ 60 kịch bản (3 vai x 20 thao tác) đều có p95 dưới 210 ms, vượt mục tiêu 500 ms. Văn thư và Thừa hành viên (phạm vi hẹp) nhanh bằng hoặc hơn Admin. Phía trước còn thời gian mạng và hiển thị, không tính ở đây.

Lưu ý khi đọc bảng: cột "trước" là các truy vấn mà API đang gọi (`dms_list_cases` 200 dòng, `dms_case_facets`, `dms_ocr_search`); chúng không có lọc theo người tạo, loại tài liệu hay tìm chữ phía DB nên các dòng đó là "không có".

## Vận hành

- **Triển khai trước khi nhập 200GB.** Lần đầu một tenant gọi tìm kiếm, `dms_index_ensure` nạp chỉ mục cho dữ liệu có sẵn. Với dữ liệu nhỏ (hiện tại) việc này tức thì. Với 150.000 hồ sơ và 742.000 trang OCR mất khoảng 4 phút, nên không nên để lần nạp đầu rơi vào một request: cứ để migration lên trước, sau đó trigger tự giữ chỉ mục theo từng lần nhập.
- Công cụ nhập 200GB sẽ chậm thêm do trigger (ước tính dưới 1ms cho mỗi hàng ghi, so với thời gian tải 200GB là không đáng kể).
- `pg_trgm` là extension "trusted" nên tài khoản chủ DB thường tạo được. Nếu host không cho, migration vẫn chạy, chỉ thiếu chỉ mục trigram: tìm chữ trên hồ sơ quét tuần tự bảng chỉ mục (vài trăm ms ở 150.000 hồ sơ).
- Hồ sơ bị huỷ hoặc tài liệu bị huỷ được xử lý qua trigger như mọi thay đổi khác.
- Tái tạo dữ liệu đo: `psql -v cases=150000 -d <db cách ly> -f apps/api/bench/dms-scale/generate.sql`, `setup-role.sql`, rồi `node bench.mjs scenarios.optimized.mjs`. Không bao giờ chạy trên dev hay prod.
