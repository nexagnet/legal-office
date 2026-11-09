# Bảng quy đổi nhóm quyền mẫu sang mã quyền thật (bản chép từ Artifact, 01/11/2026)

Nguồn gốc: https://claude.ai/artifact/WPS8XesB1ZKPHjJb1EjHj7 (tài khoản cũ có thể không mở được nên chép vào đây). **Chủ dự án đã DUYỆT bảng này (01/11/2026)**; 6 nhóm mẫu theo bảng, mỗi nhóm là nhóm được bảo vệ, văn phòng sao chép rồi chỉnh.

Mã nghiệp vụ có dạng `<nghiệp vụ>.<hành động>.<own|all>`; nghiệp vụ gồm vibang, tongdat, xacminh, tochuc, vtden, vtdi, vtnb. `4 NV` = vibang, tongdat, xacminh, tochuc. `3 VT` = vtden, vtdi, vtnb.

## 1. Hành động Figma sang mã thật
| Hành động trong Figma | Mã | Quyết định |
|---|---|---|
| Xem thông tin, danh sách tài liệu | `<nv>.read.own` / `.all` | Giữ. Sổ và báo cáo lọc theo quyền này |
| Xem nội dung tệp | gộp trong `read` | Giữ gộp |
| Tải tệp, in | `<nv>.download.own` / `.all` | Giữ gộp tải và in |
| Xuất sổ S-01/02/04/05, sổ Văn thư | theo `read` | Giữ theo `read` |
| Tạo, sửa, hủy nháp | `<nv>.draft.own` / `.all` | Giữ |
| Xác nhận lưu chính thức | `<nv>.confirm.own` / `.all` | Giữ |
| Tải tệp lên | `<nv>.add_document.own` / `.all` | Giữ |
| Đề nghị sửa đổi | thêm `<nv>.amend_request.own` / `.all` | Thêm mã |
| Duyệt sửa đổi hồ sơ | tách `dms.amendment.approve` | Tách khỏi quyền đổi quyền |
| Duyệt thay đổi quyền | `dms.permission.approve` | Giữ, chỉ còn cho đổi quyền |
| Quản lý nhóm quyền | `dms.permission.propose` | Giữ |
| Vật tư văn phòng | `dms.stock.write` | Giữ |
| Xuất bản sao nhật ký phân quyền | `dms.audit.export` | Thêm sau (PR #308) |
| Phạm vi theo địa điểm | `dms_branch_access` | Chỉ thấy hồ sơ của chi nhánh được cấp |
| Phạm vi được cấp trực tiếp | — | Hoãn |

## 2. Nhóm mẫu sang bộ mã
| Nhóm mẫu | Bộ mã | Ghi chú |
|---|---|---|
| Thừa hành viên | 4 NV: read, draft, confirm, add_document, download đều `.own`; `amend_request.own` | |
| Thư ký / Trợ lý hồ sơ | 4 NV: read, draft, add_document đều `.own`; `amend_request.own`; không confirm, không download | Chỉ nháp, xem không tải |
| Văn thư | 3 VT: read, draft, confirm, add_document `.all` trong phạm vi chi nhánh; `amend_request.all`. Từ 09/11/2026 thêm 4 NV: chỉ `read.all` (migration 0120) | Xuất sổ theo read |
| Kế toán | `dms.stock.write` | Xuất báo cáo theo quyền xem |
| Báo cáo tổng hợp | 4 NV + 3 VT: chỉ `read.all` | Báo cáo chỉ đếm hồ sơ người xem được |
| Admin hệ thống | `dms.permission.approve`, `dms.amendment.approve`, `dms.permission.propose` (+ mặc nhiên mọi quyền nghiệp vụ) | |

## 3. Bốn câu đã chốt
1. Admin vẫn mặc nhiên có mọi quyền nghiệp vụ (không xóa, không ghi đè, sửa chữ trong Figma).
2. Tách `dms.amendment.approve`: làm.
3. Thêm `amend_request`: làm.
4. Kế toán xuất báo cáo theo quyền xem, không thêm mã.
