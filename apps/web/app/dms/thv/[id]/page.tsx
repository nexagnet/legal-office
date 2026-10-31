import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsThvConfirmButton } from '../../../../components/DmsThvActions';
import { loadThvReview } from '../../../../lib/dms';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const entries = (a: Record<string, unknown>) =>
  Object.entries(a).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

export default async function DmsThvReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Xác nhận nội dung</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem.
          </p>
        </div>
      </section>
    );
  }
  const r = await loadThvReview(await requestCookie(), id);
  if (r === 'not-found') notFound();
  if (r === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Xác nhận nội dung</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="t">
      <p>
        <Link href="/dms/thv">← Chờ tôi xác nhận</Link>
      </p>
      <h1 id="t">{r.title}</h1>
      <p className="muted">
        Hãy kiểm tra nội dung dưới đây. Nếu người nhập liệu sửa lại sau khi bạn xác nhận, bạn phải
        xác nhận lại.
      </p>
      <h2>Nội dung hồ sơ</h2>
      <dl>
        {entries(r.attributes).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
      <h2>Tài liệu</h2>
      {r.documents.length === 0 ? <p className="muted">Chưa có tài liệu.</p> : null}
      {r.documents.map((d) => (
        <article key={d.id} className="mb-4">
          <h3>
            {d.title} <span className="muted">({d.kind})</span>
          </h3>
          <dl>
            {entries(d.attributes).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      <DmsThvConfirmButton caseId={r.case_id} confirmed={r.confirmed} />
    </section>
  );
}
