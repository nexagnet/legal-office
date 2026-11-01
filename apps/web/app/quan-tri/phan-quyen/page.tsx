import { AuditTab } from '../../../components/permissions/AuditTab';
import { AdminBanner } from '../../../components/admin-banner';
import { GroupsTab } from '../../../components/permissions/GroupsTab';
import { LegacyRequests } from '../../../components/permissions/LegacyRequests';
import {
  PermissionTabs,
  activePermissionTab,
} from '../../../components/permissions/PermissionTabs';
import { RequestsTab } from '../../../components/permissions/RequestsTab';
import { UsersTab } from '../../../components/permissions/UsersTab';
import { StateCard } from '../../../components/ui/state-card';
import { loadRequests } from '../../../lib/admin-api';
import { loadPermissionContext } from '../../../lib/dms-admin';
import { makeNameBook } from '../../../lib/permission-model';
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
  'yeu-cau': {
    title: 'Yêu cầu chờ duyệt',
    sub: 'Admin có quyền duyệt thay đổi quyền duyệt hoặc từ chối các đề xuất do người khác lập. Đề xuất do chính bạn lập không có nút Duyệt.',
  },
  'nhat-ky': {
    title: 'Nhật ký phân quyền',
    sub: 'Lịch sử cấp quyền, thu hồi, đổi nhóm và quyết định duyệt. Chỉ thêm dòng mới, không sửa hay xóa.',
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
  const pending = ctx.requests.filter((r) => r.status === 'PENDING').length;
  const names = makeNameBook(ctx.groups, ctx.members);
  const banner = TAB_BANNER[tab];
  return (
    <>
      {banner ? <AdminBanner title={banner.title} sub={banner.sub} /> : null}
      <PermissionTabs active={tab} pending={pending} />
      {tab === 'nguoi-dung' ? (
        <UsersTab
          members={ctx.members}
          groups={ctx.groups}
          requests={ctx.requests}
          searchParams={params}
          canPropose={ctx.canPropose}
        />
      ) : tab === 'nhom' ? (
        <GroupsTab
          groups={ctx.groups}
          requests={ctx.requests}
          searchParams={params}
          canPropose={ctx.canPropose}
          officeId={ctx.officeId}
        />
      ) : tab === 'yeu-cau' ? (
        <>
          <RequestsTab
            requests={ctx.requests}
            names={names}
            userId={ctx.userId}
            searchParams={params}
            canPropose={ctx.canPropose}
          />
          <LegacyRequests rows={legacyRows} roles={ctx.roles} />
        </>
      ) : (
        <AuditTab
          requests={ctx.requests}
          names={names}
          searchParams={params}
          officeId={ctx.officeId}
          canExport={ctx.canExportAudit}
        />
      )}
    </>
  );
}
