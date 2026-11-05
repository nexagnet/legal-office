/**
 * Hàm thuần cho cột "số, ngày" của sổ (số hồ sơ tự cấp + ngày người nhập). Tách khỏi `lib/dms.ts` vì file đó dùng
 * `next/headers` (chỉ chạy ở server), còn các form client cần những hàm này.
 */
const DATE_ONLY = /^(ngày\s*)?\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4}$/i;

/** Ghép số hồ sơ tự cấp với ngày người nhập ("037/2026/VB-TPL ngày 31/10/2026"); giống `withCaseNumber` của API. */
export function withCaseNumber(caseNumber: string | null | undefined, entered: string): string {
  const n = (caseNumber ?? '').trim();
  const v = entered.trim();
  if (n === '') return v;
  if (v === '') return n;
  if (!DATE_ONLY.test(v)) return v;
  return `${n} ngày ${v.replace(/^ngày\s*/i, '')}`;
}

const CODE_OF_DOMAIN: Readonly<Record<string, string>> = {
  vibang: 'VB',
  tongdat: 'TĐ',
  xacminh: 'XM',
  tochuc: 'TC',
};

/** Chữ mờ đặt trước ô ngày: số hồ sơ thật nếu đã có, chưa có (bản nháp) thì dạng "…/2026/VB-TPL ngày". */
export function numberPrefix(domain: string, year: number, caseNumber?: string | null): string {
  const n = (caseNumber ?? '').trim();
  return `${n !== '' ? n : `…/${year}/${CODE_OF_DOMAIN[domain] ?? '?'}-TPL`} ngày`;
}

/** Giá trị đưa vào ô ngày: bỏ chữ "ngày" ở đầu nếu giá trị chỉ là ngày; giá trị cũ có cả số nhập tay giữ nguyên. */
export const dateOnly = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return DATE_ONLY.test(s) ? s.replace(/^ngày\s*/i, '') : s;
};
