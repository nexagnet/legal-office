/** Màu nền avatar (Figma N0 · Avatar chữ viết tắt): chữ trắng đều đạt tương phản AA. */
export const AVATAR_COLORS = [
  '#1f4fa8',
  '#1a7f4b',
  '#8a5a00',
  '#7a3fb5',
  '#0f7b8a',
  '#c0392b',
  '#4a5a73',
  '#8a5a2b',
] as const;

/** Họ tên để hiển thị từ nhãn dạng "Họ tên (email)"; chỉ có email thì giữ nguyên email. */
export function personName(label: string): string {
  const named = /^(.*?)\s*[(<][^)>]*@[^)>]*[)>]\s*$/.exec(label.trim());
  return (named?.[1] ?? label).trim() || label;
}

/** Phần tên hiển thị của một nhãn dạng "Họ tên (email)" hoặc chỉ email; email thì lấy phần trước dấu @. */
function plainName(label: string): string {
  const named = /^(.*?)\s*[(<][^)>]*@[^)>]*[)>]\s*$/.exec(label.trim());
  const base = (named?.[1] ?? label).trim();
  return base.includes('@') ? (base.split('@')[0] ?? base) : base;
}

/**
 * Chữ viết tắt từ họ tên: chữ cái đầu của từ đầu và từ cuối ("Nguyễn Văn Dũng" → "ND"); một từ thì 1 chữ.
 * Tên rỗng trả về chuỗi rỗng (component hiện ký hiệu thay thế).
 */
export function initialsOf(label: string): string {
  const parts = plainName(label)
    .split(/[\s._-]+/)
    .filter(Boolean);
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick
    .map((p) => Array.from(p ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase('vi-VN');
}

/** Màu ổn định theo mã người (hoặc họ tên): cùng một người luôn cùng một màu. */
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

const ORGANIZATION_PREFIX =
  /^(công ty|cty|tcty|tổng công ty|ngân hàng|ubnd|ủy ban|uỷ ban|tòa án|toà án|viện kiểm sát|chi cục|cục|sở|phòng|ban|trường|bệnh viện|doanh nghiệp|dntn|hợp tác xã|htx|văn phòng|trung tâm|hội|liên đoàn|tập đoàn|chi nhánh|tổ chức|quỹ)(\s|$)/i;
const ORGANIZATION_SUFFIX = /\b(tnhh|jsc|ltd|corp|inc)\b/i;

/**
 * Nhận diện tên tổ chức khi dữ liệu không có cờ loại (người nhận tống đạt, bên được xác minh). Chỉ để quyết định có hiện
 * avatar hay không; tên không rõ ràng thì coi là cá nhân. Ở nơi có cờ loại (khách hàng, đương sự) thì dùng cờ đó.
 */
export function looksLikeOrganization(name: string): boolean {
  const n = name.trim();
  return ORGANIZATION_PREFIX.test(n) || ORGANIZATION_SUFFIX.test(n);
}
