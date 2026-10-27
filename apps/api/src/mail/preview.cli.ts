/** Dựng bản xem thử các thư hệ thống thành tệp HTML: `pnpm --filter @legal-office/api build && node apps/api/dist/mail/preview.cli.js <thư-mục>`. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDigests } from '../reminders/digest';
import { renderLoginLinkMail } from './login-link';
import { renderReminderDigestMail } from './reminder-digest';
import { renderTestMail } from './test-mail';

async function main(): Promise<void> {
  const dir = process.argv[2] ?? 'email-preview';
  mkdirSync(dir, { recursive: true });
  const login = await renderLoginLinkMail({
    url: 'https://legal-office.example/xac-thuc?t=3f1c2d9e-0000-4000-8000-000000000000.Qm9vdHN0cmFwVG9rZW4',
    validMinutes: 15,
  });
  const at = (iso: string) => new Date(iso);
  const base = { user_id: 'u1', email: 'a@example.test', office_id: 'o1' } as const;
  const [digest] = buildDigests([
    {
      ...base,
      notification_id: '1',
      office_name: 'Văn phòng Hai Bà Trưng',
      kind: 'DEADLINE_OVERDUE',
      domain: 'TONG_DAT',
      label: 'Tống đạt: Nguyễn Văn A',
      deadline_at: at('2026-10-25T03:00:00Z'),
    },
    {
      ...base,
      notification_id: '2',
      office_name: 'Văn phòng Hai Bà Trưng',
      kind: 'DEADLINE_DUE_SOON',
      domain: 'VIBANG_CSDL',
      label: 'Vi bằng số 128/2026',
      deadline_at: at('2026-10-28T08:00:00Z'),
    },
    {
      ...base,
      notification_id: '3',
      office_name: 'Văn phòng Hai Bà Trưng',
      kind: 'DEADLINE_DUE_SOON',
      domain: 'CONG_VAN',
      label: 'Công văn trả lời Sở Tư pháp',
      deadline_at: at('2026-10-29T02:00:00Z'),
    },
    {
      ...base,
      notification_id: '4',
      office_name: 'Chi nhánh Đống Đa',
      kind: 'DEADLINE_DUE_SOON',
      domain: 'THA_THU_HOI',
      label: 'Hồ sơ THA 45/2026',
      deadline_at: at('2026-10-30T02:00:00Z'),
    },
  ]);
  const test = await renderTestMail();
  writeFileSync(join(dir, 'dang-nhap.html'), login.html);
  writeFileSync(join(dir, 'nhac-han.html'), await renderReminderDigestMail(digest!));
  writeFileSync(join(dir, 'thu-thu.html'), test.html);
}

void main();
