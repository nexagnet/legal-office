import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CaseSteps, type Progress } from '../../../components/CaseSteps';
import { CaseActions } from '../../../components/CaseActions';
import { RejectCaseForm } from '../../../components/CaseRejectCopy';
import { ChangeDecision } from '../../../components/ChangeRequestRow';
import { StatusPill } from '../../../components/StatusPill';
import { ActionMenu, type ActionItem } from '../../../components/ui/action-menu';
import { TabNav } from '../../../components/ui/tab-nav';
import { type CaseDetail, type HistoryEntry, getJson } from '../../../lib/case-api';
import { currentSession, requestCookie } from '../../../lib/server';
import { CASE_STATUS_LABEL, HISTORY_KIND_LABEL } from '../../../lib/messages';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 48 * 60 * 60 * 1000;
const FIELD_LABEL: Record<string, string> = { title: 'Tiêu đề', description: 'Nội dung' };
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

interface ChangeItem {
  readonly id: string;
  readonly reason: string;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
  readonly status: string;
  readonly createdAt: string;
}

type Tab = 'tien-do' | 'thong-tin' | 'lich-su' | 'de-nghi';
const TABS: readonly Tab[] = ['tien-do', 'thong-tin', 'lich-su', 'de-nghi'];

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t === sp.tab) ?? 'tien-do';
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const c = await getJson<CaseDetail>(`/vibang/cases/${encodeURIComponent(id)}`, cookie);
  if (c === 404) notFound();
  if (c === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const changes = await getJson<{ items: ChangeItem[] }>(
    `/vibang/cases/${encodeURIComponent(id)}/change-requests`,
    cookie,
  );
  const items = typeof changes === 'object' ? changes.items : [];
  const progress = await getJson<Progress>(
    `/vibang/cases/${encodeURIComponent(id)}/progress`,
    cookie,
  );
  const isAdmin = session.roles.includes('ADMIN');
  const isFinal = c.status === 'RETURNED' || c.status === 'CANCELLED';
  const meta = [c.customerName, c.branchName, c.thvLabel ? `THV ${c.thvLabel}` : null].filter(
    (x): x is string => !!x,
  );
  const windowOpen = Date.now() < new Date(c.createdAt).getTime() + WINDOW_MS;
  const numbered = typeof progress === 'object' && !!progress.numberLabel;
  const history =
    tab === 'tien-do' || tab === 'lich-su'
      ? await getJson<{ items: HistoryEntry[] }>(
          `/vibang/cases/${encodeURIComponent(id)}/history`,
          cookie,
        )
      : null;
  const events = history && typeof history === 'object' ? history.items : [];
  const base = `/vi-bang/${c.id}`;
  const menu: ActionItem[] = [];
  if (!isFinal) {
    menu.push({
      key: 'edit',
      label: windowOpen ? 'Sửa trong 48 giờ' : 'Đề nghị thay đổi',
      href: `${base}?tab=thong-tin#sua`,
      hint: windowOpen ? undefined : 'Đã quá 48 giờ kể từ ngày tạo',
    });
    if (isAdmin) {
      menu.push({
        key: 'assign',
        label: c.responsibleThvUserId ? 'Đổi THV phụ trách' : 'Phân công THV',
        href: `${base}/phan-cong`,
      });
    }
  }
  if (numbered) {
    menu.push(
      { key: 'misa', label: 'Thu hồi MISA', href: `${base}/thu-hoi-misa`, separated: true },
      { key: 'n11', label: 'Sửa lỗi (N-11)', href: `${base}/sua-loi-n11` },
      {
        key: 'handover',
        label: 'Kiểm tra bàn giao',
        href: `${base}/kiem-tra-ban-giao`,
        separated: true,
      },
    );
    if (c.status === 'RETURNED') {
      menu.push({
        key: 'copy',
        label: 'Cấp bản sao',
        href: `${base}/cap-ban-sao`,
        hint: 'Thao tác hiếm, hiện theo vai và giai đoạn',
      });
    }
  }
  const pending = items.filter((r) => r.status === 'PENDING').length;
  const tabHref = (t: Tab) => (t === 'tien-do' ? base : `${base}?tab=${t}`);
  return (
    <section aria-labelledby="t">
      <p className="case-back">
        <Link href="/vi-bang">← Danh sách hồ sơ</Link>
      </p>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h1 id="t" className="font-serif text-[34px] leading-10 font-bold text-[#12263f]">
            {c.title}
          </h1>
          {meta.length > 0 ? <p className="muted">{meta.join(' • ')}</p> : null}
          <p>
            <span className="badge" data-status={c.status}>
              {CASE_STATUS_LABEL[c.status] ?? c.status}
            </span>
          </p>
        </div>
        <ActionMenu items={menu} />
      </header>
      <div className="mb-5 grid gap-4">
        {typeof progress === 'object' ? (
          <CaseSteps caseId={c.id} status={c.status} progress={progress} />
        ) : (
          <section className="panel">
            <h2>Tiến độ hồ sơ</h2>
            <p className="muted">Chưa tải được tiến độ hồ sơ.</p>
          </section>
        )}
      </div>
      <TabNav
        label="Các mục của hồ sơ"
        active={tab}
        tabs={[
          { key: 'tien-do', label: 'Tiến độ', href: tabHref('tien-do') },
          { key: 'thong-tin', label: 'Thông tin', href: tabHref('thong-tin') },
          ...(numbered ? [{ key: 'tai-lieu', label: 'Tài liệu', href: `${base}/tai-lieu` }] : []),
          { key: 'phap-ly', label: 'Pháp lý', href: `${base}/phap-ly` },
          { key: 'lich-su', label: 'Lịch sử', href: tabHref('lich-su') },
          {
            key: 'de-nghi',
            label: 'Đề nghị thay đổi',
            href: tabHref('de-nghi'),
            count: pending || undefined,
          },
        ]}
      />
      {tab === 'tien-do' ? (
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
      ) : null}
      {tab === 'thong-tin' ? (
        <div className="grid gap-4">
          <section className="panel" aria-labelledby="info-t">
            <h2 id="info-t">Thông tin hồ sơ</h2>
            <dl className="info">
              <dt>THV phụ trách</dt>
              <dd>{c.thvLabel ?? (c.responsibleThvUserId ? 'Đã phân công' : 'Chưa phân công')}</dd>
              {c.branchName ? (
                <>
                  <dt>Địa điểm</dt>
                  <dd>{c.branchName}</dd>
                </>
              ) : null}
              {c.intakeNo ? (
                <>
                  <dt>Số tiếp nhận</dt>
                  <dd>{c.intakeNo}</dd>
                </>
              ) : null}
              {c.createdByLabel ? (
                <>
                  <dt>Người tạo</dt>
                  <dd>{c.createdByLabel}</dd>
                </>
              ) : null}
              {c.customerPhone ? (
                <>
                  <dt>SĐT khách</dt>
                  <dd>{c.customerPhone}</dd>
                </>
              ) : null}
              {c.customerIdNumber ? (
                <>
                  <dt>Số định danh</dt>
                  <dd>{c.customerIdNumber}</dd>
                </>
              ) : null}
              <dt>Ngày tạo</dt>
              <dd>{fmt.format(new Date(c.createdAt))}</dd>
              <dt>Giới hạn sửa</dt>
              <dd>48 giờ từ ngày tạo</dd>
              <dt>Nội dung</dt>
              <dd>{c.description || 'Chưa có nội dung ghi nhận.'}</dd>
            </dl>
          </section>
          <div id="sua">
            <CaseActions
              caseId={c.id}
              title={c.title}
              description={c.description ?? ''}
              windowOpen={windowOpen}
              isFinal={isFinal}
              canCancel={isAdmin}
              section="edit"
            />
          </div>
          {!isFinal && (isAdmin || c.status === 'INTAKE' || c.status === 'ASSIGNED') ? (
            <section
              aria-labelledby="danger-t"
              className="grid gap-4 rounded-2xl border border-danger bg-danger-soft/40 p-5"
            >
              <div className="grid gap-1">
                <h2 id="danger-t" className="font-serif text-lg font-bold text-danger">
                  Vùng nguy hiểm
                </h2>
                <p className="text-[13px] text-muted">
                  Huỷ hoặc từ chối hồ sơ cần ghi lý do. Không hoàn tác được.
                </p>
              </div>
              <CaseActions
                caseId={c.id}
                title={c.title}
                description={c.description ?? ''}
                windowOpen={windowOpen}
                isFinal={isFinal}
                canCancel={isAdmin}
                section="cancel"
              />
              {c.status === 'INTAKE' || c.status === 'ASSIGNED' ? (
                <RejectCaseForm caseId={c.id} />
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
      {tab === 'lich-su' ? (
        events.length === 0 ? (
          <div className="state" role="status">
            <h2>Chưa có lịch sử</h2>
            <p>Hồ sơ chưa có mốc xử lý nào được ghi nhận.</p>
          </div>
        ) : (
          <section className="panel">
            <h2>Các mốc xử lý (mới nhất trước)</h2>
            <ol className="history">
              {events.map((e, i) => (
                <li key={`${e.at}-${e.kind}-${i}`}>
                  <span className="history-title">{HISTORY_KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span className="muted">
                    {fmt.format(new Date(e.at))}
                    {e.actorLabel ? ` · ${e.actorLabel}` : ''}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )
      ) : null}
      {tab === 'de-nghi' ? (
        items.length === 0 ? (
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
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const field = Object.keys(r.after)[0] ?? '';
                  return (
                    <tr key={r.id}>
                      <th scope="row">{FIELD_LABEL[field] ?? field}</th>
                      <td>
                        {r.before[field] ?? ''} → {r.after[field] ?? ''}
                      </td>
                      <td>{r.reason}</td>
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
        )
      ) : null}
    </section>
  );
}
