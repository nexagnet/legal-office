import { ReturnPanel } from '../../../../components/CaseStagePanels';
import { getJson } from '../../../../lib/case-api';
import type { ContactEntry } from '../../../../lib/contacts';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Trả kết quả và liên hệ khách', async ({ c, progress, roles }) => {
    const res = await getJson<{ items: ContactEntry[] }>(
      `/vibang/cases/${encodeURIComponent(id)}/contacts`,
      await requestCookie(),
    );
    return (
      <ReturnPanel
        caseId={c.id}
        status={c.status}
        progress={progress}
        roles={roles}
        contacts={typeof res === 'object' ? res.items : []}
        handover={{ recipient: c.handoverRecipient ?? null, on: c.handoverOn ?? null }}
      />
    );
  });
}
