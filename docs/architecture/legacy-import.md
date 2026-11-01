# Nhập hàng loạt tài liệu cũ

Mục đích: đưa kho tệp có sẵn của khách (hàng trăm GB trên máy tính) vào DMS, **chỉ lưu tệp và đánh dấu "tài liệu cũ"**.
Không tạo hồ sơ nghiệp vụ, không nhập dữ liệu nghiệp vụ. Đề xuất gốc: `reports/de-xuat-nhap-200gb-tai-lieu-cu-2026-10-31.md`.

## Nguyên tắc

- **Bất biến như mọi bản ghi DMS:** không xoá, không ghi đè, không sửa trực tiếp, kể cả Admin. Ép bằng trigger (`dms_legacy_files` chỉ ghi thêm; đợt chỉ đi `OPEN -> CLOSED`). API cố ý không có `DELETE`/`PUT`.
- **Theo đợt:** mỗi lần nhập là một đợt. Đóng đợt xong thì không thêm tệp được nữa (cả ở hàm lẫn trigger).
- **Chống trùng theo nội dung:** khoá đối tượng = `t/<tenant>/legacy/<văn phòng>/<2 ký tự đầu hash>/<sha256>`. Cùng nội dung trong một văn phòng chỉ lưu một lần; mỗi đường dẫn gốc vẫn là một bản ghi riêng nên cấu trúc thư mục được giữ nguyên.
- **Khoá do máy chủ dựng.** Hàm `dms_legacy_register` so khớp và từ chối khoá khác `dms_legacy_object_key(...)`. Ứng dụng dựng cùng công thức ở `apps/api/src/dms/legacy.ts`.
- **Quyền theo Nhóm quyền** (không Role): `dms.legacy.import` (mở/đóng đợt, nhập) và `dms.legacy.read` (liệt kê, mở/tải). Người nhập không tự động được xem. Mỗi lần mở tệp ghi `audit_log` và `dms_audit_records`. Nhật ký không chứa tên tệp/đường dẫn.
- **Khoá R2 không nằm trên máy khách.** Công cụ chỉ nhận liên kết PUT có thời hạn (1 giờ). Liên kết ký content-length, content-type và `x-amz-checksum-sha256`, nên kho tự từ chối nội dung sai.

## Luồng nhập một tệp

1. Công cụ quét thư mục, tính sha256 theo luồng, ghi sổ tiến độ.
2. `POST /dms/legacy/batches/:id/files/prepare`. Nếu hash đã có trong văn phòng: API đăng ký ngay, không tải lại. Nếu chưa: trả liên kết PUT.
3. Công cụ PUT thẳng lên kho (tự thử lại khi lỗi mạng/5xx; liên kết hết hạn thì xin lại).
4. `POST .../files/complete`: API kiểm tra tệp đã nằm trong kho với đúng kích thước rồi đăng ký bản ghi. Gọi lại an toàn.

Đăng ký lại cùng đường dẫn và cùng nội dung là thành công, không ghi thêm. Cùng đường dẫn nhưng khác nội dung bị từ chối (`PATH_CONFLICT`), không ghi đè.

## Dùng công cụ `lo-import`

