import { MisaNumberPanels } from '../../../../components/CaseStagePanels';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Xác nhận MISA và cấp số', ({ c, progress, roles }) => (
    <MisaNumberPanels caseId={c.id} status={c.status} progress={progress} roles={roles} />
  ));
}
