import { DataTable } from '../../../../../components/ui/data-table';
import { AdminBanner } from '../../../../../components/admin-banner';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BranchAccessSection } from '../../../../../components/permissions/BranchAccessSection';
import { MemberSuspendButton } from '../../../../../components/permissions/MemberSuspendButton';
import { PermissionTabs } from '../../../../../components/permissions/PermissionTabs';
import { UserOverridesEditor } from '../../../../../components/permissions/UserOverridesEditor';
import { NoteBox, Pill } from '../../../../../components/permissions/Pill';
import { Avatar } from '../../../../../components/ui/avatar';
import { StateCard } from '../../../../../components/ui/state-card';
import {
  loadBranchAccess,
  loadOfficeBranches,
  loadPermissionContext,
  loadUserOverrides,
} from '../../../../../lib/dms-admin';
import { requestCookie } from '../../../../../lib/server';
import {
  ACCOUNT_STATE_LABEL,
  SCOPE_LABEL,
  STATUS_LABEL,
  accountState,
  buildPersonRows,
  describeRequest,
  effectiveByDomain,
  effectivePermissions,
  formatWhen,
  isOverridable,
  overridableBaseline,
  PERMISSION_SOURCE_LABEL,
  permissionLabel,
  makeNameBook,
  requestCode,
} from '../../../../../lib/permission-model';

export const dynamic = 'force-dynamic';