Quyền: vai Admin của văn phòng mặc nhiên có `dms.legacy.import` và `dms.legacy.read` (xem #284). Người khác cần được thêm vào một Nhóm quyền có mã đó.

**Gói chạy trên Windows không cần cài Node.** Tạo gói (cần mạng tới nodejs.org; kiểm sha256 của `node.exe` theo `SHASUMS256.txt`):

```
pnpm build
pnpm --filter @legal-office/api package:import      # ra apps/api/dist-package/lo-import-win-x64.zip
```

Gói gồm `node\node.exe`, `app\*.js`, `lo-import.cmd`, `lo-import.env.example` và `HUONG-DAN.txt` (hướng dẫn từng bước cho người chạy, nguồn ở `apps/api/package-lo-import/`). Cấu hình đặt trong `lo-import.env` cạnh `lo-import.cmd`:

```
LO_API_URL=https://www.nexagnet.com/api
LO_COOKIE=lo_session=<giá trị cookie phiên>      # đăng nhập bằng Chrome, F12 > Application > Cookies
```

Lệnh (trên máy phát triển có Node thì thay `lo-import` bằng `node dist/legacy-import/import.cli.js`):

```
lo-import scan   D:\LuuTru                                    # đếm, không gửi gì
lo-import open   --office <id> --label "Kho cũ 2016-2020" D:\LuuTru
lo-import run    --batch <mã đợt> --concurrency 3 D:\LuuTru
lo-import report --batch <mã đợt>                            # so số tệp trên hệ thống với sổ trên máy
lo-import close  --batch <mã đợt>
```

- Sổ tiến độ `lo-import-<mã đợt>.jsonl` nằm ở thư mục hiện tại. **Giữ lại** để chạy tiếp; chạy lại lệnh `run` bỏ qua tệp đã xong (kích thước và ngày sửa không đổi) và làm nốt phần còn lại. Dòng cuối bị cắt do tắt máy đột ngột được bỏ qua.
- Phiên đăng nhập sống 12 giờ (`SESSION_TTL_MINUTES`, mặc định 720), ngắn hơn một lần nhập 200 GB. Khi API trả 401, công cụ hỏi cookie mới ngay tại cửa sổ lệnh và làm tiếp, không phải chạy lại. Không có cửa sổ tương tác thì dừng với mã thoát 3.
- Bỏ qua và báo trong tổng kết: `Thumbs.db`, `desktop.ini`, `.DS_Store`, `~$*`, `*.tmp`, liên kết tượng trưng, tên có `\`, đường dẫn dài quá 1000 ký tự, mục không đọc được. Trên Windows đường dẫn được thêm tiền tố `\\?\` để đọc được thư mục lồng sâu quá 260 ký tự.
- Lỗi một tệp không dừng cả đợt; mã thoát 2 nếu có tệp lỗi. Tệp bị sửa trong lúc nhập không được đăng ký nội dung nửa vời (kho kiểm tra hash).

## Đã kiểm chứng

- `apps/api/src/db/dms-legacy-import.itest.ts`: hàm DB, quyền, bất biến, cô lập tenant (PostgreSQL thật).
- `apps/api/src/db/dms-legacy-import.http.itest.ts`: công cụ nhập chạy thật qua API thật, PostgreSQL thật, kho giả lập S3 kiểm checksum: giữ cấu trúc, chống trùng kể cả khi chạy song song, thử lại, tiếp tục sau lỗi, tệp đổi giữa chừng, đợt đã đóng, quyền xem/tải, nhật ký.
- `apps/api/src/storage/s3-presign.test.ts`: cấu trúc chữ ký của liên kết ký sẵn.

## CHƯA kiểm chứng / chưa làm (cần biết trước khi chạy dữ liệu thật)

- **Chưa thử với Cloudflare R2 thật.** Liên kết ký sẵn mới được thử với kho giả lập. Phải thử một tệp thật trên bucket thử (PUT có checksum header, HEAD, GET) trước khi nhập dữ liệu thật.
- **Tệp lớn hơn 5 GiB** bị từ chối (PUT một lần). Tải nhiều phần và chạy tiếp từng phần chưa làm; đứt mạng giữa một tệp lớn thì tệp đó tải lại từ đầu.
- **`FILE_STORE=local` không hỗ trợ** đường nhập này (trả 501 `DIRECT_UPLOAD_NOT_SUPPORTED`); cần `FILE_STORE=r2` hoặc kho S3 khác.
- **Gói Windows chưa được chạy thử trên một máy Windows thật.** Đã kiểm: build, đóng gói, sha256 của `node.exe`, chạy mã trong gói bằng Node trên Linux. Phải chạy `scan` và một thư mục nhỏ trên máy khách trước khi nhập cả kho.
- **Đăng nhập bằng cookie dán tay** (chưa có token riêng cho công cụ).
- **Giao diện web** để duyệt thư mục tài liệu cũ và gán hai quyền mới vào Nhóm quyền chưa làm (hiện qua API và DB).
- Chưa có giới hạn tốc độ băng thông và khung giờ chạy; tạm dùng `--concurrency` thấp.
- Quét virus tệp nhập chưa làm.
- Dữ liệu thật chỉ nhập sau khi khách đồng ý bằng văn bản về nơi lưu và người có chuyên môn xác nhận thủ tục theo Luật BVDLCN 91/2025/QH15.
