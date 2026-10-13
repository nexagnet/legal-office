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
const DB = `lo_evup_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Evidence uploads for verification and enforcement (HTTP + file store + PostgreSQL)',
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
      Buffer.from('chứng cứ giả lập'),
    ]);
    const VX = '/verification';
    const TH = '/enforcement-cases';
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
    const files = () => {
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true }))
          if (e.isDirectory()) walk(join(d, e.name));
          else out.push(join(d, e.name));
      };
      walk(storeDir);
      return out;
    };

    const openRound = async (handler: string | null) => {
      const c = (
        await api('POST', `${VX}/cases`, U.clerk1, {
          officeId: OFF,
          branchId: BR1,
          caseRef: 'XM/' + id().slice(0, 8),
        })
      ).json.label as string;
      if (handler)
        await api('PUT', `${VX}/cases/${c}/handler`, U.admin, { handlerUserId: handler });
      const r = await api('POST', `${VX}/cases/${c}/rounds`, handler ?? U.admin, {
        partyName: 'Bên giả lập',
      });
      return { c, round: r.json.label as string };
    };

    it('verification: stores a source file and records it against the round', async () => {
      const { round } = await openRound(U.thvA);
      const src = q({ kind: 'Biên bản', confidentiality: 'CONFIDENTIAL', purpose: 'Đối chiếu' });
      const r = await upload(`${VX}/rounds/${round}/source-files${src}`, U.thvA, PNG);
      expect(r.status).toBe(200);
      const row = (
        await owner.query(
          `SELECT evidence_key, evidence_sha256, kind, confidentiality FROM vx_sources WHERE round_id = $1`,
          [round],
        )
      ).rows[0];
      expect(row).toMatchObject({ kind: 'Biên bản', confidentiality: 'CONFIDENTIAL' });
      expect(row.evidence_sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
      expect(await store.get(row.evidence_key)).toEqual(PNG);
    });

    it('verification: denial and bad input leave no stored file', async () => {
      const { round } = await openRound(U.thvA);
      const before = files().length;
      const src = q({ kind: 'Biên bản', confidentiality: 'CONFIDENTIAL', purpose: 'x' });
      expect((await upload(`${VX}/rounds/${round}/source-files${src}`, U.thvB, PNG)).status).toBe(
        403,
      );
      const bad = q({ kind: 'Biên bản', confidentiality: 'SECRET', purpose: 'x' });
      expect((await upload(`${VX}/rounds/${round}/source-files${bad}`, U.thvA, PNG)).status).toBe(
        422,
      );
      expect(
        (await upload(`${VX}/rounds/${round}/source-files${src}`, U.thvA, Buffer.from('x'))).status,
      ).toBe(422);
      expect((await upload(`${VX}/rounds/${round}/source-files`, U.thvA, PNG)).status).toBe(400);
      expect(files().length).toBe(before);
    });

    const openObligation = async () => {
      const c = (
        await api('POST', TH, U.clerk1, {
          officeId: OFF,
          branchId: BR1,
          caseRef: 'THA/' + id().slice(0, 8),
          agreementRef: 'HĐ-giả-lập',
          decisionRef: 'QĐ-giả-lập',
        })
      ).json.label as string;
      await api('PUT', `${TH}/${c}/handler`, U.admin, { handlerUserId: U.thvA });
      const o = (
        await api('POST', `${TH}/${c}/obligations`, U.thvA, { description: 'Nghĩa vụ giả lập' })
      ).json.label as string;
      return { c, o };
    };

    it('enforcement: records a result with its file, idempotent on the same key', async () => {
      const { o } = await openObligation();
      const ev = q({ kind: 'PARTIAL_RESULT', note: 'Đã thu một phần', idempotencyKey: 'k-' + o });
      expect((await upload(`${TH}/obligations/${o}/event-files${ev}`, U.thvA, PNG)).status).toBe(
        200,
      );
      const rows = (
        await owner.query(
          `SELECT evidence_key, evidence_sha256, kind FROM th_obligation_events WHERE obligation_id = $1`,
          [o],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe('PARTIAL_RESULT');
      expect(rows[0].evidence_sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
      expect(await store.get(rows[0].evidence_key)).toEqual(PNG);
      expect((await upload(`${TH}/obligations/${o}/event-files${ev}`, U.thvA, PNG)).status).toBe(
        200,
      );
      expect(
        (await owner.query(`SELECT 1 FROM th_obligation_events WHERE obligation_id = $1`, [o]))
          .rowCount,
      ).toBe(1);
    });

    it('enforcement: wrong person is refused and leaves no file', async () => {
      const { o } = await openObligation();
      const before = files().length;
      const ev = q({ kind: 'PARTIAL_RESULT', note: 'x', idempotencyKey: 'k2-' + o });
      expect((await upload(`${TH}/obligations/${o}/event-files${ev}`, U.thvB, PNG)).status).toBe(
        403,
      );
      expect(files().length).toBe(before);
    });

    it('enforcement: only admin or head completes, once every obligation is done', async () => {
      const { c, o } = await openObligation();
      const before = files().length;
      expect((await upload(`${TH}/${c}/completion-file`, U.thvA, PNG)).status).toBe(403);
      expect((await upload(`${TH}/${c}/completion-file`, U.admin, PNG)).status).toBe(409);
      expect(files().length).toBe(before);
      const done = q({ kind: 'COMPLETION', note: 'Đã thi hành xong', idempotencyKey: 'done-' + o });
      expect((await upload(`${TH}/obligations/${o}/event-files${done}`, U.thvA, PNG)).status).toBe(
        200,
      );
      expect((await upload(`${TH}/${c}/completion-file`, U.admin, PNG)).status).toBe(200);
      const row = (
        await owner.query(`SELECT status, completion_evidence_key FROM th_cases WHERE id = $1`, [c])
      ).rows[0];
      expect(row.status).toBe('COMPLETED');
      expect(await store.get(row.completion_evidence_key)).toEqual(PNG);
    });
  },
);
