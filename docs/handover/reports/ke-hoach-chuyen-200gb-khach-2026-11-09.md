# Kế hoạch chuyển 200GB tài liệu scan của khách lên hệ thống (9/11/2026)

Chỉ là kế hoạch, chưa thực hiện gì. Các con số thời gian là ước, đo lại ở bước thử. Dựa trên `docs/engineering/nhap-200gb-tai-lieu-cu.md` (công cụ `lo-import`), PR #429 (tải từng tệp, OCR/tìm kiếm tùy chọn) và các báo cáo cùng thư mục.

## 0. Tình trạng hiện tại cần nhớ
- Bucket Lock **đã áp** cho bucket `lo-files`, rule `legacy-<8 ký tự đầu tenant>`, prefix `t/<TENANT_ID_VP_HBT>/legacy/`, vô thời hạn. Tệp đã vào prefix này **không xóa, không ghi đè được**.
- Khóa tệp trong R2 là `t/<tenant>/legacy/<văn phòng>/<2 ký tự đầu sha256>/<sha256>` (`apps/api/src/dms/legacy.ts`). Prefix do tenant quyết định, nên **không thể thử "một prefix tạm" trong cùng tenant thật**; muốn thử không bị khóa phải dùng tenant khác (xem bước 2).
- Bảng `dms_legacy_files` cũng bất biến (trigger). Nên nhập nhầm = dòng DB ở lại vĩnh viễn, dù bucket có khóa hay không. Khóa bucket chỉ bổ sung lớp chống xóa tệp thật.
- Chưa có production thật, chưa thử R2 thật và Windows thật (rủi ro lớn nhất). OCR và tìm kiếm tài liệu cũ mặc định **tắt**.

## 1. Kiểm kê dữ liệu của khách (làm trước tiên, chưa chạm hệ thống)
Hỏi khách và ghi lại:
1. **Cách nhận**: ổ cứng/NAS tại văn phòng (khuyến nghị: chạy `lo-import` ngay tại máy khách, đọc trực tiếp), hay họ gửi ổ cứng/link? Tránh bắt khách tải về rồi gửi lại.
2. **Quy mô**: chạy `lo-import scan` để lấy số tệp, tổng dung lượng, số tệp bị bỏ qua; đối chiếu với con số khách nói.
3. **Định dạng**: thống kê theo đuôi tệp (PDF, ảnh, Word...), tệp >5GiB (bị từ chối), tên quá dài/ký tự lạ, tệp mật khẩu.
4. **Trùng lặp**: công cụ tự bỏ trùng theo sha256 (lưu một lần), `uniqueObjects` < `fileCount` là bình thường.
5. **Thư mục không được nhập** (cá nhân, nhạy cảm, rác) do khách chỉ định.
6. **Quét virus** do khách tự làm trước khi nhập (công cụ không quét).
7. **Văn bản đồng ý** của khách về nơi lưu và việc đưa dữ liệu lên (Luật BVDLCN 91/2025/QH15), có người có chuyên môn xác nhận.

## 2. Thứ tự các bước
| Bước | Việc | Điều kiện qua |
|---|---|---|
| 1 | Kiểm kê + `scan` + khách xác nhận danh sách bỏ qua | Số liệu khớp, có văn bản đồng ý |
| 2 | **Thử 300–500 tệp ở tenant thử** (không bị khóa), xem mục 3 | Đạt hết mục kiểm ở bước 3 |
| 3 | Thử 50–100 tệp thật ở tenant thật để xác nhận Windows + R2 + khóa | Xem mục 4; chấp nhận các tệp này ở lại vĩnh viễn nên chọn tệp thật của khách |
| 4 | Chạy full theo đợt (mỗi năm/loại thư mục một đợt) | `matches: true` từng đợt |
| 5 | Đối chiếu tổng + biên bản + nghiệm thu | Mục 6 |
| 6 | Dọn bảo mật, giữ ổ gốc đến khi khách ký nghiệm thu | Mục 7 |
| 7 | (Sau, tách riêng) bật OCR/tìm kiếm | Mục 8 |

## 3. Bước thử 300–500 tệp (không bị khóa)
- Dùng **tenant thử** (tạo bằng `bootstrap-tenant.cli` trên môi trường dev, hoặc bucket thử riêng). Rule khóa chỉ phủ prefix của tenant VP Hai Bà Trưng, nên prefix `t/<tenant thử>/legacy/` **xóa được**; DB thử là dữ liệu giả, bỏ cả DB dev được.
- Lấy mẫu 300–500 tệp **thật** của khách đủ loại: PDF to nhỏ, ảnh, Word, tên tiếng Việt có dấu/ký tự lạ, thư mục lồng sâu, một cặp tệp trùng, một tệp gần 1GB, một tệp hỏng.
- Kiểm: `failed` rỗng (hoặc đúng các tệp hỏng dự kiến), `matches: true`; mở lại ngẫu nhiên 20 tệp đúng nội dung (nhất là tên Unicode); số đối tượng trong bucket thử = `uniqueObjects`; tốc độ thực đo (MB/giây, tệp/giờ) để chốt thời gian toàn bộ; thử **ngắt giữa chừng rồi chạy lại** (kéo dây mạng, đóng cửa sổ) và thử chạy lại sau khi đã xong (không nhân đôi).
- Nên chạy thử đúng máy Windows của khách, đúng đường truyền, đúng khung giờ định nhập thật.

