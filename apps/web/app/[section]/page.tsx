import { notFound } from 'next/navigation';
import { ModuleState } from '../../components/ModuleState';
import { NAV, findNav } from '../nav';
import { currentSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return NAV.map((n) => ({ section: n.slug }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = findNav(section);
  if (!item) notFound();
  return <ModuleState item={item} session={await currentSession()} />;
}
