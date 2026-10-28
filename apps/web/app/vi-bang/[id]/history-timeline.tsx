import type { HistoryEntry } from '../../../lib/case-api';
import { HISTORY_KIND_LABEL } from '../../../lib/messages';
import { PersonLabel } from '../../../components/ui/avatar';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Mốc xử lý của hồ sơ, mới nhất trước (Figma N13 E3). */
export function HistoryTimeline({ events }: { readonly events: readonly HistoryEntry[] }) {
  if (events.length === 0) {
    return (
      <div className="state" role="status">
        <h2>Chưa có lịch sử</h2>
        <p>Hồ sơ chưa có mốc xử lý nào được ghi nhận.</p>
      </div>
    );
  }
  return (
    <section className="panel" aria-labelledby="hist-t">
      <h2 id="hist-t">Lịch sử hồ sơ</h2>
      <ol className="history">
        {events.map((e, i) => (
          <li key={`${e.at}-${e.kind}-${i}`}>
            <span className="history-title">{HISTORY_KIND_LABEL[e.kind] ?? e.kind}</span>
            <span className="muted inline-flex flex-wrap items-center gap-x-1.5">
              <span>{fmt.format(new Date(e.at))}</span>
              {e.actorLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <PersonLabel label={e.actorLabel} id={e.actorUserId} />
                </>
              ) : null}
              {e.detail ? <span>· {e.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
