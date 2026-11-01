import { DataTable } from '../../components/ui/data-table';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Input } from '../../components/ui/field';
import { CorrespondenceActions } from '../../components/CorrespondenceActions';
import { NewCorrespondenceSheet } from '../../components/NewCorrespondenceSheet';
import { RowActions } from '../../components/RowActions';
import { StatusPill } from '../../components/StatusPill';
import { FilterChips } from '../../components/ui/filter-chips';
import { TabNav } from '../../components/ui/tab-nav';
import { NewDecisionForm } from '../../components/NewDecisionForm';
import { API_URL, currentSession, loadSignerOptions, requestCookie } from '../../lib/server';
import { CORRESPONDENCE_STATUS_LABEL } from '../../lib/messages';

/** Trạng thái đã khép lại: công văn đến đã xử lý, công văn đi đã ban hành. */
const PROCESSED = new Set(['HANDLED', 'ISSUED']);

export const dynamic = 'force-dynamic';

interface Row {
  readonly id: string;
  readonly direction: string;
  readonly status: string;
  readonly refNo: string | null;
  readonly docType: string;
  readonly counterparty: string;
  readonly subject: string;
  readonly receivedOn: string | null;
  readonly issuedOn: string | null;
  readonly overdue: boolean;
}

interface Decision {
  readonly id: string;
  readonly decision_no: string;
  readonly doc_type: string;
  readonly title: string;
  readonly signed_on: string;
}

async function loadDecisions(
  cookie: string | null,
  officeId: string,
): Promise<Decision[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/decisions?officeId=${encodeURIComponent(officeId)}`,
      {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
      },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as Decision[];
  } catch {
    return 'error';
  }
}

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

async function load(cookie: string | null, officeId: string): Promise<Row[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/correspondence/list?officeId=${encodeURIComponent(officeId)}&limit=500`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as Row[];
  } catch {
    return 'error';
  }
}

type TabKey = 'den' | 'di' | 'quyet-dinh';
type ChipKey = 'all' | 'pending' | 'overdue' | 'done';

const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const dateOf = (iso: string | null) => (iso ? day.format(new Date(iso)) : '—');

