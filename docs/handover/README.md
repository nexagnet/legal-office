# Bàn giao dự án Legal Office (cập nhật 13/11/2026)

Thư mục này gom mọi thứ đã biết về dự án vào một chỗ, để người mới hoặc AI khác đọc là nắm được. Viết ngày 13/11/2026, tổng hợp từ bộ nhớ dự án, các báo cáo, mã nguồn, lịch sử PR #390–#447 và các luồng làm việc đã đóng.

**Đọc theo thứ tự này:**

| Tệp | Nội dung |
|---|---|
| [01-san-pham-va-nghiep-vu.md](01-san-pham-va-nghiep-vu.md) | Sản phẩm là gì, 4 nghiệp vụ, sổ S-01..S-06, quy tắc mục A/C, đánh số, phân quyền, căn cứ pháp lý |
| [02-kien-truc-ky-thuat.md](02-kien-truc-ky-thuat.md) | Cấu trúc mã, cách chạy, kiểm thử, migration, CI, quy tắc viết mã |
| [03-ha-tang-production.md](03-ha-tang-production.md) | Server Tencent, Postgres, Docker/Caddy/GHCR, R2, sao lưu, khôi phục, giới hạn tải đã đo |
| [04-chuyen-200gb-va-tim-kiem.md](04-chuyen-200gb-va-tim-kiem.md) | Kế hoạch chuyển 200GB tài liệu cũ, OCR, tìm kiếm, cờ `LEGACY_*` |
| [05-quyet-dinh-da-chot.md](05-quyet-dinh-da-chot.md) | Quyết định đã chốt kèm lý do, và các phương án đã loại |
| [06-viec-dang-do.md](06-viec-dang-do.md) | Việc còn dang dở, ai chịu trách nhiệm |
| [07-quy-uoc-lam-viec.md](07-quy-uoc-lam-viec.md) | Quy ước làm việc với chủ dự án, PR, giao diện |
| [08-lich-su-va-nguon.md](08-lich-su-va-nguon.md) | Dòng thời gian, danh sách PR, các luồng làm việc, nơi tìm thêm |
| [reports/](reports/) | Bản sao các báo cáo gốc (đã lược bí mật) |

AI đọc repo: bắt đầu từ [`AGENTS.md`](../../AGENTS.md) ở gốc, rồi tệp này.

## Ghi chú về độ tin cậy

- Tài liệu dùng ba mức: **đã chốt** (chủ dự án quyết, có ngày), **đã đo** (số đo thật, có ngày và nơi đo), **ước/suy đoán** (đánh dấu rõ, chưa kiểm). Số không có nhãn nghĩa là lấy từ mã nguồn hoặc tài liệu trong repo tại thời điểm viết; hãy kiểm lại mã nếu sắp dựa vào nó.
- Nguồn nghiệp vụ chi tiết nhất vẫn là [`docs/handoff/NGHIEP-VU-TOAN-DU-AN.md`](../handoff/NGHIEP-VU-TOAN-DU-AN.md) (bàn giao 02/11, bổ sung đến 13/11). Phần hạ tầng trong đó (Northflank) đã **lỗi thời**: production chọn Tencent, xem tệp 03.
- Các tài liệu `docs/product`, `docs/design`, `docs/architecture/misa-numbering.md`, Issue #1 và hướng dẫn sử dụng PDF cũ mô tả quy trình trước ngày 30/10/2026; đừng coi là quy tắc hiện hành.

## Không có bí mật trong thư mục này

Repo này **công khai** (kiểm bằng GitHub API ngày 13/11/2026). Vì vậy tài liệu cố ý **không chứa**: khóa, mật khẩu, token, nội dung `.env`, CCCD hay dữ liệu cá nhân thật, địa chỉ IP của server, mã tenant của khách. Các báo cáo trong `reports/` đã thay mã tenant bằng `<TENANT_ID_VP_HBT>`. Giá trị thật nằm ở: tệp `.env` trên server (quyền 600), GitHub Secrets, trình quản lý mật khẩu của chủ dự án, và máy của chủ dự án. Nếu cần địa chỉ server hoặc bí mật, hỏi chủ dự án; đừng ghi vào repo.
