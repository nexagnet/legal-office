import Link from 'next/link';
import { formatDay } from '../lib/deadlines';
import {
  MY_WORK_DOMAIN_LABEL,
  myWorkHref,
  myWorkStatusLabel,
  type MyWorkItem,
} from '../lib/my-work';

/**
 * Việc của tôi, một cột để dùng trên điện thoại. Chỉ đọc: mỗi việc dẫn về màn nghiệp vụ, nơi thao tác
 * vẫn qua API kiểm quyền. Quá hạn được ghi bằng chữ, không chỉ bằng màu.
 */
export function MyWorkList({ items }: { readonly items: readonly MyWorkItem[] | 'error' }) {
  if (items === 'error') {
    return (
      <div className="state" role="alert">
        <h2>Không tải được việc của bạn</h2>
        <p>Máy chủ chưa trả về danh sách việc. Vui lòng thử lại sau.</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="state" role="status">
        <h2>Không có việc được giao</h2>
        <p>Hiện không có hồ sơ nào đang giao cho bạn xử lý.</p>
      </div>
    );
  }
  return (
    <ul className="my-work">
      {items.map((it) => {
        const href = myWorkHref(it);
        return (
          <li key={`${it.domain}-${it.refId}`} data-overdue={it.overdue}>
            <span className="my-work-domain">{MY_WORK_DOMAIN_LABEL[it.domain] ?? it.domain}</span>
            {href ? <Link href={href}>{it.label}</Link> : <span>{it.label}</span>}
            <span className="my-work-meta">
              <span className="muted">{myWorkStatusLabel(it)}</span>
              {it.deadlineAt ? (
                <>
                  <span className={it.overdue ? 'pill overdue' : 'pill soon'}>
                    {it.overdue ? 'Quá hạn' : 'Có hạn'}
                  </span>
                  <span>Hạn {formatDay(it.deadlineAt)}</span>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
