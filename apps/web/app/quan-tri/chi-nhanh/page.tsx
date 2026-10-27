import { BranchManager } from '../../../components/BranchManager';
import { loadMembers } from '../../../lib/admin-api';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId || !session.roles.includes('ADMIN')) {
    return <p className="muted">Chỉ Admin quản lý được chi nhánh.</p>;
  }
  const members = await loadMembers(await requestCookie(), officeId);
  const counts: Record<string, number> = {};
  if (members !== 'error') {
    for (const m of members) {
      if (!m.role) continue;
      for (const name of m.branches) counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return <BranchManager officeId={officeId} branches={session.branches} memberCounts={counts} />;
}
