import { describe, expect, it } from 'vitest';
import { buildDigests } from '../reminders/digest';
import { renderLoginLinkMail } from './login-link';
import { renderReminderDigestMail } from './reminder-digest';
import { renderTestMail } from './test-mail';

describe('email HTML', () => {
  it('thư đăng nhập chỉ có một link, không chứa mã, giữ bản text', async () => {
    const url = 'https://app.test/xac-thuc?t=abc.def';
    const m = await renderLoginLinkMail({ url, validMinutes: 15 });
    expect(m.text).toContain(url);
    expect(m.text.match(/https?:\/\//g)).toHaveLength(1);
    expect(m.html).toContain(`href="${url}"`);
    expect(m.html).toContain('Nhận mã đăng nhập');
    expect(m.html).not.toMatch(/\b\d{6}\b/);
  });

  it('escape dữ liệu động trong thư nhắc hạn', async () => {
    const [d] = buildDigests([
      {
        notification_id: 'n1',
        user_id: 'u1',
        email: 'a@example.test',
        office_id: 'o1',
        office_name: 'VP <b>A</b>',
        kind: 'DEADLINE_OVERDUE',
        domain: 'CONG_VAN',
        label: 'X & "Y"',
        deadline_at: new Date('2026-10-20T03:00:00Z'),
      },
    ]);
    const html = await renderReminderDigestMail(d!);
    expect(html).not.toContain('<b>A</b>');
    expect(html).toContain('VP &lt;b&gt;A&lt;/b&gt;');
    expect(html).toContain('X &amp; &quot;Y&quot;');
    expect(html).toContain('Đã quá hạn');
  });

  it('thư thử có html và text', async () => {
    const m = await renderTestMail();
    expect(m.html).toContain('<!doctype html>'.toLowerCase());
    expect(m.text.length).toBeGreaterThan(0);
  });
});
