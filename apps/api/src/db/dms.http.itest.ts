import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
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
  const U = { a: id(), b: id(), approver1: id(), approver2: id(), proposer: id(), none: id() };

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
    const own = ['read', 'draft', 'confirm', 'add_document', 'download', 'amend_request'].map(
      (x) => `vibang.${x}.own`,
    );
    await mk('THV tạo', own, [U.a, U.b]);
    await mk('Đọc hồ sơ', ['vibang.read.all'], [U.approver1, U.approver2]);
    await mk('Người đề xuất', ['dms.permission.propose'], [U.proposer]);
    await mk(
      'Quản trị phân quyền',
      ['dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve'],
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
    const one = await api('GET', `/dms/cases/${caseId}`, U.a);
    expect(one.status).toBe(200);
    expect(one.json).toMatchObject({
      id: caseId,
      status: 'RECORDED',
      title: 'Vi bằng thử 2',
      document_count: 1,
      scan_count: 1,
    });
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

  it('xuất sổ: STT cấp lúc ghi sổ, JSON và CSV đúng mẫu, người khác không thấy', async () => {
    const spec = await api('GET', '/dms/books', U.a);
    expect(spec.json.books.map((b: Json) => b.code)).toEqual(['S-01', 'S-02', 'S-04', 'S-05']);
    const caseId = (
      await api('POST', '/dms/cases', U.a, {
        officeId: OFF,
        domain: 'vibang',
        title: 'Xác minh thử',
        attributes: { nguoi_yeu_cau: 'Nguyễn Văn G', ghi_chu: '=1+1' },
      })
    ).json.label as string;
    const year = new Date().getFullYear();
    const before = await api('GET', `/dms/books/S-02?officeId=${OFF}&year=${year}`, U.a);
    expect(before.status).toBe(200);
    expect(before.json.rows.some((r: Row) => r.case_id === caseId)).toBe(false);
    expect((await api('POST', `/dms/cases/${caseId}/record`, U.a)).status).toBe(200);
    const after = await api('GET', `/dms/books/S-02?officeId=${OFF}&year=${year}`, U.a);
    const docs = await api('GET', `/dms/cases/${caseId}/documents`, U.a);
    expect(docs.json.rows).toEqual([]);
    const mine = after.json.rows.find((r: Row) => r.case_id === caseId);
    expect(mine.stt).toBeGreaterThanOrEqual(1);
    const csv = await fetch(`${base}/dms/books/S-02?officeId=${OFF}&year=${year}&format=csv`, {
      headers: { 'x-synthetic-user': U.a, 'x-synthetic-tenant': T },
    });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const text = await csv.text();
    expect(text).toContain('NGƯỜI YÊU CẦU LẬP VI BẰNG');
    expect(text).toContain('Nguyễn Văn G');
    expect(text).toContain("'=1+1");
    const pdf = await fetch(`${base}/dms/books/S-02?officeId=${OFF}&year=${year}&format=pdf`, {
      headers: { 'x-synthetic-user': U.a, 'x-synthetic-tenant': T },
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect(pdf.headers.get('content-disposition')).toContain('TP-THV-S-02');
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    expect(
      (await api('GET', `/dms/books/S-02?officeId=${OFF}&year=${year}`, U.b)).json.rows,
    ).toEqual([]);
    expect((await api('GET', `/dms/books/S-03?officeId=${OFF}&year=${year}`, U.a)).status).toBe(
      400,
    );
    expect((await api('GET', `/dms/books/S-02?officeId=${OFF}`, U.a)).status).toBe(400);
  });

  it('THV được ghi tên phải tự xác nhận qua HTTP trước khi hồ sơ ghi sổ', async () => {
    const caseId = (
      await api('POST', '/dms/cases', U.a, {
        officeId: OFF,
        domain: 'vibang',
        title: 'Cần THV xác nhận',
      })
    ).json.label as string;
    expect((await api('PUT', `/dms/cases/${caseId}/thv`, U.a, { thvUserId: U.b })).status).toBe(
      200,
    );
    expect(
      (await api('PUT', `/dms/cases/${caseId}/thv`, U.a, { thvUserId: 'không phải uuid' })).status,
    ).toBe(400);
    const blocked = await api('POST', `/dms/cases/${caseId}/record`, U.a);
    expect(blocked.status).toBe(409);
    expect(blocked.json.code).toBe('THV_CONFIRMATION_REQUIRED');
    const pending = await api('GET', '/dms/thv/pending', U.b);
    expect(pending.json.rows.map((r: Row) => r.case_id)).toContain(caseId);
    expect((await api('GET', `/dms/thv/cases/${caseId}`, U.b)).json.title).toBe('Cần THV xác nhận');
    expect((await api('GET', `/dms/thv/cases/${caseId}`, U.a)).status).toBe(404);
    expect((await api('POST', `/dms/thv/cases/${caseId}/confirm`, U.a)).status).toBe(404);
    expect((await api('POST', `/dms/thv/cases/${caseId}/confirm`, U.b)).status).toBe(200);
    expect((await api('POST', `/dms/cases/${caseId}/record`, U.a)).status).toBe(200);
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
    expect((await api('GET', `/dms/cases/${caseId}`, U.b)).status).toBe(404);
    expect((await api('GET', `/dms/cases/${id()}`, U.a)).status).toBe(404);
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

    const p = await api('POST', `/dms/groups/${thvGroup}/requests`, U.proposer, {
      kind: 'GRANT',
      permission: 'tongdat.read.own',
      reason: 'cần đọc tống đạt',
    });
    expect(p.status).toBe(201);
    const reqId = p.json.label as string;
    // Người đề xuất không có quyền duyệt nên không tự duyệt được (không thấy yêu cầu để duyệt).
    expect(
      (
        await api('POST', `/dms/permission-requests/${reqId}/review`, U.proposer, {
          approve: true,
        })
      ).status,
    ).toBe(404);
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
    // Admin đề xuất thì có hiệu lực ngay, không cần ai duyệt (thu hồi khẩn cấp).
    const urgent = await api('POST', `/dms/groups/${thvGroup}/requests`, U.approver1, {
      kind: 'REVOKE',
      permission: 'tongdat.read.own',
      reason: 'thu hồi khẩn cấp',
    });
    expect(urgent.status).toBe(201);
    expect(urgent.json.code).toBe('REQUEST_APPLIED');
    expect(
      (await api('GET', `/dms/me/permissions?officeId=${OFF}`, U.a)).json.permissions,
    ).not.toContain('tongdat.read.own');
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

  it('sửa đổi hồ sơ đã ghi sổ qua HTTP: bắt buộc lý do và scan, chờ duyệt, Admin duyệt thì áp dụng', async () => {
    // Cấu hình cửa sổ tự duyệt đã gỡ: không còn đường nào.
    expect((await api('GET', `/dms/amendment-window?officeId=${OFF}`, U.a)).status).toBe(404);
    const c = (
      await api('POST', '/dms/cases', U.a, {
        officeId: OFF,
        domain: 'vibang',
        title: 'Vi bằng sửa đổi',
        attributes: { ghi_chu: 'gốc' },
      })
    ).json.label as string;
    expect((await api('POST', `/dms/cases/${c}/record`, U.a)).status).toBe(200);
    const changes = encodeURIComponent(JSON.stringify({ attributes: { ghi_chu: 'đã sửa' } }));
    const path = (reason: string) =>
      `/dms/cases/${c}/amendments?reason=${encodeURIComponent(reason)}&changes=${changes}`;
    expect(
      (await upload(path('Văn bản sửa đổi 01'), U.a, Buffer.from('không phải pdf'))).status,
    ).toBe(422);
    const sent = await upload(path('Văn bản sửa đổi 01'), U.a, PDF);
    expect(sent.status).toBe(200);
    expect(sent.json.code).toBe('AMENDMENT_PENDING');
    const amendId = sent.json.label as string;
    expect((await api('GET', `/dms/cases/${c}`, U.a)).json.attributes.ghi_chu).toBe('gốc');

    expect((await api('GET', `/dms/amendments?officeId=${OFF}`, U.a)).json.rows).toHaveLength(1);
    expect((await api('GET', `/dms/amendments?officeId=${OFF}`, U.b)).json.rows).toHaveLength(0);
    expect(
      (await api('GET', `/dms/amendments?officeId=${OFF}&status=PENDING`, U.approver1)).json.rows,
    ).toHaveLength(1);
    expect(
      (await api('POST', `/dms/amendments/${amendId}/review`, U.a, { approve: true })).status,
    ).toBe(403);
    expect(
      (await api('POST', `/dms/amendments/${amendId}/review`, U.approver1, { approve: true }))
        .status,
    ).toBe(200);
    expect((await api('GET', `/dms/cases/${c}`, U.a)).json.attributes.ghi_chu).toBe('đã sửa');
    const ev = await fetch(`${base}/dms/amendments/${amendId}/evidence`, {
      headers: { 'x-synthetic-user': U.approver2, 'x-synthetic-tenant': T },
    });
    expect(ev.status).toBe(200);
    expect(Buffer.from(await ev.arrayBuffer())).toEqual(PDF);
    expect(
      (
        await fetch(`${base}/dms/amendments/${amendId}/evidence`, {
          headers: { 'x-synthetic-user': U.b, 'x-synthetic-tenant': T },
        })
      ).status,
    ).toBe(404);
  });

  it('thêm phiên bản tệp mới qua HTTP: tải bước đệm, gửi kèm scan sửa đổi, Admin duyệt, v2 tải về', async () => {
    const c = (
      await api('POST', '/dms/cases', U.a, { officeId: OFF, domain: 'vibang', title: 'Có tệp' })
    ).json.label as string;
    const docId = (
      await api('POST', `/dms/cases/${c}/documents`, U.a, {
        kind: 'Vi bằng',
        title: 'Bản chính',
        isOfficial: true,
      })
    ).json.label as string;
    const fileId = (await upload(`/dms/documents/${docId}/files?label=scan&isScan=true`, U.a, PDF))
      .json.label as string;
    expect((await api('POST', `/dms/cases/${c}/record`, U.a)).status).toBe(200);
    const NEWPDF = Buffer.from('%PDF-1.4\n% phiên bản 2\n');
    const staged = await upload('/dms/uploads', U.a, NEWPDF);
    expect(staged.status).toBe(200);
    const stagedId = staged.json.label as string;
    const q = `fileId=${fileId}&documentId=${docId}&stagedId=${stagedId}&reason=${encodeURIComponent('Quét lại rõ hơn')}`;
    // Người khác không dùng được tệp bước đệm của mình.
    expect((await upload(`/dms/cases/${c}/amendments?${q}`, U.b, PDF)).status).toBe(404);
    const sent = await upload(`/dms/cases/${c}/amendments?${q}`, U.a, PDF);
    expect(sent.json.code).toBe('AMENDMENT_PENDING');
    // Dùng lại bước đệm sau khi gửi thì bị chặn.
    expect((await upload(`/dms/cases/${c}/amendments?${q}`, U.a, PDF)).status).toBe(409);
    expect(
      (
        await api('POST', `/dms/amendments/${sent.json.label}/review`, U.approver1, {
          approve: true,
        })
      ).status,
    ).toBe(200);
    const files = await api('GET', `/dms/documents/${docId}/files`, U.a);
    expect(files.json.rows.map((r: Row) => r.version)).toEqual([1, 2]);
    const dl = await fetch(`${base}/dms/files/${fileId}/download`, {
      headers: { 'x-synthetic-user': U.a, 'x-synthetic-tenant': T },
    });
    expect(Buffer.from(await dl.arrayBuffer())).toEqual(NEWPDF);
  });
  // Chạy cuối: thêm chi nhánh vào văn phòng làm thay đổi cách tạo hồ sơ của mọi test phía sau.
  it('phạm vi chi nhánh qua HTTP: cấp, chọn khi tạo, thu hồi; người không có quyền duyệt bị chặn', async () => {
    const branchA = id();
    const branchB = id();
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$3,$4,'CN A'),($2,$3,$4,'CN B')`,
      [branchA, branchB, T, OFF],
    );
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'THANH_VIEN')`,
      [T, U.a, OFF],
    );
    const grant = (user: string, branch: string, granted: boolean, actor = U.approver1) =>
      api('POST', '/dms/branch-access', actor, {
        officeId: OFF,
        userId: user,
        branchId: branch,
        granted,
        reason: 'phân công',
      });

    expect(
      (await api('POST', '/dms/cases', U.a, { officeId: OFF, domain: 'vibang', title: 'X' }))
        .status,
    ).toBe(403);
    expect((await grant(U.a, branchA, true, U.a)).status).toBe(403);
    expect((await grant(U.a, branchA, true)).json.code).toBe('BRANCH_ACCESS_GRANTED');
    expect((await grant(U.a, branchB, true)).status).toBe(200);

    const mine = await api('GET', `/dms/me/branches?officeId=${OFF}`, U.a);
    expect(mine.json.rows.map((r: Row) => r.name)).toEqual(['CN A', 'CN B']);
    const list = await api('GET', `/dms/branch-access?officeId=${OFF}`, U.approver1);
    expect(list.json.rows.filter((r: Json) => r.userId === U.a)).toHaveLength(2);
    expect((await api('GET', `/dms/branch-access?officeId=${OFF}`, U.a)).json.rows).toEqual([]);

    const need = await api('POST', '/dms/cases', U.a, {
      officeId: OFF,
      domain: 'vibang',
      title: 'X',
    });
    expect(need.status).toBe(422);
    expect(need.json.code).toBe('BRANCH_REQUIRED');
    const made = await api('POST', '/dms/cases', U.a, {
      officeId: OFF,
      domain: 'vibang',
      title: 'Y',
      branchId: branchB,
    });
    expect(made.json.code).toBe('CASE_DRAFT_CREATED');
    expect((await api('GET', `/dms/cases/${made.json.label}`, U.a)).status).toBe(200);

    expect((await grant(U.a, branchB, false)).json.code).toBe('BRANCH_ACCESS_REVOKED');
    // Chi nhánh B đã thu hồi: nháp của chính mình ở chi nhánh B cũng không còn thấy được.
    expect((await api('GET', `/dms/cases/${made.json.label}`, U.a)).status).toBe(404);
  });

  it('hồ sơ chưa có chi nhánh qua HTTP: chỉ Admin thấy và gắn được; người khác nhận rỗng / 403', async () => {
    const legacy = (
      await owner.query(
        `INSERT INTO dms_case_files (tenant_id, office_id, domain, title, created_by, status, recorded_by, recorded_at)
         VALUES ($1,$2,'vibang','Hồ sơ cũ không chi nhánh',$3,'RECORDED',$3,now()) RETURNING id`,
        [T, OFF, U.approver1],
      )
    ).rows[0].id as string;
    const asAdmin = await api('GET', `/dms/cases-without-branch?officeId=${OFF}`, U.approver1);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.json.total).toBeGreaterThanOrEqual(1);
    expect((asAdmin.json.rows as Row[]).map((r) => r.id)).toContain(legacy);
    const asOther = await api('GET', `/dms/cases-without-branch?officeId=${OFF}`, U.a);
    expect(asOther.json).toEqual({ total: 0, rows: [] });
    const body = {
      officeId: OFF,
      caseIds: [legacy],
      branchId: (await api('GET', `/dms/me/branches?officeId=${OFF}`, U.approver1)).json.rows[0].id,
    };
    expect((await api('POST', '/dms/cases-without-branch/assign', U.a, body)).status).toBe(403);
    const done = await api('POST', '/dms/cases-without-branch/assign', U.approver1, body);
    expect(done.status).toBe(200);
    expect(done.json.code).toBe('BRANCH_ASSIGNED');
    expect((await api('POST', '/dms/cases-without-branch/assign', U.approver1, body)).status).toBe(
      422,
    );
  });

  it('xuất bản sao nhật ký phân quyền: quyền riêng, bị từ chối cũng ghi, xuất xong có dòng nhật ký', async () => {
    const exporter = id();
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
      exporter,
      T,
      exporter,
    ]);
    const fetchXlsx = (user: string) =>
      fetch(`${base}/dms/permission-log/export?officeId=${OFF}`, {
        headers: { 'x-synthetic-user': user, 'x-synthetic-tenant': T },
      });
    // Không có quyền riêng (kể cả người duyệt phân quyền): 403 và có dòng từ chối
    const denied = await fetchXlsx(U.approver1);
    expect(denied.status).toBe(403);
    const deniedRows = await owner.query(
      `SELECT outcome FROM audit_log WHERE tenant_id = $1 AND action = 'dms.audit.export' ORDER BY id DESC LIMIT 1`,
      [T],
    );
    expect(deniedRows.rows[0].outcome).toBe('deny');
    // Cấp quyền riêng cho một nhóm rồi xuất
    const g = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Xuất nhật ký') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id;
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.audit.export')`,
      [T, g],
    );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, g, exporter],
    );
    const ok = await fetchXlsx(exporter);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('spreadsheetml');
    const bytes = Buffer.from(await ok.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0]!;
    expect(String(ws.getRow(3).getCell(1).value)).toBe('Mã yêu cầu');
    expect(ws.rowCount).toBeGreaterThan(3); // có dòng dữ liệu từ các test trước
    // Việc xuất được ghi lại: ai, bao nhiêu dòng
    const logged = await owner.query(
      `SELECT actor_id, detail FROM dms_audit_records WHERE tenant_id = $1 AND action = 'dms.audit.export'`,
      [T],
    );
    expect(logged.rows).toHaveLength(1);
    expect(logged.rows[0].actor_id).toBe(exporter);
    expect(logged.rows[0].detail.rows).toBe(ws.rowCount - 3);
    // Quyền riêng này không được sao chép sang nhóm mới
    const copy = await api('POST', `/dms/groups/${g}/copy`, U.approver1, {
      name: 'Bản sao xuất nhật ký',
    });
    expect(copy.status).toBe(200);
    const perms = await owner.query(
      `SELECT permission FROM dms_group_permissions WHERE group_id = (SELECT id FROM dms_permission_groups WHERE name = 'Bản sao xuất nhật ký' AND tenant_id = $1)`,
      [T],
    );
    expect(perms.rows).toEqual([]);
    // Danh mục quyền hiệu lực của người xuất có mã mới
    const mine = await api('GET', `/dms/me/permissions?officeId=${OFF}`, exporter);
    expect(mine.json.permissions).toContain('dms.audit.export');
  });
});
