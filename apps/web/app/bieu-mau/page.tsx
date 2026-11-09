import Link from 'next/link';
import { NewFormUpload } from '../../components/NewFormUpload';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
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
          <p>Không có biểu mẫu nào khớp từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <>
          <DataTable tableKey="bieu-mau-tt06">
            <table>
              <caption className="sr-only">Biểu mẫu Thông tư 06</caption>
              <thead>
                <tr>
                  <th scope="col">Mã mẫu</th>
                  <th scope="col">Tên văn bản</th>
                  <th scope="col">Phiên bản</th>
                  <th scope="col">Ngày đăng ký</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => (
                  <tr key={f.code}>
                    <th scope="row">{f.code}</th>
                    <td>{f.title}</td>
                    <td>{f.version}</td>
                    <td>{day.format(new Date(f.registeredAt))}</td>
                    <td>
                      <span className="flex flex-wrap items-center gap-2">
                        <Button asChild variant="secondary">
                          <a
                            className="no-underline"
                            aria-label={`Tải phụ lục ${f.code}`}
                            href={`/api/office/tt06-forms/${encodeURIComponent(f.code)}/file?officeId=${encodeURIComponent(officeId ?? '')}`}
                          >
                            Tải về
                          </a>
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <p className="muted mt-3 text-xs">Hiển thị {shown.length} biểu mẫu.</p>
        </>
      )}
      {officeId && canRegister ? (
        <div id="dang-ky">
          <NewFormUpload officeId={officeId} />
        </div>
      ) : null}
    </section>
  );
}
