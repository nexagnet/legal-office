import Link from 'next/link';
import { AdminBanner } from '../../../../../components/admin-banner';
import { notFound } from 'next/navigation';
import { GroupStatusButton } from '../../../../../components/permissions/GroupStatusButton';
import { PermissionTabs } from '../../../../../components/permissions/PermissionTabs';
import { NoteBox, Pill } from '../../../../../components/permissions/Pill';
import { Avatar } from '../../../../../components/ui/avatar';
import { StateCard } from '../../../../../components/ui/state-card';
import { loadPermissionContext } from '../../../../../lib/dms-admin';
import {
  STATUS_LABEL,
  defaultScopeLabel,
  describeRequest,
  formatWhen,
  groupPermissionSections,
  groupVersion,
  isGroupActive,
  isTemplateGroup,
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
  const active = isGroupActive(group);
  const version = groupVersion(group);
  const pendingPerm = pending.filter((r) => r.kind === 'GRANT' || r.kind === 'REVOKE').length;

  return (
    <>
      <PermissionTabs
        active="nhom"
        pending={requests.filter((r) => r.status === 'PENDING').length}
      />
      <AdminBanner
        crumb={[
          ['Quản trị', '/quan-tri'],
          ['Phân quyền', '/quan-tri/phan-quyen'],
          ['Nhóm quyền', '/quan-tri/phan-quyen?tab=nhom'],
          [group.name],
        ]}
        title={group.name}
        sub={`${isTemplateGroup(group) ? 'Nhóm mẫu của hệ thống' : 'Nhóm tùy chỉnh'}. Phiên bản hiện hành v${version}${
          pendingPerm > 0 ? `; có một đề xuất v${version + 1} đang chờ duyệt và chưa áp dụng` : ''
        }.`}
      />
      <section className="group-summary" aria-labelledby="grp-t">
        <h2 id="grp-t" className="sr-only">
          {group.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Pill tone={isTemplateGroup(group) ? 'info' : 'brass'}>
            {isTemplateGroup(group) ? 'Nhóm mẫu' : 'Tùy chỉnh'}
          </Pill>
          {active ? <Pill tone="ok">Đang dùng</Pill> : <Pill tone="mute">Ngừng dùng</Pill>}
          <Pill tone="info">v{version} · hiện hành</Pill>
          {pendingPerm > 0 ? <Pill tone="brass">Có đề xuất v{version + 1} chờ duyệt</Pill> : null}
          <Pill tone="mute">{group.permissions.length} quyền</Pill>
          {sensitive > 0 ? <Pill tone="warn">{sensitive} quyền nhạy cảm</Pill> : null}
        </div>
        <dl className="kv">
          <div>
            <dt>Phạm vi mặc định</dt>
            <dd>{defaultScopeLabel(group)}</dd>
          </div>
          <div>
            <dt>Người đang dùng</dt>
            <dd>{group.member_ids.length} thành viên</dd>
          </div>
          {group.created_by ? (
            <div>
              <dt>Tạo bởi</dt>
              <dd>
                {names.userName(group.created_by)}
                {group.created_at ? ` · ${formatWhen(group.created_at)}` : ''}
              </dd>
            </div>
          ) : null}
          {group.approved_by ? (
            <div>
              <dt>Duyệt bởi</dt>
              <dd>
                {names.userName(group.approved_by)} · v{version}
                {group.approved_at ? ` · ${formatWhen(group.approved_at)}` : ''}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="muted">
          Quyền và thành viên chỉ đổi qua đề xuất có duyệt.
          {isTemplateGroup(group)
            ? ' Nhóm mẫu được bảo vệ: không đổi quyền trực tiếp, hãy sao chép thành nhóm tùy chỉnh.'
            : ''}
          {active ? '' : ' Nhóm đã ngừng dùng nên không cấp quyền hiệu lực cho ai.'}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {active && !isTemplateGroup(group) ? (
            <>
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
            </>
          ) : null}
          {active ? (
            <Link
              className="btn-link"
              href={`/quan-tri/phan-quyen/de-xuat?loai=ADD_MEMBER&nhom=${group.id}`}
            >
              Thêm thành viên
            </Link>
          ) : null}
          {ctx.canApprove && !isTemplateGroup(group) ? (
            <GroupStatusButton groupId={group.id} retire={active} />
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <section className="group-perms" aria-labelledby="perm-t">
          <div className="group-perms-head">
            <h2 id="perm-t">Quyền trong nhóm</h2>
            <span>Phạm vi mặc định</span>
          </div>
          {sections.length === 0 ? <p className="muted">Nhóm này chưa có quyền nào.</p> : null}
          {sections.map((s) => (
            <div key={s.title} className="group-perms-sec">
              <h3>{s.title}</h3>
              <ul>
                {s.items.map((i) => (
                  <li key={i.code}>
                    <span>
                      {i.action}
                      {isSensitivePermission(i.code) ? <Pill tone="warn">Nhạy cảm</Pill> : null}
                    </span>
                    <span>{i.scope ?? '—'}</span>
                  </li>
                ))}
              </ul>
              {s.missing.length > 0 ? (
                <p className="group-perms-missing">
                  <strong>Không có trong nhóm:</strong> {s.missing.join(', ')}. Cấp riêng khi cần.
                </p>
              ) : null}
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
            aria-labelledby="ver-t"
          >
            <h2 id="ver-t" className="font-serif text-base">
              Phiên bản nhóm
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 text-sm">
              {pendingPerm > 0 ? (
                <li className="grid gap-1">
                  <span>
                    <Pill tone="brass">v{version + 1} · đề xuất</Pill>
                  </span>
                  <span className="text-xs text-muted">Chờ duyệt, chưa áp dụng</span>
                </li>
              ) : null}
              <li className="grid gap-1">
                <span>
                  <Pill tone="ok">v{version} · hiện hành</Pill>
                </span>
                <span className="text-xs text-muted">
                  {group.permissions.length} quyền · {group.member_ids.length} thành viên
                </span>
              </li>
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
