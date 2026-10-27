import { describe, expect, it } from 'vitest';
import { ALL_TAB, activeTab, filterByTab, statusTabs, type StatusGroup } from '../lib/status-tabs';

const GROUPS: readonly StatusGroup[] = [
  { key: 'dang', label: 'Đang xử lý', statuses: ['A', 'B'] },
  { key: 'xong', label: 'Hoàn tất', statuses: ['C'] },
];
const ITEMS = [{ status: 'A' }, { status: 'B' }, { status: 'C' }, { status: 'C' }];

describe('status-tabs', () => {
  it('giá trị lạ hoặc thiếu rơi về Tất cả', () => {
    expect(activeTab(GROUPS, undefined)).toBe(ALL_TAB);
    expect(activeTab(GROUPS, 'bay')).toBe(ALL_TAB);
    expect(activeTab(GROUPS, 'xong')).toBe('xong');
  });
  it('lọc theo nhóm và giữ nguyên khi Tất cả', () => {
    expect(filterByTab(ITEMS, GROUPS, 'dang')).toHaveLength(2);
    expect(filterByTab(ITEMS, GROUPS, ALL_TAB)).toHaveLength(4);
  });
  it('tab có số đếm và liên kết theo URL', () => {
    const tabs = statusTabs('/tong-dat', GROUPS, ITEMS);
    expect(tabs.map((t) => [t.key, t.count, t.href])).toEqual([
      [ALL_TAB, 4, '/tong-dat'],
      ['dang', 2, '/tong-dat?tab=dang'],
      ['xong', 2, '/tong-dat?tab=xong'],
    ]);
  });
});
