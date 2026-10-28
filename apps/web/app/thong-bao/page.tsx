import Link from 'next/link';
import { NotificationList } from '../../components/NotificationList';
import { TabNav } from '../../components/ui/tab-nav';
import {
  NOTIFICATION_TABS,
  filterNotifications,
  loadNotifications,
  parseTab,
} from '../../lib/notifications';
import { currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Thông báo</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem thông báo.
          </p>
        </div>
      </section>
    );
  }
  const tab = parseTab((await searchParams).tab);
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const all = officeId ? await loadNotifications(await requestCookie(), officeId) : [];
  return (
    <section aria-labelledby="t">
      <h1 id="t">Thông báo</h1>
      <p className="muted">
        Nhắc hạn trong ứng dụng, sinh từ các hạn bạn được xem. Nhắc không đồng nghĩa chuyển trạng
        thái hồ sơ hay phê duyệt.
      </p>
      {all === 'error' || !officeId ? (
        <div className="state" role="alert">
          <h2>Không tải được thông báo</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : (
        <>
          <TabNav
            label="Lọc thông báo"
            active={tab}
            tabs={NOTIFICATION_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              href: t.key === 'tat-ca' ? '/thong-bao' : `/thong-bao?tab=${t.key}`,
              count: filterNotifications(all, t.key).length,
            }))}
          />
          <NotificationList items={filterNotifications(all, tab)} officeId={officeId} />
        </>
      )}
    </section>
  );
}
