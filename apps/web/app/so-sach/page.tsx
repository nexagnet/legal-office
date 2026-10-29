import Link from 'next/link';
import { TabNav } from '../../components/ui/tab-nav';
import { LedgerSeal } from '../../components/LedgerSeal';
import { ReportExport } from '../../components/ReportExport';
import {
  MONTH_STATE_LABEL,
  currentYm,
  monthRows,
  type SealedPeriod,
} from '../../lib/ledger-periods';
import { API_URL, currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

const LEDGERS = [
  ['s-01', 'S-01 · Tống đạt'],
  ['s-02', 'S-02 · Vi bằng'],
  ['s-04', 'S-04 · Xác minh điều kiện THA'],
  ['s-05', 'S-05 · Thi hành án'],
  ['s-06', 'S-06 · Sử dụng lao động'],
] as const;
const CODES = new Set<string>(LEDGERS.map(([c]) => c));
const EMPTY = '—';

interface Ledger {
  readonly code: string;
  readonly title: string;
  readonly notice: string;
  readonly columns: readonly {
    readonly no: number;
    readonly key: string;
    readonly label: string;
  }[];
  readonly rows: readonly Record<string, unknown>[];
}

async function load(
  cookie: string | null,
  officeId: string,
  code: string,
  year: string,
): Promise<Ledger | 'error'> {
  const qs = new URLSearchParams({ officeId });
  if (year) qs.set('year', year);
  try {
    const res = await fetch(`${API_URL}/office/ledgers/${code}?${qs.toString()}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as Ledger;
  } catch {
    return 'error';
  }
}

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

/** Các tháng đã đóng quyển của sổ trong năm. Lỗi hoặc không đủ quyền xem thì ẩn khối đóng quyển. */
async function loadPeriods(
  cookie: string | null,
  officeId: string,
  code: string,
  year: string,
): Promise<SealedPeriod[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/ledgers/${code}/periods?officeId=${encodeURIComponent(officeId)}&year=${year}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: SealedPeriod[] }).items;
  } catch {
    return 'error';
  }
}

/** Cột chưa có nguồn (null) hiển thị gạch ngang, không bịa giá trị. */
function cell(v: unknown): string {
  if (v === null || v === undefined || v === '') return EMPTY;
  return String(v);
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ so?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.so && CODES.has(sp.so) ? sp.so : 's-02';
  const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : '';
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Sổ sách</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem sổ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const ledger = officeId ? await load(await requestCookie(), officeId, code, year) : 'error';
  const sealYear = year || currentYm().slice(0, 4);
  const canSeal = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  const periods = officeId
    ? await loadPeriods(await requestCookie(), officeId, code, sealYear)
    : 'error';
  const table: string[][] =
    ledger === 'error'
      ? []
      : [
          ledger.columns.map((c) => c.label),
          ...ledger.rows.map((r) => ledger.columns.map((c) => cell(r[c.key]))),
        ];
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">{ledger === 'error' ? 'Sổ sách' : ledger.title}</h1>
        </div>
        {ledger !== 'error' ? (
          <ReportExport
            rows={table}
            filename={`${code}${year ? `-${year}` : ''}.csv`}
            server={
              officeId
                ? {
                    path: `/office/ledgers/${code}/export`,
                    params: { officeId, ...(year ? { year } : {}) },
                  }
                : undefined
            }
          />
        ) : null}
      </div>
      <TabNav
        label="Sổ"
        active={code}
        tabs={LEDGERS.map(([c, label]) => ({
          key: c,
          label,
          href: `/so-sach?so=${c}${year ? `&year=${year}` : ''}`,
        }))}
      />
      {code === 's-06' ? (
        <p className="muted">
          Sổ S-06 dựng từ <Link href="/quan-tri/ho-so-lao-dong">Hồ sơ lao động</Link> (bản mới nhất
          của mỗi người), không theo năm. Chỉ Admin và Trưởng văn phòng xem được.
        </p>
      ) : (
        <form className="filters filters-ledger" method="get" role="search">
          <input type="hidden" name="so" value={code} />
          <label>
            <span className="sr-only">Năm</span>
            <input
              name="year"
              inputMode="numeric"
              maxLength={4}
              defaultValue={year}
              placeholder="Năm"
            />
          </label>
          <button type="submit" className="primary">
            Xem
          </button>
        </form>
      )}
      {ledger === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được sổ</h2>
          <p>Bạn có thể chưa có quyền xem sổ này, hoặc máy chủ đang lỗi. Vui lòng thử lại.</p>
        </div>
      ) : ledger.rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Sổ chưa có dòng nào</h2>
          <p>Chưa có hồ sơ nào khớp năm đã chọn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{ledger.title}</caption>
            <thead>
              <tr>
                {ledger.columns.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r, i) => (
                <tr key={i}>
                  {ledger.columns.map((c, j) =>
                    j === 0 ? (
                      <th key={c.key} scope="row">
                        {cell(r[c.key])}
                      </th>
                    ) : (
                      <td key={c.key}>{cell(r[c.key])}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ledger !== 'error' ? (
        <aside className="panel">
          <h2>Yêu cầu sổ điện tử</h2>
          <p className="muted">{ledger.notice} Cột chưa có nguồn dữ liệu hiển thị “—”.</p>
        </aside>
      ) : null}
      {officeId && periods !== 'error' ? (
        <aside className="panel" aria-labelledby="seal-t">
          <h2 id="seal-t">Đóng quyển theo tháng · {sealYear}</h2>
          <p className="muted">
            Đóng quyển sau khi in và giáp lai sổ của tháng. Chỉ đóng được tháng đã qua; đã đóng thì
            không mở lại. Chỉ Admin và Trưởng văn phòng đóng quyển.
          </p>
          <ul className="grid gap-2 text-sm">
            {monthRows(Number(sealYear), periods, currentYm()).map((m) => (
              <li key={m.ym} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Tháng {m.month}/{sealYear} · {MONTH_STATE_LABEL[m.state]}
                  {m.sealed ? (
                    <span className="muted"> · ngày {day.format(new Date(m.sealed.sealedAt))}</span>
                  ) : null}
                </span>
                {m.state === 'open' && canSeal ? (
                  <LedgerSeal officeId={officeId} code={code} ym={m.ym} />
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      <p className="ledger-link">
        <Link href="/so-sach/theo-doi-so">Theo dõi cập nhật CSDL / Sở →</Link>
      </p>
    </section>
  );
}
