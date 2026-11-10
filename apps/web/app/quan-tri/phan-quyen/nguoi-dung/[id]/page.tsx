import { DataTable } from '../../../../../components/ui/data-table';
import { AdminBanner } from '../../../../../components/admin-banner';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BranchAccessSection } from '../../../../../components/permissions/BranchAccessSection';
import { MemberSuspendButton } from '../../../../../components/permissions/MemberSuspendButton';
import { PermissionTabs } from '../../../../../components/permissions/PermissionTabs';
import { ResetMemberPasswordButton } from '../../../../../components/permissions/ResetMemberPasswordButton';
import { LinkPersonnelForm } from '../../../../../components/permissions/LinkPersonnelForm';
import { PersonnelSheet } from '../../../../../components/PersonnelSheet';
import { ThvCardsForm } from '../../../../../components/ThvCardsForm';
import { TabNav } from '../../../../../components/ui/tab-nav';
import { loadThvCards } from '../../../../../lib/admin-api';
import { loadPersonnelByUser, loadUnlinkedPersonnel } from '../../../../../lib/personnel';
import { UserOverridesEditor } from '../../../../../components/permissions/UserOverridesEditor';
import { Pill } from '../../../../../components/permissions/Pill';
import { Avatar } from '../../../../../components/ui/avatar';
import { StateCard } from '../../../../../components/ui/state-card';
import {
  loadBranchAccess,
  loadOfficeBranches,
  loadPermissionContext,
  loadUserOverrides,
} from '../../../../../lib/dms-admin';
import { currentSession, requestCookie } from '../../../../../lib/server';
import {
  ACCOUNT_STATE_LABEL,
  DOMAIN_LIMIT,
  STATUS_LABEL,
  accountState,
  buildPersonRows,
  describeRequest,
  effectiveByDomain,
  effectivePermissions,
  formatWhen,
  groupsOfUser,
  isOverridable,
  isSystemGroup,
  overridableBaseline,
  PERMISSION_SOURCE_LABEL,
  permissionLabel,
  makeNameBook,
  requestCode,
  scopeSummary,
} from '../../../../../lib/permission-model';

export const dynamic = 'force-dynamic';

type AccountTab = 'quyen' | 'the-thv' | 'lao-dong';
const ACCOUNT_TABS: readonly (readonly [AccountTab, string])[] = [
  ['quyen', 'Quyền'],
  ['the-thv', 'Thẻ thừa hành viên'],
  ['lao-dong', 'Hồ sơ lao động'],
];

