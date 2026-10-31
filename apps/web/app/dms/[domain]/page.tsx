import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { KpiStrip } from '../../../components/KpiStrip';
import { NewDmsCaseForm } from '../../../components/NewDmsCaseForm';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  DMS_TAB_LABEL,
  activeDmsTab,
  canDraft,
  domainBySlug,
  loadDmsCases,
  loadMyDmsPermissions,
  type DmsTab,
} from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const TABS: readonly DmsTab[] = ['chinh-thuc', 'nhap', 'da-huy'];

export default async function DmsDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const domain = domainBySlug((await params).domain);
  if (!domain) notFound();
  const tab = activeDmsTab((await searchParams).tab);
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            Phiên làm việc chưa được xác thực. <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
          <p>Tài khoản chưa thuộc văn phòng nào.</p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const [rows, permissions] = await Promise.all([
    loadDmsCases(cookie, officeId, domain.code, tab),
    loadMyDmsPermissions(cookie, officeId),
  ]);
  const base = `/dms/${domain.slug}`;
  return (
    <section aria-labelledby="t">
      <h1 id="t">{domain.label}</h1>
      <TabNav
        label={`Nhóm hồ sơ ${domain.label}`}
        active={tab}
        tabs={TABS.map((k) => ({
          key: k,
          label: DMS_TAB_LABEL[k],
          href: k === 'chinh-thuc' ? base : `${base}?tab=${k}`,
        }))}
      />
      {'book' in domain ? (
        <p className="mb-2">
          <Link href={`/dms/so/${domain.bookSlug}`}>Xem trước và xuất sổ {domain.label}</Link>
        </p>
      ) : null}
      {canDraft(permissions, domain.code) ? (
        <NewDmsCaseForm officeId={officeId} domainCode={domain.code} />
      ) : null}
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Máy chủ chưa trả về danh sách. Vui lòng thử lại sau.</p>
        </div>
      ) : (
        <>
          <KpiStrip
            label={`Tổng hợp ${DMS_TAB_LABEL[tab].toLowerCase()}`}
            items={[
              { label: 'Hồ sơ', value: rows.length },
              { label: 'Tài liệu', value: rows.reduce((n, r) => n + r.document_count, 0) },
              {
                label: 'Thiếu scan',
                value: rows.filter((r) => r.document_count > 0 && r.scan_count === 0).length,
                tone: 'danger',
              },
            ]}
          />
          <DmsCaseTable rows={rows} caption={`Danh sách hồ sơ ${domain.label}`} basePath={base} />
          <p className="muted mt-3">
            Nháp và nháp đã hủy không có{' '}
            {'book' in domain && domain.code === 'vtden' ? 'Số đến' : 'STT'}, không vào xuất sổ,
            không tính thống kê chính thức.
          </p>
        </>
      )}
    </section>
  );
}
