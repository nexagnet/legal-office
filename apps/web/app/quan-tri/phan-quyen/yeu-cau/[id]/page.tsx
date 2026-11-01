import { AdminBanner } from '../../../../../components/admin-banner';
import { notFound } from 'next/navigation';
import { PermissionTabs } from '../../../../../components/permissions/PermissionTabs';
import { Pill } from '../../../../../components/permissions/Pill';
import { ReviewPanel } from '../../../../../components/permissions/ReviewPanel';
import { StateCard } from '../../../../../components/ui/state-card';
import { loadPermissionContext } from '../../../../../lib/dms-admin';
import {
  KIND_LABEL,
  STATUS_LABEL,
  describeRequest,
  formatWhen,
  groupVersion,
  isRequestStale,
  isSensitivePermission,
  makeNameBook,
  permissionLabel,
  requestCode,
  splitLabel,
} from '../../../../../lib/permission-model';

export const dynamic = 'force-dynamic';

export default async function RequestPage({
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
        description="Xem yêu cầu đổi quyền cần quyền đề xuất hoặc duyệt thay đổi quyền."
      />
    );
  }
  const r = ctx.requests.find((x) => x.id === id);
  if (!r) notFound();
  const { members, groups, requests } = ctx;
  const names = makeNameBook(groups, members);
  const group = groups.find((g) => g.id === r.group_id);
  const pendingCount = requests.filter((x) => x.status === 'PENDING').length;
  const mine = ctx.userId !== null && r.proposed_by === ctx.userId;
  const stale = r.status === 'PENDING' && isRequestStale(r, group);
  const sensitive = r.permission ? isSensitivePermission(r.permission) : false;
  const impact = r.kind === 'GRANT' || r.kind === 'REVOKE' ? (group?.member_ids.length ?? 0) : 1;
  const approverIds = new Set([
    ...members.filter((m) => m.role === 'ADMIN').map((m) => m.userId),
    ...groups
      .filter((g) => g.permissions.includes('dms.permission.approve'))
      .flatMap((g) => g.member_ids),
  ]);
  const approvers = [...approverIds];
  const permChange = r.kind === 'GRANT' || r.kind === 'REVOKE';
  const widened = permChange && r.kind === 'GRANT' && (r.permission?.endsWith('.all') ?? false);
  const version = group ? groupVersion(group) : 1;
  const remaining = Math.max(
    0,
    (group?.permissions.length ?? 0) - (r.permission && r.kind === 'REVOKE' ? 1 : 0),
  );
  const canDecide = r.status === 'PENDING' && ctx.canApprove && !mine && !stale;

  return (
    <>
      <PermissionTabs active="yeu-cau" pending={pendingCount} />
      <AdminBanner
        crumb={[
          ['Quản trị', '/quan-tri'],
          ['Phân quyền', '/quan-tri/phan-quyen'],
          ['Yêu cầu chờ duyệt', '/quan-tri/phan-quyen?tab=yeu-cau'],
          [requestCode(r.id)],
        ]}
      />
      {permChange ? (
        <div className="kpi-strip" role="list" aria-label="Tác động của đề xuất">
          <div role="listitem" data-tone="info">
            <strong>{impact}</strong>
            <span>Người bị ảnh hưởng</span>
          </div>
          <div role="listitem" data-tone="ok">
            <strong>{r.kind === 'GRANT' ? '+1' : '0'}</strong>
            <span>Quyền được thêm</span>
          </div>
          <div role="listitem" data-tone="danger">
            <strong>{r.kind === 'REVOKE' ? '−1' : '0'}</strong>
            <span>Quyền bị thu hồi</span>
          </div>
          <div role="listitem" data-tone="warn">
            <strong>{widened ? 1 : 0}</strong>
            <span>Phạm vi mở rộng · mức độ cao</span>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <section
          className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm"
          aria-labelledby="req-t"
        >
          <div className="flex flex-wrap gap-2">
            <Pill tone="mute">{requestCode(r.id)}</Pill>
            <Pill
              tone={r.status === 'PENDING' ? 'brass' : r.status === 'APPROVED' ? 'ok' : 'danger'}
            >
              {STATUS_LABEL[r.status]}
            </Pill>
            {sensitive ? <Pill tone="danger">Quyền nhạy cảm</Pill> : null}
            <Pill tone="info">{KIND_LABEL[r.kind]}</Pill>
          </div>
          <h2 id="req-t" className="font-serif text-xl">
            {describeRequest(r, names)}
          </h2>
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Người đề xuất</dt>
            <dd>
              {names.userName(r.proposed_by)} · {formatWhen(r.proposed_at)}
              {r.auto_applied ? ' · Admin tự đề xuất, áp dụng ngay' : ''}
            </dd>
            {permChange ? (
              <>
                <dt className="text-muted">Phiên bản nhóm</dt>
                <dd>
                  v{version} hiện hành
                  {r.status === 'PENDING' ? ` · v${version + 1} đề xuất, chưa áp dụng` : ''}
                </dd>
                <dt className="text-muted">Mức nhạy cảm</dt>
                <dd>{sensitive ? 'Cao: quyền nhạy cảm' : 'Thường'}</dd>
              </>
            ) : null}
            <dt className="text-muted">Lý do</dt>
            <dd>{r.reason}</dd>
            <dt className="text-muted">Người bị ảnh hưởng</dt>
            <dd className="font-semibold">
              {r.kind === 'ADD_MEMBER' || r.kind === 'REMOVE_MEMBER'
                ? names.userName(r.user_id)
                : `${impact} thành viên nhóm “${names.groupName(r.group_id)}”`}
            </dd>
            {r.reviewed_by ? (
              <>
                <dt className="text-muted">Người duyệt</dt>
                <dd>
                  {names.userName(r.reviewed_by)} · {formatWhen(r.reviewed_at ?? r.proposed_at)}
                  {r.review_reason ? ` · ${r.review_reason}` : ''}
                </dd>
              </>
            ) : null}
          </dl>
          {r.permission ? (
            <div className="flex flex-wrap gap-2">
              <Pill tone={r.kind === 'GRANT' ? 'ok' : 'danger'}>
                {r.kind === 'GRANT' ? '+ Thêm quyền' : '− Thu hồi quyền'}
              </Pill>
            </div>
          ) : null}
          {permChange && r.permission ? (
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Quyền</th>
                  <th scope="col">v{version} · hiện hành</th>
                  <th scope="col">v{version + 1} · đề xuất</th>
                  <th scope="col">Thay đổi</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    {permissionLabel(r.permission)}
                    {sensitive ? <small>Quyền nhạy cảm</small> : null}
                  </th>
                  <td>
                    <Pill tone={r.kind === 'REVOKE' ? 'ok' : 'mute'}>
                      {r.kind === 'REVOKE' ? 'Có' : 'Không có'}
                    </Pill>
                  </td>
                  <td>
                    <Pill tone={r.kind === 'GRANT' ? 'ok' : 'mute'}>
                      {r.kind === 'GRANT' ? 'Có' : 'Không có'}
                    </Pill>
                  </td>
                  <td>
                    <Pill tone={r.kind === 'GRANT' ? 'ok' : 'danger'}>
                      {r.kind === 'GRANT' ? '+ Thêm' : '− Thu hồi'}
                    </Pill>
                  </td>
                </tr>
                <tr>
                  <th scope="row">{remaining} quyền còn lại</th>
                  <td>Giữ nguyên</td>
                  <td>Giữ nguyên</td>
                  <td>
                    <Pill tone="mute">Không đổi</Pill>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}
          {sensitive && r.permission ? (
            <aside className="rounded-[10px] bg-brass-soft/60 px-4 py-3 text-sm">
              <strong className="block text-warn">Quyền nhạy cảm cần đọc kỹ</strong>
              {permissionLabel(r.permission)}
            </aside>
          ) : null}
        </section>

        <div className="grid gap-4">
          <section
            className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm"
            aria-labelledby="chk-t"
          >
            <h2 id="chk-t" className="font-serif text-base">
              Kiểm tra trước khi duyệt
            </h2>
            <ul className="grid gap-2 text-sm">
              <Check ok={!mine}>
                {mine ? 'Bạn là người đề xuất nên không tự duyệt' : 'Bạn không phải người đề xuất'}
              </Check>
              <Check ok={!stale}>
                {stale ? 'Nhóm đã đổi, đề xuất không còn khớp' : 'Nhóm vẫn khớp với đề xuất'}
              </Check>
              <Check ok={ctx.canApprove}>
                {ctx.canApprove ? 'Bạn có quyền duyệt thay đổi quyền' : 'Bạn chưa có quyền duyệt'}
              </Check>
              {sensitive ? <Check ok={null}>1 quyền nhạy cảm cần đọc kỹ</Check> : null}
            </ul>
          </section>
          <section
            className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm"
            aria-labelledby="ap-t"
          >
            <h2 id="ap-t" className="font-serif text-base">
              Ai được duyệt yêu cầu này
            </h2>
            <ul className="grid gap-2 text-sm">
              {approvers.map((uid) => {
                const label = members.find((m) => m.userId === uid)?.label;
                const isProposer = uid === r.proposed_by;
                return (
                  <li key={uid} className="grid gap-1">
                    <strong>
                      {label ? splitLabel(label).name : names.userName(uid)}
                      {uid === ctx.userId ? ' (bạn)' : ''}
                    </strong>
                    <span>
                      <Pill tone={isProposer ? 'danger' : 'ok'}>
                        {isProposer
                          ? 'Là người đề xuất, không tự duyệt'
                          : 'Hợp lệ · có quyền duyệt'}
                      </Pill>
                    </span>
                  </li>
                );
              })}
              {approvers.length === 0 ? (
                <li className="muted">Chưa có ai giữ quyền duyệt.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>

      <section className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm" aria-labelledby="dec-t">
        <h2 id="dec-t" className="font-serif text-lg">
          Quyết định
        </h2>
        {canDecide ? (
          <ReviewPanel requestId={r.id} impact={impact} />
        ) : r.status !== 'PENDING' ? (
          <p>Yêu cầu đã được xử lý: {STATUS_LABEL[r.status].toLowerCase()}. Không sửa lại được.</p>
        ) : (
          <p>
            {mine
              ? 'Bạn là người đề xuất nên không có nút Duyệt. Admin khác có quyền duyệt thay đổi quyền sẽ xử lý trong Hộp duyệt.'
              : stale
                ? 'Nhóm đã đổi sau khi đề xuất được gửi. Hãy gửi đề xuất mới.'
                : 'Bạn chưa có quyền duyệt thay đổi quyền.'}
          </p>
        )}
      </section>
    </>
  );
}

function Check({ ok, children }: { readonly ok: boolean | null; readonly children: string }) {
  return (
    <li className="flex gap-2">
      <span
        aria-hidden="true"
        className={ok === null ? 'text-warn' : ok ? 'text-ok' : 'text-danger'}
      >
        {ok === null ? '!' : ok ? '✓' : '✕'}
      </span>
      <span>{children}</span>
    </li>
  );
}
