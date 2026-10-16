import { ReturnPanel } from '../../../../components/CaseStagePanels';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Trả kết quả và liên hệ khách', ({ c, progress }) => (
    <ReturnPanel caseId={c.id} status={c.status} progress={progress} />
  ));
}
