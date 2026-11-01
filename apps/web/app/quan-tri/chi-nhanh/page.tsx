import { BranchManager } from '../../../components/BranchManager';
import { loadMembers } from '../../../lib/admin-api';
import { loadDmsGroups } from '../../../lib/dms-admin';
import { groupsOfUser } from '../../../lib/permission-model';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId || !session.roles.includes('ADMIN')) {
    return <p className="muted">Chỉ Admin quản lý được chi nhánh.</p>;
  }
  const cookie = await requestCookie();
  const [members, groups] = await Promise.all([
    loadMembers(cookie, officeId),
    loadDmsGroups(cookie, officeId),
  ]);
  const counts: Record<string, number> = {};
  const groupNames: Record<string, Set<string>> = {};
  if (members !== 'error') {
    const seen = new Set<string>();
    for (const m of members) {
      for (const name of m.branches) {
        if (seen.has(`${m.userId}|${name}`)) continue;
        seen.add(`${m.userId}|${name}`);
        counts[name] = (counts[name] ?? 0) + 1;
        for (const g of groups === 'error' ? [] : groupsOfUser(groups, m.userId)) {
          (groupNames[name] ??= new Set()).add(g.name);
        }
      }
    }
  }
  const branchGroups = Object.fromEntries(Object.entries(groupNames).map(([k, v]) => [k, [...v]]));
  return (
    <BranchManager
      officeId={officeId}
      branches={session.branches}
      memberCounts={counts}
      branchGroups={branchGroups}
    />
  );
}
