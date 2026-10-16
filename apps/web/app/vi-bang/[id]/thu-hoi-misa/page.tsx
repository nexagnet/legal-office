import { MisaRevoke, type RevokeProposal } from '../../../../components/MisaRevoke';
import { getJson } from '../../../../lib/case-api';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

interface Misa {
  readonly status: string;
  readonly reference: string | null;
  readonly confirmedAt: string | null;
  readonly revokeProposals: readonly RevokeProposal[];
}

const MISA_LABEL: Record<string, string> = {
  CONFIRMED_FULL: 'Đã xác nhận thanh toán đủ',
  NOT_CONFIRMED: 'Chưa xác nhận',
  REVOKED: 'Đã thu hồi xác nhận',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(
    id,
    'Thu hồi xác nhận thanh toán trên MISA',
    async ({ c, progress, roles }) => {
      const m = await getJson<Misa>(
        `/vibang/cases/${encodeURIComponent(id)}/misa`,
        await requestCookie(),
      );
      if (typeof m !== 'object') {
        return (
          <div className="state" role="alert">
            <h2>Không tải được trạng thái MISA</h2>
            <p>Vui lòng thử lại sau.</p>
          </div>
        );
      }
      return (
        <MisaRevoke
          caseId={c.id}
          caseTitle={c.title}
          numberLabel={progress.numberLabel}
          misaStatusLabel={MISA_LABEL[m.status] ?? m.status}
          reference={m.reference}
          confirmedAt={m.confirmedAt}
          proposals={m.revokeProposals}
          canPropose={roles.includes('KE_TOAN') || roles.includes('ADMIN')}
          canDecide={roles.includes('ADMIN')}
        />
      );
    },
  );
}
