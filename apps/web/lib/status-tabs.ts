import type { TabItem } from '../components/ui/tab-nav';

export interface StatusGroup {
  readonly key: string;
  readonly label: string;
  readonly statuses: readonly string[];
}

export const ALL_TAB = 'tat-ca';

/** Chọn nhóm trạng thái từ `?tab=`; giá trị lạ rơi về "Tất cả" để không giấu hồ sơ. */
export function activeTab(groups: readonly StatusGroup[], raw: string | undefined): string {
  return groups.some((g) => g.key === raw) ? (raw as string) : ALL_TAB;
}

export function filterByTab<T extends { readonly status: string }>(
  items: readonly T[],
  groups: readonly StatusGroup[],
  tab: string,
): T[] {
  const group = groups.find((g) => g.key === tab);
  return group ? items.filter((i) => group.statuses.includes(i.status)) : [...items];
}

/** Tab "Tất cả" + mỗi nhóm một tab kèm số đếm (tab theo URL, Figma N12 D11). */
export function statusTabs<T extends { readonly status: string }>(
  basePath: string,
  groups: readonly StatusGroup[],
  items: readonly T[],
): TabItem[] {
  return [
    { key: ALL_TAB, label: 'Tất cả', href: basePath, count: items.length },
    ...groups.map((g) => ({
      key: g.key,
      label: g.label,
      href: `${basePath}?tab=${g.key}`,
      count: filterByTab(items, groups, g.key).length,
    })),
  ];
}
