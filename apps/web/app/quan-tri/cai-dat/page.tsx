import Link from 'next/link';
import { DmsNumberImport, type NumberRow } from '../../../components/DmsNumberImport';
import { OfficeSettingsForm } from '../../../components/OfficeSettingsForm';
import { API_URL, currentSession, requestCookie } from '../../../lib/server';

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

interface NumberStatus {
  readonly year: number;
  readonly rows: readonly NumberRow[];
}

/** Số cuối đang dùng của 4 sổ DMS và số hồ sơ Tống đạt. Lỗi hoặc không phải Admin thì ẩn khối này. */
async function loadNumberStatus(
  officeId: string,
  cookie: string | null,
): Promise<NumberStatus | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/dms/number-status?officeId=${encodeURIComponent(officeId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as NumberStatus;
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
  const status = await loadNumberStatus(officeId, await requestCookie());
  const isAdmin = session.roles.includes('ADMIN');
  return (
    <section aria-labelledby="t">
      <h1 className="sr-only" id="t">
        Cấu hình văn phòng
      </h1>
      <nav className="panel mb-4" aria-label="Cài đặt khác">
        <ul>
          <li>
            <Link href="/quan-tri/email">Email gửi thư</Link>: máy chủ gửi thư đặt lại mật khẩu.
          </li>
          <li>
            <Link href="/quan-tri/lich">Lịch làm việc</Link>: ngày làm việc và ngày nghỉ.
          </li>
        </ul>
      </nav>
      <OfficeSettingsForm
        officeId={officeId}
        legalName={s.legalName ?? s.officeName}
        displayName={s.displayName ?? s.officeName}
        numberRule={s.numberRule}
        branches={s.branches}
        canEdit={isAdmin}
      />
      {status !== 'error' ? (
        <aside className="panel mt-4" aria-labelledby="num-t">
          <h2 id="num-t">Số cuối sổ giấy · {status.year}</h2>
          <DmsNumberImport officeId={officeId} year={status.year} rows={status.rows} />
        </aside>
      ) : null}
    </section>
  );
}
