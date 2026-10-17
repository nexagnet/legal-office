import { IssueCopyForm } from '../../../../components/CaseRejectCopy';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Tiếp nhận yêu cầu cấp bản sao Vi bằng', ({ c, progress }) =>
    c.status === 'RETURNED' ? (
      <IssueCopyForm caseId={c.id} caseTitle={progress.numberLabel ?? c.title} />
    ) : (
      <div className="state" role="status">
        <h2>Chưa cấp được bản sao</h2>
        <p>Chỉ cấp bản sao cho Vi bằng đã trả kết quả.</p>
      </div>
    ),
  );
}
