import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Progress } from '../../../components/CaseSteps';
import { type CaseDetail, getJson } from '../../../lib/case-api';
import { currentSession, requestCookie } from '../../../lib/server';

/** Khung chung cho các màn xử lý một bước của hồ sơ (Figma 3:106, 3:132, 3:158). */
export async function renderStage(
  id: string,
  title: string,
  body: (ctx: { c: CaseDetail; progress: Progress; roles: readonly string[] }) => ReactNode,
) {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{title}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xử lý hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const c = await getJson<CaseDetail>(`/vibang/cases/${encodeURIComponent(id)}`, cookie);
  if (c === 404) notFound();
  const progress =
    c === 'error'
      ? 'error'
      : await getJson<Progress>(`/vibang/cases/${encodeURIComponent(id)}/progress`, cookie);
  if (c === 'error' || progress === 'error' || progress === 404) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{title}</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label={title} className="stage">
      <p className="stage-back">
        <Link href={`/vi-bang/${id}`}>← Hồ sơ {c.title}</Link>
      </p>
      <h1 className="sr-only">{title}</h1>
      {body({ c, progress, roles: session.roles })}
    </section>
  );
}
