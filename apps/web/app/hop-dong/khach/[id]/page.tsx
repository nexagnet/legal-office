import { DataTable } from '../../../../components/ui/data-table';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomerAddenda } from '../../../../components/CustomerAddenda';
import { CustomerContracts } from '../../../../components/CustomerContracts';
import { CustomerProfileForm } from '../../../../components/CustomerForms';
import { StatusPill } from '../../../../components/StatusPill';
import { TabNav } from '../../../../components/ui/tab-nav';
import { getJson } from '../../../../lib/case-api';
import {
  CONTACT_KIND_LABEL,
  CONTACT_OUTCOME_LABEL,
  type ContactEntry,
} from '../../../../lib/contacts';
import { type Contract, type Customer } from '../../../../lib/customers';
import { CASE_STATUS_LABEL, PARTY_KIND_LABEL } from '../../../../lib/messages';
import { currentSession, requestCookie } from '../../../../lib/server';
import { NAV } from '../../../nav';
import { Avatar } from '../../../../components/ui/avatar';

export const dynamic = 'force-dynamic';

const ITEM = NAV.find((n) => n.slug === 'hop-dong')!;
type Tab = 'thong-tin' | 'hop-dong' | 'phu-luc' | 'vi-bang' | 'nhat-ky';
const TABS: readonly Tab[] = ['thong-tin', 'hop-dong', 'phu-luc', 'vi-bang', 'nhat-ky'];
/** Nhật ký liên hệ gom từ các hồ sơ gần nhất của khách (không có API riêng theo khách). */
const LOG_CASES = 20;
const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

interface NumberRow {
  readonly caseId: string;
  readonly numberLabel: string;
  readonly allocatedAt: string;
  readonly status: string;
  readonly title: string;
  readonly branchName: string | null;
}

