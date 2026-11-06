import { MailSettingsForm } from '../../../components/MailSettingsForm';
import { loadMailSettings } from '../../../lib/admin-api';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function MailPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId) return null;
  const mail = await loadMailSettings(await requestCookie(), officeId);
  return (
    <>
      {mail === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được cấu hình email</h2>
          <p>Chỉ Admin xem được. Vui lòng thử lại sau.</p>
        </div>
      ) : (
        <MailSettingsForm officeId={officeId} settings={mail} />
      )}
    </>
  );
}
