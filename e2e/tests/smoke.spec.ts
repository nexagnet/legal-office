import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Đọc thông tin do start-stack.sh ghi (tài khoản quản trị tạm của văn phòng giả). */
const env = Object.fromEntries(
  readFileSync(new URL('../.stack.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
) as Record<string, string>;
const NEW_PASSWORD = 'E2e-Mat-Khau-Moi-5678';
const TITLE = 'Hồ sơ smoke E2E';

// Khi hỏng, in nội dung trang và các lời gọi API lỗi ra log CI để biết ngay nguyên nhân.
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  console.log('URL khi hỏng:', page.url());
  console.log(
    (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).slice(0, 2000),
  );
});

test('đăng nhập, đổi mật khẩu lần đầu, tạo nháp Vi bằng, ghi sổ và thấy ở danh sách Chính thức', async ({
  page,
}) => {
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) console.log('API lỗi', r.status(), r.url());
  });
  await page.goto('/login');
  await page.locator('input[name=identifier]').fill(env.E2E_ADMIN_EMAIL!);
  await page.locator('input[name=password]').fill(env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  // Lần đầu bắt buộc đổi mật khẩu.
  await page.waitForURL('**/doi-mat-khau');
  await page.locator('input[name=currentPassword]').fill(env.E2E_ADMIN_PASSWORD!);
  await page.locator('input[name=newPassword]').fill(NEW_PASSWORD);
  await page.locator('input[name=confirm]').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/doi-mat-khau'));

  // Tạo nháp Vi bằng (mục A chỉ cột sổ S-02, mục C thông tin khác).
  await page.goto('/dms/vi-bang/tao-moi');
  await page.locator('input[name=nguoi_yeu_cau]').fill('Nguyễn Văn A, Hà Nội');
  await page.locator('input[name=noi_dung_yeu_cau]').fill('Ghi nhận hiện trạng');
  await page.locator('input[name=so_ngay_vi_bang]').fill('13/11/2026');
  await page.locator('input[name=dia_chi_noi_lap]').fill('Ba Đình, Hà Nội');
  await page.locator('input[name=thua_hanh_vien]').fill('Trần B');
  await page.locator('input[name=title]').fill(TITLE);
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await page.waitForURL(/\/dms\/vi-bang\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Nháp', { exact: true }).first()).toBeVisible();

  // Ghi sổ.
  await page.getByRole('button', { name: 'Xác nhận lưu chính thức' }).click();
  const recorded = page.waitForResponse((r) => /\/api\/dms\/cases\/[^/]+\/record$/.test(r.url()));
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu chính thức' }).click();
  const res = await recorded;
  console.log('record ->', res.status(), (await res.text().catch(() => '')).slice(0, 300));
  expect(res.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: /^001\/2026\/VB-THV/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Đã ghi sổ').first()).toBeVisible();

  // Có mặt ở danh sách Chính thức của Vi bằng.
  await page.goto('/dms/vi-bang');
  await expect(page.getByText('001/2026/VB-THV').first()).toBeVisible();

  // Đăng xuất.
  await page.getByRole('button', { name: /^Tài khoản/ }).click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await page.waitForURL('**/login');
});
