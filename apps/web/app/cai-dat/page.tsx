import Link from 'next/link';
import { OfficeSettingsForm } from '../../components/OfficeSettingsForm';
import { API_URL, currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

interface Settings {
  readonly legalName: string | null;
  readonly displayName: string | null;
  readonly officeName: string;
  readonly numberRule: string;
  readonly branches: readonly { readonly id: string; readonly name: string }[];
}

async function load(officeId: string, cookie: string | null): Promise<Settings | 'error'> {
  try {
    const res = await fetch(`${API_URL}/office/settings?officeId=${encodeURIComponent(officeId)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as Settings;
  } catch {
    return 'error';
  }
}

export default async function Page() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Cấu hình văn phòng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem cấu hình văn phòng.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const s = officeId ? await load(officeId, await requestCookie()) : 'error';
  if (!officeId || s === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Cấu hình văn phòng</h1>
        <div className="state" role="alert">
          <h2>Không tải được cấu hình</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="t">
      <h1 className="sr-only" id="t">
        Cấu hình văn phòng
      </h1>
      <OfficeSettingsForm
        officeId={officeId}
        legalName={s.legalName ?? s.officeName}
        displayName={s.displayName ?? s.officeName}
        numberRule={s.numberRule}
        branches={s.branches}
        canEdit={session.roles.includes('ADMIN')}
      />
    </section>
  );
}
