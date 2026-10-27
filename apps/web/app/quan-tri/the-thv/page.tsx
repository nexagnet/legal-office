import { ThvCardsForm } from '../../../components/ThvCardsForm';
import { loadMembers, loadThvCards } from '../../../lib/admin-api';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function ThvCardsPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId) return null;
  const cookie = await requestCookie();
  const [members, cards] = await Promise.all([
    loadMembers(cookie, officeId),
    loadThvCards(cookie, officeId),
  ]);
  const thv =
    members === 'error'
      ? []
      : [
          ...new Map(
            members
              .filter((m) => m.role === 'THV')
              .map((m) => [m.userId, { userId: m.userId, label: m.label }]),
          ).values(),
        ];
  return (
    <>
      <div>
        <h1>Thẻ thừa hành viên</h1>
        <p className="muted">
          Họ tên và số Thẻ của từng thừa hành viên, dùng để điền cột Thừa hành viên ở các sổ nghiệp
          vụ.
        </p>
      </div>
      <ThvCardsForm officeId={officeId} people={thv} cards={cards} canEdit />
    </>
  );
}
