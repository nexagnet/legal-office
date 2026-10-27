import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CaseBanner } from '../../../components/CaseBanner';
import { CaseSteps, type Progress } from '../../../components/CaseSteps';
import { ActionMenu } from '../../../components/ui/action-menu';
import { TabNav } from '../../../components/ui/tab-nav';
import { type CaseDetail, getJson } from '../../../lib/case-api';
import { CASE_STATUS_LABEL } from '../../../lib/messages';
import { caseMenu } from './case-menu';
import { currentSession, requestCookie } from '../../../lib/server';

const WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ChangeItem {
  readonly id: string;
  readonly reason: string;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
  readonly status: string;
  readonly createdAt: string;
}

export type CaseTab = 'tien-do' | 'thong-tin' | 'tai-lieu' | 'phap-ly' | 'lich-su' | 'de-nghi';

export interface CaseFrameContext {
  readonly c: CaseDetail;
  readonly base: string;
  readonly cookie: string | null;
  readonly isAdmin: boolean;
  readonly isFinal: boolean;
  readonly windowOpen: boolean;
  readonly changes: readonly ChangeItem[];
  readonly roles: readonly string[];
}

export interface CaseContext extends CaseFrameContext {
  readonly progress: Progress | null;
}

export type CaseLoad =
  | { readonly kind: 'login' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ok'; readonly ctx: CaseContext };

/** Nạp hồ sơ, tiến độ và đề nghị sửa của một hồ sơ cho khung và các hộp thoại thao tác. 404 thì gọi `notFound()`. */
export async function loadCase(id: string): Promise<CaseLoad> {
  const session = await currentSession();
  if (session.status !== 'authenticated') return { kind: 'login' };
  const cookie = await requestCookie();
  const enc = encodeURIComponent(id);
  const c = await getJson<CaseDetail>(`/vibang/cases/${enc}`, cookie);
  if (c === 404) notFound();
  if (c === 'error') return { kind: 'error' };
  const changeRes = await getJson<{ items: ChangeItem[] }>(
    `/vibang/cases/${enc}/change-requests`,
    cookie,
  );
  const progressRes = await getJson<Progress>(`/vibang/cases/${enc}/progress`, cookie);
  return {
    kind: 'ok',
    ctx: {
      c,
      base: `/vi-bang/${c.id}`,
      cookie,
      isAdmin: session.roles.includes('ADMIN'),
      isFinal: c.status === 'RETURNED' || c.status === 'CANCELLED',
      windowOpen: Date.now() < new Date(c.createdAt).getTime() + WINDOW_MS,
      changes: typeof changeRes === 'object' ? changeRes.items : [],
      roles: session.roles,
      progress: typeof progressRes === 'object' ? progressRes : null,
    },
  };
}

/** Khung hồ sơ Vi bằng dùng chung cho mọi tab (Figma N13 E1–E5): banner, tiến độ, thanh tab, rồi nội dung. `tab` null: màn thao tác, không tab nào sáng. */
export async function renderCaseFrame(
  id: string,
  tab: CaseTab | null,
  body: (ctx: CaseContext) => ReactNode,
) {
  const loaded = await loadCase(id);
  if (loaded.kind === 'login') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  if (loaded.kind === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const { ctx } = loaded;
  const { c, base, isAdmin, isFinal, windowOpen, changes, progress } = ctx;
  const meta = [c.customerName, c.branchName, c.thvLabel ? `THV ${c.thvLabel}` : null].filter(
    (x): x is string => !!x,
  );
  const numbered = !!progress?.numberLabel;
  const pending = changes.filter((r) => r.status === 'PENDING').length;
  const menu = caseMenu({
    c,
    base,
    progress,
    isAdmin,
    isFinal,
    windowOpen,
    pendingChanges: pending,
  });
  const tabHref = (t: CaseTab) => (t === 'tien-do' ? base : `${base}?tab=${t}`);
  return (
    <section aria-labelledby="t">
      <h1 id="t" className="sr-only">
        {c.title}
      </h1>
      <CaseBanner
        title={c.title}
        meta={meta.join(' • ')}
        status={c.status}
        statusLabel={CASE_STATUS_LABEL[c.status] ?? c.status}
      >
        <ActionMenu groups={menu} />
      </CaseBanner>
      <div className="mb-5 grid gap-4">
        {progress ? (
          <CaseSteps caseId={c.id} status={c.status} progress={progress} />
        ) : (
          <section className="panel">
            <h2>Tiến độ hồ sơ</h2>
            <p className="muted">Chưa tải được tiến độ hồ sơ.</p>
          </section>
        )}
      </div>
      <TabNav
        label="Các mục của hồ sơ"
        active={tab ?? ''}
        tabs={[
          { key: 'tien-do', label: 'Tiến độ', href: tabHref('tien-do') },
          { key: 'thong-tin', label: 'Thông tin', href: tabHref('thong-tin') },
          ...(numbered ? [{ key: 'tai-lieu', label: 'Tài liệu', href: `${base}/tai-lieu` }] : []),
          { key: 'phap-ly', label: 'Pháp lý', href: `${base}/phap-ly` },
          { key: 'lich-su', label: 'Lịch sử', href: tabHref('lich-su') },
          {
            key: 'de-nghi',
            label: 'Đề nghị thay đổi',
            href: tabHref('de-nghi'),
            count: pending || undefined,
          },
        ]}
      />
      {body(ctx)}
    </section>
  );
}
