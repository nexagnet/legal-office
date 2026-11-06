import { ThvCardsForm } from '../../../components/ThvCardsForm';
import { loadMembers, loadThvCards } from '../../../lib/admin-api';
import { loadDmsGroups } from '../../../lib/dms-admin';
import { groupsOfUser } from '../../../lib/permission-model';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function ThvCardsPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId) return null;
  const cookie = await requestCookie();
  const [members, cards, groups] = await Promise.all([
    loadMembers(cookie, officeId),
    loadThvCards(cookie, officeId),
    loadDmsGroups(cookie, officeId),
  ]);
  const thv =
    members === 'error'
      ? []
      : [
          ...new Map(
            members
              .filter((m) => m.role === 'THV')
              .map((m) => [
                m.userId,
                {
                  userId: m.userId,
                  label: m.label,
                  groups:
                    groups === 'error' ? [] : groupsOfUser(groups, m.userId).map((g) => g.name),
                },
              ]),
          ).values(),
        ];
  return (
    <>
      <ThvCardsForm officeId={officeId} people={thv} cards={cards} canEdit />
    </>
  );
}
