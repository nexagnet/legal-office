/** Tệp tài liệu cũ tải bằng MỘT yêu cầu PUT tới kho; S3 và R2 đều giới hạn 5 GiB cho kiểu này. Lớn hơn cần tải nhiều phần (chưa làm). */
export const LEGACY_MAX_BYTES = 5 * 1024 ** 3;

/**
 * Khoá đối tượng của tài liệu cũ: theo văn phòng + sha256 của nội dung, nên cùng nội dung trong một văn phòng chỉ lưu một lần.
 * PHẢI giống hệt hàm SQL `dms_legacy_object_key` (hàm đăng ký so khớp và từ chối khoá khác).
 */
export function legacyObjectKey(tenantId: string, officeId: string, sha256: string): string {
  return `t/${tenantId}/legacy/${officeId}/${sha256.slice(0, 2)}/${sha256}`;
}
