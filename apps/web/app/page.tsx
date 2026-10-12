import { ModuleState } from '../components/ModuleState';
import { OVERVIEW } from './nav';
import { currentSession } from '../lib/server';

export default async function HomePage() {
  return <ModuleState item={OVERVIEW} session={await currentSession()} />;
}
