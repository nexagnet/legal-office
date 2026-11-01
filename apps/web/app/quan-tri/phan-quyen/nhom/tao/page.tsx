import { AdminBanner } from '../../../../../components/admin-banner';
import { GroupWizard } from '../../../../../components/permissions/GroupWizard';
import { StateCard } from '../../../../../components/ui/state-card';
import { loadPermissionContext } from '../../../../../lib/dms-admin';

export const dynamic = 'force-dynamic';

/** Tạo nhóm quyền (Figma P4/P5). Cần quyền đề xuất; máy chủ vẫn ép quyền ở từng bước. */
export default async function CreateGroupPage() {
  const ctx = await loadPermissionContext();
  if (!ctx) return null;
  if (!ctx.canPropose || ctx.groups === 'error') {
    return (
      <StateCard
        mark="403"
        tone="danger"
        alert
        title="Không đủ quyền"
        description="Tạo nhóm quyền cần quyền đề xuất hoặc duyệt thay đổi quyền."
      />
    );
  }
  return (
    <>
      <AdminBanner
        crumb={[
          ['Quản trị', '/quan-tri'],
          ['Phân quyền', '/quan-tri/phan-quyen'],
          ['Nhóm quyền', '/quan-tri/phan-quyen?tab=nhom'],
          ['Tạo nhóm quyền'],
        ]}
        title="Tạo nhóm quyền"
        sub="Bắt đầu từ nhóm trống hoặc sao chép một nhóm, rồi chọn quyền và phạm vi. Nhóm mới chỉ có hiệu lực sau khi người có thẩm quyền duyệt."
      />
      <GroupWizard officeId={ctx.officeId} groups={ctx.groups} />
    </>
  );
}
