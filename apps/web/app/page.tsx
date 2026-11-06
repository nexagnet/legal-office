import { DmsOverview } from '../components/DmsOverview';
import { ModuleState } from '../components/ModuleState';
import { currentSession, requestCookie } from '../lib/server';
import { NAV, OVERVIEW } from './nav';

export const dynamic = 'force-dynamic';

const canSeeCases = (roles: readonly string[]) =>
  (NAV.find((n) => n.slug === 'vi-bang')?.roles ?? []).some((r) => roles.includes(r));

/** Tổng quan theo Figma DMS v2 (T1): số liệu hồ sơ, theo nghiệp vụ, cần bổ sung scan, bản trình chờ duyệt. */
export default async function HomePage() {
  const session = await currentSession();
  if (session.status !== 'authenticated' || !canSeeCases(session.roles)) {
    return <ModuleState item={OVERVIEW} session={session} />;
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) return <ModuleState item={OVERVIEW} session={session} />;
  return <DmsOverview cookie={await requestCookie()} officeId={officeId} />;
}
