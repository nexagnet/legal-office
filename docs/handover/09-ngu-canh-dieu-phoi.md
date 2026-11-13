# 09. Ngữ cảnh điều phối (cập nhật 13/11/2026)

Tệp này ghi lại những gì phiên điều phối đang biết mà các tệp 01 đến 08 chưa có: quy tắc làm việc của chủ dự án, trạng thái các PR ngày 13/11, việc còn mở cần chủ dự án quyết hoặc làm, và ghi chú vận hành. Viết để tài khoản hoặc phiên AI sau đọc là tiếp tục được. Repo công khai nên tệp này không có bí mật, địa chỉ máy chủ, CCCD hay mã văn phòng của khách.

## 1. Quy tắc của chủ dự án (đã chốt, áp dụng ngay)

- **Tự xác nhận trước khi hỏi** (13/11): đọc code, `docs/handover`, issue và PR cũ trước; chỉ hỏi phần không tìm ra (pháp lý, tiền, dữ liệu khách, bí mật, deploy production, xóa dữ liệu hoặc dịch vụ), kèm bằng chứng đã kiểm.
- **Tự merge**: Claude được squash-merge PR vào `main` khi CI đúng head xanh và không còn review mở. **Hỏi trước** với bí mật và xóa dịch vụ (đúng như `AGENTS.md`); các thay đổi `.github`, CI, hạ tầng và deploy production cũng hỏi trước, trừ khi chủ dự án đã nói rõ cho phép (ví dụ PR #454 thêm job CI không bắt buộc, chủ dự án đã cho merge). Không force-push, đồng bộ bằng merge `origin/main`.
- **Trả lời tiếng Việt, ngắn, kết quả trước.**
- **Tìm thư viện có sẵn trước khi tự viết.** Giao diện tối giản, bảng không bỏ cột (dùng `DataTable`), bám Figma DMS v2, bộ lọc theo nghiệp vụ là trung tâm.
- Dữ liệu dev là dữ liệu giả; dữ liệu khách thật không vào repo, báo cáo hay log. Không chạy `tools/seed-demo` trên production.
- Điều chưa chốt có ảnh hưởng pháp lý, tiền hoặc dữ liệu khách thì hỏi, không tự quyết. Phần suy ra được từ quy tắc đã chốt hoặc Figma thì tự chốt và nói rõ đã chốt gì.

## 2. Trạng thái PR ngày 13/11/2026

Đã merge vào `main`:

| PR | Nội dung |
|---|---|
| #450 | `deploy/docker-compose.yml` truyền `REMINDER_TENANT_IDS` và `SCAN_PURGE_TENANT_IDS` (mặc định bằng `TENANT_ID`) |
| #451 | Nút "Thử lại OCR" cho tệp OCR lỗi (migration 0127, `POST /dms/files/:id/ocr-retry`) |
| #452 | Chip "Quá hạn báo kết quả" chỉ cho Tống đạt; hạn 2 ngày làm việc kể từ "Ngày tống đạt" (migration 0128) |
| #453 | Sửa 500 ở `ocr-status`, lựa chọn THV và đường tài liệu cũ (tên hàm DB thiếu trong danh sách cho phép của `repo.rows`); thêm test HTTP C8 |
| #454 | Smoke E2E trình duyệt (Playwright) trong CI, job `e2e-smoke`, chưa là check bắt buộc |
| #456 | Trang Báo cáo mới: lọc chi nhánh, N-09 theo kỳ 6 tháng, sao chép cả bảng, CSV, Mẫu Phụ lục III theo kỳ (migration 0129) |

Đang mở:

- **#455** (nháp): tab Tài liệu và hộp thoại Tải lên theo Figma.
- **#457**: OCR từng trang, timeout theo trang, 200 dpi. Nguyên nhân lỗi OCR trên dev: job OCR chạy với 0,2 vCPU hết 120 giây khi gặp PDF 13 trang, `ENGINE_ERROR` 3 lần. Sau khi merge phải bấm "Thử lại OCR" cho 3 tệp của hồ sơ Vi bằng 038/2026/VB-TPL.
- **Bộ lọc theo cột** (chưa code xong). Thiết kế đã chốt: biểu tượng phễu mở popover trên tiêu đề cột, hàng chip "Đang lọc", tờ lọc trên điện thoại, bộ lọc nằm trên URL, xuất Excel theo bộ lọc, một PR cho cả 4 nghiệp vụ; cần migration thêm `attrs_norm` và tham số `p_cols`.

## 3. Lỗi đang mở: smoke E2E chập chờn

Chi tiết ở dòng C8 của [06-viec-dang-do.md](06-viec-dang-do.md). Tóm tắt: khoảng 1 lần trong 5, sau khi ghi sổ API trả 200 và dữ liệu đã ghi (tải lại thấy "Đã ghi sổ") nhưng trang chi tiết vẫn hiện Nháp dù `router.refresh()` đã phát yêu cầu RSC và nhận về trang đầy đủ. Đã gặp trên CI của `main` (job `e2e-smoke`, run ngày 13/11) và tái hiện cục bộ khi máy bận. Chưa rõ là lỗi bộ định tuyến Next 15.5.28 hay lỗi của ứng dụng (có khoảng 50 chỗ gọi `router.refresh()`). Việc này chặn CI các PR khác chừng nào job còn chạy; vì job chưa bắt buộc nên không chặn merge, nhưng sẽ làm nhiễu. Hướng thử tiếp ghi ở 06.

Cũng được báo: job `db-integration` thỉnh thoảng lỗi dọn dẹp Postgres dù 529 test đều qua; chưa điều tra.

## 4. Việc còn mở cần chủ dự án

Quyết định nghiệp vụ:

- Trường "cơ quan giao" ở Tống đạt.
- Trường "kết quả" và "số tiền" cho N-10.
- Cách đếm Tổ chức THA ở N-09.
- Báo cáo đột xuất.
- Mẫu Excel N-09 và N-10 của khách (có thể bỏ nếu báo cáo theo Phụ lục III).

Triển khai production trên server Tencent (chỉ chủ dự án làm được, mức R2/R3): token và CORS của R2, GitHub Secrets cho workflow `deploy`, DNS, SMTP. Xem [03-ha-tang-production.md](03-ha-tang-production.md) và nhóm A của [06-viec-dang-do.md](06-viec-dang-do.md).

## 5. Ghi chú vận hành

- **Figma**: kết nối Figma MCP đã hết hạn mức gói Starter. Chủ dự án đã tải bản "Full UX" (Nexagnet, Vi bằng và Quản lý văn phòng) về thư mục Downloads trên máy của họ; muốn đối chiếu thì xin ảnh hoặc tệp từ đó.
- **Northflank** (môi trường dev cũ): CLI cần đặt biến `USERPROFILE` sang một thư mục ngắn không dấu trước khi `northflank login` (PowerShell: `$env:USERPROFILE='C:\nfhome'; northflank login`). Token tài khoản thứ hai đã đăng nhập lại ngày 13/11. Production không dùng Northflank.
- **Hook pre-push cục bộ**: máy chủ dự án đang dùng Node 26, trong khi repo cần Node 22, nên hook làm 4 test `data-table` lỗi. Chủ dự án đồng ý bỏ qua hook cho nhánh OCR bằng `ECC_SKIP_PREPUSH=1`. CI trên GitHub dùng Node 22 và là bằng chứng chính thức.
- **Số hồ sơ Vi bằng**: hồ sơ cũ giữ ký hiệu `VB-TPL` (bất biến); chỉ hồ sơ ghi sổ từ 05/11/2026 mới có `VB-THV`.
- **Tài khoản thử**: nằm trong tệp riêng trên máy chủ dự án, không ghi trong repo.
- **Smoke E2E cục bộ**: `pnpm build`, rồi `DATABASE_URL=<Postgres tạm, tài khoản chủ> bash e2e/start-stack.sh`, `pnpm --filter @legal-office/e2e test:e2e`, `bash e2e/stop-stack.sh`. Mỗi lần chạy cần dựng lại stack vì lần đầu đăng nhập bắt buộc đổi mật khẩu.
- **Migration**: mới nhất là 0129 (13/11); luôn kiểm `main` trước khi chọn số.
