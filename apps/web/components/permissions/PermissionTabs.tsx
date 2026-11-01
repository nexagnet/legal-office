import { FilterChips } from '../ui/filter-chips';

export type PermissionTab = 'nguoi-dung' | 'nhom' | 'yeu-cau' | 'nhat-ky';

const BASE = '/quan-tri/phan-quyen';

export function activePermissionTab(raw: string | undefined): PermissionTab {
  return raw === 'nhom' || raw === 'yeu-cau' || raw === 'nhat-ky' ? raw : 'nguoi-dung';
}

export const tabHref = (tab: PermissionTab, extra = ''): string =>
  `${BASE}${tab === 'nguoi-dung' ? '' : `?tab=${tab}`}${extra}`;

/** Bốn tab của mục Phân quyền (Figma P1/P3/Q4/P10). Chạy ở máy chủ, đổi tab bằng liên kết. */
export function PermissionTabs({
  active,
  pending,
}: {
  readonly active: PermissionTab | null;
  readonly pending: number;
}) {
  return (
    <FilterChips
      label="Các tab phân quyền"
      active={active ?? ''}
      chips={[
        { key: 'nguoi-dung', label: 'Người dùng & quyền hiệu lực', href: tabHref('nguoi-dung') },
        { key: 'nhom', label: 'Nhóm quyền', href: tabHref('nhom') },
        { key: 'yeu-cau', label: 'Yêu cầu chờ duyệt', href: tabHref('yeu-cau'), count: pending },
        { key: 'nhat-ky', label: 'Nhật ký phân quyền', href: tabHref('nhat-ky') },
      ]}
    />
  );
}
