import Link from 'next/link';
import { StatCard } from '../components/StatCard';
import { ModuleState } from '../components/ModuleState';
import { isOpenCase, loadCases, summarizeCases } from '../lib/cases';
import { CASE_STATUS_LABEL } from '../lib/messages';
import { currentSession, requestCookie } from '../lib/server';
import { NAV, OVERVIEW } from './nav';

export const dynamic = 'force-dynamic';

const canSeeCases = (roles: readonly string[]) =>
  (NAV.find((n) => n.slug === 'vi-bang')?.roles ?? []).some((r) => roles.includes(r));

export default async function HomePage() {
  const session = await currentSession();
  if (session.status !== 'authenticated' || !canSeeCases(session.roles)) {
    return <ModuleState item={OVERVIEW} session={session} />;
  }
  const cases = await loadCases(await requestCookie());
  if (cases === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tổng quan</h1>
        <div className="state" role="alert">
          <h2>Không tải được số liệu</h2>
          <p>Máy chủ chưa trả về danh sách hồ sơ. Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const sum = summarizeCases(cases);
  const today = cases.filter(isOpenCase).slice(0, 4);
  const reminders: string[] = [
    sum.unassigned > 0 ? `${sum.unassigned} hồ sơ chưa phân công THV` : '',
    sum.awaitingReturn > 0 ? `${sum.awaitingReturn} hồ sơ đã ký/đóng dấu, chờ trả khách` : '',
  ].filter(Boolean);
  return (
    <section aria-labelledby="t">
      <h1 id="t" className="sr-only">
        Tổng quan
      </h1>
      <div className="stats">
        <StatCard label="Hồ sơ đang xử lý" value={sum.open} note="Chưa trả khách hoặc huỷ" />
        <StatCard
          label="Chưa phân công THV"
          value={sum.unassigned}
          note="Hồ sơ mới tiếp nhận"
          tone="amber"
        />
        <StatCard
          label="Chờ trả khách"
          value={sum.awaitingReturn}
          note="Đã ký hoặc đóng dấu"
          tone="red"
        />
        <StatCard
          label="Đã trả khách"
          value={sum.returned}
          note="Trong phạm vi bạn xem"
          tone="green"
        />
      </div>
      <div className="panels">
        <div className="panel">
          <h2>Hồ sơ cần xử lý</h2>
          {today.length === 0 ? (
            <p className="muted">Không có hồ sơ đang xử lý.</p>
          ) : (
            <ul className="rows">
              {today.map((c) => (
                <li key={c.id}>
                  <Link href={`/vi-bang/${c.id}`}>{c.title}</Link>
                  <span className="badge" data-status={c.status}>
                    {CASE_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Nhắc việc và cảnh báo</h2>
          {reminders.length === 0 ? (
            <p className="muted">Không có việc cần nhắc.</p>
          ) : (
            <ul className="reminders">
              {reminders.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
