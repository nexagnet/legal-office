import { describe, expect, it } from 'vitest';
import { buildDigests, type PendingReminder } from './digest';

const r = (over: Partial<PendingReminder>): PendingReminder => ({
  notification_id: 'n1',
  user_id: 'u1',
  email: 'a@example.test',
  office_id: 'o1',
  office_name: 'VP A',
  kind: 'DEADLINE_DUE_SOON',
  domain: 'CONG_VAN',
  label: 'Công văn X',
  deadline_at: new Date('2026-10-20T03:00:00Z'),
  ...over,
});

describe('buildDigests', () => {
  it('một thư cho mỗi người, tách quá hạn và sắp đến hạn, giờ Việt Nam', () => {
    const out = buildDigests([
      r({ notification_id: 'n1' }),
      r({ notification_id: 'n2', kind: 'DEADLINE_OVERDUE', domain: 'TONG_DAT', label: 'Bên B' }),
      r({ notification_id: 'n3', user_id: 'u2', email: 'b@example.test' }),
    ]);
    expect(out.map((d) => d.email)).toEqual(['a@example.test', 'b@example.test']);
    expect(out[0]!.subject).toBe('Nhắc hạn: 1 việc quá hạn, 1 việc sắp đến hạn');
    expect(out[0]!.notificationIds).toEqual(['n1', 'n2']);
    expect(out[0]!.text).toContain('Đã quá hạn:\n- [Tống đạt] Bên B');
    expect(out[0]!.text).toContain('Sắp đến hạn:\n- [Công văn] Công văn X — hạn 10:00 20/10/2026');
    expect(out[1]!.subject).toBe('Nhắc hạn: 1 việc sắp đến hạn');
  });

  it('không có nhắc thì không có thư', () => {
    expect(buildDigests([])).toEqual([]);
  });
});
