import { browser, asRole, BASE } from './lib.mjs';
const XM = '80b4e63f-7631-4fec-a37c-6de9197ee05f';
const b = await browser(); const { page } = await asRole(b, 'THV');
for (let i = 0; i < 2; i++) {
  await page.goto(`${BASE}/xac-minh/${XM}?tab=luot`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  const links = page.getByText('Ghi kết quả', { exact: true });
  if (!(await links.count())) { console.log('no more rounds'); break; }
  await links.first().click(); await page.waitForTimeout(1500);
  await page.getByLabel('Loại nguồn').fill('Văn bản của cơ quan có thẩm quyền');
  await page.getByLabel('Mục đích sử dụng').fill('Xác định điều kiện thi hành án');
  await page.locator('input[name=file]').setInputFiles('demo-scan.pdf');
  await page.getByRole('button', { name: 'Ghi nguồn kèm tệp' }).click(); await page.waitForTimeout(2500);
  if (!(await page.locator('textarea[name=result]').isVisible())) { await links.first().click(); await page.waitForTimeout(1500); }
  await page.locator('textarea[name=result]').fill('DEMO: Đã có kết quả xác minh cho lượt này.');
  await page.getByRole('button', { name: 'Ghi kết quả lượt' }).click(); await page.waitForTimeout(2500);
  console.log('round', i, await page.locator('table').innerText().then(t => t.replace(/\s+/g, ' ').slice(0, 200)));
}
await b.close();
