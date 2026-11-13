/**
 * Mã miền ở API/DB -> đường dẫn web của nghiệp vụ. Tách riêng khỏi `lib/dms.ts` để thành phần client (hộp tìm kiếm) dùng được:
 * `lib/dms.ts` kéo theo mã chỉ chạy ở máy chủ. Có test đối chiếu với `DMS_DOMAINS` và `VAN_THU_DOMAINS`.
 */
export const DMS_DOMAIN_SLUG: Readonly<Record<string, string>> = {
  vibang: 'vi-bang',
  tongdat: 'tong-dat',
  xacminh: 'xac-minh',
  tochuc: 'to-chuc-tha',
  vtden: 'van-ban-den',
  vtdi: 'van-ban-di',
  vtnb: 'van-ban-noi-bo',
};

/** Mã miền -> tên hiển thị của nghiệp vụ (có test đối chiếu với `DMS_DOMAINS` và `VAN_THU_DOMAINS`). */
export const DMS_DOMAIN_LABEL: Readonly<Record<string, string>> = {
  vibang: 'Vi bằng',
  tongdat: 'Tống đạt',
  xacminh: 'Xác minh điều kiện THA',
  tochuc: 'Tổ chức thi hành án',
  vtden: 'Văn bản đến',
  vtdi: 'Văn bản đi',
  vtnb: 'Văn bản nội bộ',
};

/** Đường mở hồ sơ ở tab Tài liệu; `null` nếu mã miền lạ. */
export function dmsCaseDocsHref(domain: string, caseId: string): string | null {
  const slug = DMS_DOMAIN_SLUG[domain];
  return slug ? `/dms/${slug}/${caseId}?tab=tai-lieu` : null;
}
