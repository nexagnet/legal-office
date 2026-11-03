#!/usr/bin/env node
// Nạp DỮ LIỆU GIẢ cho 4 nghiệp vụ (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA) qua API hợp lệ.
// Chạy lại được (idempotent theo tiêu đề hồ sơ). Mọi hồ sơ mang thuộc tính seed_demo = "seed-demo" để nhận diện/dọn sau.
// Xem README.md. Không xoá, không ghi đè bản ghi đã lưu.
import { AMEND_TEXT, DOMAINS, SEED_TAG } from './gen.mjs';
import { buildScan } from './scan.mjs';

const env = process.env;
const API = (env.SEED_API_URL ?? 'https://dev.nexagnet.com/api').replace(/\/$/, '');
const PER_DOMAIN = Number(env.SEED_COUNT ?? 36);
const ONLY = (env.SEED_DOMAINS ?? Object.keys(DOMAINS).join(',')).split(',');
const FOOTER = 'DỮ LIỆU GIẢ để thử nghiệm (seed-demo) – không phải hồ sơ thật';

class Client {
  constructor(headers) {
    this.headers = headers;
  }
  static async login(email, password) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: env.SEED_TENANT_ID, email, password }),
    });
    if (!res.ok) throw new Error(`Đăng nhập ${email} lỗi ${res.status}`);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    return new Client({ cookie });
  }
  static synthetic(user) {
    return new Client({ 'x-synthetic-user': user, 'x-synthetic-tenant': env.SEED_TENANT_ID });
  }
  async call(method, path, { json, bytes, type } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          ...this.headers,
          ...(json ? { 'content-type': 'application/json' } : {}),
          ...(bytes ? { 'content-type': type } : {}),
        },
        body: json ? JSON.stringify(json) : bytes,
      });
      if (res.status === 429 && attempt < 6) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const text = await res.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      return { status: res.status, body };
    }
  }
  async ok(method, path, opts) {
    const r = await this.call(method, path, opts);
    if (r.status >= 300)
      throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  }
}

async function clientFor(prefix) {
  if (env[`${prefix}_SYNTHETIC_USER`]) return Client.synthetic(env[`${prefix}_SYNTHETIC_USER`]);
  if (env[`${prefix}_EMAIL`])
    return Client.login(env[`${prefix}_EMAIL`], env[`${prefix}_PASSWORD`] ?? '');
  return null;
}

async function listExisting(c, officeId, domain) {
  const byTitle = new Map();
  // Liệt kê theo từng trạng thái: bản "Đã hủy" không nằm trong danh sách mặc định.
  for (const status of ['DRAFT', 'RECORDED', 'CANCELLED']) {
    for (let offset = 0; ; offset += 200) {
      const { rows } = await c.ok(
        'GET',
        `/dms/cases?${new URLSearchParams({ officeId, domain, status, limit: '200', offset: String(offset) })}`,
      );
      for (const r of rows) byTitle.set(r.title, r);
      if (rows.length < 200) break;
    }
  }
  return byTitle;
}

async function attachScan(c, docId, label, content, vector) {
  const bytes = await buildScan({
    title: content.title,
    lines: content.lines,
    footer: FOOTER,
    vector,
  });
  await c.ok(
    'POST',
    `/dms/documents/${docId}/files?${new URLSearchParams({ label, isScan: 'true' })}`,
    { bytes, type: 'application/pdf' },
  );
}

async function seedCase(c, ctx, spec, idx) {
  const { officeId, branches, domain, existing, stats } = ctx;
  const found = existing.get(spec.title);
  // Hồ sơ nháp mà kế hoạch cũng là nháp thì coi như đã xong.
  if (found && (found.status !== 'DRAFT' || spec.status === 'DRAFT')) {
    stats.skipped++;
    return found.id;
  }
  let caseId = found?.id;
  if (!caseId) {
    const branchId = branches.length ? branches[idx % branches.length] : undefined;
    const r = await c.ok('POST', '/dms/cases', {
      json: {
        officeId,
        domain,
        title: spec.title,
        attributes: { ...spec.attrs, seed_demo: SEED_TAG },
        ...(branchId ? { branchId } : {}),
      },
    });
    caseId = r.label;
  }
  const have = new Map(
    (await c.ok('GET', `/dms/cases/${caseId}/documents`)).rows.map((d) => [d.title, d]),
  );
  for (const [k, d] of spec.docs.entries()) {
    let row = have.get(d.title);
    if (!row) {
      const r = await c.ok('POST', `/dms/cases/${caseId}/documents`, {
        json: {
          kind: d.kind,
          title: d.title,
          isOfficial: d.isOfficial,
          attributes: { ...d.attributes, ...(spec.docAttrs?.(k) ?? {}), seed_demo: SEED_TAG },
        },
      });
      row = { id: r.label, file_count: 0 };
    }
    // "Thiếu scan": tài liệu chính cuối cùng của hồ sơ này cố ý không có tệp.
    const skipScan = spec.missingScan && k === spec.docs.length - 1;
    if (!skipScan && !row.file_count) {
      await attachScan(
        c,
        row.id,
        `scan-${k + 1}-${d.kind}.pdf`,
        { title: d.title, lines: d.lines },
        spec.vectorScan && k % 2 === 0,
      );
      stats.files++;
    }
  }
  if (spec.status === 'CANCELLED')
    await c.ok('POST', `/dms/cases/${caseId}/cancel-draft`, {
      json: { reason: 'Nhập nhầm hồ sơ, hủy bản nháp (dữ liệu giả)' },
    });
  else if (spec.status === 'RECORDED') await c.ok('POST', `/dms/cases/${caseId}/record`);
  stats.created++;
  return caseId;
}

