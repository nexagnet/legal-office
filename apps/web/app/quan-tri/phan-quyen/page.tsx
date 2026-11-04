import { AdminBanner } from '../../../components/admin-banner';
import { GroupsTab } from '../../../components/permissions/GroupsTab';
import { LegacyRequests } from '../../../components/permissions/LegacyRequests';
import {
  PermissionTabs,
  activePermissionTab,
} from '../../../components/permissions/PermissionTabs';
import { UsersTab } from '../../../components/permissions/UsersTab';
import { StateCard } from '../../../components/ui/state-card';
import { loadRequests } from '../../../lib/admin-api';
import { loadPermissionContext } from '../../../lib/dms-admin';
import { requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Params {
  tab?: string;
  loc?: string;
  q?: string;
  page?: string;
  dd?: string;
}

/** Đầu trang riêng của từng tab (Figma P3, Q6, P10); tab đầu dùng đầu trang chung của mục Phân quyền. */
const TAB_BANNER: Partial<Record<string, { title: string; sub: string }>> = {
  nhom: {
    title: 'Phân quyền',
    sub: 'Nhóm mẫu của hệ thống được bảo vệ. Muốn nhóm riêng: sao chép nhóm mẫu hoặc bắt đầu từ nhóm trống, chọn quyền và phạm vi.',
  },
};

export default async function PermissionPage({
  searchParams,
}: {
  readonly searchParams: Promise<Params>;
}) {
  const ctx = await loadPermissionContext();
  if (!ctx) return null;
  const legacy =
    ctx.roles.includes('ADMIN') || ctx.roles.includes('TRUONG_VP')
      ? await loadRequests(await requestCookie(), ctx.officeId)
      : 'error';
  const legacyRows = legacy === 'error' ? [] : legacy;

  if (!ctx.canPropose) {
    // Trưởng văn phòng cũ chỉ còn việc xử lý nốt đề xuất cấp vai đã gửi; mọi thứ khác cần quyền phân quyền.
    if (ctx.roles.includes('TRUONG_VP') && legacyRows.length > 0) {
      return <LegacyRequests rows={legacyRows} roles={ctx.roles} />;
    }
    return (
      <StateCard
        mark="403"
        tone="danger"
        alert
        title="Không đủ quyền"
        description="Mục Phân quyền cần quyền đề xuất hoặc duyệt thay đổi quyền. Liên hệ Admin của văn phòng nếu bạn cần quyền này."
      />
    );
  }
  if (ctx.members === 'error' || ctx.groups === 'error' || ctx.requests === 'error') {
    return (
      <StateCard
        mark="!"
        tone="danger"
        alert
        title="Không tải được phân quyền"
        description="Vui lòng thử lại sau ít phút."
      />
    );
  }

  const params = await searchParams;
  const tab = activePermissionTab(params.tab);
  const banner = TAB_BANNER[tab];
  return (
    <>
      {banner ? <AdminBanner title={banner.title} sub={banner.sub} /> : null}
      <PermissionTabs active={tab} />
      {tab === 'nguoi-dung' ? (
        <UsersTab
          members={ctx.members}
          groups={ctx.groups}
          requests={ctx.requests}
          searchParams={params}
          canPropose={ctx.canPropose}
        />
      ) : (
        <GroupsTab
          groups={ctx.groups}
          requests={ctx.requests}
          searchParams={params}
          canPropose={ctx.canApprove}
        />
      )}
    </>
  );
}
