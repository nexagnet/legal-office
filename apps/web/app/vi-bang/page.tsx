import Link from 'next/link';
import { KpiStrip } from '../../components/KpiStrip';
import { CaseTable } from '../../components/CaseTable';
import { NewViBangSheet } from '../../components/NewCaseSheets';
import { loadCases, summarizeCases } from '../../lib/cases';
import { currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

export default async function ViBangPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            Phiên làm việc chưa được xác thực. <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const cases = await loadCases(await requestCookie());
  const sum = cases === 'error' ? null : summarizeCases(cases);
  return (
    <section aria-labelledby="t">
      {cases === 'error' || cases.length === 0 ? (
        <div className="mb-4 flex justify-end">
          <NewViBangSheet branches={session.branches} />
        </div>
      ) : null}
      {cases === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Máy chủ chưa trả về danh sách. Vui lòng thử lại sau.</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có hồ sơ</h2>
          <p>Chưa có hồ sơ Vi bằng nào trong phạm vi quyền của bạn.</p>
        </div>
      ) : sum === null ? null : (
        <>
          <KpiStrip
            label="Tổng hợp hồ sơ Vi bằng"
            items={[
              { label: 'Đang xử lý', value: sum.open },
              { label: 'Chưa phân công', value: sum.unassigned, tone: 'warn' },
              { label: 'Chờ trả khách', value: sum.awaitingReturn, tone: 'warn' },
              { label: 'Đã trả khách', value: sum.returned, tone: 'ok' },
            ]}
          />
          <CaseTable cases={cases} action={<NewViBangSheet branches={session.branches} />} />
          <p className="muted mt-3">
            Hồ sơ bạn được phép xem. Chưa ghi nhận số tiền; thanh toán do kế toán xác nhận từ MISA.
          </p>
        </>
      )}
    </section>
  );
}
