import { RegistrationForm } from '../../../../components/RegistrationForm';
import { getJson } from '../../../../lib/case-api';
import type { Registration } from '../../../../lib/registration';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Theo dõi cập nhật CSDL / Sở Tư pháp', async ({ c }) => {
    const r = await getJson<Registration>(
      `/vibang/cases/${encodeURIComponent(id)}/registration`,
      await requestCookie(),
    );
    if (typeof r !== 'object') {
      return (
        <div className="state" role="status">
          <h2>Chưa có theo dõi cập nhật Sở</h2>
          <p>Chỉ Vi bằng đã cấp số mới có mục theo dõi cập nhật CSDL / Sở.</p>
        </div>
      );
    }
    return (
      <RegistrationForm
        caseId={c.id}
        numberLabel={r.numberLabel}
        madeAt={r.madeAt}
        regStatus={r.regStatus}
        deadlineAt={r.deadlineAt}
      />
    );
  });
}
