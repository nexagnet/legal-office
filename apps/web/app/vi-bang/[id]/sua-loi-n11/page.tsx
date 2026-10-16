import { N11Correction, type N11Item } from '../../../../components/N11Correction';
import { getJson } from '../../../../lib/case-api';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

interface Doc {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly createdAt: string;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Sửa lỗi kỹ thuật Vi bằng · N-11', async ({ c, progress }) => {
    const cookie = await requestCookie();
    const base = `/vibang/cases/${encodeURIComponent(id)}`;
    const [n11, docs] = await Promise.all([
      getJson<{ items: N11Item[] }>(`${base}/n11-corrections`, cookie),
      getJson<{ items: Doc[] }>(`${base}/documents`, cookie),
    ]);
    if (typeof n11 !== 'object') {
      return (
        <div className="state" role="alert">
          <h2>Không tải được đề nghị sửa lỗi</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      );
    }
    const documents =
      typeof docs === 'object'
        ? docs.items.map((d) => ({
            id: d.id,
            label: `${d.kind} · bản ${d.version} · ${new Date(d.createdAt).toLocaleDateString('vi-VN')}`,
          }))
        : [];
    return (
      <N11Correction
        caseId={c.id}
        caseTitle={c.title}
        numberLabel={progress.numberLabel}
        createdAt={c.createdAt}
        items={n11.items}
        documents={documents}
      />
    );
  });
}
