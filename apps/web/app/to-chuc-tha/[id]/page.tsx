import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { CaseActionDialog } from '../../../components/CaseActionDialog';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import type { DialogAction } from '../../../components/DialogActionMenu';
import { AddAssetSheet, AssetList, type Asset } from '../../../components/EnforcementAssets';
import { EnforcementActions } from '../../../components/EnforcementActions';
import { StatusPill } from '../../../components/StatusPill';
import { DefList } from '../../../components/ui/def-list';
import { PartyName, Person } from '../../../components/ui/avatar';
import { StepCards, type StepCard } from '../../../components/ui/step-cards';
import { loadItems } from '../../../lib/load-items';
import {
  ENFORCEMENT_STATUS_LABEL,
  OBLIGATION_STATUS_LABEL,
  PARTY_ROLE_LABEL,
} from '../../../lib/messages';
import { personName } from '../../../lib/avatar';
import { loadPeopleNames } from '../../../lib/people';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Party {
  readonly id: string;
  readonly kind?: string;
  readonly displayName: string;
  readonly role: string;
}
interface Obligation {
  readonly id: string;
  readonly seq: number;
  readonly description: string;
  readonly status: string;
}
interface Item {
  readonly caseId: string;
  readonly caseRef: string;
  readonly agreementRef: string;
  readonly decisionRef: string;
  readonly status: string;
  readonly handlerUserId: string | null;
  readonly parties: Party[];
  readonly obligations: Obligation[];
}

