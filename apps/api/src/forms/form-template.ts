// Khung dữ liệu của một biểu mẫu: danh sách khối (đoạn văn, bảng ký, dòng tự do...).
// Văn bản mẫu nằm ở ./templates/*.ts (sinh từ Phụ lục III, TT 08/2026/TT-BTP).
//
// Văn bản trong khối có thể chứa:
//  - **đậm** và %%nghiêng%% (bật/tắt, lồng được);
//  - {{khóa=chỗ-chấm-gốc}}: chỗ trống ứng với một trường dữ liệu. Có dữ liệu -> thay bằng giá
//    trị; không có -> GIỮ NGUYÊN chỗ chấm gốc để nhân viên điền tay.

export const FORM_CODES = [
  'N-01',
  'N-02',
  'N-03',
  'N-04',
  'N-05',
  'N-06',
  'N-07',
  'N-08',
  'N-11',
] as const;
export type FormCode = (typeof FORM_CODES)[number];

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface CellSpec {
  readonly lines: readonly string[];
  readonly align: Align;
}

export type Block =
  | { readonly kind: 'p'; readonly align: Align; readonly text: string }
  | { readonly kind: 'blank' }
  /** Bảng một dòng không viền (đầu trang, khối chữ ký). */
  | { readonly kind: 'cols'; readonly cells: readonly CellSpec[] }
  /** Nhóm dòng chấm: có dữ liệu thì mỗi dòng dữ liệu là một đoạn, không thì giữ dòng chấm gốc. */
  | { readonly kind: 'lines'; readonly key: string; readonly blanks: readonly string[] }
  /** Danh sách đánh số `1)`, `2)`...; dòng chưa có dữ liệu giữ dòng chấm gốc. */
  | { readonly kind: 'numbered'; readonly key: string; readonly blanks: readonly string[] }
  /** Bảng kê giấy tờ tống đạt (phụ lục N-01). */
  | { readonly kind: 'itemsTable' }
  /** Bảng nội dung sửa lỗi kỹ thuật (N-11). */
  | { readonly kind: 'correctionsTable' };

export interface FormTemplate {
  readonly code: FormCode;
  /** Ký hiệu trong Phụ lục III, ví dụ `TP-THV-N-03`. */
  readonly ref: string;
  readonly title: string;
  readonly blocks: readonly Block[];
}

const para =
  (align: Align) =>
  (text: string): Block => ({ kind: 'p', align, text });

export const j = para('justify');
export const c = para('center');
export const l = para('left');
export const r = para('right');
export const blank = (): Block => ({ kind: 'blank' });
export const cell = (lines: readonly string[], align: Align): CellSpec => ({ lines, align });
export const cols = (...cells: CellSpec[]): Block => ({ kind: 'cols', cells });
export const lines = (key: string, blanks: readonly string[]): Block => ({
  kind: 'lines',
  key,
  blanks,
});
export const numbered = (key: string, blanks: readonly string[]): Block => ({
  kind: 'numbered',
  key,
  blanks,
});
export const itemsTable = (): Block => ({ kind: 'itemsTable' });
export const correctionsTable = (): Block => ({ kind: 'correctionsTable' });

/** Mọi khóa `{{khóa=...}}` xuất hiện trong mẫu (kể cả trong ô bảng). */
export function templateKeys(template: FormTemplate): string[] {
  const keys = new Set<string>();
  const scan = (text: string): void => {
    for (const m of text.matchAll(PLACEHOLDER_RE)) keys.add(m[1] as string);
  };
  for (const b of template.blocks) {
    if (b.kind === 'p') scan(b.text);
    else if (b.kind === 'cols') b.cells.forEach((cl) => cl.lines.forEach(scan));
  }
  return [...keys].sort();
}

export const PLACEHOLDER_RE = /\{\{([\w.]+)=([^}]*)\}\}/g;
