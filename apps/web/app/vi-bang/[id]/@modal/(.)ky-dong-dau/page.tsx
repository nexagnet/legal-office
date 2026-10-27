import { renderStageDialog } from '../../stage-dialog';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStageDialog(id, 'ky-dong-dau');
}
