import { chromium } from 'playwright-core';
import fs from 'node:fs';
export const BASE = process.env.GUIDE_BASE ?? 'https://dev.nexagnet.com';
export const TENANT = fs.readFileSync(new URL('./tenant.txt', import.meta.url), 'utf8').trim();
const ACC = 'C:/Users/phung/Documents/legal-office-test-accounts-thu.txt';
const ADMIN = 'C:/Users/phung/Documents/legal-office-admin-thu.txt';
/** Mỗi dòng tệp tài khoản thử: email,mật khẩu,VAI (hoặc cách nhau bằng tab). Không bao giờ in mật khẩu ra. */
export function creds() {
  const m = {};
  for (const l of fs.readFileSync(ACC, 'utf8').split(/\r?\n/)) {
    const [e, p, r] = l.split(/[,\t]/).map((s) => s.trim());
    if (r && e && p) m[r] = { email: e, password: p };
  }
  const a = fs.readFileSync(ADMIN, 'utf8').split(/\r?\n/).filter(Boolean);
  m.ADMIN = { email: a[0].trim(), password: a[1].trim() };
  return m;
}
export async function browser() {
  return chromium.launch({
    executablePath: 'C:/Users/phung/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    args: ['--no-sandbox'],
  });
}
export async function asRole(b, role, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN', ...opts });
  const c = creds()[role];
  if (!c) throw new Error(`không có tài khoản cho vai ${role}`);
  const r = await ctx.request.post(`${BASE}/api/auth/login`, {
    data: { tenantId: TENANT, email: c.email, password: c.password },
  });
  if (r.status() !== 200) throw new Error(`login ${role} ${r.status()}`);
  const page = await ctx.newPage();
  return { ctx, page };
}
