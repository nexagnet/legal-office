# Kế hoạch tích hợp 200 GB dữ liệu cũ của khách hàng

Lập 04/11/2026. Dành cho người phụ trách triển khai (kỹ thuật) và người đại diện khách hàng. Phần kỹ thuật chi tiết của công cụ nằm ở [legacy-import.md](../architecture/legacy-import.md); hướng dẫn từng bước cho người ngồi máy khách nằm ở `apps/api/package-lo-import/HUONG-DAN.txt` (đi kèm gói `lo-import-win-x64.zip`).

## 1. Phạm vi: nhập cái gì, không nhập cái gì

- **Nhập:** toàn bộ tệp trong kho của khách (scan, Word, PDF, ảnh...), giữ nguyên cấu trúc thư mục. Mỗi tệp được lưu vào kho riêng tư (Cloudflare R2) và có một bản ghi đánh dấu "tài liệu cũ".
- **Không nhập:** hồ sơ nghiệp vụ. Công cụ không đọc nội dung, không tạo hồ sơ Vi bằng, Tống đạt, Xác minh, Tổ chức THA, không điền số hồ sơ hay người liên quan. Nhân viên tra cứu tài liệu cũ theo cây thư mục. Muốn đưa một tài liệu cũ thành hồ sơ mới thì tạo hồ sơ trong hệ thống và tải lại bản scan như thường lệ.
- **Bất biến:** tệp đã nhập không xóa, không ghi đè, không sửa, kể cả Admin (ép bằng trigger trong DB; API cố ý không có `DELETE` hay `PUT`). Nhập nhầm thư mục thì không gỡ được, vì vậy phải thử nhỏ trước (mục 4.3).
- **Tệp gốc trên máy khách không bị đụng tới:** công cụ chỉ đọc.

## 2. Việc cần chốt với khách trước khi chạm vào dữ liệu thật

| Việc | Ai | Ghi chú |
|---|---|---|
| Văn bản đồng ý của khách về nơi lưu (R2, vùng nào) và việc đưa dữ liệu lên hệ thống | Khách | Bắt buộc. Dữ liệu cá nhân nên người có chuyên môn xác nhận thủ tục theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 |
| Kho nguồn: ổ nào, đường dẫn nào, bao nhiêu GB, thư mục nào không được nhập | Khách | Đối chiếu với kết quả `lo-import scan` ở mục 4.2 |
| Máy chạy công cụ: Windows, ổ cứng gắn trực tiếp hoặc chia sẻ mạng nội bộ ổn định, bật liên tục | Khách | Máy không được ngủ; nên cắm dây mạng |
| Đường truyền lên: tốc độ upload thực đo được | Khách | Xem ước lượng ở mục 6 |
| Người ngồi canh bước thử nhỏ và người nhận kết quả đối chiếu | Khách + chúng ta | |

## 3. Điều kiện của hệ thống production (làm trước, theo [go-live-checklist.md](go-live-checklist.md))

