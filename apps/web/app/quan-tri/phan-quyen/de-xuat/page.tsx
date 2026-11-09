import { AdminBanner } from '../../../../components/admin-banner';
import { PermissionTabs } from '../../../../components/permissions/PermissionTabs';
import { ProposeChangeForm } from '../../../../components/permissions/ProposeChangeForm';
import { BLOCK_RULES, isGroupActive } from '../../../../lib/permission-model';
import { StateCard } from '../../../../components/ui/state-card';
import { loadPermissionContext } from '../../../../lib/dms-admin';

export const dynamic = 'force-dynamic';

export default async function ProposePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ loai?: string; nhom?: string; nguoi?: string }>;
}) {
  const ctx = await loadPermissionContext();
  if (!ctx) return null;
  if (!ctx.canPropose || ctx.members === 'error' || ctx.groups === 'error') {
    return (
      <StateCard
        mark="403"
        tone="danger"
        alert
        title="Không đủ quyền"
        description="Chỉ người có quyền quản trị phân quyền đổi được nhóm hoặc quyền."
      />
    );
  }
  const people = [
    ...new Map(ctx.members.map((m) => [m.userId, { userId: m.userId, label: m.label }])).values(),
  ];
  return (
    <>
      <PermissionTabs active="nguoi-dung" />
      <AdminBanner
        crumb={[
          ['Quản trị', '/quan-tri'],
          ['Phân quyền', '/quan-tri/phan-quyen'],
          ['Đổi nhóm hoặc quyền'],
        ]}
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        {ctx.groups.length === 0 ? (
          <StateCard
            mark="!"
            title="Chưa có nhóm quyền"
            description="Tạo nhóm quyền ở tab Nhóm quyền trước, rồi quay lại để đổi nhóm hoặc quyền."
          />
        ) : (
          <ProposeChangeForm
            groups={ctx.groups.filter(isGroupActive)}
            people={people}
            initial={await searchParams}
          />
        )}
        <aside className="grid gap-4">
          <section
            className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm"
            aria-labelledby="blk-t"
          >
            <h2 id="blk-t" className="font-serif text-base">
              Hệ thống chặn trước
            </h2>
            <ul className="m-0 grid list-none gap-2 p-0 text-sm">
              {BLOCK_RULES.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden="true" className="text-danger">
                    ✕
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm">
            <h2 className="font-serif text-base">Mỗi thay đổi ghi một dòng nhật ký</h2>
            <p className="text-sm text-muted">
              Chọn nhiều thành viên hoặc quyền thì ghi từng thay đổi riêng, cùng một lý do.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
