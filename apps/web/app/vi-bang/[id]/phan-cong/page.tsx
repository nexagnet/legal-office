import { AssignThv, type ThvOption } from '../../../../components/AssignThv';
import { type CaseDetail, getJson } from '../../../../lib/case-api';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

async function AssignBody({ c, isAdmin }: { c: CaseDetail; isAdmin: boolean }) {
  if (!isAdmin) {
    return (
      <div className="state" role="status">
        <h2>Chỉ Admin phân công</h2>
        <p>Mỗi Vi bằng có một Thừa hành viên phụ trách do Admin giao.</p>
      </div>
    );
  }
  const thv = await getJson<{ items: ThvOption[] }>('/vibang/thv', await requestCookie());
  return (
    <AssignThv
      caseId={c.id}
      caseTitle={c.title}
      options={typeof thv === 'object' ? thv.items : []}
      currentThvId={c.responsibleThvUserId}
    />
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Admin phân công Thừa hành viên', ({ c, roles }) => (
    <AssignBody c={c} isAdmin={roles.includes('ADMIN')} />
  ));
}
