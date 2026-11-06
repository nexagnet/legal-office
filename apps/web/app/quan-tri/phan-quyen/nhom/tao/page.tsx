import { AdminBanner } from '../../../../../components/admin-banner';
import { GroupWizard } from '../../../../../components/permissions/GroupWizard';
import { StateCard } from '../../../../../components/ui/state-card';
import { loadPermissionContext } from '../../../../../lib/dms-admin';

export const dynamic = 'force-dynamic';

/** Tạo nhóm quyền (Figma P4/P5). Chỉ Admin tạo nhóm; máy chủ vẫn ép quyền ở từng bước. */
export default async function CreateGroupPage() {
  const ctx = await loadPermissionContext();
  if (!ctx) return null;
  if (!ctx.canApprove || ctx.groups === 'error') {
    return (
      <StateCard
        mark="403"
        tone="danger"
        alert
        title="Không đủ quyền"
        description="Chỉ Admin tạo được nhóm quyền."
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
        sub="Bắt đầu từ nhóm trống hoặc sao chép một nhóm, rồi chọn quyền và phạm vi. Nhóm mới có hiệu lực ngay khi Admin bấm Tạo nhóm và được ghi vào nhật ký phân quyền."
      />
      <GroupWizard officeId={ctx.officeId} groups={ctx.groups} />
    </>
  );
}
