import Link from 'next/link';
import { NewFormUpload } from '../../components/NewFormUpload';
import { API_URL, currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

interface FormRow {
  readonly code: string;
  readonly version: number;
  readonly title: string;
  readonly registeredAt: string;
}

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

async function load(cookie: string | null, officeId: string): Promise<FormRow[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/tt06-forms?officeId=${encodeURIComponent(officeId)}`,
      {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
      },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as FormRow[];
  } catch {
    return 'error';
  }
}

export default async function FormsPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Biểu mẫu</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để tải biểu mẫu.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const forms = officeId ? await load(await requestCookie(), officeId) : [];
  const canRegister = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  return (
    <section aria-labelledby="t">
      <h1 id="t">Biểu mẫu</h1>
      <p className="muted">
        Phụ lục Thông tư 06 chỉ để tải về; hệ thống không điền, ký hay phát hành.
      </p>
      {forms === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : forms.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có biểu mẫu</h2>
          <p>Chưa có phụ lục nào được đăng ký.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Biểu mẫu Thông tư 06</caption>
            <thead>
              <tr>
                <th scope="col">Phụ lục</th>
                <th scope="col">Tiêu đề</th>
                <th scope="col">Phiên bản</th>
                <th scope="col">Đăng ký</th>
                <th scope="col">Tải về</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.code}>
                  <th scope="row">{f.code}</th>
                  <td>{f.title}</td>
                  <td>{f.version}</td>
                  <td>{day.format(new Date(f.registeredAt))}</td>
                  <td>
                    <a
                      href={`/api/office/tt06-forms/${encodeURIComponent(f.code)}/file?officeId=${encodeURIComponent(officeId ?? '')}`}
                    >
                      Tải phụ lục {f.code}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {officeId && canRegister ? <NewFormUpload officeId={officeId} /> : null}
    </section>
  );
}