export default async function EnforcementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return <DetailSignIn title="Hồ sơ tổ chức thi hành án" what="hồ sơ tổ chức thi hành án" />;
  }
  const cookie = await requestCookie();
  const items = await loadItems<Item>('/enforcement-cases', cookie);
  if (items === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ tổ chức thi hành án</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const c = items.find((x) => x.caseId === id);
  if (!c) notFound();
  const isAdmin = session.roles.includes('ADMIN');
  const handlers = isAdmin ? await loadHandlerOptions(cookie) : [];
  const statusLabel = ENFORCEMENT_STATUS_LABEL[c.status] ?? c.status;
  const open = c.status === 'OPEN';
  const assigned = c.handlerUserId !== null;
  const handlerLabel = c.handlerUserId
    ? (await loadPeopleNames(cookie, [c.handlerUserId])).get(c.handlerUserId)
    : undefined;
  const assets = await loadItems<Asset>(`/enforcement/cases/${c.caseId}/assets`, cookie);
  const canOrder = session.roles.includes('ADMIN') || session.roles.includes('TRUONG_VP');
  const doneObl = c.obligations.filter((o) => o.status === 'COMPLETED').length;
  const assignPath = `enforcement-cases/${c.caseId}/handler`;

  const steps: StepCard[] = [
    {
      key: 'assign',
      role: 'Admin hoặc Trưởng VP',
      title: 'Giao Thừa hành viên phụ trách',
      state: assigned ? 'done' : open ? 'current' : 'done',
      description: assigned ? (
        handlerLabel ? (
          <Person name={personName(handlerLabel)} id={c.handlerUserId} />
        ) : (
          'Đã phân công'
        )
      ) : isAdmin ? (
        'Chọn Thừa hành viên sẽ phụ trách hồ sơ này.'
      ) : (
        'Đang chờ Admin hoặc Trưởng VP giao người phụ trách.'
      ),
      action:
        open && !assigned && isAdmin ? (
          <AssignHandler path={assignPath} options={handlers} currentId={null} />
        ) : undefined,
    },
    {
      key: 'run',
      role: 'Thừa hành viên',
      title: 'Thực hiện các nghĩa vụ',
      state: !open ? 'done' : assigned ? 'current' : 'todo',
      description: `${c.parties.length} đương sự, ${doneObl}/${c.obligations.length} nghĩa vụ đã hoàn tất.`,
      action:
        open && assigned ? (
          <CaseActionDialog
            label="Cập nhật hồ sơ"
            title="Cập nhật hồ sơ thi hành án"
            description="Thêm đương sự, nghĩa vụ, ghi diễn biến, ghi kết quả hoặc hoàn tất hồ sơ."
            primary
          >
            <EnforcementActions caseId={c.caseId} status={c.status} obligations={c.obligations} />
          </CaseActionDialog>
        ) : undefined,
    },
    {
      key: 'finish',
      role: 'Hoàn tất',
      title:
        c.status === 'TERMINATED'
          ? 'Hồ sơ đã chấm dứt'
          : c.status === 'COMPLETED'
            ? 'Hồ sơ đã hoàn tất'
            : 'Hoàn tất hoặc chấm dứt hồ sơ',
      state: open ? 'todo' : 'done',
      failed: c.status === 'TERMINATED',
      description: open ? 'Mở khi mọi nghĩa vụ đã xong hoặc có lý do chấm dứt.' : statusLabel,
    },
  ];

  const actions: DialogAction[] =
    open && assigned && isAdmin
      ? [
          {
            key: 'reassign',
            label: 'Đổi người phụ trách',
            title: 'Đổi người phụ trách',
            body: (
              <AssignHandler path={assignPath} options={handlers} currentId={c.handlerUserId} />
            ),
          },
        ]
      : [];

  return (
    <DetailFrame
      title={c.caseRef}
      meta={`${c.agreementRef} · ${c.decisionRef}`}
      status={c.status}
      statusLabel={statusLabel}
      backHref="/to-chuc-tha"
      backLabel="Tổ chức thi hành án"
      actions={actions}
    >
      <div className="grid gap-4">
        <div className="grid gap-3">
          <h2 className="m-0 text-[13px] font-bold text-muted">Quy trình 3 bước</h2>
          <StepCards steps={steps} label="Các bước tổ chức thi hành án" />
        </div>
        <section className="panel" aria-labelledby="parties-t">
          <h2 id="parties-t">Đương sự</h2>
          {c.parties.length === 0 ? (
            <p className="muted">Chưa có đương sự.</p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {c.parties.map((p) => (
                <li key={p.id} className="grid border-b border-line pb-3 last:border-0 last:pb-0">
                  <strong>
                    <PartyName name={p.displayName} person={p.kind === 'PERSON'} size="md" />
                  </strong>
                  <span className="text-[13px] text-muted">
                    {PARTY_ROLE_LABEL[p.role] ?? p.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel" aria-labelledby="obl-t">
          <h2 id="obl-t">Nghĩa vụ</h2>
          {c.obligations.length === 0 ? (
            <p className="muted">Chưa có nghĩa vụ.</p>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {c.obligations.map((o) => (
                <li
                  key={o.id}
                  className="grid gap-1 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <span>
                    {o.seq}. {o.description}
                  </span>
                  <span>
                    <StatusPill
                      status={o.status}
                      label={OBLIGATION_STATUS_LABEL[o.status] ?? o.status}
                    />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="panel" aria-labelledby="asset-t">
          <h2 id="asset-t">Tài sản và biện pháp</h2>
          <p className="muted">
            Đề xuất biện pháp chỉ trở thành đã áp dụng khi có lệnh có chữ ký của cơ quan có thẩm
            quyền; hệ thống không tự đóng băng hay kê biên.
          </p>
          {assets === 'error' ? (
            <p className="muted">Không tải được danh sách tài sản. Vui lòng thử lại sau.</p>
          ) : (
            <AssetList assets={assets} canWrite={open && assigned} canOrder={canOrder} />
          )}
          {open && assigned ? (
            <div>
              <AddAssetSheet caseId={c.caseId} />
            </div>
          ) : null}
        </section>
      </div>
      <section className="panel" aria-labelledby="info-t">
        <h2 id="info-t">Thông tin hồ sơ</h2>
        <DefList
          rows={[
            ['Mã hồ sơ', c.caseRef],
            ['Hợp đồng', c.agreementRef],
            ['Quyết định', c.decisionRef],
            ['Trạng thái', <StatusPill key="s" status={c.status} label={statusLabel} />],
          ]}
        />
      </section>
    </DetailFrame>
  );
}
