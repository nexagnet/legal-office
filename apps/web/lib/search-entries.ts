import { hrefOf, type NavItem } from '../app/nav';

export interface SearchCase {
  readonly id: string;
  readonly title: string;
  readonly customerName?: string | null;
  readonly intakeNo?: string | null;
  readonly numberLabel?: string | null;
}

export interface SearchHit {
  readonly kind: 'page' | 'case';
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

const LIMIT = 8;

/** Tìm trang (theo tên menu) rồi hồ sơ Vi bằng; không phân biệt hoa thường và dấu tiếng Việt. */
export function searchEntries(
  query: string,
  pages: readonly NavItem[],
  cases: readonly SearchCase[],
): SearchHit[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const pageHits: SearchHit[] = pages
    .filter((p) => fold(`${p.label} ${p.summary}`).includes(needle))
    .map((p) => ({ kind: 'page', href: hrefOf(p), label: p.label, hint: 'Trang' }));
  const caseHits: SearchHit[] = cases
    .filter((c) =>
      fold([c.title, c.customerName, c.intakeNo, c.numberLabel].filter(Boolean).join(' ')).includes(
        needle,
      ),
    )
    .map((c) => ({
      kind: 'case',
      href: `/vi-bang/${c.id}`,
      label: c.title,
      hint: c.customerName ? `Vi bằng · ${c.customerName}` : 'Vi bằng',
    }));
  return [...pageHits, ...caseHits].slice(0, LIMIT);
}
