import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { CaseActionDialog } from '../../../components/CaseActionDialog';
import { ContractDateForm } from '../../../components/ContractDateForm';
import { type DialogAction } from '../../../components/DialogActionMenu';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import { StatusPill } from '../../../components/StatusPill';
import { DefList } from '../../../components/ui/def-list';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  CompleteRoundForm,
  ConclusionDecision,
  ConclusionProposalForm,
  SourceFileForm,
  StartRoundForm,
} from '../../../components/VerificationActions';
import { loadItems } from '../../../lib/load-items';
import { VERIFICATION_STATUS_LABEL } from '../../../lib/messages';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Round {
  readonly id: string;
  readonly seq: number;
  readonly partyName: string;
  readonly status: string;
  readonly result: string | null;
}
interface Item {
  readonly caseId: string;
  readonly caseRef: string;
  readonly status: string;
  readonly handlerUserId: string | null;
  readonly conclusionText: string | null;
  readonly rounds: Round[];
}

const TABS = [
  { key: 'tong-quan', label: 'Tổng quan' },
  { key: 'luot', label: 'Các lượt xác minh' },
  { key: 'ket-luan', label: 'Kết luận' },
  { key: 'lich-su', label: 'Lịch sử' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const ROUND_LABEL: Record<string, string> = {
  IN_PROGRESS: 'Đang xác minh',
  COMPLETED: 'Đã có kết quả',
};

export default async function VerificationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return <DetailSignIn title="Hồ sơ xác minh" what="hồ sơ xác minh" />;
  }
  const cookie = await requestCookie();
  const items = await loadItems<Item>('/verification/cases', cookie);
  if (items === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ xác minh</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const c = items.find((x) => x.caseId === id);
  if (!c) notFound();
  const tab: Tab = TABS.find((t) => t.key === rawTab)?.key ?? 'luot';
  const isAdmin = session.roles.includes('ADMIN');
  const handlers = isAdmin ? await loadHandlerOptions(cookie) : [];
  const concluded = c.status === 'CONCLUDED';
  const proposed = c.status === 'CONCLUSION_PROPOSED';
  const statusLabel = VERIFICATION_STATUS_LABEL[c.status] ?? c.status;
  const open = c.rounds.filter((r) => r.status === 'IN_PROGRESS');
  const done = c.rounds.length - open.length;

  const actions: DialogAction[] = [];
  if (c.status === 'OPEN') {
    actions.push({
      key: 'luot',
      label: 'Thêm lượt xác minh',
      title: 'Thêm lượt xác minh',
      body: <StartRoundForm caseId={c.caseId} />,
    });
    actions.push({
      key: 'de-xuat',
      label: 'Đề xuất kết luận',
      title: 'Đề xuất kết luận',
      description: 'Chỉ đề xuất được khi mọi lượt đã có kết quả.',
      body: <ConclusionProposalForm caseId={c.caseId} />,
    });
  }
  if (proposed) {
    actions.push({
      key: 'quyet-dinh',
      label: 'Quyết định kết luận',
      title: 'Quyết định kết luận',
      body: <ConclusionDecision caseId={c.caseId} />,
    });
  }
  if (!concluded) {
    if (isAdmin) {
      actions.push({
        key: 'phan-cong',
        label: 'Phân công Thừa hành viên',
        title: 'Phân công Thừa hành viên',
        body: (
          <AssignHandler
            path={`verification/cases/${c.caseId}/handler`}
            options={handlers}
            currentId={c.handlerUserId}
          />
        ),
      });
    }
    actions.push({
      key: 'hop-dong',
      label: 'Ngày ký hợp đồng',
      title: 'Ngày ký hợp đồng dịch vụ',
      body: <ContractDateForm caseId={c.caseId} />,
    });
  }

  const base = `/xac-minh/${c.caseId}`;
  return (
    <DetailFrame
      title={c.caseRef}
      meta="Xác minh điều kiện thi hành án"
      status={c.status}
      statusLabel={statusLabel}
      actions={actions}
      single
    >
      <TabNav
        label="Mục của hồ sơ xác minh"
        active={tab}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?tab=${t.key}` }))}
      />
      {tab === 'tong-quan' ? (
        <section className="panel" aria-labelledby="ov-t">
          <h2 id="ov-t">Tổng quan</h2>
          <DefList
            rows={[
              ['Mã hồ sơ', c.caseRef],
              ['Trạng thái', <StatusPill key="s" status={c.status} label={statusLabel} />],
              ['THV phụ trách', c.handlerUserId ? 'Đã phân công' : 'Chưa phân công'],
              ['Các lượt xác minh', `${c.rounds.length} lượt, ${done} đã có kết quả`],
              ['Kết luận', c.conclusionText ?? 'Chưa có'],
            ]}
          />
        </section>
      ) : null}
      {tab === 'luot' ? (
        <section className="panel panel-flat" aria-labelledby="rounds-t">
          <div className="panel-head">
            <h2 id="rounds-t">Các lượt xác minh</h2>
            {c.status === 'OPEN' ? (
              <CaseActionDialog label="Thêm lượt xác minh" title="Thêm lượt xác minh" primary>
                <StartRoundForm caseId={c.caseId} />
              </CaseActionDialog>
            ) : null}
          </div>
          {c.rounds.length === 0 ? (
            <p className="muted">Chưa có lượt xác minh.</p>
          ) : (
            <div className="table-wrap">
              <table className="table-cards">
                <caption className="sr-only">Các lượt xác minh</caption>
                <thead>
                  <tr>
                    <th scope="col">Lượt</th>
                    <th scope="col">Bên được xác minh</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Kết quả</th>
                    <th scope="col">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.rounds.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{r.seq}</th>
                      <td data-label="Bên được xác minh">{r.partyName}</td>
                      <td data-label="Trạng thái">
                        <StatusPill
                          status={r.status}
                          label={ROUND_LABEL[r.status] ?? r.status}
                          tone={r.status === 'COMPLETED' ? 'ok' : 'warn'}
                        />
                      </td>
                      <td data-label="Kết quả">
                        {r.result ?? <span className="muted">Chờ phản hồi</span>}
                      </td>
                      <td data-label="Thao tác" className="text-right">
                        {r.status === 'IN_PROGRESS' && c.status === 'OPEN' ? (
                          <CaseActionDialog
                            label="Ghi kết quả"
                            title="Ghi kết quả"
                            description={`${r.seq}. ${r.partyName}`}
                            className="link-btn"
                          >
                            <div className="stack">
                              <SourceFileForm rounds={[r]} />
                              <CompleteRoundForm rounds={[r]} />
                            </div>
                          </CaseActionDialog>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">Kết luận chỉ đề xuất được khi mọi lượt đã có kết quả.</p>
        </section>
      ) : null}
      {tab === 'ket-luan' ? (
        <section className="panel" aria-labelledby="concl-t">
          <h2 id="concl-t">Kết luận</h2>
          <p>
            <StatusPill status={c.status} label={statusLabel} />
          </p>
          {c.conclusionText ? (
            <p>{c.conclusionText}</p>
          ) : (
            <p className="muted">Chưa có kết luận.</p>
          )}
          {c.status === 'OPEN' ? <ConclusionProposalForm caseId={c.caseId} /> : null}
          {proposed ? <ConclusionDecision caseId={c.caseId} /> : null}
        </section>
      ) : null}
      {tab === 'lich-su' ? (
        <section className="panel" aria-labelledby="hist-t">
          <h2 id="hist-t">Lịch sử</h2>
          <p className="muted">Dựng từ các lượt và kết luận đã ghi trên hồ sơ.</p>
          <ol className="stack">
            {c.rounds.map((r) => (
              <li key={r.id}>
                Lượt {r.seq}: {r.partyName} · {ROUND_LABEL[r.status] ?? r.status}
                {r.result ? ` · ${r.result}` : ''}
              </li>
            ))}
            {c.conclusionText ? <li>Kết luận: {c.conclusionText}</li> : null}
            {c.rounds.length === 0 && !c.conclusionText ? <li>Chưa có mốc nào.</li> : null}
          </ol>
        </section>
      ) : null}
    </DetailFrame>
  );
}
