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
import { LocalFileStore, type FileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_ug_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

type Legal = Record<string, Record<string, unknown>>;

describe.skipIf(!ADMIN_URL)(
  'UI gaps: customer numbers, place, legal info, history, branch activity (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-files-'));
    const store: FileStore = new LocalFileStore(storeDir);
    const id = () => randomUUID();
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
          `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [T, uid, OFF, role, role === 'ADMIN'],
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

    const customer = async () =>
      (
        await api('POST', '/vibang/customers', U.clerk1, {
          kind: 'PERSON',
          externalRef: 'KH-giả-lập',
        })
      ).json.label as string;
    const newCase = async () => {
      const r = await api('POST', '/vibang/cases', U.clerk1, {
        officeId: OFF,
        branchId: BR1,
        customerId: await customer(),
        title: 'Hồ sơ giả lập',
      });
      const c = r.json.label as string;
      await api('PUT', `/vibang/cases/${c}/responsible-thv`, U.admin, { thvUserId: U.thvA });
      return c;
    };
    const force = async (c: string, status: string) => {
      const client = await owner.connect();
      try {
        await client.query(`SET session_replication_role = replica`);
        await client.query(`UPDATE vibang_cases SET status = $2 WHERE id = $1`, [c, status]);
      } finally {
        await client.query(`RESET session_replication_role`);
        client.release();
      }
    };

    const number = async (c: string, seq: number, by: string) => {
      const label = `${seq}/2026/VB`;
      await owner.query(
        `INSERT INTO vibang_numbers (tenant_id, office_id, case_id, year, seq, label, allocated_by) VALUES ($1,$2,$3,2026,$4,$5,$6)`,
        [T, OFF, c, seq, label, by],
      );
      return label;
    };

    it('lists the vi bang numbers of a customer for intake roles only, within case visibility', async () => {
      const cust = await customer();
      const mk = async (branch: string, title: string) =>
        (
          await api('POST', '/vibang/cases', U.clerk1, {
            officeId: OFF,
            branchId: branch,
            customerId: cust,
            title,
          })
        ).json.label as string;
      const c1 = await mk(BR1, 'KH A việc 1');
      const label = await number(c1, 901, U.admin);
      await api('POST', '/vibang/cases', U.clerk1, {
        officeId: OFF,
        branchId: BR1,
        customerId: cust,
        title: 'Chưa có số',
      });
      const r = await api('GET', `/vibang/customers/${cust}/numbers`, U.clerk1);
      expect(r.status).toBe(200);
      expect(r.json.total).toBe(1);
      expect((r.json.items as Record<string, unknown>[])[0]).toMatchObject({
        caseId: c1,
        numberLabel: label,
        branchName: 'CN1',
      });
      expect((await api('GET', `/vibang/customers/${cust}/numbers`, U.admin)).json.total).toBe(1);
      // Văn thư chi nhánh khác không thấy hồ sơ nên danh sách rỗng; kế toán/THV không thuộc vai tiếp nhận
      expect((await api('GET', `/vibang/customers/${cust}/numbers`, U.clerk2)).json.total).toBe(0);
      expect((await api('GET', `/vibang/customers/${cust}/numbers`, U.acc1)).json.total).toBe(0);
      expect((await api('GET', `/vibang/customers/${cust}/numbers`, null)).status).toBe(401);
    });

    it('sets the place of a vi bang, feeds S-02 column 5, and refuses final cases and other branches', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/place`;
      expect((await api('POST', url, U.clerk2, { placeAddress: 'x' })).status).toBe(403);
      expect((await api('POST', url, U.acc1, { placeAddress: 'x' })).status).toBe(403);
      expect((await api('POST', url, U.clerk1, { placeAddress: 'Phường A, Hà Nội' })).status).toBe(
        200,
      );
      expect(
        ((await api('GET', `/vibang/cases/${c}/legal`, U.clerk1)).json as Record<string, unknown>)
          .placeAddress,
      ).toBe('Phường A, Hà Nội');
      const label = await number(c, 902, U.admin);
      const led = await api('GET', `/office/ledgers/S-02?officeId=${OFF}&year=2026`, U.admin);
      const rows = (led.json.rows ?? led.json.items ?? []) as Record<string, unknown>[];
      expect(rows.find((r) => r.vibangLabel === label || r.vibang_label === label)).toMatchObject({
        diaChiNoiLap: 'Phường A, Hà Nội',
      });
      expect((await api('POST', url, U.clerk1, { placeAddress: '' })).status).toBe(200);
      const done = await newCase();
      await force(done, 'RETURNED');
      const fin = await api('POST', `/vibang/cases/${done}/place`, U.clerk1, { placeAddress: 'x' });
      expect(fin.json.code).toBe('CASE_FINAL');
      expect(fin.status).toBe(409);
      const long = await api('POST', url, U.clerk1, { placeAddress: 'a'.repeat(501) });
      expect(long.status).toBe(400);
    });

    it('returns the legal tab with PII only for intake roles and 404 outside case visibility', async () => {
      const cust = await customer();
      await owner.query(
        `UPDATE customers SET display_name = 'Lê Giả Lập', id_number = '111111111111', address = 'Số 1, Hà Nội' WHERE id = $1`,
        [cust],
      );
      const ct = await owner.query(
        `INSERT INTO contracts (tenant_id, customer_id, external_ref, service_kind, signed_on) VALUES ($1,$2,'HD-GL-01','VI_BANG','2026-01-02') RETURNING id`,
        [T, cust],
      );
      const c = (
        await api('POST', '/vibang/cases', U.clerk1, {
          officeId: OFF,
          branchId: BR1,
          customerId: cust,
          contractId: ct.rows[0].id,
          title: 'Hồ sơ pháp lý',
        })
      ).json.label as string;
      await number(c, 903, U.admin);
      const own = (await api('GET', `/vibang/cases/${c}/legal`, U.clerk1)).json as Legal;
      expect(own.contract).toMatchObject({
        ref: 'HD-GL-01',
        serviceKind: 'VI_BANG',
        signedOn: '2026-01-02',
      });
      expect(own.customer).toMatchObject({ name: 'Lê Giả Lập', idNumber: '111111111111' });
      expect(own.number!.label).toBe('903/2026/VB');
      const acc = (await api('GET', `/vibang/cases/${c}/legal`, U.acc1)).json as Legal;
      expect(acc.customer!.name).toBeNull();
      expect(acc.customer!.idNumber).toBeNull();
      expect(acc.contract!.ref).toBe('HD-GL-01');
      expect((await api('GET', `/vibang/cases/${c}/legal`, U.clerk2)).status).toBe(404);
      expect(
        (await api('GET', `/vibang/cases/${c}/legal`, U.otherTenantAdmin, undefined, T2)).status,
      ).toBe(404);
    });

    it('returns a case history from the business tables, newest first, within case visibility', async () => {
      const c = await newCase();
      await number(c, 904, U.admin);
      await api('POST', `/vibang/cases/${c}/contacts`, U.clerk1, {
        kind: 'REMINDER',
        outcome: 'REMINDED',
      });
      const r = await api('GET', `/vibang/cases/${c}/history`, U.clerk1);
      expect(r.status).toBe(200);
      const items = r.json.items as {
        at: string;
        kind: string;
        actorLabel: string | null;
        detail: string | null;
      }[];
      const kinds = items.map((i) => i.kind);
      expect(kinds).toEqual(
        expect.arrayContaining(['CASE_CREATED', 'THV_ASSIGNED', 'NUMBER_ALLOCATED']),
      );
      expect(items.find((i) => i.kind === 'CASE_CREATED')?.actorLabel).toBe('VAN_THU');
      expect(items.find((i) => i.kind === 'NUMBER_ALLOCATED')?.detail).toBe('904/2026/VB');
      const times = items.map((i) => Date.parse(i.at));
      expect([...times].sort((x, y) => y - x)).toEqual(times);
      expect((await api('GET', `/vibang/cases/${c}/history`, U.clerk2)).status).toBe(404);
      expect((await api('GET', `/vibang/cases/${c}/history`, null)).status).toBe(401);
    });

    it('reports activity per branch with zero rows kept and the same read scope', async () => {
      const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      const q = (user: string | null) =>
        api(
          'GET',
          `/office/branches/activity?officeId=${OFF}&from=2020-01-01&to=${tomorrow}`,
          user,
        );
      const all = (await q(U.admin)).json as unknown as {
        branchName: string;
        vibangCases: number;
        vibangNumbers: number;
        lastActivityAt: string | null;
      }[];
      const cn1 = all.find((r) => r.branchName === 'CN1');
      const cn2 = all.find((r) => r.branchName === 'CN2');
      expect(cn1!.vibangCases).toBeGreaterThan(0);
      expect(cn1!.vibangNumbers).toBeGreaterThan(0);
      expect(cn1!.lastActivityAt).not.toBeNull();
      expect(cn2).toMatchObject({ vibangCases: 0, lastActivityAt: null });
      const clerk2 = (await q(U.clerk2)).json as unknown as { branchName: string }[];
      expect(clerk2.map((r) => r.branchName)).toEqual(['CN2']);
      expect(
        (
          await api(
            'GET',
            `/office/branches/activity?officeId=${OFF}&from=bad&to=${tomorrow}`,
            U.admin,
          )
        ).status,
      ).toBe(400);
      expect((await q(null)).status).toBe(401);
    });
  },
);