## 4. Khóa tệp: điều phải thử riêng ở tenant thật
Vì prefix thật đã khóa, cần kiểm trước khi chạy full (bước 3 ở bảng): **chạy lại cùng một tệp đã nhập có bị lỗi do khóa không** (PUT ghi đè khóa đã tồn tại có thể bị R2 từ chối, trong khi công cụ coi là "chạy lại an toàn"). Nếu bị lỗi, cần sửa `lo-import`/API để HEAD trước và bỏ PUT khi khóa đã tồn tại (cùng sha256 = cùng nội dung). Đây là điều kiện chặn của kế hoạch "chạy lại khi đứt". Cũng kiểm thao tác `prepare`/`complete` với tệp trùng nội dung giữa hai đợt.

## 5. Chạy full bằng lo-import
- **Máy**: Windows của khách, cắm dây mạng, tắt ngủ/khóa màn hình, đọc từ ổ gắn trực tiếp hoặc chia sẻ nội bộ ổn định; chạy ngoài giờ làm việc.
- **Tài khoản**: riêng cho nhập, quyền `dms.legacy.import`, dùng `LO_TENANT_ID/LO_LOGIN/LO_PASSWORD` để tự đăng nhập lại (phiên 12 giờ). Chưa kiểm qua đợt dài, nên theo dõi đợt đầu.
- **Băng thông/thời gian** (chỉ tải, chưa tính băm sha256 và nhiều tệp nhỏ): 20 Mbps ~22 giờ, 50 Mbps ~9 giờ, 100 Mbps ~4,5 giờ. Thực tế nhân 1,5–2 nếu nhiều tệp nhỏ hoặc ổ cơ. Chốt lại bằng số đo ở bước 3.
- **Đứt thì chạy lại** đúng lệnh `run`; sổ `lo-import-<đợt>.jsonl` không xóa/không di chuyển. Mã thoát 0 xong, 2 còn lỗi, 3 hết phiên.
- **Chia đợt** theo thư mục lớn, mỗi đợt `report` và `close` riêng.
- **Không deploy API** trong lúc nhập (giữ 1 instance).

## 6. Đối chiếu số tệp và checksum
Mỗi đợt: `scan` (trừ phần bỏ qua) = `fileCount` = số dòng trong sổ; `matches: true`; `totalBytes` khớp; `uniqueObjects` = số đối tượng thực trên R2 (đếm bằng `rclone size/ls` ở prefix legacy). Checksum: sha256 đã tính ở máy khách và khai khi nhập; R2 kiểm lại bằng header `x-amz-checksum-sha256` lúc PUT. Thêm kiểm chọn mẫu ngẫu nhiên 50–100 tệp: tải lại từ hệ thống, so sha256 với bản gốc. Lưu biên bản (ngày, người chạy, các con số, danh sách bỏ qua, danh sách lỗi) kèm văn bản đồng ý. Sau khi nhập, đưa số tổng cho khách xác nhận.

## 7. Bản gốc, dự phòng và Bucket Lock
- **Giữ ổ/kho gốc của khách nguyên vẹn** đến khi khách ký nghiệm thu **và** đã có bản sao dự phòng của dữ liệu đã nhập (chép đêm sang bucket thứ hai ở nhà cung cấp khác bằng `rclone copy`, không dùng `sync`, theo `bien-phap-khoi-phuc-du-lieu`). Nếu khách chỉ có một bản, đề nghị họ tự giữ một bản ổ nguyên trạng.
- **Bucket Lock** (đã áp) — hai lựa chọn:
  1. **Giữ khóa như hiện nay (khuyến nghị)**. Ưu: đơn giản, không có khoảng hở nào để xóa nhầm/độc hại, không phải nhớ áp lại. Nhược: tệp nhập nhầm (nhất là nhạy cảm) nằm lại vĩnh viễn trong bucket (DB cũng ở lại vì bất biến). Giảm rủi ro bằng `scan` + khách xác nhận, thử tenant thử và 50–100 tệp thật ở bước 3, và chia đợt nhỏ trước.
  2. **Gỡ rule tạm lúc nhập, áp lại sau đối chiếu**. Ưu: nhập nhầm gỡ được tệp trong bucket. Nhược: thêm hai thao tác thủ công trên production, có khoảng hở không chống xóa, dễ quên áp lại, và dòng DB vẫn không gỡ được nên "gỡ" chỉ làm DB trỏ tới tệp không còn (liên kết hỏng). Cần kiểm tài liệu Cloudflare xem gỡ/áp lại rule có hành xử như mong đợi không (chưa xác minh).
