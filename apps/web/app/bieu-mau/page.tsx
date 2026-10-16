import Link from 'next/link';
import { NewFormUpload } from '../../components/NewFormUpload';
import { matchesQuery } from '../../lib/search';
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

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? '').slice(0, 200).trim();
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
  const shown =
    forms === 'error' || !q ? forms : forms.filter((f) => matchesQuery(`${f.code} ${f.title}`, q));
  const canRegister = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Thư viện biểu mẫu</h1>
          <p className="muted">
            Phụ lục Thông tư 06 chỉ để tải về; hệ thống không điền, ký hay phát hành.
          </p>
        </div>
        {officeId && canRegister ? (
          <a className="primary btn-link" href="#dang-ky">
            + Tải tài liệu lên
          </a>
        ) : null}
      </div>
      <form className="filters filters-single" method="get" role="search">
        <label className="filter-search">
          <span className="sr-only">Tìm biểu mẫu</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Tìm theo mã mẫu, tên văn bản, thông tư..."
          />
        </label>
        <button type="submit" className="primary">
          Tìm
        </button>
      </form>
      <p className="tabs-line">
        <span className="tab-chip" aria-current="true">
          Thông tư 06
        </span>
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
      ) : shown === 'error' || shown.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có biểu mẫu khớp</h2>
          <p>Không có biểu mẫu nào khớp từ khoá tìm kiếm.</p>
        </div>
      ) : (
        <ul className="template-grid" aria-label="Biểu mẫu Thông tư 06">
          {shown.map((f) => (
            <li key={f.code} className="template-card">
              <span className="tag">Phụ lục {f.code}</span>
              <h2>{f.title}</h2>
              <p className="muted">
                Phiên bản {f.version} · đăng ký {day.format(new Date(f.registeredAt))}
              </p>
              <a
                href={`/api/office/tt06-forms/${encodeURIComponent(f.code)}/file?officeId=${encodeURIComponent(officeId ?? '')}`}
              >
                Tải phụ lục {f.code}
              </a>
            </li>
          ))}
        </ul>
      )}
      {officeId && canRegister ? (
        <div id="dang-ky">
          <NewFormUpload officeId={officeId} />
        </div>
      ) : null}
    </section>
  );
}
