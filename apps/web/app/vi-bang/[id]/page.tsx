import Link from 'next/link';
import { CaseActionDialog } from '../../../components/CaseActionDialog';
import { CaseActions } from '../../../components/CaseActions';
import { CHANGE_FIELD_LABEL } from '../../../lib/change-fields';
import { ChangeDecision } from '../../../components/ChangeRequestRow';
import { StatusPill } from '../../../components/StatusPill';
import { DefList } from '../../../components/ui/def-list';
import { type HistoryEntry, getJson } from '../../../lib/case-api';
import { HISTORY_KIND_LABEL } from '../../../lib/messages';
import { type CaseTab, renderCaseFrame } from './case-frame';
import { HistoryTimeline } from './history-timeline';
import { PersonLabel } from '../../../components/ui/avatar';

export const dynamic = 'force-dynamic';

const REQUEST_LABEL: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
};
const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const TABS: readonly CaseTab[] = ['tien-do', 'thong-tin', 'lich-su', 'de-nghi'];

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: CaseTab = TABS.find((t) => t === sp.tab) ?? 'tien-do';
  return renderCaseFrame(id, tab, async (ctx) => {
    const { c, base, cookie, isAdmin, isFinal, windowOpen, changes } = ctx;
    const history =
      tab === 'tien-do' || tab === 'lich-su'
        ? await getJson<{ items: HistoryEntry[] }>(
            `/vibang/cases/${encodeURIComponent(id)}/history`,
            cookie,
          )
        : null;
    const events = history && typeof history === 'object' ? history.items : [];
    if (tab === 'tien-do') {
      return (
        <section className="panel" aria-labelledby="act-t">
          <h2 id="act-t">Hoạt động gần đây</h2>
          {events.length === 0 ? (
            <p className="muted">Chưa có mốc xử lý nào được ghi nhận.</p>
          ) : (
            <ol className="history">
              {events.slice(0, 5).map((e, i) => (
                <li key={`${e.at}-${e.kind}-${i}`}>
                  <span className="history-title">{HISTORY_KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span className="muted">{fmt.format(new Date(e.at))}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      );
    }
    if (tab === 'thong-tin') {
      const rows: [string, string][] = [
        ['Khách hàng', c.customerName ?? ''],
        ['Địa điểm', c.branchName ?? ''],
        ['Số tiếp nhận', c.intakeNo ?? ''],
        ['SĐT khách', c.customerPhone ?? ''],
        ['Số định danh', c.customerIdNumber ?? ''],
        ['Ngày tạo', fmt.format(new Date(c.createdAt))],
        ['Giới hạn sửa', '48 giờ từ ngày tạo'],
        ['Nội dung', c.description || 'Chưa có nội dung ghi nhận.'],
      ];
      const shown = rows.filter(([, v]) => v);
      return (
        <div className="grid gap-4">
          <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
            <section className="panel" aria-labelledby="info-t">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="info-t" className="!m-0">
                  Thông tin hồ sơ
                </h2>
                {isFinal ? null : (
                  <CaseActionDialog
                    label={windowOpen ? 'Sửa thông tin' : 'Đề nghị thay đổi'}
                    title={windowOpen ? 'Sửa thông tin hồ sơ' : 'Đề nghị thay đổi hồ sơ'}
                    description={
                      windowOpen
                        ? 'Sửa trực tiếp trong 48 giờ kể từ ngày tạo.'
                        : 'Đã quá 48 giờ: đề nghị được gửi Admin duyệt.'
                    }
                  >
                    <CaseActions
                      caseId={c.id}
                      title={c.title}
                      description={c.description ?? ''}
                      windowOpen={windowOpen}
                      isFinal={isFinal}
                      canCancel={false}
                      section="edit"
                    />
                  </CaseActionDialog>
                )}
              </div>
              <DefList rows={shown} />
            </section>
            <section className="panel" aria-labelledby="who-t">
              <h2 id="who-t">Người phụ trách</h2>
              <DefList
                rows={[
                  [
                    'Thừa phát lại',
                    <PersonLabel
                      key="thv"
                      label={c.thvLabel}
                      id={c.responsibleThvUserId}
                      size="md"
                      fallback={c.responsibleThvUserId ? 'Đã phân công' : 'Chưa phân công'}
                    />,
                  ],
                  [
                    'Người tạo',
                    <PersonLabel key="by" label={c.createdByLabel} size="md" fallback="Không rõ" />,
                  ],
                ]}
              />
            </section>
          </div>
        </div>
      );
    }
    if (tab === 'lich-su') return <HistoryTimeline events={events} />;
    return (
      <section className="panel" aria-labelledby="req-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="req-title" className="!m-0">
            Đề nghị thay đổi
          </h2>
          {isFinal ? null : (
            <CaseActionDialog
              primary
              label="Tạo đề nghị"
              title="Đề nghị thay đổi hồ sơ"
              description="Dùng khi đã quá 48 giờ; Admin duyệt trước khi áp dụng."
            >
              <CaseActions
                caseId={c.id}
                title={c.title}
                description={c.description ?? ''}
                windowOpen={false}
                isFinal={isFinal}
                canCancel={false}
                section="edit"
              />
            </CaseActionDialog>
          )}
        </div>
        {changes.length === 0 ? (
          <p className="muted">Chưa có đề nghị thay đổi.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Đề nghị thay đổi của hồ sơ</caption>
              <thead>
                <tr>
                  <th scope="col">Trường</th>
                  <th scope="col">Cũ → Mới</th>
                  <th scope="col">Lý do</th>
                  <th scope="col">Ngày gửi</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((r) => {
                  const field = Object.keys(r.after)[0] ?? '';
                  return (
                    <tr key={r.id}>
                      <th scope="row">{CHANGE_FIELD_LABEL[field] ?? field}</th>
                      <td>
                        {r.before[field] ?? ''} → {r.after[field] ?? ''}
                      </td>
                      <td>{r.reason}</td>
                      <td>{fmt.format(new Date(r.createdAt))}</td>
                      <td>
                        {r.status === 'PENDING' ? (
                          isAdmin ? (
                            <Link href={`${base}/duyet-sua`}>Xem và duyệt</Link>
                          ) : (
                            <ChangeDecision requestId={r.id} canDecide={false} />
                          )
                        ) : (
                          <StatusPill
                            status={r.status}
                            label={REQUEST_LABEL[r.status] ?? r.status}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  });
}
