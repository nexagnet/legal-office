import { SignStampPanels } from '../../../../components/CaseStagePanels';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Ký, đóng dấu và bản scan', ({ c, progress, roles }) => (
    <SignStampPanels caseId={c.id} status={c.status} progress={progress} roles={roles} />
  ));
}
