import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PermissionTabs } from '../../../../../components/permissions/PermissionTabs';
import { NoteBox, Pill } from '../../../../../components/permissions/Pill';
import { Avatar } from '../../../../../components/ui/avatar';
import { StateCard } from '../../../../../components/ui/state-card';
import { loadPermissionContext } from '../../../../../lib/dms-admin';
import {
  STATUS_LABEL,
  describeRequest,
  formatWhen,
  groupPermissionSections,
  isSensitivePermission,
  makeNameBook,
  requestCode,
  splitLabel,
} from '../../../../../lib/permission-model';

export const dynamic = 'force-dynamic';

export default async function GroupPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPermissionContext();
  if (!ctx) return null;
  if (
    !ctx.canPropose ||
    ctx.members === 'error' ||
    ctx.groups === 'error' ||
    ctx.requests === 'error'
  ) {
    return (
      <StateCard
        mark="403"
        tone="danger"
        alert
        title="Không đủ quyền"
        description="Xem nhóm quyền cần quyền đề xuất hoặc duyệt thay đổi quyền."
      />
    );
  }
  const group = ctx.groups.find((g) => g.id === id);
  if (!group) notFound();
  const { members, requests } = ctx;
  const names = makeNameBook(ctx.groups, members);
  const sections = groupPermissionSections(group.permissions);
  const mine = requests.filter((r) => r.group_id === group.id);
  const pending = mine.filter((r) => r.status === 'PENDING');
  const people = group.member_ids.map((uid) => {
    const m = members.find((x) => x.userId === uid);
    return { uid, ...(m ? splitLabel(m.label) : { name: names.userName(uid), email: null }) };
  });
  const sensitive = group.permissions.filter(isSensitivePermission).length;

  return (
    <>
      <PermissionTabs
        active="nhom"
        pending={requests.filter((r) => r.status === 'PENDING').length}
      />
      <p className="admin-crumb">
        <Link href="/quan-tri/phan-quyen">Phân quyền</Link> ›{' '}
        <Link href="/quan-tri/phan-quyen?tab=nhom">Nhóm quyền</Link> › {group.name}
      </p>
      <section className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm" aria-labelledby="grp-t">
        <div className="flex flex-wrap gap-2">
          <Pill tone="ok">Đang dùng</Pill>
          <Pill tone="info">{group.permissions.length} quyền</Pill>
          {sensitive > 0 ? <Pill tone="warn">{sensitive} quyền nhạy cảm</Pill> : null}
          {pending.length > 0 ? <Pill tone="brass">{pending.length} đề xuất chờ duyệt</Pill> : null}
        </div>
        <h2 id="grp-t" className="font-serif text-2xl">
          {group.name}
        </h2>
        <p className="text-sm text-muted">
          {group.member_ids.length} thành viên. Quyền và thành viên chỉ đổi qua đề xuất có duyệt.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="primary btn-link"
            href={`/quan-tri/phan-quyen/de-xuat?loai=GRANT&nhom=${group.id}`}
          >
            Thêm quyền vào nhóm
          </Link>
          <Link
            className="btn-link"
            href={`/quan-tri/phan-quyen/de-xuat?loai=REVOKE&nhom=${group.id}`}
          >
            Thu hồi quyền
          </Link>
          <Link
            className="btn-link"
            href={`/quan-tri/phan-quyen/de-xuat?loai=ADD_MEMBER&nhom=${group.id}`}
          >
            Thêm thành viên
          </Link>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm"
          aria-labelledby="perm-t"
        >
          <h2 id="perm-t" className="font-serif text-lg">
            Quyền trong nhóm
          </h2>
          {sections.length === 0 ? <p className="muted">Nhóm này chưa có quyền nào.</p> : null}
          {sections.map((s) => (
            <div key={s.title} className="grid gap-1">
              <h3 className="rounded-md bg-head px-3 py-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                {s.title}
              </h3>
              <ul className="m-0 grid list-none p-0">
                {s.items.map((i) => (
                  <li
                    key={i.code}
                    className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm"
                  >
                    <span>{i.label}</span>
                    {isSensitivePermission(i.code) ? <Pill tone="warn">Nhạy cảm</Pill> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <div className="grid gap-4">
          <section
            className="grid gap-3 rounded-2xl bg-surface p-5 shadow-sm"
            aria-labelledby="mem-t"
          >
            <h2 id="mem-t" className="font-serif text-base">
              Thành viên ({people.length})
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0">
              {people.length === 0 ? <li className="muted">Chưa có thành viên.</li> : null}
              {people.map((p) => (
                <li key={p.uid} className="flex items-center gap-3 text-sm">
                  <Avatar name={p.name} id={p.uid} size="md" />
                  <span className="grid">
                    <Link
                      className="font-semibold"
                      href={`/quan-tri/phan-quyen/nguoi-dung/${p.uid}`}
                    >
                      {p.name}
                    </Link>
                    {p.email ? <span className="text-xs text-muted">{p.email}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section
            className="grid gap-3 rounded-2xl bg-surface p-5 shadow-sm"
            aria-labelledby="his-t"
          >
            <h2 id="his-t" className="font-serif text-base">
              Đề xuất của nhóm
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 text-sm">
              {mine.length === 0 ? <li className="muted">Chưa có đề xuất nào.</li> : null}
              {mine.slice(0, 8).map((r) => (
                <li key={r.id} className="grid gap-1 border-b border-line pb-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link className="font-semibold" href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}>
                      {requestCode(r.id)}
                    </Link>
                    <Pill
                      tone={
                        r.status === 'PENDING' ? 'brass' : r.status === 'APPROVED' ? 'ok' : 'danger'
                      }
                    >
                      {STATUS_LABEL[r.status]}
                    </Pill>
                  </span>
                  <span>{describeRequest(r, names)}</span>
                  <span className="text-xs text-muted">{formatWhen(r.proposed_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <NoteBox tone="warn" title="Sửa nhóm đang có người dùng">
        Một đề xuất thêm hoặc thu hồi quyền ảnh hưởng tới cả {group.member_ids.length} thành viên
        của nhóm. Quyền mới chỉ có hiệu lực sau khi Admin khác duyệt; Admin tự đề xuất thì có hiệu
        lực ngay và được ghi nhật ký.
      </NoteBox>
    </>
  );
}
