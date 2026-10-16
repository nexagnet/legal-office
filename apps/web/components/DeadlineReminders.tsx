import Link from 'next/link';
import {
  DEADLINE_DOMAIN_LABEL,
  deadlineHref,
  formatDay,
  type DeadlineItem,
} from '../lib/deadlines';

/**
 * Nhắc hạn trong ứng dụng: hạn trong 7 ngày tới và đã quá hạn. Không gửi ra ngoài.
 * Quá hạn được ghi bằng chữ "Quá hạn", không chỉ bằng màu.
 */
export function DeadlineReminders({
  items,
}: {
  readonly items: readonly DeadlineItem[] | 'error';
}) {
  return (
    <div className="panel deadlines" aria-labelledby="deadline-t">
      <h2 id="deadline-t">Nhắc hạn</h2>
      <p className="muted">
        Hạn trong 7 ngày tới và hạn đã quá. Chỉ là nhắc việc trong ứng dụng, không phải hạn pháp lý
        tự động.
      </p>
      {items === 'error' ? (
        <div className="state" role="alert">
          <h3>Không tải được nhắc hạn</h3>
          <p>Máy chủ chưa trả về danh sách hạn. Vui lòng thử lại sau.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state" role="status">
          <h3>Không có hạn cần nhắc</h3>
          <p>Không có hạn nào trong 7 ngày tới và không có hạn quá hạn.</p>
        </div>
      ) : (
        <ul className="rows deadline-rows">
          {items.map((d) => {
            const href = deadlineHref(d);
            return (
              <li key={`${d.domain}-${d.refId}`} data-overdue={d.overdue}>
                <span className="deadline-main">
                  {href ? <Link href={href}>{d.label}</Link> : <span>{d.label}</span>}
                  <span className="muted">{DEADLINE_DOMAIN_LABEL[d.domain] ?? d.domain}</span>
                </span>
                <span className="deadline-when">
                  <span className={d.overdue ? 'pill overdue' : 'pill soon'}>
                    {d.overdue ? 'Quá hạn' : 'Sắp đến hạn'}
                  </span>
                  <span>Hạn {formatDay(d.deadlineAt)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
