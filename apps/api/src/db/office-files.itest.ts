import { createHash, randomUUID } from 'node:crypto';
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
const DB = `lo_corr_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Correspondence attachments and issuance with proof (HTTP + file store + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-td-'));
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

    const PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from('công văn giả lập'),
    ]);
    const OF = '/office/correspondence';
    const upload = async (path: string, user: string, body: Buffer, type = 'image/png') => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': type, 'x-synthetic-user': user, 'x-synthetic-tenant': T },
        body,
      });
      const t = await res.text();
      return { status: res.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : {} };
    };
    const q = (o: Record<string, string>) => '?' + new URLSearchParams(o).toString();
    const countFiles = () => {
      let n = 0;
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(d, e.name));
          else n += 1;
        }
      };
      walk(storeDir);
      return n;
    };
    const draft = async () =>
      (
        await api('POST', OF, U.clerk1, {
          officeId: OFF,
          branchId: BR1,
          direction: 'OUTBOUND',
          docType: 'Công văn',
          counterparty: 'Cơ quan giả lập',
          subject: 'Trích yếu giả lập',
        })
      ).json.label as string;

    it('runs the outbound flow with a final document and a proof file', async () => {
      await owner.query(`UPDATE memberships SET legal_signer = true WHERE user_id = $1`, [U.admin]);
      const c = await draft();
      expect(
        (await upload(`${OF}/${c}/attachment-files${q({ role: 'FINAL_DOCUMENT' })}`, U.clerk1, PNG))
          .status,
      ).toBe(200);
      expect((await api('POST', `${OF}/${c}/submission`, U.clerk1)).status).toBe(200);
      expect((await api('POST', `${OF}/${c}/approval`, U.admin)).status).toBe(200);
      const issue = q({ refNo: '12/CV-VP', issuedOn: '2026-10-13', sendMethod: 'Bưu điện' });
      expect((await upload(`${OF}/${c}/issuance-file${issue}`, U.admin, PNG)).status).toBe(200);
      const row = (
        await owner.query(
          `SELECT status, ref_no, send_method FROM of_correspondence WHERE id = $1`,
          [c],
        )
      ).rows[0];
      expect(row).toMatchObject({ status: 'ISSUED', ref_no: '12/CV-VP', send_method: 'Bưu điện' });
      const att = (
        await owner.query(
          `SELECT role, evidence_key, evidence_sha256 FROM of_attachments WHERE correspondence_id = $1 ORDER BY role`,
          [c],
        )
      ).rows;
      expect(att.map((a) => a.role)).toEqual(['FINAL_DOCUMENT', 'SEND_PROOF']);
      for (const a of att) {
        expect(a.evidence_sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
        expect(await store.get(a.evidence_key)).toEqual(PNG);
      }
    });

    it('refuses without leaving files: wrong role, no permission, no signing authority, bad role value', async () => {
      const c = await draft();
      const before = countFiles();
      expect(
        (await upload(`${OF}/${c}/attachment-files${q({ role: 'FINAL_DOCUMENT' })}`, U.acc1, PNG))
          .status,
      ).toBe(403);
      expect(
        (await upload(`${OF}/${c}/attachment-files${q({ role: 'BOGUS' })}`, U.clerk1, PNG)).status,
      ).toBe(422);
      expect((await upload(`${OF}/${c}/attachment-files`, U.clerk1, PNG)).status).toBe(400);
      const issue = q({ refNo: '1', issuedOn: '2026-10-13', sendMethod: 'x' });
      expect((await upload(`${OF}/${c}/issuance-file${issue}`, U.clerk1, PNG)).status).toBe(403);
      expect((await upload(`${OF}/${c}/issuance-file${issue}`, U.admin, PNG)).status).toBe(422);
      expect(countFiles()).toBe(before);
    });

    it('submit needs the final document; lists only within grants', async () => {
      const c = await draft();
      expect((await api('POST', `${OF}/${c}/submission`, U.clerk1)).status).toBe(422);
      const list = async (u: string) =>
        (await api('GET', `${OF}?officeId=${OFF}`, u)).json as unknown as { id: string }[];
      expect((await list(U.admin)).map((r) => r.id)).toContain(c);
      expect((await list(U.clerk2)).map((r) => r.id)).not.toContain(c);
    });
    it('lists signers and records a decision with a hash; refuses duplicates and non-signers without orphan files', async () => {
      await owner.query(`UPDATE memberships SET legal_signer = true WHERE user_id = $1`, [U.admin]);
      const signers = async (u: string) =>
        (await api('GET', `/office/signers?officeId=${OFF}`, u)).json as unknown as {
          items: { userId: string }[];
        };
      expect((await signers(U.clerk1)).items.map((i) => i.userId)).toEqual([U.admin]);
      expect((await signers(U.outsider)).items).toEqual([]);
      const dec = (no: string, signer: string) =>
        q({
          officeId: OFF,
          branchId: BR1,
          decisionNo: no,
          docType: 'Quyết định',
          title: 'Quyết định giả lập',
          signerUserId: signer,
          signedOn: '2026-10-13',
        });
      const ok = await upload(`/office/decision-files${dec('QD-01', U.admin)}`, U.clerk1, PNG);
      expect(ok.status).toBe(200);
      const row = (
        await owner.query(
          `SELECT evidence_key, evidence_sha256 FROM of_decisions WHERE decision_no = 'QD-01'`,
        )
      ).rows[0];
      expect(row.evidence_sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
      expect(await store.get(row.evidence_key)).toEqual(PNG);
      const before = countFiles();
      expect(
        (await upload(`/office/decision-files${dec('QD-01', U.admin)}`, U.clerk1, PNG)).status,
      ).toBe(409);
      expect(
        (await upload(`/office/decision-files${dec('QD-02', U.thvA)}`, U.clerk1, PNG)).status,
      ).toBe(403);
      expect(countFiles()).toBe(before);
    });
    it('lists stock and batches only within the writing scope', async () => {
      const item = (
        await api('POST', '/office/items', U.admin, { officeId: OFF, name: 'Giấy A4', unit: 'ram' })
      ).json.label as string;
      for (const [u, br, n] of [
        [U.clerk1, BR1, 10],
        [U.clerk2, BR2, 5],
      ] as const) {
        expect(
          (
            await api('POST', `/office/items/${item}/receipts`, u, {
              branchId: br,
              quantity: n,
              receiptRef: 'PN-' + n,
            })
          ).status,
        ).toBe(200);
      }
      const stock = async (u: string) =>
        (await api('GET', `/office/stock?officeId=${OFF}`, u)).json as unknown as {
          branchId: string | null;
          onHand: number | null;
        }[];
      expect((await stock(U.admin)).map((r) => r.onHand).sort()).toEqual([10, 5]);
      expect((await stock(U.clerk1)).filter((r) => r.branchId).map((r) => r.onHand)).toEqual([10]);
      expect((await stock(U.thvA)).filter((r) => r.branchId)).toEqual([]);
      expect(await stock(U.outsider)).toEqual([]);
      const batches = async (u: string) =>
        (await api('GET', `/office/batches?officeId=${OFF}`, u)).json as unknown as unknown[];
      expect(await batches(U.admin)).toHaveLength(2);
      expect(await batches(U.clerk2)).toHaveLength(1);
      expect(await batches(U.thvB)).toEqual([]);
    });
    it('registers a TT06 form with a file, lists it and downloads the latest version', async () => {
      const reg = (code: string, user: string, body: Buffer) =>
        upload(
          `/office/tt06-form-files${q({ officeId: OFF, code, title: 'Mẫu giả lập' })}`,
          user,
          body,
        );
      expect((await reg('I', U.clerk1, PNG)).status).toBe(403);
      expect((await reg('X', U.admin, PNG)).status).toBe(422);
      const v2 = Buffer.concat([PNG, Buffer.from(' v2')]);
      expect((await reg('I', U.admin, PNG)).status).toBe(200);
      expect((await reg('I', U.head, v2)).status).toBe(200);
      const list = (await api('GET', `/office/tt06-forms?officeId=${OFF}`, U.clerk1))
        .json as unknown as { code: string; version: number }[];
      expect(list).toMatchObject([{ code: 'I', version: 2 }]);
      expect((await api('GET', `/office/tt06-forms?officeId=${OFF}`, U.outsider)).json).toEqual([]);
      const get = (user: string) =>
        fetch(`${base}/office/tt06-forms/I/file?officeId=${OFF}`, {
          headers: { 'x-synthetic-user': user, 'x-synthetic-tenant': T },
        });
      const ok = await get(U.thvA);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-disposition')).toContain('attachment');
      expect(Buffer.from(await ok.arrayBuffer())).toEqual(v2);
      expect((await get(U.outsider)).status).toBe(403);
      const missing = await fetch(`${base}/office/tt06-forms/II/file?officeId=${OFF}`, {
        headers: { 'x-synthetic-user': U.admin, 'x-synthetic-tenant': T },
      });
      expect(missing.status).toBe(404);
    });
  },
);