export default async function EffectivePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
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
        description="Xem quyền hiệu lực cần quyền đề xuất hoặc duyệt thay đổi quyền."
      />
    );
  }
  const person = buildPersonRows(ctx.members, ctx.groups, ctx.requests).find(
    (p) => p.userId === id,
  );
  if (!person) notFound();
  const names = makeNameBook(ctx.groups, ctx.members);
  const cookie = await requestCookie();
  const [officeBranches, branchAccess, allOverrides] = await Promise.all([
    loadOfficeBranches(cookie, ctx.officeId),
    loadBranchAccess(cookie, ctx.officeId),
    loadUserOverrides(cookie, ctx.officeId, id),
  ]);
  const activeOverrides = allOverrides.filter((o) => o.ended_at === null);
  const groupCodes = person.groups.flatMap((g) => g.permissions);
  const baseline = [...overridableBaseline(groupCodes)];
  const effective = effectivePermissions(ctx.groups, id, activeOverrides);
  const rows = person.suspended ? [] : effectiveByDomain(ctx.groups, id, activeOverrides);
  const state = accountState(person);
  const history = ctx.requests.filter((r) => r.user_id === id);

  return (
    <>
      <PermissionTabs
        active="nguoi-dung"
        pending={ctx.requests.filter((r) => r.status === 'PENDING').length}
      />
      <AdminBanner title={`Quyền hiệu lực · ${person.name}`} />
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} id={person.userId} size="lg" />
          <div className="grid gap-1">
            <h2 className="font-serif text-xl">{person.name}</h2>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <Pill
                tone={
                  state === 'active'
                    ? 'ok'
                    : state === 'waiting'
                      ? 'brass'
                      : state === 'suspended'
                        ? 'danger'
                        : 'warn'
                }
              >
                {ACCOUNT_STATE_LABEL[state]}
              </Pill>
              {person.email}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ctx.canApprove && id !== ctx.userId ? (
            <MemberSuspendButton userId={id} officeId={ctx.officeId} suspended={person.suspended} />
          ) : null}
          {ctx.canPropose ? (
            <Link
              className="primary btn-link"
              href={`/quan-tri/phan-quyen/de-xuat?loai=ADD_MEMBER&nguoi=${id}`}
            >
              Đề xuất thay đổi nhóm quyền
            </Link>
          ) : null}
        </div>
      </section>
      {person.suspended ? (
        <p role="status" className="callout">
          <strong>Tài khoản đang tạm khóa</strong>
          Người này không đăng nhập được và không có quyền hiệu lực nào. Nhóm quyền, hồ sơ và lịch
          sử giữ nguyên; mở khóa thì quyền theo các nhóm dưới đây có hiệu lực trở lại.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section
          className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm"
          aria-labelledby="grp-t"
        >
          <h2 id="grp-t" className="text-xs font-bold tracking-wide text-muted uppercase">
            Nhóm quyền đang áp dụng
          </h2>
          {person.isAdmin ? (
            <p className="text-sm">
              <strong>Admin (mặc nhiên)</strong> · toàn quyền quản trị, vẫn không xóa, ghi đè hay
              sửa trực tiếp hồ sơ đã lưu.
            </p>
          ) : null}
          {person.groups.map((g) => (
            <p key={g.id} className="text-sm">
              <Link className="font-semibold" href={`/quan-tri/phan-quyen/nhom/${g.id}`}>
                {g.name}
              </Link>{' '}
              · {g.permissions.length} quyền
            </p>
          ))}
          {!person.isAdmin && person.groups.length === 0 ? (
            <p className="muted text-sm">Chưa thuộc nhóm quyền nào.</p>
          ) : null}
          {person.pending.map((r) => (
            <p key={r.id} className="text-sm text-warn">
              Đang chờ duyệt: {describeRequest(r, names)}
            </p>
          ))}
        </section>
        <section className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm" aria-labelledby="hn-t">
          <h2 id="hn-t" className="text-xs font-bold tracking-wide text-muted uppercase">
            Tư cách hành nghề
          </h2>
          <p className="text-sm">
            Tư cách Thừa hành viên và số Thẻ quản lý riêng ở mục{' '}
            <Link href="/quan-tri/the-thv">Thẻ THV</Link>; gán nhóm quyền không tạo ra tư cách này.
          </p>
        </section>
      </div>
      <BranchAccessSection
        officeId={ctx.officeId}
        userId={id}
        branches={officeBranches}
        granted={branchAccess.filter((b) => b.userId === id)}
        canEdit={ctx.canApprove && !person.suspended}
        seesAll={person.isAdmin || effective.includes('dms.permission.approve')}
      />

      <section className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm" aria-labelledby="ovr-t">
        <h2 id="ovr-t" className="font-serif text-lg">
          Quyền chi tiết của riêng người này
        </h2>
        <p className="text-sm text-muted">
          Quyền hiệu lực = quyền của các nhóm + quyền{' '}
          <strong>{PERMISSION_SOURCE_LABEL.grant.toLowerCase()}</strong> − quyền{' '}
          <strong>{PERMISSION_SOURCE_LABEL.revoke.toLowerCase()}</strong>. Ô đã tick là quyền đang
          có; màu vàng là thêm riêng, màu đỏ là bỏ riêng so với nhóm. Admin áp dụng ngay, cần lý do,
          có nhật ký.
        </p>
        {person.isAdmin ? (
          <p className="text-sm">
            Admin mặc nhiên có mọi quyền nên không đặt quyền riêng. Quyền đề xuất, duyệt thay đổi
            quyền chỉ theo nhóm.
          </p>
        ) : (
          <UserOverridesEditor
            officeId={ctx.officeId}
            userId={id}
            baseline={baseline}
            current={effective.filter(isOverridable)}
            groupOnly={[...new Set(groupCodes.filter((c) => !isOverridable(c)))]}
            canEdit={ctx.canApprove && id !== ctx.userId}
          />
        )}
        {allOverrides.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0 text-sm">
            {allOverrides.map((o) => (
              <li key={o.id} className="grid gap-0.5 border-b border-line pb-2">
                <span>
                  <strong>{formatWhen(o.set_at)}</strong> ·{' '}
                  <Pill tone={o.effect === 'GRANT' ? 'brass' : 'danger'}>
                    {o.effect === 'GRANT'
                      ? PERMISSION_SOURCE_LABEL.grant
                      : PERMISSION_SOURCE_LABEL.revoke}
                  </Pill>{' '}
                  {permissionLabel(o.permission)}
                  {o.ended_at ? ` · đã hết hiệu lực ${formatWhen(o.ended_at)}` : ' · đang hiệu lực'}
                </span>
                <span className="text-muted">
                  Người đặt: {names.userName(o.set_by)} · Lý do: {o.reason}
                  {o.ended_by
                    ? ` · Người gỡ: ${names.userName(o.ended_by)} (${o.end_reason ?? ''})`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm" aria-labelledby="eff-t">
        <h2 id="eff-t" className="font-serif text-lg">
          Quyền hiệu lực theo nghiệp vụ
        </h2>
        <p className="text-sm text-muted">
          Mỗi dòng là một nghiệp vụ. Phạm vi lấy rộng nhất trong các nhóm và quyền thêm riêng của
          người này, đã trừ quyền bỏ riêng. Muốn đổi nhóm hãy gửi đề xuất; muốn đổi quyền riêng dùng
          mục phía trên.
        </p>
        {person.isAdmin && !person.suspended ? (
          <p className="text-sm">
            Admin mặc nhiên có mọi quyền ở tất cả nghiệp vụ, phạm vi toàn văn phòng.
          </p>
        ) : null}
        {rows.length === 0 && (!person.isAdmin || person.suspended) ? (
          <p className="muted">
            {person.suspended ? 'Đang tạm khóa: không có quyền hiệu lực.' : 'Chưa có quyền nào.'}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <DataTable tableKey="quan-tri-phan-quyen-nguoi-dung-id-page-1">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nghiệp vụ</th>
                  <th scope="col">Được phép</th>
                  <th scope="col">Nguồn</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.domain}>
                    <th scope="row">{r.title}</th>
                    <td className="text-sm">
                      {r.actions.map((a) => `${a.label} (${SCOPE_LABEL[a.scope]})`).join(' · ')}
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1.5">
                        {r.sources.map((s) => (
                          <Pill key={s} tone="ok">
                            {s}
                          </Pill>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm" aria-labelledby="his-t">
        <h2 id="his-t" className="font-serif text-lg">
          Lịch sử cấp quyền của người này
        </h2>
        {history.length === 0 ? <p className="muted">Chưa có lịch sử.</p> : null}
        <ul className="m-0 grid list-none gap-3 p-0 text-sm">
          {history.map((r) => (
            <li key={r.id} className="grid gap-0.5 border-b border-line pb-2">
              <span>
                <strong>{formatWhen(r.proposed_at)}</strong> · {describeRequest(r, names)} ·{' '}
                {STATUS_LABEL[r.status].toLowerCase()}
              </span>
              <span className="text-muted">
                Đề xuất: {names.userName(r.proposed_by)}
                {r.reviewed_by ? ` · Duyệt: ${names.userName(r.reviewed_by)}` : ''} · Lý do:{' '}
                {r.reason} ·{' '}
                <Link href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}>{requestCode(r.id)}</Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <NoteBox title="Quyền được kiểm ở máy chủ">
        Việc kiểm tra thật nằm ở máy chủ. Khi thu hồi quyền, hiệu lực áp dụng ngay cho API, tải tệp,
        tìm kiếm và xuất sổ; màn này không chỉ ẩn nút.
      </NoteBox>
    </>
  );
}
