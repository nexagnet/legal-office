import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_cn_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Correspondence: auto outgoing number and case linking (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-cn-'));
    const store = new LocalFileStore(storeDir);
    const T = id();
    const T2 = id();
    const OFF = id();
    const BR1 = id();
    const BR2 = id();
    const U = {
      admin: id(),
      head: id(),
      secretary: id(),
      clerk1: id(),
      clerk2: id(),
      acc1: id(),
      thvA: id(),
      thvB: id(),
      outsider: id(),
      otherTenantAdmin: id(),
    };

    const api = async (
      method: string,
      path: string,
      user: string | null,
      body?: unknown,
      tenant = T,
    ) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (user) {
        headers['x-synthetic-user'] = user;
        headers['x-synthetic-tenant'] = tenant;
      }
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const t = await res.text();
      return { status: res.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : {} };
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
      appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 6 });
      server = await NestFactory.create(
        AppModule.register({
          pool: appPool,
          resolver: new SyntheticHeaderResolver(),
          fileStore: store,
        }),
        { logger: false },
      );
      await server.listen(0);
      base = (await server.getUrl()).replace('[::1]', 'localhost');

      await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
      await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [
        OFF,
        T,
      ]);
      await owner.query(
        `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
        [BR1, T, OFF, BR2],
      );
      const people: [string, string, string | null][] = [
        [U.admin, 'ADMIN', null],
        [U.head, 'TRUONG_VP', null],
        [U.secretary, 'THU_KY', null],
        [U.clerk1, 'VAN_THU', BR1],
        [U.clerk2, 'VAN_THU', BR2],
        [U.acc1, 'KE_TOAN', BR1],
        [U.thvA, 'THV', null],
        [U.thvB, 'THV', null],
      ];
      for (const [uid, role, branch] of people) {
        await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
          uid,
          T,
          role,
        ]);
        const m = await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
          [T, uid, OFF, role],
        );
        if (branch) {
          await owner.query(
            `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
            [T, m.rows[0].id, branch],
          );
        }
      }
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'out')`, [
        U.outsider,
        T,
      ]);
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'a2')`, [
        U.otherTenantAdmin,
        T2,
      ]);
    });

    afterAll(async () => {
      await server?.close();
      await owner?.end();
      rmSync(storeDir, { recursive: true, force: true });
      await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
      await admin.end();
    });

    const OF = '/office/correspondence';
    const hex = 'a'.repeat(64);
    const draft = async () =>
      (
        await api('POST', OF, U.clerk1, {
          officeId: OFF,
          branchId: BR1,
          direction: 'OUTBOUND',
          docType: 'Công văn',
          counterparty: 'Sở Tư pháp',
          subject: 'Trả lời ' + Math.random(),
        })
      ).json.label as string;
    const approved = async () => {
      const c = await draft();
      expect(
        (
          await api('POST', `${OF}/${c}/attachments`, U.clerk1, {
            role: 'FINAL_DOCUMENT',
            evidenceKey: 'of/final.pdf',
            evidenceSha256: hex,
          })
        ).status,
      ).toBe(200);
      expect((await api('POST', `${OF}/${c}/submission`, U.clerk1, {})).status).toBe(200);
      expect((await api('POST', `${OF}/${c}/approval`, U.head, {})).status).toBe(200);
      return c;
    };
    const issue = (c: string, body: Record<string, unknown>) =>
      api('POST', `${OF}/${c}/issuance`, U.head, {
        issuedOn: '2026-10-16',
        sendMethod: 'Bưu điện',
        proofKey: 'of/proof.png',
        proofSha256: hex,
        ...body,
      });

    it('allocates <seq>/<year>/CV-THV on issue when no number is typed, keeps typed numbers, rejects blank', async () => {
      await owner.query(
        `UPDATE memberships SET legal_signer = true WHERE tenant_id = $1 AND user_id = $2`,
        [T, U.head],
      );
      const a = await approved();
      const b = await approved();
      const c = await approved();
      const first = await issue(a, {});
      expect(first.status).toBe(200);
      expect(first.json.label).toBe('1/2026/CV-THV');
      expect((await issue(b, {})).json.label).toBe('2/2026/CV-THV');
      expect((await issue(c, { refNo: '  ' })).status).toBeGreaterThanOrEqual(400);
      const typed = await issue(c, { refNo: '12/CV-VP' });
      expect(typed.status).toBe(200);
      expect(typed.json.label).toBe('12/CV-VP');
      // Năm khác bắt đầu lại từ 1
      const d = await approved();
      expect((await issue(d, { issuedOn: '2027-01-05' })).json.label).toBe('1/2027/CV-THV');
      const detail = await api('GET', `${OF}/${a}`, U.admin);
      expect(detail.json).toMatchObject({ refNo: '1/2026/CV-THV', status: 'ISSUED' });
    });

    it('links, changes and unlinks a case until the correspondence is final', async () => {
      const cust = id();
      await owner.query(
        `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c')`,
        [cust, T],
      );
      const vb = id();
      await owner.query(
        `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'Hồ sơ liên quan')`,
        [vb, T, OFF, BR1, cust],
      );
      const c = await draft();
      const link = (user: string, body: Record<string, unknown>) =>
        api('POST', `${OF}/${c}/link`, user, body);
      expect((await link(U.clerk1, { caseKind: 'VIBANG', caseId: vb })).status).toBe(200);
      expect((await api('GET', `${OF}/${c}`, U.admin)).json).toMatchObject({
        caseKind: 'VIBANG',
        caseId: vb,
      });
      expect(
        (await link(U.clerk1, { caseKind: 'VIBANG', caseId: id() })).status,
      ).toBeGreaterThanOrEqual(400);
      expect((await link(U.clerk1, { caseKind: 'VIBANG' })).status).toBeGreaterThanOrEqual(400);
      expect(
        (await link(U.acc1, { caseKind: 'VIBANG', caseId: vb })).status,
      ).toBeGreaterThanOrEqual(400);
      expect((await link(U.outsider, {})).status).toBeGreaterThanOrEqual(400);
      expect((await link(U.clerk1, {})).status).toBe(200);
      expect((await api('GET', `${OF}/${c}`, U.admin)).json).toMatchObject({
        caseKind: null,
        caseId: null,
      });
      // Công văn đã ban hành thì không đổi được
      const done = await approved();
      expect((await issue(done, {})).status).toBe(200);
      expect(
        (await api('POST', `${OF}/${done}/link`, U.clerk1, { caseKind: 'VIBANG', caseId: vb }))
          .status,
      ).toBeGreaterThanOrEqual(400);
    });
  },
);