/** Hồ sơ một khách hàng (Figma N12 D8): tab Thông tin, Hợp đồng, Phụ lục, Vi bằng, Nhật ký liên hệ; khung bên phải tóm tắt. */
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; hd?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t === sp.tab) ?? 'thong-tin';
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{ITEM.label}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem khách hàng.
          </p>
        </div>
      </section>
    );
  }
  if (!ITEM.roles.some((r) => session.roles.includes(r))) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{ITEM.label}</h1>
        <div className="state" role="alert" data-state="Không có quyền truy cập">
          <h2>Không có quyền truy cập</h2>
          <p>Vai trò của bạn không được cấp quyền vào mục này. Liên hệ Quản trị viên nếu cần.</p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const [customers, contracts, numbers] = await Promise.all([
    getJson<Customer[]>('/vibang/customers', cookie),
    getJson<Contract[]>(`/vibang/contracts?customerId=${encodeURIComponent(id)}`, cookie),
    getJson<{ total: number; items: NumberRow[] }>(
      `/vibang/customers/${encodeURIComponent(id)}/numbers`,
      cookie,
    ),
  ]);
  if (customers === 'error' || customers === 404 || !Array.isArray(customers)) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{ITEM.label}</h1>
        <div className="state" role="alert">
          <h2>Không tải được khách hàng</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const customer = customers.find((c) => c.id === id);
  if (!customer) notFound();
  const list = Array.isArray(contracts) ? contracts : [];
  const vb = typeof numbers === 'object' ? numbers.items : [];
  const log =
    tab === 'nhat-ky'
      ? (
          await Promise.all(
            vb.slice(0, LOG_CASES).map(async (r) => {
              const res = await getJson<{ items: ContactEntry[] }>(
                `/vibang/cases/${encodeURIComponent(r.caseId)}/contacts`,
                cookie,
              );
              return typeof res === 'object' ? res.items.map((c) => ({ ...c, row: r })) : [];
            }),
          )
        )
          .flat()
          .sort((a, b) => b.at.localeCompare(a.at))
      : [];
  const base = `/hop-dong/khach/${customer.id}`;
  const href = (t: Tab) => (t === 'thong-tin' ? base : `${base}?tab=${t}`);
  const isPerson = customer.kind === 'PERSON';
  const sub = [
    PARTY_KIND_LABEL[customer.kind] ?? customer.kind,
    customer.taxCode ? `MST ${customer.taxCode}` : null,
    customer.address,
  ].filter((x): x is string => !!x);
  const info: [string, string | null][] = [
    ['Loại', PARTY_KIND_LABEL[customer.kind] ?? customer.kind],
    [
      isPerson ? 'Số giấy tờ' : 'Người đại diện',
      isPerson ? customer.idNumber : customer.representative,
    ],
    ['Điện thoại', customer.phone],
    ['Địa chỉ', customer.address],
    ['Vi bằng đã lập', typeof numbers === 'object' ? `${numbers.total} hồ sơ` : null],
  ];
  return (
    <section aria-labelledby="t">
      <p className="case-back">
        <Link href="/hop-dong">← Khách hàng và hợp đồng</Link>
      </p>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1
            id="t"
            className="flex items-center gap-3 font-serif text-[34px] leading-10 font-bold text-[#12263f]"
          >
            {customer.kind === 'PERSON' ? (
              <Avatar
                name={customer.displayName || customer.externalRef}
                id={customer.id}
                size="lg"
              />
            ) : null}
            {customer.displayName || customer.externalRef}
          </h1>
          <p className="muted">{sub.join(' · ')}</p>
        </div>
        <Link className="primary btn-link" href="/hop-dong/n-03">
          Soạn hợp đồng N-03
        </Link>
      </header>
      <TabNav
        label="Các mục của khách hàng"
        active={tab}
        tabs={[
          { key: 'thong-tin', label: 'Thông tin', href: href('thong-tin') },
          { key: 'hop-dong', label: 'Hợp đồng', href: href('hop-dong'), count: list.length },
          { key: 'phu-luc', label: 'Phụ lục', href: href('phu-luc') },
          { key: 'vi-bang', label: 'Vi bằng', href: href('vi-bang'), count: vb.length },
          { key: 'nhat-ky', label: 'Nhật ký liên hệ', href: href('nhat-ky') },
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-5 max-lg:grid-cols-1">
        <div className="grid gap-4">
          {tab === 'thong-tin' ? (
            <section className="panel" aria-label={`Khách hàng ${customer.externalRef}`}>
              <CustomerProfileForm customer={customer} />
            </section>
          ) : null}
          {tab === 'hop-dong' ? (
            <CustomerContracts
              customer={customer}
              customers={customers}
              contracts={list}
              baseHref={base}
              selectedId={sp.hd ?? null}
            />
          ) : null}
          {tab === 'phu-luc' ? <CustomerAddenda contracts={list} /> : null}
          {tab === 'nhat-ky' ? (
            log.length === 0 ? (
              <div className="state" role="status">
                <h2>Chưa có liên hệ</h2>
                <p>Chưa ghi nhận lần nhắc hoặc báo kết quả nào cho các hồ sơ của khách.</p>
              </div>
            ) : (
              <DataTable tableKey="hop-dong-khach-id-page-1">
                <table>
                  <caption className="sr-only">Nhật ký liên hệ khách</caption>
                  <thead>
                    <tr>
                      <th scope="col">Thời điểm</th>
                      <th scope="col">Hồ sơ</th>
                      <th scope="col">Nội dung</th>
                      <th scope="col">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">{day.format(new Date(c.at))}</th>
                        <td>
                          <Link href={`/vi-bang/${c.row.caseId}`}>{c.row.title}</Link>
                        </td>
                        <td>{CONTACT_KIND_LABEL[c.kind] ?? c.kind}</td>
                        <td>{CONTACT_OUTCOME_LABEL[c.outcome] ?? c.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            )
          ) : null}
          {tab === 'vi-bang' ? (
            vb.length === 0 ? (
              <div className="state" role="status">
                <h2>Chưa có Vi bằng</h2>
                <p>Khách chưa có Vi bằng nào được cấp số.</p>
              </div>
            ) : (
              <DataTable tableKey="hop-dong-khach-id-page-2">
                <table>
                  <caption className="sr-only">Vi bằng của khách</caption>
                  <thead>
                    <tr>
                      <th scope="col">Số Vi bằng</th>
                      <th scope="col">Hồ sơ</th>
                      <th scope="col">Địa điểm</th>
                      <th scope="col">Ngày cấp số</th>
                      <th scope="col">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vb.map((r) => (
                      <tr key={r.caseId}>
                        <th scope="row">{r.numberLabel}</th>
                        <td>
                          <Link href={`/vi-bang/${r.caseId}`}>{r.title}</Link>
                        </td>
                        <td>{r.branchName ?? '—'}</td>
                        <td>{day.format(new Date(r.allocatedAt))}</td>
                        <td>
                          <StatusPill
                            status={r.status}
                            label={CASE_STATUS_LABEL[r.status] ?? r.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            )
          ) : null}
        </div>
        <aside className="panel" aria-labelledby="sum-t">
          <h2 id="sum-t">Khách hàng</h2>
          <dl className="info">
            {info.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {tab !== 'thong-tin' ? (
            <Link className="secondary btn-link mt-4 inline-flex" href={href('thong-tin')}>
              Sửa thông tin
            </Link>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