export default async function EffectivePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const rawTab = (await searchParams).tab;
  const tab: AccountTab = rawTab === 'the-thv' || rawTab === 'lao-dong' ? rawTab : 'quyen';
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
        description="Xem quyền hiệu lực cần quyền quản trị phân quyền."
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
  const canSeeLabor = ctx.roles.includes('ADMIN') || ctx.roles.includes('TRUONG_VP');
  const tabs = ACCOUNT_TABS.filter(
    ([k]) => k === 'quyen' || (k === 'the-thv' ? ctx.roles.includes('ADMIN') : canSeeLabor),
  );
  const tabNav = (
    <TabNav
      label="Các mục của tài khoản"
      active={tab}
      tabs={tabs.map(([k, label]) => ({
        key: k,
        label,
        href:
          k === 'quyen'
            ? `/quan-tri/phan-quyen/nguoi-dung/${id}`
            : `/quan-tri/phan-quyen/nguoi-dung/${id}?tab=${k}`,
      }))}
    />
  );
  if (tab === 'the-thv' && ctx.roles.includes('ADMIN')) {
    const cards = (await loadThvCards(cookie, ctx.officeId)).filter((c) => c.userId === id);
    return (
      <>
        <PermissionTabs active="nguoi-dung" />
        <AdminBanner title={`Thẻ thừa hành viên · ${person.name}`} />
        {tabNav}
        <ThvCardsForm
          officeId={ctx.officeId}
          people={[{ userId: id, label: person.name, groups: person.groups.map((g) => g.name) }]}
          cards={cards}
          canEdit
        />
      </>
    );
  }
  if (tab === 'lao-dong' && canSeeLabor) {
    const [labor, unlinked] = await Promise.all([
      loadPersonnelByUser(cookie, ctx.officeId, id),
      loadUnlinkedPersonnel(cookie, ctx.officeId),
    ]);
    const session = await currentSession();
    const branches = session.status === 'authenticated' ? session.branches : [];
    return (
      <>
        <PermissionTabs active="nguoi-dung" />
        <AdminBanner title={`Hồ sơ lao động · ${person.name}`} />
        {tabNav}
        {labor === 'error' ? (
          <StateCard
            mark="!"
            tone="danger"
            alert
            title="Không tải được hồ sơ lao động"
            description="Chỉ Admin và Trưởng văn phòng xem được. Vui lòng thử lại sau."
          />
        ) : (
          <section className="panel grid gap-3" aria-labelledby="ld-t">
            <h2 id="ld-t" className="font-serif text-base">
              Hồ sơ lao động
            </h2>
            {labor ? (
              <p>
                <strong>{labor.full_name}</strong> ·{' '}
                {labor.work_status === 'ACTIVE' ? 'Đang làm' : 'Đã nghỉ'} · v{labor.version}
                {labor.labor_contract_ref
                  ? ` · HĐ ${labor.labor_contract_ref}`
                  : ' · Chưa có hợp đồng lao động'}
              </p>
            ) : (
              <p className="muted">Tài khoản này chưa có hồ sơ lao động.</p>
            )}
            <div className="flex flex-wrap items-start gap-3">
              <PersonnelSheet
                officeId={ctx.officeId}
                branches={branches}
                person={labor}
                trigger={labor ? 'Cập nhật' : '+ Tạo hồ sơ cho tài khoản này'}
                linkUserId={id}
              />
              <LinkPersonnelForm
                officeId={ctx.officeId}
                userId={id}
                linkedPersonId={labor ? labor.person_id : null}
                options={unlinked}
              />
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <PermissionTabs active="nguoi-dung" />
      <AdminBanner title={`Quyền hiệu lực · ${person.name}`} />
      {tabNav}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} id={person.userId} size="lg" />
          <div className="grid gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-xl">{person.name}</h2>
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
            </span>
            <span className="text-sm text-muted">{person.email}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ctx.canApprove && id !== ctx.userId ? (
            <MemberSuspendButton userId={id} officeId={ctx.officeId} suspended={person.suspended} />
          ) : null}
          {ctx.canApprove && id !== ctx.userId && person.email ? (
            <ResetMemberPasswordButton userId={id} email={person.email} />
          ) : null}
          {ctx.canPropose ? (
            <Link
              className="primary btn-link"
              href={`/quan-tri/phan-quyen/de-xuat?loai=ADD_MEMBER&nguoi=${id}`}
            >
              Đổi nhóm quyền
            </Link>
          ) : null}
        </div>
      </section>
      {person.suspended ? (
        <p role="status" className="callout">
          <strong>Tài khoản đang tạm khóa</strong>
          Người này không đăng nhập được và không có quyền hiệu lực. Mở khóa thì quyền theo các nhóm
          dưới đây có hiệu lực trở lại.
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
              <strong>Admin (mặc nhiên)</strong> · toàn quyền quản trị.
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
      </div>
      <section className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm" aria-labelledby="eff-t">
        <h2 id="eff-t" className="font-serif text-lg">
          Quyền hiệu lực theo nghiệp vụ
        </h2>
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
                  <th scope="col">Phạm vi</th>
                  <th scope="col">Giới hạn bắt buộc</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.domain}>
                    <th scope="row">{r.title}</th>
                    <td className="text-sm">{r.actions.map((a) => a.label).join(' · ')}</td>
                    <td>
                      <span className="flex flex-wrap gap-1.5">
                        {r.sources.map((s) => (
                          <Pill key={s} tone="ok">
                            {s}
                          </Pill>
                        ))}
                      </span>
                    </td>
                    <td className="text-sm">{scopeSummary(r.actions)}</td>
                    <td className="text-xs text-muted">{DOMAIN_LIMIT[r.domain] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : null}
      </section>

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
        {person.isAdmin || groupsOfUser(ctx.groups, id).some(isSystemGroup) ? (
          <p className="text-sm">
            Tài khoản Admin hoặc thuộc nhóm Admin có mọi quyền nên không đặt quyền riêng.
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
                Người thực hiện: {names.userName(r.proposed_by)}
                {r.reviewed_by && r.reviewed_by !== r.proposed_by
                  ? ` · Duyệt: ${names.userName(r.reviewed_by)}`
                  : ''}{' '}
                · Lý do: {r.reason} ·{' '}
                <Link href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}>{requestCode(r.id)}</Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