export default async function CorrespondencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; chip?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 200);
  const tab: TabKey = sp.tab === 'di' || sp.tab === 'quyet-dinh' ? sp.tab : 'den';
  const chip: ChipKey =
    sp.chip === 'pending' || sp.chip === 'overdue' || sp.chip === 'done' ? sp.chip : 'all';
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Công văn</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem công văn.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const cookie = await requestCookie();
  const all = officeId ? await load(cookie, officeId) : ([] as Row[]);
  const decisions = officeId ? await loadDecisions(cookie, officeId) : ([] as Decision[]);
  const signers = officeId ? await loadSignerOptions(cookie, officeId) : [];

  const href = (over: { tab?: string; chip?: string }) => {
    const p = new URLSearchParams();
    const t = over.tab ?? tab;
    if (t !== 'den') p.set('tab', t);
    const c = over.chip ?? (over.tab ? 'all' : chip);
    if (c !== 'all') p.set('chip', c);
    if (q) p.set('q', q);
    const s = p.toString();
    return s ? `/cong-van?${s}` : '/cong-van';
  };

  const rows = all === 'error' ? [] : all;
  const inTab = rows.filter((c) => c.direction === (tab === 'di' ? 'OUTBOUND' : 'INBOUND'));
  const isDone = (c: Row) => PROCESSED.has(c.status);
  const counts = {
    all: inTab.length,
    pending: inTab.filter((c) => !isDone(c)).length,
    overdue: inTab.filter((c) => c.overdue).length,
    done: inTab.filter(isDone).length,
  };
  const needle = norm(q);
  const shown = inTab
    .filter((c) =>
      chip === 'pending'
        ? !isDone(c)
        : chip === 'overdue'
          ? c.overdue
          : chip === 'done'
            ? isDone(c)
            : true,
    )
    .filter(
      (c) =>
        !needle ||
        norm(`${c.refNo ?? ''} ${c.subject} ${c.counterparty} ${c.docType}`).includes(needle),
    );
  const dateLabel = tab === 'di' ? 'Ngày ban hành' : 'Ngày nhận';
  const partyLabel = tab === 'di' ? 'Nơi nhận' : 'Nơi gửi';

  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Công văn</h1>
        </div>
        <NewCorrespondenceSheet branches={session.branches} />
      </div>
      <TabNav
        label="Phân loại văn bản"
        active={tab}
        tabs={[
          {
            key: 'den',
            label: 'Công văn đến',
            href: href({ tab: 'den' }),
            count: rows.filter((c) => c.direction === 'INBOUND').length,
          },
          {
            key: 'di',
            label: 'Công văn đi',
            href: href({ tab: 'di' }),
            count: rows.filter((c) => c.direction === 'OUTBOUND').length,
          },
          {
            key: 'quyet-dinh',
            label: 'Sổ quyết định',
            href: href({ tab: 'quyet-dinh' }),
            count: decisions === 'error' ? undefined : decisions.length,
          },
        ]}
      />
      {tab === 'quyet-dinh' ? (
        <>
          {decisions === 'error' ? (
            <div className="state" role="alert">
              <h3>Không tải được sổ quyết định</h3>
              <p>Vui lòng thử lại sau.</p>
            </div>
          ) : decisions.length === 0 ? (
            <div className="state" role="status">
              <h3>Chưa có quyết định</h3>
              <p>Chưa có quyết định nào trong phạm vi quyền của bạn.</p>
            </div>
          ) : (
            <DataTable tableKey="cong-van-page-1">
              <table>
                <caption className="sr-only">Sổ quyết định</caption>
                <thead>
                  <tr>
                    <th scope="col">Số</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Trích yếu</th>
                    <th scope="col">Ngày ký</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.id}>
                      <th scope="row">{d.decision_no}</th>
                      <td>{d.doc_type}</td>
                      <td>{d.title}</td>
                      <td>{day.format(new Date(d.signed_on))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
          <NewDecisionForm branches={session.branches} signers={signers} />
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <FilterChips
              label="Lọc nhanh"
              active={chip}
              chips={[
                { key: 'all', label: 'Tất cả', href: href({ chip: 'all' }), count: counts.all },
                {
                  key: 'pending',
                  label: 'Chờ xử lý',
                  href: href({ chip: 'pending' }),
                  count: counts.pending,
                },
                {
                  key: 'overdue',
                  label: 'Quá hạn',
                  href: href({ chip: 'overdue' }),
                  count: counts.overdue,
                },
                {
                  key: 'done',
                  label: 'Đã xử lý',
                  href: href({ chip: 'done' }),
                  count: counts.done,
                },
              ]}
            />
            <form method="get" role="search" className="flex-1 basis-72 sm:max-w-sm">
              {tab !== 'den' ? <input type="hidden" name="tab" value={tab} /> : null}
              {chip !== 'all' ? <input type="hidden" name="chip" value={chip} /> : null}
              <label className="relative block">
                <span className="sr-only">Tìm theo số hiệu, trích yếu hoặc nơi gửi/nhận</span>
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
                />
                <Input
                  type="search"
                  name="q"
                  defaultValue={q}
                  maxLength={200}
                  className="rounded-full pl-10"
                  placeholder="Tìm theo số hiệu, trích yếu…"
                />
              </label>
            </form>
          </div>
          {all === 'error' ? (
            <div className="state" role="alert">
              <h2>Không tải được danh sách</h2>
              <p>Vui lòng thử lại sau.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="state" role="status">
              <h2>Chưa có công văn</h2>
              <p>Không có công văn nào khớp trong phạm vi quyền của bạn.</p>
            </div>
          ) : (
            <DataTable tableKey="cong-van-page-2">
              <table>
                <caption className="sr-only">Công văn</caption>
                <thead>
                  <tr>
                    <th scope="col">Số hiệu</th>
                    <th scope="col">Trích yếu</th>
                    <th scope="col">{partyLabel}</th>
                    <th scope="col">{dateLabel}</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">
                        <Link href={`/cong-van/${c.id}`}>
                          {c.refNo ?? <span className="muted">Chưa có số</span>}
                        </Link>
                      </th>
                      <td>
                        {c.subject} <span className="muted">· {c.docType}</span>
                      </td>
                      <td>{c.counterparty}</td>
                      <td>{dateOf(tab === 'di' ? c.issuedOn : c.receivedOn)}</td>
                      <td>
                        {c.overdue && !isDone(c) ? (
                          <StatusPill status="OVERDUE" label="Quá hạn" tone="danger" />
                        ) : (
                          <StatusPill
                            status={c.status}
                            label={CORRESPONDENCE_STATUS_LABEL[c.status] ?? c.status}
                          />
                        )}
                      </td>
                      <td>
                        <RowActions>
                          <CorrespondenceActions
                            id={c.id}
                            direction={c.direction}
                            status={c.status}
                          />
                        </RowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
        </>
      )}
    </section>
  );
}
