import Link from 'next/link';
import { NumberImport } from '../../components/NumberImport';
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

interface NumberStatus {
  readonly year: number;
  readonly lastSeq: number;
  readonly paperImported: boolean;
  readonly importedSeq: number | null;
  readonly importedAt: string | null;
}

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

/** Số cuối đang dùng và trạng thái nhập số cuối sổ giấy. Lỗi hoặc không đủ quyền xem thì ẩn khối này. */
async function loadNumberStatus(
  officeId: string,
  cookie: string | null,
): Promise<NumberStatus | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/number-status?officeId=${encodeURIComponent(officeId)}`,
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
          {status.paperImported ? (
            <p>
              Đã nhập số cuối <strong>{status.importedSeq}</strong>
              {status.importedAt ? ` (ngày ${day.format(new Date(status.importedAt))})` : ''}. Số
              đang dùng: <strong>{status.lastSeq}</strong>; số Vi bằng kế tiếp là{' '}
              <strong>{status.lastSeq + 1}</strong>.
            </p>
          ) : (
            <p className="notice-amber">
              Số cuối sổ giấy: chưa nhập. Chưa cấp được số thật cho Vi bằng đầu tiên của năm{' '}
              {status.year}.
            </p>
          )}
          {isAdmin ? (
            <NumberImport
              officeId={officeId}
              year={status.year}
              label={status.paperImported ? 'Nhập lại số cuối' : 'Nhập số cuối'}
            />
          ) : (
            <p className="muted">Chỉ Admin nhập số cuối sổ giấy.</p>
          )}
        </aside>
      ) : null}
    </section>
  );
}
