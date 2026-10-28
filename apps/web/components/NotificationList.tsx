'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
import { DEADLINE_DOMAIN_LABEL, formatDay } from '../lib/deadlines';
import { notificationHref, type NotificationItem } from '../lib/notifications-view';
import { postJson } from '../lib/post-json';

/** Danh sách nhắc hạn trong ứng dụng; quá hạn ghi bằng chữ, chưa đọc có chữ cho trình đọc màn hình. */
export function NotificationList({
  items,
  officeId,
}: {
  readonly items: readonly NotificationItem[];
  readonly officeId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = items.filter((i) => i.readAt === null).length;

  async function markRead(id?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson('/office/notifications/read', { officeId, ...(id ? { id } : {}) });
      if (!r.ok) return setError('Không đánh dấu được. Vui lòng thử lại.');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <Button
          variant="secondary"
          disabled={busy || unread === 0}
          loading={busy}
          onClick={() => void markRead()}
        >
          Đánh dấu đã đọc tất cả
        </Button>
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có thông báo</h2>
          <p>Chưa có nhắc hạn nào trong mục này.</p>
        </div>
      ) : (
        <ul className="rows deadline-rows">
          {items.map((n) => {
            const href = notificationHref(n);
            return (
              <li key={n.id} data-overdue={n.overdue} data-unread={n.readAt === null}>
                <span className="deadline-main">
                  {n.readAt === null ? <span className="sr-only">Chưa đọc: </span> : null}
                  {href ? <Link href={href}>{n.label}</Link> : <span>{n.label}</span>}
                  <span className="muted">
                    {DEADLINE_DOMAIN_LABEL[n.domain] ?? n.domain} · Hạn {formatDay(n.deadlineAt)}
                  </span>
                </span>
                <span className="deadline-when">
                  <span className={n.overdue ? 'pill overdue' : 'pill soon'}>
                    {n.overdue ? 'Quá hạn' : 'Sắp đến hạn'}
                  </span>
                  {n.readAt === null ? (
                    <Button variant="ghost" disabled={busy} onClick={() => void markRead(n.id)}>
                      Đã đọc
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
