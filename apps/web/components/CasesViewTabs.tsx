import { TabNav } from './ui/tab-nav';

/** Hai chế độ xem của mục "Hồ sơ": do tôi tạo, hoặc cả văn phòng (chỉ khi có quyền `*.read.all`). */
export function CasesViewTabs({
  active,
  canViewAll,
}: {
  readonly active: 'mine' | 'office';
  readonly canViewAll: boolean;
}) {
  if (!canViewAll) return null;
  return (
    <TabNav
      label="Phạm vi hồ sơ"
      soft
      active={active}
      tabs={[
        { key: 'mine', label: 'Của tôi', href: '/dms/cua-toi' },
        { key: 'office', label: 'Cả văn phòng', href: '/dms/van-phong' },
      ]}
    />
  );
}
