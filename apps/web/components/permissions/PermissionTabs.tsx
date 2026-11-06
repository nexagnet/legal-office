import { FilterChips } from '../ui/filter-chips';

export type PermissionTab = 'nguoi-dung' | 'nhom';

const BASE = '/quan-tri/phan-quyen';
/** Nhật ký phân quyền nằm trong Lịch sử hoạt động. */
const ACTIVITY_HREF = '/dms/lich-su?group=permission';

export function activePermissionTab(raw: string | undefined): PermissionTab {
  return raw === 'nhom' ? raw : 'nguoi-dung';
}

export const tabHref = (tab: PermissionTab, extra = ''): string =>
  `${BASE}${tab === 'nguoi-dung' ? '' : `?tab=${tab}`}${extra}`;

/** Bốn tab của mục Phân quyền (Figma P1/P3/Q4/P10). Chạy ở máy chủ, đổi tab bằng liên kết. */
export function PermissionTabs({ active }: { readonly active: PermissionTab | null }) {
  return (
    <FilterChips
      label="Các tab phân quyền"
      active={active ?? ''}
      chips={[
        { key: 'nguoi-dung', label: 'Người dùng & quyền hiệu lực', href: tabHref('nguoi-dung') },
        { key: 'nhom', label: 'Nhóm quyền', href: tabHref('nhom') },
        { key: 'nhat-ky', label: 'Nhật ký phân quyền', href: ACTIVITY_HREF },
      ]}
    />
  );
}
