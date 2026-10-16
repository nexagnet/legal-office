import Link from 'next/link';
import { CustomerDirectory } from '../../components/CustomerDirectory';
import { getJson } from '../../lib/case-api';
import type { Contract, Customer } from '../../lib/customers';
import { currentSession, requestCookie } from '../../lib/server';
import { NAV } from '../nav';

export const dynamic = 'force-dynamic';

const ITEM = NAV.find((n) => n.slug === 'hop-dong')!;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? '').slice(0, 200).trim();
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{ITEM.label}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem khách hàng và hợp đồng.
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
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const [customers, contracts] = await Promise.all([
    getJson<Customer[]>(`/vibang/customers${qs}`, cookie),
    getJson<Contract[]>('/vibang/contracts', cookie),
  ]);
  return (
    <section aria-labelledby="t">
      <h1 id="t">{ITEM.label}</h1>
      <p className="muted">
        Quản lý khách hàng và hồ sơ hợp đồng dịch vụ (không có số tiền kế toán).
      </p>
      <p>
        <Link className="primary btn-link" href="/hop-dong/n-03">
          Soạn hợp đồng N-03
        </Link>
      </p>
      <form className="filters filters-single" method="get" role="search">
        <label className="filter-search">
          <span className="sr-only">Tìm khách hàng</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Tìm khách hàng theo tên, điện thoại, mã số thuế, hợp đồng..."
          />
        </label>
        <button type="submit" className="primary">
          Tìm
        </button>
      </form>
      {customers === 'error' || customers === 404 ? (
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : (
        <CustomerDirectory
          customers={customers}
          contracts={typeof contracts === 'object' && Array.isArray(contracts) ? contracts : []}
          query={q}
        />
      )}
    </section>
  );
}
