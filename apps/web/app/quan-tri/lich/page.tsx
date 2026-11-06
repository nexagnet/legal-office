import { CalendarSettings } from '../../../components/CalendarSettings';
import { loadCalendar } from '../../../lib/deadlines-api';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId) return null;
  const calendar = await loadCalendar(await requestCookie(), officeId);
  return (
    <>
      {calendar === 'error' || !calendar ? (
        <div className="state" role="alert">
          <h2>Không tải được lịch làm việc</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : (
        <CalendarSettings officeId={officeId} calendar={calendar} canEdit />
      )}
    </>
  );
}
