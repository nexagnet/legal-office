# Khảo sát: Bucket Lock đã bật thì thùng rác backend có cần sửa không (2026-11-09)

Chỉ đọc code (main @ 397c601), chưa sửa gì. Khóa: bucket lo-files, prefix `t/<TENANT_ID_VP_HBT>/legacy/`, giữ vô thời hạn, xóa/ghi đè trả 409.

## Kết luận ngắn
- **Thùng rác KHÔNG cần sửa.** Không có đường xóa nào đụng prefix `legacy/`.
- **Có 1 chỗ nên sửa nhỏ (không bắt buộc ngay):** chạy lại nhập tệp, khi tệp đã lên R2 nhưng chưa đăng ký DB, sẽ PUT lên khóa đã khóa và nhận 409. Sửa đơn giản: ở `prepare`, gọi `head(key)`; nếu đã có đúng kích thước thì bỏ qua PUT.

## 1. Mọi chỗ backend xóa/ghi đè object
| Chỗ | Làm gì | Prefix đụng tới | Đụng vùng khóa? |
|---|---|---|---|
| `dms/scan-purge.ts` (cron 02:30 giờ VN, `SCAN_PURGE_SCHEDULE=on`) | `store.delete` object của scan đã xóa mềm quá 30 ngày | khóa trong `dms_document_versions` (`t/<tenant>/dms/<id>/...`) và `dms_submission_files` (`t/<tenant>/dms/staged/...`) | Không |
| `storage/evidence.ts` `recordWithUpload` | xóa object vừa PUT nếu DB từ chối (dọn mồ côi) | `th/`, `vx/`, `vb/`, `of/`, `thv-cards/`... | Không |
| `vibang/vibang-files.controller.ts` | như trên, cho bản scan cuối vi bằng | `t/<tenant>/vibang/...` | Không |
| `dms-submissions`, `dms-cases` | PUT khóa có `randomUUID()` | `dms/...` | Không (khóa mới mỗi lần, không ghi đè) |
| `dms-legacy.controller.ts` | chỉ presign PUT, HEAD, presign GET; **không có delete** | `legacy/<office>/<sha2>/<sha256>` | Có, nhưng chỉ ghi |
| `LocalFileStore.delete` | chỉ dev/test | n/a | n/a |

Không còn `DeleteObject` nào khác (đã grep `.delete(`, `DeleteObjectCommand`). Không có job dọn nào khác, không có lifecycle rule trong repo.

## 2. Thùng rác hiện hoạt động ra sao
- Chỉ xóa mềm **file scan** (không phải hồ sơ). Giữ 30 ngày (`purge_after`), trong thời gian đó Admin chỉ **xem và tải**; **không có khôi phục** (migration 0105 ghi rõ). Không có lệnh "dọn ngay" bằng tay, chỉ có cron.
- Dọn: **xóa object trước, đánh dấu `purged_at` ở DB sau** (`dms_scan_purge_done`). Dòng DB không bao giờ bị DELETE (trigger append-only), chỉ chuyển một chiều: chưa xóa → đã xóa → đã dọn.
- Có xóa object thật. Có kiểm khóa phải bắt đầu bằng `t/<tenantId>/`.
- Tài liệu cũ nằm ở `dms_legacy_files`, bảng khác hoàn toàn, không có `deleted_at`/`purge_after` nên **không bao giờ vào danh sách dọn**. Tệp cũ không xóa mềm được (bất biến).

## 3. Nếu lệnh xóa nhận 409 thì sao
Hiện tại **không xảy ra** vì khóa chỉ phủ `legacy/` mà purge không đụng. Nhưng nếu một ngày nào đó có khóa legacy lọt vào purge: `store.delete` ném lỗi → bắt ở `scan-purge.ts` → log lỗi, **không** đánh dấu `purged_at` (DB nhất quán, không mất dữ liệu) → file đó được thử lại mỗi đêm. Giới hạn: cả lô lỗi thì dừng (`progress === 0`), tối đa 50 lô/tenant, nên không lặp vô hạn trong một lượt, nhưng sẽ báo lỗi lặp mỗi đêm. Không có trạng thái nửa vời (DB chưa đánh dấu, object còn nguyên).
Với `evidence.ts` và vibang-files: delete đã `.catch(() => undefined)` nên 409 bị nuốt, chỉ để lại object mồ côi, không làm hỏng request.

## 4. Chạy lại tệp đã nhập (PUT lên khóa đã khóa)
- Luồng bình thường an toàn: `prepare` tra `dms_legacy_known_hashes`; sha256 đã đăng ký thì **không trả liên kết PUT** (dedupe). Chạy lại cả thư mục đã nhập xong không PUT lại gì.
- **Kẽ hở duy nhất:** tệp đã PUT lên R2 nhưng `complete` chưa ghi DB (mất mạng, client dừng giữa chừng, lô đóng). Chạy lại: hash chưa known → `prepare` trả liên kết PUT → PUT vào khóa đã khóa → **R2 trả 409** → `client.upload` ném `ApiError(409, UPLOAD_FAILED)`, không retry (chỉ retry 5xx/429) → tệp đó báo lỗi mãi, dù object đã đúng. Trước khi bật khóa thì PUT ghi đè vô hại; giờ thì kẹt.
- Tương tự nếu bật khóa mà chưa kiểm PUT lặp: nên thử một tệp ở tenant thử (đã có trong kế hoạch 200GB).

## 5. Phương án đơn giản nhất
**Không sửa thùng rác.** Nếu muốn vá kẽ hở chạy lại (khuyến nghị làm trước đợt nhập 200GB), chọn một trong hai, cái đầu đơn giản hơn:
1. **Server (`dms-legacy.controller.ts` `prepare`, ~5 dòng):** trước `presignPut`, `const h = await store.head(key)`; nếu `h` có và `h.size === f.size` thì trả `{status:'UPLOADED'}` để client gọi thẳng `complete` (complete đã kiểm HEAD và size, gọi lại an toàn). Chỉ cần thêm nhánh `UPLOADED` ở `legacy-import/run.ts`.
2. Client: coi 409 ở PUT là "đã có", chuyển sang `complete`. Rẻ hơn nhưng nuốt 409 mù, kém an toàn vì không kiểm size.

Kèm 1 test: prepare khi object đã tồn tại đúng size → không trả URL.

## 6. Rủi ro
- Phương án 1: thêm 1 request HEAD mỗi tệp chưa known (rẻ so với PUT). Nếu object có sẵn nhưng sai size thì vẫn trả liên kết PUT và sẽ 409 → báo lỗi rõ, cần xử lý tay (không ghi đè được, đúng ý muốn của khóa).
- Hệ quả cần biết: do khóa vô thời hạn và DB bất biến, tệp nhập nhầm không gỡ được kể cả sau khi có thể gỡ khóa; đã ghi trong kế hoạch 200GB.
- Nếu sau này thêm tính năng "xóa tài liệu cũ" hay chuyển scan vào prefix `legacy/`, phải quay lại xem xét (khi đó xóa sẽ 409).
- Không rủi ro với scan-purge, evidence, vibang hiện tại.
