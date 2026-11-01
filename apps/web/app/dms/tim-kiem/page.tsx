import Link from 'next/link';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/field';
import { DMS_DOMAINS, VAN_THU_DOMAINS, searchDmsOcr } from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const slugOf = (code: string) => [...DMS_DOMAINS, ...VAN_THU_DOMAINS].find((d) => d.code === code);

/** Tìm toàn văn trong nội dung các tệp scan (OCR). Kết quả chỉ trỏ về hồ sơ gốc, không sửa gì. */
export default async function DmsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 200);
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tìm trong nội dung scan</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để tìm hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const rows = q && officeId ? await searchDmsOcr(await requestCookie(), officeId, q) : null;
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tìm trong nội dung scan</h1>
      <form method="get" role="search" className="mb-4 flex flex-wrap items-center gap-3">
        <label className="min-w-72 flex-1">
          <span className="sr-only">Từ khóa</span>
          <Input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Từ khóa trong chữ nhận dạng từ bản scan…"
          />
        </label>
        <Button type="submit">Tìm</Button>
      </form>
      <p className="muted mb-3">
        Chữ trong tệp scan được nhận dạng tự động sau khi tải lên (thường trong 1 đến 2 phút). Chỉ
        hiện hồ sơ trong phạm vi quyền của bạn.
      </p>
      {rows === null ? null : rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tìm được</h2>
          <p>Máy chủ chưa trả về kết quả. Vui lòng thử lại sau.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có kết quả</h2>
          <p>Không có tệp scan nào khớp “{q}”.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const d = slugOf(r.domain);
            return (
              <li key={r.file_id} className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-semibold">
                  {d ? (
                    <Link href={`/dms/${d.slug}/${r.case_id}?tab=tai-lieu`}>{r.case_title}</Link>
                  ) : (
                    r.case_title
                  )}{' '}
                  <span className="muted">· {d?.label ?? r.domain}</span>
                </p>
                <p className="muted">
                  {r.document_title} · {r.file_label}
                </p>
                <p>{r.snippet}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
