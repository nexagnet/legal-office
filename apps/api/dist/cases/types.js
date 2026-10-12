"use strict";
/** Hồ sơ Vi bằng (lát #6). Mô hình thuần, bất biến; lưu trữ nằm ở lớp dữ liệu. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERNAL_FIELDS = exports.PROOFS = exports.CASE_STATUSES = void 0;
exports.CASE_STATUSES = [
    'INTAKE',
    'ASSIGNED',
    'SIGNED',
    'STAMPED',
    'RETURNED',
    'CANCELLED',
];
/**
 * Bằng chứng pháp lý do các lát khác ghi nhận (#7 số/MISA, #8 ký/dấu/scan). Lát này chỉ KIỂM TRA sự có mặt
 * của chúng khi chuyển trạng thái, không tự tạo ra chúng.
 */
exports.PROOFS = [
    'MISA_CONFIRMED_FULL',
    'NUMBER_ALLOCATED',
    'FINAL_SCAN_WITH_SIGNATURE_AND_STAMP',
];
/** Trường nội bộ được sửa trực tiếp trong 48 giờ đầu. Mọi trường khác (nội dung pháp lý cuối) đi đường N-11. */
exports.INTERNAL_FIELDS = ['title', 'description', 'contactNote'];
