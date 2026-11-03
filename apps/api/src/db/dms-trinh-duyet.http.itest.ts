import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// DMS GĐ 2b qua HTTP thật: Trình / Duyệt (N4) và xóa file scan + Scan đã xóa 30 ngày (N6). Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmstd_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% synthetic scan ${tag}\n`);

describe.skipIf(!ADMIN_URL)('DMS Trình / Duyệt và xóa scan qua HTTP (PostgreSQL + kho tệp)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-dmstd-'));
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { admin: id(), m1: id(), m2: id(), outsider: id() };

  const api = async (method: string, path: string, user: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'x-synthetic-user': user,
        'x-synthetic-tenant': T,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Json) : {} };
  };
  const upload = async (user: string, bytes: Buffer) => {
    const res = await fetch(`${base}/dms/uploads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-synthetic-user': user,
        'x-synthetic-tenant': T,
      },
      body: bytes,
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Json) : {} };
  };
  const download = async (path: string, user: string) => {
    const res = await fetch(`${base}${path}`, {
      headers: { 'x-synthetic-user': user, 'x-synthetic-tenant': T },
    });
    return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
  };
  /** Tải lên bước đệm rồi gửi bản trình; trả id bản trình và danh sách file. */
  const submit = async (user: string, title: string, tags: string[]) => {
    const staged: string[] = [];
    for (const t of tags) {
      const up = await upload(user, pdf(t));
      expect(up.status).toBe(200);
      staged.push(up.json.label as string);
    }
    const r = await api('POST', '/dms/submissions', user, {
      officeId: OFF,
      title,
      description: 'Mô tả thử',
      files: staged.map((s, i) => ({ stagedId: s, label: `${tags[i]}.pdf` })),
    });
    expect(r.status).toBe(201);
    const sid = r.json.label as string;
    const one = await api('GET', `/dms/submissions/${sid}`, user);
    return { sid, files: one.json.files as Json[] };
  };

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_app') THEN CREATE ROLE legal_app LOGIN; END IF; END $$`,
    );
    owner = new pg.Pool({ connectionString: withDb(ADMIN_URL!, DB), max: 2 });
    await owner.query(MIGRATION);
    await owner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_app');
    await owner.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_app');
    const appUrl = new URL(withDb(ADMIN_URL!, DB));
    appUrl.username = 'legal_app';
    appUrl.password = '';
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 8 });
    server = await NestFactory.create(
      AppModule.register({
        pool: appPool,
        resolver: new SyntheticHeaderResolver(),
        fileStore: new LocalFileStore(storeDir),
      }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const u of Object.values(U)) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        T,
        u,
      ]);
    }
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role)
       VALUES ($1,$2,$5,'ADMIN'),($1,$3,$5,'THV'),($1,$4,$5,'THV')`,
      [T, U.admin, U.m1, U.m2, OFF],
    );
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it('thành viên gửi bản trình kèm scan; người ngoài văn phòng bị từ chối; thiếu scan bị chặn', async () => {
    const { sid, files } = await submit(U.m1, 'Bổ sung giấy ủy quyền', ['uy-quyen']);
    expect(files).toHaveLength(1);
    expect(files[0]?.label).toBe('uy-quyen.pdf');

    const up = await upload(U.outsider, pdf('x'));
    const denied = await api('POST', '/dms/submissions', U.outsider, {
      officeId: OFF,
      title: 'Người ngoài',
      files: [{ stagedId: up.json.label, label: 'x.pdf' }],
    });
    expect(denied.status).toBe(403);
    expect(
      (
        await api('POST', '/dms/submissions', U.m1, {
          officeId: OFF,
          title: 'Không scan',
          files: [],
        })
      ).status,
    ).toBe(400);
    // Tệp đệm của người khác không dùng được.
    const other = await upload(U.m2, pdf('của m2'));
    const stolen = await api('POST', '/dms/submissions', U.m1, {
      officeId: OFF,
      title: 'Lấy tệp người khác',
      files: [{ stagedId: other.json.label, label: 'm2.pdf' }],
    });
    expect(stolen.status).toBe(404);
    expect(sid).toBeTruthy();
  });

  it('phạm vi xem: người gửi chỉ thấy bản của mình, Admin thấy cả văn phòng; huy hiệu chỉ cho Admin', async () => {
    const mine = await submit(U.m1, 'Bản của m1', ['a1']);
    const theirs = await submit(U.m2, 'Bản của m2', ['b1']);
    const ids = async (user: string) =>
      (
        (await api('GET', `/dms/submissions?officeId=${OFF}&limit=200`, user)).json.rows as Json[]
      ).map((r) => r.id);
    const m1 = await ids(U.m1);
    expect(m1).toContain(mine.sid);
    expect(m1).not.toContain(theirs.sid);
    const adm = await ids(U.admin);
    expect(adm).toEqual(expect.arrayContaining([mine.sid, theirs.sid]));
    expect((await api('GET', `/dms/submissions/${theirs.sid}`, U.m1)).status).toBe(404);

    const countFor = async (user: string) =>
      (await api('GET', `/dms/submissions/pending-count?officeId=${OFF}`, user)).json.pending;
    expect(await countFor(U.m1)).toBe(0);
    expect(await countFor(U.admin)).toBeGreaterThanOrEqual(2);

    // Tải scan: chủ bản trình tải được, người khác không.
    const f = theirs.files[0]!;
    const ok = await download(`/dms/submission-files/${f.id}/download`, U.m2);
    expect(ok.status).toBe(200);
    expect(ok.bytes.toString()).toContain('synthetic scan b1');
    expect((await download(`/dms/submission-files/${f.id}/download`, U.m1)).status).toBe(404);
  });

  it('chỉ Admin duyệt; từ chối cần lý do; không duyệt lại được', async () => {
    const { sid } = await submit(U.m1, 'Cần duyệt', ['c1']);
    const byMember = await api('POST', `/dms/submissions/${sid}/decide`, U.m1, { approve: true });
    expect(byMember.status).toBe(403);
    const noNote = await api('POST', `/dms/submissions/${sid}/decide`, U.admin, {
      approve: false,
    });
    expect(noNote.status).toBe(422);
    const approved = await api('POST', `/dms/submissions/${sid}/decide`, U.admin, {
      approve: true,
      note: 'Đủ giấy tờ',
    });
    expect(approved.status).toBe(200);
    expect(approved.json.code).toBe('SUBMISSION_APPROVED');
    const again = await api('POST', `/dms/submissions/${sid}/decide`, U.admin, { approve: true });
    expect(again.status).toBe(409);
    const one = await api('GET', `/dms/submissions/${sid}`, U.m1);
    expect(one.json.status).toBe('APPROVED');
  });

  it('xóa scan: cần quyền + lý do; file vào Scan đã xóa, chỉ Admin xem/tải; bản trình vẫn còn', async () => {
    const { sid, files } = await submit(U.m1, 'Có scan để xóa', ['d1', 'd2']);
    const target = files.find((f) => f.label === 'd1.pdf')!.id as string;

    // Thành viên thường chưa được cấp quyền xóa.
    const noRight = await api('POST', '/dms/scans/delete', U.m1, {
      kind: 'submission',
      fileId: target,
      reason: 'Tải nhầm',
    });
    expect(noRight.status).toBe(403);
    expect(noRight.json.code).toBe('PERMISSION_DENIED');
    // Lý do bắt buộc (kiểm ngay ở API).
    expect(
      (await api('POST', '/dms/scans/delete', U.admin, { kind: 'submission', fileId: target }))
        .status,
    ).toBe(400);

    const done = await api('POST', '/dms/scans/delete', U.admin, {
      kind: 'submission',
      fileId: target,
      reason: 'Tải nhầm file',
    });
    expect(done.status).toBe(200);
    expect(done.json.code).toBe('SCAN_DELETED');
    expect(
      (
        await api('POST', '/dms/scans/delete', U.admin, {
          kind: 'submission',
          fileId: target,
          reason: 'Xóa lần hai',
        })
      ).status,
    ).toBe(409);

    // Bản trình vẫn còn, chỉ mất 1 scan; file đã xóa không tải được ở chỗ thường.
    const one = await api('GET', `/dms/submissions/${sid}`, U.m1);
    expect(one.status).toBe(200);
    expect((one.json.files as Json[]).map((f) => f.id)).not.toContain(target);
    expect((await download(`/dms/submission-files/${target}/download`, U.m1)).status).toBe(404);

    // Mục Scan đã xóa: Admin thấy và tải được; người khác rỗng / bị chặn.
    const listed = await api('GET', `/dms/deleted-scans?officeId=${OFF}`, U.admin);
    const row = (listed.json.rows as Json[]).find((r) => r.file_id === target);
    expect(row).toMatchObject({ kind: 'submission', delete_reason: 'Tải nhầm file' });
    expect(row?.days_left).toBeGreaterThanOrEqual(29);
    expect((await api('GET', `/dms/deleted-scans?officeId=${OFF}`, U.m1)).json.rows).toEqual([]);
    const got = await download(`/dms/deleted-scans/submission/${target}/download`, U.admin);
    expect(got.status).toBe(200);
    expect(got.bytes.toString()).toContain('synthetic scan d1');
    expect((await download(`/dms/deleted-scans/submission/${target}/download`, U.m1)).status).toBe(
      404,
    );
    expect((await download(`/dms/deleted-scans/khac/${target}/download`, U.admin)).status).toBe(
      400,
    );
  });

  it('xóa scan của hồ sơ: số scan giảm, hồ sơ và tài liệu còn nguyên', async () => {
    const group = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'THV') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id;
    for (const p of ['read', 'draft', 'confirm', 'add_document', 'download'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, group, `vibang.${p}.own`],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, group, U.m1],
    );
    const c = await api('POST', '/dms/cases', U.m1, {
      officeId: OFF,
      domain: 'vibang',
      title: 'Hồ sơ có scan',
    });
    const caseId = c.json.label as string;
    const d = await api('POST', `/dms/cases/${caseId}/documents`, U.m1, {
      kind: 'N-04',
      title: 'Vi bằng',
      isOfficial: true,
    });
    const docId = d.json.label as string;
    const up = await fetch(`${base}/dms/documents/${docId}/files?label=scan.pdf&isScan=true`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-synthetic-user': U.m1,
        'x-synthetic-tenant': T,
      },
      body: pdf('hs'),
    });
    expect(up.status).toBe(200);
    const fileId = ((await up.json()) as Json).label as string;
    await api('POST', `/dms/cases/${caseId}/record`, U.m1);
    expect(((await api('GET', `/dms/cases/${caseId}`, U.m1)).json as Json).scan_count).toBe(1);

    const del = await api('POST', '/dms/scans/delete', U.admin, {
      kind: 'document',
      fileId,
      reason: 'Scan mờ, tải lại',
    });
    expect(del.status).toBe(200);
    const after = await api('GET', `/dms/cases/${caseId}`, U.m1);
    expect(after.json).toMatchObject({ scan_count: 0, status: 'RECORDED' });
    expect(after.json.case_number).toMatch(/VB-TPL$/);
    const docs = await api('GET', `/dms/cases/${caseId}/documents`, U.m1);
    expect(docs.json.rows).toHaveLength(1);
    expect((await download(`/dms/files/${fileId}/download`, U.m1)).status).toBe(404);
    const listed = await api('GET', `/dms/deleted-scans?officeId=${OFF}`, U.admin);
    expect((listed.json.rows as Json[]).find((r) => r.file_id === fileId)).toMatchObject({
      kind: 'document',
      case_id: caseId,
    });
  });

  it('Lịch sử hoạt động: chỉ Admin đọc, lọc theo nhóm, tìm theo tiêu đề, phân trang, có người làm và đối tượng', async () => {
    const all = await api('GET', `/dms/activity?officeId=${OFF}&limit=200`, U.admin);
    expect(all.status).toBe(200);
    const rows = all.json.rows as Json[];
    const actions = new Set(rows.map((r) => r.action));
    expect(actions).toContain('dms.submission.create');
    expect(actions).toContain('dms.submission.decide');
    expect(actions).toContain('dms.scan.delete');
    expect(all.json.total).toBe(rows.length);
    // Mỗi dòng có người làm; hồ sơ có số hồ sơ, bản trình có tiêu đề.
    expect(rows.every((r) => typeof r.actor_label === 'string')).toBe(true);
    expect(rows.find((r) => r.action === 'dms.case.record')?.case_number).toMatch(/VB-TPL$/);
    expect(
      rows.find((r) => r.action === 'dms.submission.create' && r.submission_title === 'Cần duyệt'),
    ).toBeTruthy();
    // Mới nhất trước.
    const times = rows.map((r) => Date.parse(r.at as string));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    // Người không phải Admin chỉ nhận danh sách rỗng.
    const asMember = await api('GET', `/dms/activity?officeId=${OFF}`, U.m1);
    expect(asMember.status).toBe(200);
    expect(asMember.json).toEqual({ rows: [], total: 0 });

    // Lọc theo nhóm và tìm theo tiêu đề bản trình.
    const subs = (await api('GET', `/dms/activity?officeId=${OFF}&group=submission`, U.admin)).json
      .rows as Json[];
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((r) => String(r.action).startsWith('dms.submission.'))).toBe(true);
    const found = (
      await api(
        'GET',
        `/dms/activity?officeId=${OFF}&q=${encodeURIComponent('Cần duyệt')}`,
        U.admin,
      )
    ).json.rows as Json[];
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => r.submission_title === 'Cần duyệt')).toBe(true);

    // Phân trang: trang 1 một dòng nhưng tổng vẫn là tổng.
    const p1 = await api('GET', `/dms/activity?officeId=${OFF}&limit=1`, U.admin);
    expect(p1.json.rows).toHaveLength(1);
    expect(p1.json.total).toBe(rows.length);
    // Tham số lạ bị chặn.
    expect((await api('GET', `/dms/activity?officeId=${OFF}&group=khac`, U.admin)).status).toBe(
      400,
    );
  });
});
