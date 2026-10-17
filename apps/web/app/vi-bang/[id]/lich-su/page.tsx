import { type HistoryEntry, getJson } from '../../../../lib/case-api';
import { HISTORY_KIND_LABEL } from '../../../../lib/messages';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN');

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Lịch sử xử lý hồ sơ', async () => {
    const h = await getJson<{ items: HistoryEntry[] }>(
      `/vibang/cases/${encodeURIComponent(id)}/history`,
      await requestCookie(),
    );
    if (typeof h !== 'object') {
      return (
        <div className="state" role="alert">
          <h2>Không tải được lịch sử</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      );
    }
    if (h.items.length === 0) {
      return (
        <div className="state" role="status">
          <h2>Chưa có lịch sử</h2>
          <p>Hồ sơ chưa có mốc xử lý nào được ghi nhận.</p>
        </div>
      );
    }
    return (
      <section className="panel">
        <h2>Các mốc xử lý (mới nhất trước)</h2>
        <ol className="history">
          {h.items.map((e, i) => (
            <li key={`${e.at}-${e.kind}-${i}`}>
              <span className="history-title">{HISTORY_KIND_LABEL[e.kind] ?? e.kind}</span>
              <span className="muted">
                {fmt(e.at)}
                {e.actorLabel ? ` · ${e.actorLabel}` : ''}
                {e.detail ? ` · ${e.detail}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  });
}
