import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { CaseActionDialog } from '../../../components/CaseActionDialog';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import type { DialogAction } from '../../../components/DialogActionMenu';
import { AddAssetSheet, AssetList, type Asset } from '../../../components/EnforcementAssets';
import {
  ProposeTransferSheet,
  TransferList,
  type Transfer,
} from '../../../components/EnforcementTransfer';
import { EnforcementActions } from '../../../components/EnforcementActions';
import { StatusPill } from '../../../components/StatusPill';
import { DefList } from '../../../components/ui/def-list';
import { TabNav } from '../../../components/ui/tab-nav';
import { TerminationSheet } from '../../../components/TerminationSheet';
import { PartyName, Person } from '../../../components/ui/avatar';
import { StepCards, type StepCard } from '../../../components/ui/step-cards';
import { loadItems } from '../../../lib/load-items';
import {
  ENFORCEMENT_STATUS_LABEL,
  OBLIGATION_STATUS_LABEL,
  PARTY_ROLE_LABEL,
  RESULT_KIND_LABEL,
  TERMINATION_REASON_LABEL,
} from '../../../lib/messages';
import { personName } from '../../../lib/avatar';
import { loadPeopleNames } from '../../../lib/people';
import { API_URL, currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Party {
  readonly id: string;
  readonly kind?: string;
  readonly displayName: string;
  readonly role: string;
}
interface ObligationEvent {
  readonly kind: string;
  readonly note: string;
  readonly at: string;
  readonly hasEvidence: boolean;
}
interface Obligation {
  readonly id: string;
  readonly seq: number;
  readonly description: string;
  readonly status: string;
  readonly obligorPartyId: string | null;
  readonly dueOn: string | null;
  readonly events: readonly ObligationEvent[];
}
interface Termination {
  readonly reason: string;
  readonly basis: string;
  readonly outcome: string | null;
  readonly terminatedAt: string;
}

const TABS = [
  { key: 'duong-su', label: 'Đương sự và nghĩa vụ' },
  { key: 'tai-san', label: 'Tài sản và biện pháp' },
  { key: 'chuyen-ho-so', label: 'Chuyển hồ sơ' },
  { key: 'cham-dut', label: 'Chấm dứt' },
] as const;
type Tab = (typeof TABS)[number]['key'];
const dayFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === rawTab)?.key ?? 'duong-su';
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
  const transfers = await loadItems<Transfer>(`/enforcement/cases/${c.caseId}/transfers`, cookie);
  const transferNames =
    transfers === 'error'
      ? new Map<string, string>()
      : await loadPeopleNames(
          cookie,
          transfers.map((t) => t.toUserId),
        );
  const thvOptions = (await loadHandlerOptions(cookie)).filter((o) => o.userId !== c.handlerUserId);
  const canOrder = session.roles.includes('ADMIN') || session.roles.includes('TRUONG_VP');
  const termRes =
    c.status === 'TERMINATED'
      ? await fetch(`${API_URL}/enforcement-cases/${c.caseId}/termination`, {
          headers: cookie ? { cookie } : {},
          cache: 'no-store',
        }).catch(() => null)
      : null;
  const termination = termRes?.ok
    ? ((await termRes.json()) as { termination: Termination | null }).termination
    : null;
  const partyName = (pid: string | null) =>
    c.parties.find((x) => x.id === pid)?.displayName ?? 'Chưa gắn đương sự';
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
            <EnforcementActions
              caseId={c.caseId}
              status={c.status}
              obligations={c.obligations}
              parties={c.parties}
            />
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
        <TabNav
          label="Mục của hồ sơ thi hành án"
          active={tab}
          tabs={TABS.map((t) => ({
            key: t.key,
            label: t.label,
            href: `/to-chuc-tha/${c.caseId}?tab=${t.key}`,
          }))}
        />
        {tab === 'duong-su' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section className="panel" aria-labelledby="parties-t">
              <h2 id="parties-t">Đương sự</h2>
              {c.parties.length === 0 ? (
                <p className="muted">Chưa có đương sự.</p>
              ) : (
                <ul className="m-0 grid list-none gap-3 p-0">
                  {c.parties.map((p) => (
                    <li
                      key={p.id}
                      className="grid border-b border-line pb-3 last:border-0 last:pb-0"
                    >
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
              <h2 id="obl-t">Nghĩa vụ và kết quả từng phần</h2>
              {c.obligations.length === 0 ? (
                <p className="muted">Chưa có nghĩa vụ.</p>
              ) : (
                <ol className="m-0 grid list-none gap-4 p-0">
                  {c.obligations.map((o) => (
                    <li
                      key={o.id}
                      className="grid gap-1.5 border-b border-line pb-4 last:border-0 last:pb-0"
                    >
                      <span className="font-semibold">
                        {o.seq}. {o.description}
                      </span>
                      <span className="text-[13px] text-muted">
                        {partyName(o.obligorPartyId)}
                        {o.dueOn ? ` · hạn ${dayFmt.format(new Date(o.dueOn))}` : ''}
                      </span>
                      <span>
                        <StatusPill
                          status={o.status}
                          label={OBLIGATION_STATUS_LABEL[o.status] ?? o.status}
                        />
                      </span>
                      {o.events.length > 0 ? (
                        <ul className="m-0 grid list-none gap-0.5 p-0 text-[13px]">
                          {o.events.map((e, i) => (
                            <li key={i}>
                              {dayFmt.format(new Date(e.at))} ·{' '}
                              {RESULT_KIND_LABEL[e.kind] ?? 'Ghi chú'}: {e.note}
                              {e.hasEvidence ? ' · kèm biên bản' : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              <p className="muted m-0 text-[13px]">
                Kết quả ghi rồi bất biến, không sửa. Hoàn thành một nghĩa vụ không làm xong cả vụ;
                số tiền trong bản án chỉ là nội dung nghĩa vụ, không phải sổ thu chi.
              </p>
            </section>
          </div>
        ) : null}
        {tab === 'tai-san' ? (
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
        ) : null}
        {tab === 'chuyen-ho-so' ? (
          <section className="panel" aria-labelledby="transfer-t">
            <h2 id="transfer-t">Chuyển hồ sơ</h2>
            <p className="muted">
              Đề nghị, duyệt trong ứng dụng, quyết định pháp lý, biên bản bàn giao N-08 rồi mới hoàn
              tất. Hoàn tất thì THV nhận hồ sơ trở thành người phụ trách.
            </p>
            {transfers === 'error' ? (
              <p className="muted">Không tải được các đề nghị chuyển hồ sơ.</p>
            ) : (
              <TransferList
                transfers={transfers}
                names={Object.fromEntries(transferNames)}
                canWrite={open}
                canComplete={canOrder}
              />
            )}
            {open && assigned && thvOptions.length > 0 ? (
              <div>
                <ProposeTransferSheet caseId={c.caseId} options={thvOptions} />
              </div>
            ) : null}
          </section>
        ) : null}
        {tab === 'cham-dut' ? (
          <section className="panel" aria-labelledby="term-t">
            <h2 id="term-t">Chấm dứt vụ việc</h2>
            {c.status === 'TERMINATED' ? (
              termination ? (
                <DefList
                  rows={[
                    ['Lý do', TERMINATION_REASON_LABEL[termination.reason] ?? termination.reason],
                    ['Căn cứ pháp lý', termination.basis],
                    ['Kết quả thực tế', termination.outcome ?? 'Không ghi'],
                    ['Thời điểm', dayFmt.format(new Date(termination.terminatedAt))],
                  ]}
                />
              ) : (
                <p className="muted">Hồ sơ đã chấm dứt.</p>
              )
            ) : (
              <>
                <p className="muted">
                  Cần căn cứ pháp lý và kết quả thực tế. Chỉ Admin hoặc Trưởng văn phòng ghi. Sau
                  khi chấm dứt, Trưởng văn phòng ký quyết định thu hồi trong 2 ngày làm việc (NĐ 151
                  Điều 46).
                </p>
                {open && canOrder ? (
                  <div>
                    <TerminationSheet caseId={c.caseId} />
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}
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
