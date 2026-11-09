/** Tệp tài liệu cũ tải bằng MỘT yêu cầu PUT tới kho; S3 và R2 đều giới hạn 5 GiB cho kiểu này. Lớn hơn cần tải nhiều phần (chưa làm). */
export const LEGACY_MAX_BYTES = 5 * 1024 ** 3;

/**
 * Khoá đối tượng của tài liệu cũ: theo văn phòng + sha256 của nội dung, nên cùng nội dung trong một văn phòng chỉ lưu một lần.
 * PHẢI giống hệt hàm SQL `dms_legacy_object_key` (hàm đăng ký so khớp và từ chối khoá khác).
 */
export function legacyObjectKey(tenantId: string, officeId: string, sha256: string): string {
  return `t/${tenantId}/legacy/${officeId}/${sha256.slice(0, 2)}/${sha256}`;
}

function flag(v: string | undefined): boolean {
  const t = (v ?? '').trim().toLowerCase();
  return t === '1' || t === 'true';
}

/**
 * Công tắc CHẠY OCR tài liệu cũ: `LEGACY_OCR_ENABLED` (`1`/`true`; mặc định TẮT). Worker lo-ocr đọc biến này để quyết định có nhận
 * việc OCR tài liệu cũ hay không; API đọc để hiện cột trạng thái OCR. Chỉ tác động tài liệu cũ: hàng đợi OCR của hồ sơ mới không đổi.
 */
export const legacyOcrEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  flag(env.LEGACY_OCR_ENABLED);

/**
 * Công tắc TÌM KIẾM tài liệu cũ: `LEGACY_SEARCH_ENABLED` (`1`/`true`; mặc định TẮT), độc lập với công tắc OCR. Chỉ API đọc.
 * Tìm kiếm hồ sơ mới (/dms/search) không bị ảnh hưởng.
 */
export const legacySearchEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  flag(env.LEGACY_SEARCH_ENABLED);
