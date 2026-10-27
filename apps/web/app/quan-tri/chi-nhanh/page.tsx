import { BranchManager } from '../../../components/BranchManager';
import { currentSession } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId || !session.roles.includes('ADMIN')) {
    return <p className="muted">Chỉ Admin quản lý được chi nhánh.</p>;
  }
  return <BranchManager officeId={officeId} branches={session.branches} />;
}
