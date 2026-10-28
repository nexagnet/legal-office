import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  filterNotifications,
  notificationHref,
  parseTab,
  type NotificationItem,
} from '../lib/notifications';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const n = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1',
  kind: 'DEADLINE_DUE_SOON',
  domain: 'VIBANG_CSDL',
  refId: 'r1',
  caseId: 'c1',
  label: 'Vi bằng 0128/2026',
  deadlineAt: '2026-10-26T03:00:00Z',
  createdAt: '2026-10-25T03:00:00Z',
  readAt: null,
  overdue: false,
  ...over,
});

describe('Thông báo', () => {
  it('lọc theo tab và mặc định về Tất cả', () => {
    const items = [n({ id: 'a' }), n({ id: 'b', readAt: 'x', overdue: true })];
    expect(parseTab('lạ')).toBe('tat-ca');
    expect(filterNotifications(items, 'chua-doc').map((i) => i.id)).toEqual(['a']);
    expect(filterNotifications(items, 'qua-han').map((i) => i.id)).toEqual(['b']);
    expect(filterNotifications(items, 'tat-ca')).toHaveLength(2);
  });

  it('dẫn về hồ sơ liên quan', () => {
    expect(notificationHref({ domain: 'VIBANG_CSDL', caseId: 'c1' })).toBe('/vi-bang/c1');
    expect(notificationHref({ domain: 'LA', caseId: null })).toBeNull();
  });

  it('ghi Quá hạn bằng chữ và đánh dấu chưa đọc', async () => {
    const { NotificationList } = await import('../components/NotificationList');
    const html = renderToStaticMarkup(
      <NotificationList items={[n({ overdue: true })]} officeId="o1" />,
    );
    expect(html).toContain('Quá hạn');
    expect(html).toContain('Chưa đọc');
    expect(html).toContain('/vi-bang/c1');
  });
});