- Khuyến nghị: lựa chọn 1, vì người dùng ưu tiên đơn giản và DB đã bất biến sẵn.
- **Quyền và nơi lưu**: kiểm khóa API của ứng dụng chỉ ghi/đọc không có quyền xóa; `dms.legacy.import` chỉ cấp cho tài khoản nhập; `dms.legacy.read` chỉ cho người cần xem; thử từ tài khoản khác văn phòng phải bị từ chối (RLS); bucket riêng tư, không công khai; nếu sau này chuyển OVH thì dữ liệu phải qua `rclone` và kiểm lại checksum (xem kế hoạch OVH).
- **Dọn bảo mật** sau nhập: xóa `lo-import.env`, khóa/đổi mật khẩu tài khoản nhập, giữ sổ `.jsonl` làm bằng chứng.

## 8. OCR và tìm kiếm — tách riêng, bật sau
Đã có PR #429 (tải từng tệp, OCR/tìm tùy chọn qua `LEGACY_OCR_ENABLED`, `LEGACY_SEARCH_ENABLED`, mặc định tắt). Chỉ bật **sau** khi nhập và nghiệm thu xong. Thứ tự: đo 300–500 trang mẫu → quyết nơi chạy (máy thuê một lần, không chạy trên VPS 2 core) → chạy hàng loạt → bật tìm kiếm cho một nhóm người dùng thử. Chi tiết: `ke-hoach-tim-kiem-200gb-2026-11-09.md`. Nói thẳng với khách: tìm được theo chữ in, không đảm bảo chữ viết tay.

## 9. Nghiệm thu với khách
1. Bàn giao biên bản số liệu (mục 6) và danh sách bỏ qua/lỗi.
2. Khách tự chọn 20–50 tệp bất kỳ, tìm theo cây thư mục ở `/dms/tai-lieu-cu` và mở/tải, so với bản gốc.
3. Kiểm quyền: nhân viên được xem thấy, người không có quyền không thấy.
4. Khách ký xác nhận; từ đó mới được trả/tái sử dụng ổ gốc.

## 10. Rủi ro
| Rủi ro | Xử lý |
|---|---|
| Chưa thử R2 thật/Windows thật | Bước 3 và 4 ở tenant thử rồi tenant thật; dừng nếu lỗi |
| PUT lặp trên khóa đã khóa lỗi (mục 4) | Thử sớm; sửa công cụ nếu cần |
| Nhập nhầm tệp nhạy cảm, ở lại vĩnh viễn | `scan` + khách xác nhận; thử nhỏ; đợt nhỏ |
| Tệp hỏng/có mật khẩu/>5GiB | Ghi lỗi theo tệp, không dừng đợt; báo khách; tệp >5GiB cần làm tải nhiều phần |
| Tên Unicode/NFC-NFD, ký tự lạ, đường dẫn >1000 ký tự | Có trong mẫu thử; kiểm mở lại; tệp bị bỏ qua đưa vào danh sách |
| Đường truyền chậm/đứt | Chạy lại được; chạy ngoài giờ; chia đợt |
| Tệp bị sửa lúc nhập | `CHANGED_DURING_IMPORT`, chạy lại sau |
| Dữ liệu cá nhân/nhạy cảm | Đồng ý bằng văn bản; quyền tối thiểu; không gửi OCR ra bên ngoài khi chưa đồng ý |
| Mật khẩu nằm trên máy khách | Tài khoản riêng, xóa sau khi xong |
| Mất bản gốc trước khi xác nhận | Giữ ổ gốc đến khi ký nghiệm thu + có bản sao dự phòng |

## 11. Câu hỏi cần anh/chị quyết
1. Khách giao dữ liệu bằng cách nào (chạy `lo-import` tại máy khách, hay nhận ổ cứng về chạy ở chỗ mình)? Đường lên thực đo của khách là bao nhiêu?
2. Giữ Bucket Lock như hiện nay (khuyến nghị) hay gỡ tạm lúc nhập?
3. Chấp nhận dùng **tenant thử + dev** cho bước thử 300–500 tệp, sau đó 50–100 tệp thật ở tenant thật?
4. Có văn bản đồng ý của khách và ai xác nhận thủ tục BVDLCN chưa?
5. Danh sách thư mục không nhập và việc khách tự quét virus.
6. Chuyển OVH trước hay nhập 200GB trước? (Khuyến nghị: chốt nơi lưu **trước** khi nhập; nếu giữ R2 thì nhập ngay được.)
7. Khi nào bắt đầu OCR/tìm kiếm và phạm vi (xem kế hoạch tìm kiếm)?
8. Thời hạn giữ ổ gốc sau nghiệm thu.