async function proposeAmendments(proposer, ctx, items) {
  for (const { caseId, spec } of items) {
    const { rows } = await proposer.ok(
      'GET',
      `/dms/amendments?${new URLSearchParams({ officeId: ctx.officeId, caseId, limit: '5' })}`,
    );
    if (rows.length) continue;
    const changes = JSON.stringify({ attributes: AMEND_TEXT[ctx.domain](spec) });
    const bytes = await buildScan({
      title: 'Văn bản sửa đổi, bổ sung',
      footer: FOOTER,
      vector: false,
      lines: [
        `Về hồ sơ: ${spec.title}`,
        `Nội dung sửa đổi: ${Object.values(AMEND_TEXT[ctx.domain](spec))[0]}`,
        'Đề nghị Admin xem xét và phê duyệt.',
      ],
    });
    const q = new URLSearchParams({
      reason: 'Sửa theo văn bản sửa đổi thực tế (dữ liệu giả)',
      changes,
    });
    const r = await proposer.call('POST', `/dms/cases/${caseId}/amendments?${q}`, {
      bytes,
      type: 'application/pdf',
    });
    if (r.status >= 300)
      console.warn(`  ! không tạo được yêu cầu sửa đổi (${r.status}) ${JSON.stringify(r.body)}`);
    else ctx.stats.amend++;
  }
}

async function main() {
  if (!env.SEED_TENANT_ID) throw new Error('Thiếu SEED_TENANT_ID');
  const admin = await clientFor('SEED');
  if (!admin)
    throw new Error('Thiếu SEED_EMAIL/SEED_PASSWORD (hoặc SEED_SYNTHETIC_USER khi chạy cục bộ)');
  const proposer = await clientFor('SEED_PROPOSER');
  const me = await admin.ok('GET', '/auth/me');
  const officeId =
    env.SEED_OFFICE_ID ?? me.memberships?.[0]?.officeId ?? me.branches?.[0]?.officeId;
  if (!officeId) throw new Error('Không xác định được văn phòng (đặt SEED_OFFICE_ID)');
  const branches = (me.branches ?? []).filter((b) => b.officeId === officeId).map((b) => b.id);
  console.log(`Văn phòng ${officeId}; ${branches.length} chi nhánh được cấp cho tài khoản nạp.`);
  if (!branches.length)
    console.warn(
      '  ! tài khoản không có chi nhánh: hồ sơ sẽ không gắn chi nhánh (chỉ Admin thấy).',
    );
  if (!proposer)
    console.warn(
      '  ! không có SEED_PROPOSER_*: bỏ qua hồ sơ "Chờ duyệt sửa đổi" (Admin tự sửa thì có hiệu lực ngay).',
    );
  for (const domain of ONLY) {
    const def = DOMAINS[domain];
    if (!def) throw new Error(`Nghiệp vụ lạ: ${domain}`);
    const stats = { created: 0, skipped: 0, files: 0, amend: 0 };
    const existing = await listExisting(admin, officeId, domain);
    const ctx = { officeId, branches, domain, existing, stats };
    const amendItems = [];
    for (let i = 0; i < PER_DOMAIN; i++) {
      const spec = def.gen(i, PER_DOMAIN);
      const caseId = await seedCase(admin, ctx, spec, i);
      if (spec.pendingAmend) amendItems.push({ caseId, spec });
    }
    if (proposer) await proposeAmendments(proposer, ctx, amendItems);
    console.log(
      `${def.label}: tạo ${stats.created}, đã có ${stats.skipped}, tệp scan ${stats.files}, yêu cầu sửa đổi ${stats.amend}`,
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
