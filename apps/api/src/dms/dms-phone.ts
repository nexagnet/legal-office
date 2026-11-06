import { z } from 'zod';

/**
 * Số điện thoại của khách (N1): lưu trong thuộc tính `so_dien_thoai` của hồ sơ, hiện ở 4 miền (Vi bằng, Tống đạt, Xác minh,
 * Tổ chức), KHÔNG in trong sổ S-01/02/04/05 (sổ chỉ lấy các khóa khai báo trong `books.ts`; xem test chặn ở `dms-phone.test.ts`).
 * Chấp nhận cách gõ quen thuộc (khoảng trắng, dấu chấm, gạch, ngoặc, +84); cần 8-15 chữ số.
 */
export const PHONE_KEY = 'so_dien_thoai';

const PHONE_SHAPE = /^\+?\d{8,15}$/;

export function isValidPhone(value: string): boolean {
  return PHONE_SHAPE.test(value.replace(/[\s.\-()]/g, ''));
}

/**
 * Kiểm thuộc tính hồ sơ: nếu có `so_dien_thoai` thì phải là chuỗi hợp lệ (hoặc rỗng để bỏ trống).
 * Không đụng tới các khóa khác. `allowNull` cho phép null (Admin dùng null để xóa khóa khi sửa).
 */
export function phoneIssue(attributes: Record<string, unknown>, allowNull = false): string | null {
  if (!(PHONE_KEY in attributes)) return null;
  const v = attributes[PHONE_KEY];
  if (v === null) return allowNull ? null : `${PHONE_KEY}: phải là chuỗi`;
  if (typeof v !== 'string') return `${PHONE_KEY}: phải là chuỗi`;
  if (v.trim() === '') return null;
  return isValidPhone(v) ? null : `${PHONE_KEY}: số điện thoại không hợp lệ`;
}

/** Gắn vào zod: `attributes.superRefine(attributePhoneCheck())`. */
export function attributePhoneCheck(allowNull = false) {
  return (attributes: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const issue = phoneIssue(attributes, allowNull);
    if (issue) ctx.addIssue({ code: 'custom', message: issue, path: [PHONE_KEY] });
  };
}
