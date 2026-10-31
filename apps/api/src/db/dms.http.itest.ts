import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// DMS qua HTTP thật + PostgreSQL thật + kho tệp trên đĩa. Toàn bộ dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsh_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
type Row = Record<string, unknown> & { id?: string; name?: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const PDF = Buffer.from('%PDF-1.4\n% synthetic scan\n');

describe.skipIf(!ADMIN_URL)('DMS HTTP (PostgreSQL + kho tệp)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-dms-'));
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { a: id(), b: id(), approver1: id(), approver2: id(), none: id() };

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
  const upload = async (path: string, user: string, bytes: Buffer, type = 'application/pdf') => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': type, 'x-synthetic-user': user, 'x-synthetic-tenant': T },
      body: bytes,
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Json) : {} };
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
    const mk = async (name: string, perms: string[], users: string[]) => {
      const g = (
        await owner.query(
          `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
          [T, OFF, name],
        )
      ).rows[0].id;
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [T, g, u],
        );
      return g as string;
    };
    const own = ['read', 'draft', 'confirm', 'add_document', 'download'].map(
      (x) => `vibang.${x}.own`,
    );
    await mk('THV tạo', own, [U.a, U.b]);
    await mk(
      'Quản trị phân quyền',
      ['dms.permission.propose', 'dms.permission.approve'],
      [U.approver1, U.approver2],
    );
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it('chưa đăng nhập thì 401; không có nhóm quyền thì 403', async () => {
    const res = await fetch(`${base}/dms/cases?officeId=${OFF}`);
    expect(res.status).toBe(401);
    const r = await api('POST', '/dms/cases', U.none, {
      officeId: OFF,
      domain: 'vibang',
      title: 'x',
    });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('PERMISSION_DENIED');
  });

  it('vòng đời: tạo nháp → thêm tài liệu → tải tệp scan → ghi sổ → đếm → tải về → bất biến', async () => {
    const c = await api('POST', '/dms/cases', U.a, {
      officeId: OFF,
      domain: 'vibang',
      title: 'Vi bằng thử',
      attributes: { k: 1 },
    });
    expect(c.status).toBe(201);
    const caseId = c.json.label as string;
    expect(
      (
        await api('PUT', `/dms/cases/${caseId}/draft`, U.a, {
          title: 'Vi bằng thử 2',
          attributes: {},
        })
      ).status,
    ).toBe(200);

    const d = await api('POST', `/dms/cases/${caseId}/documents`, U.a, {
      kind: 'N-04',
      title: 'Vi bằng',
      isOfficial: true,
    });
    expect(d.status).toBe(201);
    const docId = d.json.label as string;

    const bad = await upload(
      `/dms/documents/${docId}/files?label=scan&isScan=true`,
      U.a,
      Buffer.from('không phải pdf'),
    );
    expect(bad.status).toBe(422);
    const up = await upload(
      `/dms/documents/${docId}/files?label=${encodeURIComponent('bản scan')}&isScan=true`,
      U.a,
      PDF,
    );
    expect(up.status).toBe(200);
    const fileId = up.json.label as string;

    expect((await api('POST', `/dms/cases/${caseId}/record`, U.a)).status).toBe(200);
    const list = await api('GET', `/dms/cases?officeId=${OFF}&domain=vibang`, U.a);
    const row = list.json.rows.find((r: Row) => r.id === caseId);
    expect(row).toMatchObject({ status: 'RECORDED', document_count: 1, scan_count: 1 });

    const dl = await fetch(`${base}/dms/files/${fileId}/download`, {
      headers: { 'x-synthetic-user': U.a, 'x-synthetic-tenant': T },
    });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer())).toEqual(PDF);

    // Đã ghi sổ: sửa nháp bị 409; không có DELETE/PATCH; PUT lên tài liệu đã ghi sổ bị 409.
    expect(
      (await api('PUT', `/dms/cases/${caseId}/draft`, U.a, { title: 'hack', attributes: {} }))
        .status,
    ).toBe(409);
    expect(
      (await api('PUT', `/dms/documents/${docId}/draft`, U.a, { kind: 'x', title: 'hack' })).status,
    ).toBe(409);
    expect((await api('DELETE', `/dms/cases/${caseId}`, U.a)).status).toBe(404);
    expect((await api('PATCH', `/dms/cases/${caseId}`, U.a, {})).status).toBe(404);
    // Bổ sung tệp MỚI vẫn được; tệp cũ nguyên vẹn.
    expect((await upload(`/dms/documents/${docId}/files?label=phu-luc`, U.a, PDF)).status).toBe(
      200,
    );
    const files = await api('GET', `/dms/documents/${docId}/files`, U.a);
    expect(files.json.rows).toHaveLength(2);
    expect(files.json.rows[0]).toMatchObject({ label: 'bản scan', version: 1 });
  });

  it('THV B không thấy, không tải, không ghi vào hồ sơ của THV A', async () => {
    const caseId = (
      await api('POST', '/dms/cases', U.a, { officeId: OFF, domain: 'vibang', title: 'Riêng A' })
    ).json.label as string;
    const docId = (
      await api('POST', `/dms/cases/${caseId}/documents`, U.a, { kind: 'N-04', title: 'T' })
    ).json.label as string;
    const fileId = (await upload(`/dms/documents/${docId}/files?label=s&isScan=true`, U.a, PDF))
      .json.label as string;
    await api('POST', `/dms/cases/${caseId}/record`, U.a);

    expect(
      (await api('GET', `/dms/cases?officeId=${OFF}`, U.b)).json.rows.some(
        (r: Row) => r.id === caseId,
      ),
    ).toBe(false);
    expect((await api('GET', `/dms/cases/${caseId}/documents`, U.b)).json.rows).toEqual([]);
    expect(
      (await api('POST', `/dms/cases/${caseId}/documents`, U.b, { kind: 'N', title: 't' })).status,
    ).toBe(404);
    expect((await upload(`/dms/documents/${docId}/files?label=x`, U.b, PDF)).status).toBe(404);
    const dl = await fetch(`${base}/dms/files/${fileId}/download`, {
      headers: { 'x-synthetic-user': U.b, 'x-synthetic-tenant': T },
    });
    expect(dl.status).toBe(404);
  });

  it('kiểm tra đầu vào: miền lạ, thân thừa trường, thiếu officeId', async () => {
    expect(
      (await api('POST', '/dms/cases', U.a, { officeId: OFF, domain: 'khac', title: 'x' })).status,
    ).toBe(400);
    expect(
      (
        await api('POST', '/dms/cases', U.a, {
          officeId: OFF,
          domain: 'vibang',
          title: 'x',
          createdBy: U.b,
        })
      ).status,
    ).toBe(400);
    expect((await api('GET', '/dms/cases', U.a)).status).toBe(400);
  });

  it('đổi quyền qua HTTP: đề xuất → không tự duyệt → người khác duyệt → có hiệu lực ngay', async () => {
    const groups = await api('GET', `/dms/groups?officeId=${OFF}`, U.approver1);
    expect(groups.status).toBe(200);
    const thvGroup = groups.json.rows.find((g: Row) => g.name === 'THV tạo').id as string;
    expect((await api('GET', `/dms/groups?officeId=${OFF}`, U.a)).json.rows).toEqual([]);

    const p = await api('POST', `/dms/groups/${thvGroup}/requests`, U.approver1, {
      kind: 'GRANT',
      permission: 'tongdat.read.own',
      reason: 'cần đọc tống đạt',
    });
    expect(p.status).toBe(201);
    const reqId = p.json.label as string;
    const self = await api('POST', `/dms/permission-requests/${reqId}/review`, U.approver1, {
      approve: true,
    });
    expect(self.status).toBe(403);
    expect(self.json.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
    expect(
      (await api('GET', `/dms/me/permissions?officeId=${OFF}`, U.a)).json.permissions,
    ).not.toContain('tongdat.read.own');

    expect(
      (
        await api('POST', `/dms/permission-requests/${reqId}/review`, U.approver2, {
          approve: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('GET', `/dms/me/permissions?officeId=${OFF}`, U.a)).json.permissions,
    ).toContain('tongdat.read.own');
    const pending = await api(
      'GET',
      `/dms/permission-requests?officeId=${OFF}&status=APPROVED`,
      U.approver2,
    );
    expect(pending.json.rows.some((r: Row) => r.id === reqId)).toBe(true);
    // Không có endpoint ghi quyền trực tiếp.
    expect(
      (
        await api('PUT', `/dms/groups/${thvGroup}/permissions`, U.approver1, {
          permissions: ['vibang.read.all'],
        })
      ).status,
    ).toBe(404);
    // Người thường không đề xuất/duyệt.
    expect(
      (
        await api('POST', `/dms/groups/${thvGroup}/requests`, U.a, {
          kind: 'GRANT',
          permission: 'vibang.read.all',
          reason: 'x',
        })
      ).status,
    ).toBe(404);
  });
});
