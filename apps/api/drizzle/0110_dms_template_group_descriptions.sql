-- DMS (0110): sửa mô tả 3 nhóm mẫu còn nhắc "đề nghị sửa đổi hồ sơ".
-- Luồng đề nghị sửa đổi đã bỏ: sau khi lưu chính thức, nhân viên chỉ tải thêm bản scan, Admin sửa trực tiếp
-- (có lý do, lưu thành phiên bản mới). Chỉ đổi mô tả; mã quyền và danh mục 92 quyền giữ nguyên.
-- Mỗi UPDATE chỉ đụng nhóm MẪU còn đúng mô tả cũ, nên nhóm mà Admin đã tự sửa mô tả không bị ghi đè.

UPDATE dms_permission_groups
   SET description = 'Quản trị phân quyền: đề xuất và duyệt thay đổi quyền; không có quyền nghiệp vụ riêng.'
 WHERE kind = 'TEMPLATE'
   AND description = 'Toàn quyền quản trị phân quyền và duyệt sửa đổi hồ sơ; không có quyền nghiệp vụ riêng.';

UPDATE dms_permission_groups
   SET description = 'Tạo nháp, xác nhận lưu chính thức, tải tệp ở bốn nghiệp vụ, trong phạm vi hồ sơ do mình tạo.'
 WHERE kind = 'TEMPLATE'
   AND description = 'Tạo nháp, xác nhận lưu chính thức, tải tệp, đề nghị sửa đổi hồ sơ của mình ở bốn nghiệp vụ.';

UPDATE dms_permission_groups
   SET description = 'Chỉ tạo nháp và thêm tài liệu, xem không tải, không xác nhận lưu chính thức.'
 WHERE kind = 'TEMPLATE'
   AND description = 'Chỉ tạo nháp và đề nghị sửa đổi, xem không tải, không xác nhận lưu chính thức.';