1. Máy chủ mới đã chuyển xong, văn phòng của khách đã tạo bằng `bootstrap-tenant.cli` (lệnh in `TENANT_ID` và `OFFICE_ID`). **Ghi lại `OFFICE_ID`**: lệnh `lo-import open` cần mã này.
2. `FILE_STORE=r2` và đủ `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. `FILE_STORE=local` KHÔNG dùng được cho đường nhập này (API trả 501 `DIRECT_UPLOAD_NOT_SUPPORTED`).
3. Bucket R2: riêng tư, bật versioning, đủ hạn mức cho 200 GB trở lên (tệp trùng nội dung chỉ lưu một lần). Tính chi phí lưu trữ hằng tháng trước khi nhập.
4. Công cụ chạy trên máy khách, không phải trình duyệt, nên thường không cần cấu hình CORS cho bucket. Nếu lúc thử thấy PUT bị từ chối thì kiểm cấu hình bucket trước tiên.
5. Sao lưu Postgres đã bật và đĩa DB còn đủ chỗ. Mỗi tệp là một dòng trong `dms_legacy_files` (ước chừng vài trăm byte đến 1 KB kèm chỉ mục), một triệu tệp cỡ vài trăm MB đến 1 GB. Đây là ước chừng, chưa đo.
6. `lo-api` chạy ổn định, giữ 1 instance, tránh deploy lại trong lúc đang nhập (nếu deploy thì công cụ gặp lỗi mạng, ghi tệp lỗi và chạy lại được).
7. Việc nhập chỉ cần mạng tới `lo-api` (xin liên kết) và tới R2 (PUT thẳng). Dung lượng đi qua API gần bằng 0.

## 4. Quy trình thực hiện

### 4.1 Chuẩn bị tài khoản và gói công cụ

1. Admin đăng nhập, đổi mật khẩu lần đầu.
2. Tạo **tài khoản riêng cho việc nhập** (Quản trị > Tài khoản), mật khẩu tối thiểu 12 ký tự. Cấp quyền `dms.legacy.import` (thêm `dms.legacy.read` nếu người này cũng đối chiếu) qua quyền riêng hoặc nhóm quyền. Vai Admin mặc nhiên có hai quyền này, nhưng không nên để thông tin đăng nhập Admin chính nằm trên máy khách.
3. Tài khoản nhập phải **đăng nhập web một lần để đổi mật khẩu lần đầu**; công cụ tự đăng nhập sẽ thất bại nếu cờ buộc đổi mật khẩu còn đó.
4. Tạo gói và gửi cho khách:

   ```bash
   pnpm build
   pnpm --filter @legal-office/api package:import
   ```

   Ra `apps/api/dist-package/lo-import-win-x64.zip` (gồm `node.exe`, mã chương trình, `lo-import.cmd`, `lo-import.env.example`, `HUONG-DAN.txt`).
5. Trên máy khách: giải nén ra ổ cứng (ví dụ `C:\lo-import`), sao chép `lo-import.env.example` thành `lo-import.env` và điền:

   ```
   LO_API_URL=https://<tên miền chính thức>/api
   LO_TENANT_ID=<TENANT_ID>
   LO_LOGIN=<email hoặc CCCD của tài khoản nhập>
   LO_PASSWORD=<mật khẩu>
   ```

   Cách này tự đăng nhập lại khi phiên 12 giờ hết hạn, không cần người canh suốt vài chục giờ. Cách dán cookie `LO_COOKIE` vẫn dùng được nhưng phải có người dán lại mỗi 12 giờ.

### 4.2 Quét thử (không gửi gì)

```
lo-import scan "D:\KhoTaiLieu"
```

Kết quả: số tệp, tổng dung lượng, số tệp bị bỏ qua theo lý do. Đối chiếu với số liệu khách nói. Bỏ qua: `Thumbs.db`, `desktop.ini`, `.DS_Store`, `~$*`, `.~lock.*`, `*.tmp`, liên kết tượng trưng, tên có dấu `\`, đường dẫn dài hơn 1000 ký tự, mục không đọc được. **Gửi khách xác nhận danh sách bỏ qua**, vì những tệp này sẽ không vào hệ thống.

### 4.3 Thử một thư mục nhỏ (bắt buộc, vài chục tệp)

```
lo-import open --office <OFFICE_ID> --label "Thử nghiệm" "D:\KhoTaiLieu\ThuMucNho"
lo-import run  --batch <mã đợt> "D:\KhoTaiLieu\ThuMucNho"
lo-import report --batch <mã đợt>
lo-import close  --batch <mã đợt>
```

Chọn thư mục nhỏ có đủ loại: PDF, ảnh, Word, tên tiếng Việt có dấu, một nhánh thư mục lồng sâu, một cặp tệp trùng nội dung. Kiểm:

- `failed` rỗng, `matches: true`.
- Một tệp tên tiếng Việt mở/tải lại đúng nội dung (qua `GET /dms/legacy/files/:id/download` bằng tài khoản có `dms.legacy.read`).
- Trên R2 thấy đối tượng dưới `t/<tenant>/legacy/<văn phòng>/...`.
- Tệp thử đã nhập thì ở lại (không xóa được), nên chọn thư mục thử là tài liệu thật của kho, không phải tệp rác.

### 4.4 Nhập cả kho

```
lo-import open --office <OFFICE_ID> --label "Kho tài liệu cũ 2016-2024" "D:\KhoTaiLieu"
lo-import run  --batch <mã đợt> --concurrency 3 "D:\KhoTaiLieu"
```

- Mỗi lần chạy ghi sổ tiến độ `lo-import-<mã đợt>.jsonl` trong thư mục đang đứng. **Không xóa, không di chuyển** cho tới khi đóng đợt.
- Đứt mạng, mất điện, tắt cửa sổ: chạy lại đúng lệnh `run`. Tệp đã xong (kích thước và ngày sửa không đổi) được bỏ qua.
- Mã thoát: `0` xong; `2` còn tệp lỗi (chạy lại để thử lại); `3` dừng vì hết phiên đăng nhập (chạy lại).
- Nên chia thành nhiều đợt theo thư mục lớn (theo năm hoặc theo loại) thay vì một đợt duy nhất, để mỗi đợt có số liệu đối chiếu riêng và sự cố không kéo theo cả kho. Mỗi đợt có sổ tiến độ riêng.

### 4.5 Đối chiếu và đóng đợt

```
lo-import report --batch <mã đợt>
lo-import close  --batch <mã đợt>
```

`matches: true` nghĩa là số tệp trên hệ thống khớp sổ trên máy. Đối chiếu thêm: tổng tệp `scan` (trừ phần bỏ qua), `fileCount` và `totalBytes` của đợt, và `uniqueObjects` (thấp hơn `fileCount` khi có tệp trùng nội dung) so với số đối tượng thực có trên R2. Lưu biên bản (ngày, người chạy, các con số, tệp bị bỏ qua) kèm văn bản đồng ý của khách. Đóng đợt xong thì không thêm tệp vào đợt đó được nữa.

### 4.6 Dọn dẹp bảo mật

Xóa `lo-import.env`, tạm khóa hoặc đổi mật khẩu tài khoản nhập (Quản trị > Tài khoản). Giữ lại `lo-import-<mã đợt>.jsonl` làm bằng chứng đối chiếu (không chứa mật khẩu, có đường dẫn tệp).

## 5. Rủi ro và cách xử lý

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| **Chưa thử với Cloudflare R2 thật** (mới thử kho giả lập S3) | Cao | Mục 4.3 là lần thử R2 thật đầu tiên. Nếu PUT/HEAD/GET lỗi thì dừng và báo, không nhập cả kho |
| **Gói Windows chưa chạy thử trên máy Windows thật** | Cao | Cùng mục 4.3. Chạy `scan` và một thư mục nhỏ trước |
| Tệp lớn hơn 5 GiB bị từ chối (`FILE_TOO_LARGE`) | Trung bình | Công cụ chưa tải nhiều phần. Lấy danh sách từ `failed`, báo khách; nếu có nhiều tệp loại này (video, sao lưu) thì phải làm thêm tính năng trước |
| Đứt mạng giữa tệp lớn | Thấp | Tệp đó tải lại từ đầu; tệp khác không ảnh hưởng |
| Tệp bị sửa trong lúc nhập | Thấp | Báo `CHANGED_DURING_IMPORT`, không đăng ký nội dung nửa vời; chạy lại sau |
| Hai tệp cùng đường dẫn nhưng khác nội dung | Thấp | `PATH_CONFLICT`, không ghi đè; xử lý tay |
| Nhập nhầm thư mục | Trung bình | Không gỡ được (bất biến). Giảm rủi ro bằng `scan` kèm khách xác nhận và thử nhỏ |
| Máy khách ngủ, khóa màn hình, mất điện | Trung bình | Tắt chế độ ngủ; cắm dây mạng; có sổ nên chạy lại làm tiếp |
| Mật khẩu tài khoản nhập nằm trên máy khách | Trung bình | Tài khoản riêng quyền tối thiểu; xóa `lo-import.env` và khóa tài khoản khi xong |
| Tệp nhiễm virus | Trung bình | Công cụ chưa quét virus. Nhờ khách tự quét kho trước khi nhập |
| Chi phí R2 và dung lượng DB | Thấp | Tính trước (mục 3) |

## 6. Ước lượng thời gian

Thời gian chủ yếu là đường truyền lên. Tải thuần 200 GB:

| Đường lên thực đo | Thời gian |
|---|---|
| 20 Mbps | khoảng 22 giờ |
| 50 Mbps | khoảng 9 giờ |
| 100 Mbps | khoảng 4,5 giờ |

Cộng thêm thời gian băm sha256 (đọc ổ đĩa một lượt, ổ cơ có thể vài giờ). Mỗi tệp cần hai lần gọi API nên kho nhiều tệp nhỏ (vài trăm nghìn tệp) sẽ lâu hơn ước lượng trên. Nên chạy ngoài giờ làm việc để không chiếm băng thông văn phòng. Tăng `--concurrency` (mặc định 3) chỉ có ích khi đường truyền còn dư. Công cụ chưa giới hạn băng thông.

## 7. Sau khi nhập: nhân viên truy cập thế nào

- Hiện **chưa có giao diện web** để duyệt cây tài liệu cũ và tải về; truy cập qua API:
  - `GET /dms/legacy/files?officeId=<id>&prefix=<thư mục>&limit=50&offset=0` liệt kê theo thư mục.
  - `GET /dms/legacy/files/:id/download` mở hoặc tải (R2 trả liên kết ngắn hạn; mỗi lần mở được ghi nhật ký).
- Quyền xem là `dms.legacy.read`, tách riêng với quyền nhập; người nhập không tự có quyền xem. Gán qua quyền riêng hoặc nhóm quyền.
- Nếu khách cần nhân viên tra cứu thường xuyên thì phải làm màn hình duyệt tài liệu cũ trước khi bàn giao (chưa làm, cần chốt với khách).
- Tìm toàn văn trong nội dung (OCR) không áp dụng cho tài liệu cũ.

## 8. Danh sách kiểm nhanh

- [ ] Có văn bản đồng ý của khách; đã chốt nơi lưu và người chịu trách nhiệm
- [ ] Production chạy `FILE_STORE=r2`, bucket riêng tư có versioning, đủ hạn mức; Postgres đã sao lưu
- [ ] Đã ghi `TENANT_ID` và `OFFICE_ID`
- [ ] Tài khoản nhập riêng đã đổi mật khẩu lần đầu, có `dms.legacy.import`
- [ ] Gói `lo-import-win-x64.zip` chạy được trên máy Windows của khách (`scan` ra số liệu)
- [ ] Đã thử một thư mục nhỏ thành công trên R2 thật: `failed` rỗng, `matches: true`, mở lại được một tệp
- [ ] Khách đã xác nhận danh sách tệp bị bỏ qua
- [ ] Đã nhập từng đợt, mỗi đợt có biên bản đối chiếu (`scan`, `report`, đối tượng trên R2)
- [ ] Đã đóng đợt, xóa `lo-import.env`, khóa tài khoản nhập
- [ ] Đã thống nhất cách nhân viên tra cứu tài liệu cũ (API hay màn hình mới)

## 9. Những điều chưa kiểm chứng (nói thẳng với khách)

- Chưa thử với R2 thật và chưa chạy trên Windows thật (mục 5).
- Tự đăng nhập của công cụ (`LO_TENANT_ID`, `LO_LOGIN`, `LO_PASSWORD`) mới kiểm bằng giả lập, chưa chạy qua một đợt dài vượt hạn phiên 12 giờ.
- Tệp trên 5 GiB, giới hạn băng thông, khung giờ chạy, quét virus và giao diện duyệt chưa làm.
