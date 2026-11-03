#!/usr/bin/env node
// Nạp DỮ LIỆU GIẢ cho 4 nghiệp vụ (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA) qua API hợp lệ.
// Chạy lại được (idempotent theo tiêu đề hồ sơ). Mọi hồ sơ mang thuộc tính seed_demo = "seed-demo" để nhận diện/dọn sau.
// Xem README.md. Không xoá, không ghi đè bản ghi đã lưu.
import { DOMAINS, SEED_TAG } from './gen.mjs';
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
        // SĐT khách hàng (N1): số GIẢ theo mẫu 0900 000 xxx, không phải số thật; không vào sổ.
        attributes: {
          ...spec.attrs,
          so_dien_thoai: `0900 000 ${String(idx).padStart(3, '0')}`,
          seed_demo: SEED_TAG,
        },
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
  else if (spec.status === 'RECORDED') {
    await c.ok('POST', `/dms/cases/${caseId}/record`);
    // Ô "Đã trả kết quả" (N2): tích cho khoảng một phần tư hồ sơ chính thức để danh sách có cả hai trạng thái.
    if (idx % 4 === 0)
      await c.ok('POST', `/dms/cases/${caseId}/returned`, { json: { returned: true } });
  }
  stats.created++;
  return caseId;
}

/**
 * Trình / Duyệt (N4): tạo vài bản trình GIẢ ở đủ ba trạng thái (chờ duyệt, đã duyệt, bị từ chối). Mỗi bản kèm một bản scan PDF
 * giả. Nhận biết theo tiêu đề nên chạy lại không nhân đôi. Người gửi là `submitter` (không phải Admin nếu có SEED_PROPOSER_*).
 */
async function seedSubmissions(submitter, admin, officeId) {
  const plan = [
    { title: '[seed-demo] Bổ sung giấy ủy quyền', decide: null },
    { title: '[seed-demo] Đề nghị cấp bản sao vi bằng', decide: null },
    {
      title: '[seed-demo] Giấy xác nhận địa chỉ nhận văn bản',
      decide: { approve: true, note: 'Đủ giấy tờ' },
    },
    {
      title: '[seed-demo] Biên nhận thiếu chữ ký',
      decide: { approve: false, note: 'Thiếu chữ ký của bên nhận, gửi lại bản đủ.' },
    },
  ];
  const have = new Set();
  for (const status of ['PENDING', 'APPROVED', 'REJECTED']) {
    const { rows } = await admin.ok(
      'GET',
      `/dms/submissions?${new URLSearchParams({ officeId, status, q: '[seed-demo]', limit: '100' })}`,
    );
    for (const r of rows) have.add(r.title);
  }
  let made = 0;
  for (const p of plan) {
    if (have.has(p.title)) continue;
    const bytes = await buildScan({
      title: p.title.replace('[seed-demo] ', ''),
      footer: FOOTER,
      vector: false,
      lines: ['Nội dung bản trình giả để thử nghiệm Trình / Duyệt.', 'Không phải hồ sơ thật.'],
    });
    const up = await submitter.ok('POST', '/dms/uploads', { bytes, type: 'application/pdf' });
    const created = await submitter.ok('POST', '/dms/submissions', {
      json: {
        officeId,
        title: p.title,
        description: 'Bản trình giả (seed-demo) để thử nghiệm.',
        files: [{ stagedId: up.label, label: 'ban-scan-1.pdf' }],
      },
    });
    if (p.decide)
      await admin.ok('POST', `/dms/submissions/${created.label}/decide`, { json: p.decide });
    made++;
  }
  return made;
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
      '  ! không có SEED_PROPOSER_*: bản Trình / Duyệt giả sẽ do chính tài khoản nạp gửi.',
    );
  for (const domain of ONLY) {
    const def = DOMAINS[domain];
    if (!def) throw new Error(`Nghiệp vụ lạ: ${domain}`);
    const stats = { created: 0, skipped: 0, files: 0 };
    const existing = await listExisting(admin, officeId, domain);
    const ctx = { officeId, branches, domain, existing, stats };
    for (let i = 0; i < PER_DOMAIN; i++) await seedCase(admin, ctx, def.gen(i, PER_DOMAIN), i);
    console.log(
      `${def.label}: tạo ${stats.created}, đã có ${stats.skipped}, tệp scan ${stats.files}`,
    );
  }
  const made = await seedSubmissions(proposer ?? admin, admin, officeId);
  console.log(`Trình / Duyệt: tạo ${made} bản trình giả.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
