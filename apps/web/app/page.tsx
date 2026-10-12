import { ModuleState } from '../components/ModuleState';
import { OVERVIEW } from './nav';
import { getSession } from './session';

export default function HomePage() {
  return <ModuleState item={OVERVIEW} session={getSession()} />;
}
