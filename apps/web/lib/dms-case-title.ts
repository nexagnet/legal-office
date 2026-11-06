import type { DmsBookColumn } from './dms';

/**
 * Tên hồ sơ khi người nhập để trống ô "Tên hồ sơ" (mục C, không vào sổ). Tên này chỉ để nhận ra hồ sơ trong danh sách:
 * lấy giá trị cột sổ đầu tiên có chữ (bỏ cột tự cấp số và cột đánh dấu), không có thì dùng ngày tạo.
 */
export function autoCaseTitle(
  domainLabel: string,
  columns: readonly DmsBookColumn[],
  values: Readonly<Record<string, unknown>>,
  today: string,
): string {
  const first = columns
    .filter((c) => !c.autoNumber && !c.tick)
    .map((c) => String(values[c.key] ?? '').trim())
    .find((v) => v !== '');
  return `${domainLabel} · ${first ?? today}`.slice(0, 500);
}
