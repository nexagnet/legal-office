import Link from 'next/link';
import { ALL_CASES_PAGE_SIZE, DmsAllCases } from '../../../components/DmsAllCases';
import { CasesViewTabs } from '../../../components/CasesViewTabs';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { loadMyDmsPermissions } from '../../../lib/dms';
import { searchAllDmsCases } from '../../../lib/dms-browse';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

/** Mọi hồ sơ của văn phòng mà tài khoản được quyền xem toàn bộ (`<nghiệp vụ>.read.all`), trong phạm vi chi nhánh được cấp. */
export default async function OfficeCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Mọi hồ sơ của văn phòng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const cookie = await requestCookie();
  const permissions = officeId ? await loadMyDmsPermissions(cookie, officeId) : [];
  const canViewAll = permissions.some((p) => p.endsWith('.read.all'));
  if (!canViewAll) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Mọi hồ sơ của văn phòng</h1>
        <div className="state" role="alert">
          <h2>Không có quyền truy cập</h2>
          <p>
            Tài khoản của bạn chưa được cấp quyền xem toàn bộ hồ sơ. Hồ sơ do bạn tạo nằm ở mục{' '}
            <Link href="/dms/cua-toi">Hồ sơ do tôi tạo</Link>.
          </p>
        </div>
      </section>
    );
  }
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const result = await searchAllDmsCases(cookie, {
    officeId: officeId!,
    limit: ALL_CASES_PAGE_SIZE,
    offset: (page - 1) * ALL_CASES_PAGE_SIZE,
  });
  return (
    <section aria-labelledby="t">
      <h1 id="t">Mọi hồ sơ của văn phòng</h1>
      <CasesViewTabs active="office" canViewAll />
      {result === 'error' ? (
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được danh sách hồ sơ. Kiểm tra kết nối và thử lại."
        />
      ) : (
        <DmsAllCases
          rows={result.rows}
          total={result.total}
          page={page}
          basePath="/dms/van-phong"
          emptyText="Chưa có hồ sơ nào trong phạm vi của bạn."
        />
      )}
    </section>
  );
}
