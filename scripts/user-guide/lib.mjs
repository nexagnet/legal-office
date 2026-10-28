import { chromium } from 'playwright-core';
import fs from 'node:fs';
export const BASE = 'https://http--lo-web--8929jqrrnzyy.code.run';
export const TENANT = fs.readFileSync(new URL('./tenant.txt', import.meta.url), 'utf8').trim();
const ACC = 'C:/Users/phung/Documents/legal-office-test-accounts-thu.txt';
export function creds() {
  const m = {};
  for (const l of fs.readFileSync(ACC, 'utf8').split(/\r?\n/)) { const [r, e, p] = l.split('\t'); if (p) m[r] = { email: e, password: p }; }
  const a = fs.readFileSync('C:/Users/phung/Documents/legal-office-admin-thu.txt', 'utf8').split(String.fromCharCode(10));
  m.ADMIN = { email: a[0].trim(), password: a[1].trim() };
  return m;
}
export async function browser() {
  return chromium.launch({ executablePath: 'C:/Users/phung/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
}
export async function asRole(b, role, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN', ...opts });
  const c = creds()[role];
  const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { tenantId: TENANT, email: c.email, password: c.password } });
  if (r.status() !== 200) throw new Error(`login ${role} ${r.status()}`);
  const page = await ctx.newPage();
  return { ctx, page };
}
