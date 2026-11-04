import Link from 'next/link';
import { ALL_CASES_PAGE_SIZE, DmsAllCases } from '../../../components/DmsAllCases';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { searchAllDmsCases } from '../../../lib/dms-browse';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

/**
 * Hồ sơ do chính tôi tạo, xuyên mọi nghiệp vụ và mọi trạng thái (nháp, đã ghi sổ). Người tạo luôn thấy hồ sơ mình tạo
 * dù không có quyền xem và dù thuộc chi nhánh nào.
 */
export default async function MyCreatedCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ do tôi tạo</h1>
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
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const result =
    officeId && session.userId
      ? await searchAllDmsCases(await requestCookie(), {
          officeId,
          creator: session.userId,
          limit: ALL_CASES_PAGE_SIZE,
          offset: (page - 1) * ALL_CASES_PAGE_SIZE,
        })
      : null;
  return (
    <section aria-labelledby="t">
      <h1 id="t">Hồ sơ do tôi tạo</h1>
      <p className="muted">
        Mọi hồ sơ bạn đã tạo ở các nghiệp vụ, kể cả bản nháp. Mở hồ sơ để tải thêm tài liệu dần.
      </p>
      {result === 'error' ? (
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được danh sách hồ sơ. Kiểm tra kết nối và thử lại."
        />
      ) : (
        <DmsAllCases
          rows={result?.rows ?? []}
          total={result?.total ?? null}
          page={page}
          basePath="/dms/cua-toi"
          emptyText="Bạn chưa tạo hồ sơ nào."
        />
      )}
    </section>
  );
}
