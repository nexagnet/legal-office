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
import { LocalFileStore, type FileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_readapis_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Vi bằng read APIs: MISA, N-11, documents, transfers (HTTP + PostgreSQL)',
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
    const getRaw = async (path: string, user: string | null, tenant = T) => {
      const headers: Record<string, string> = {};
      if (user) {
        headers['x-synthetic-user'] = user;
        headers['x-synthetic-tenant'] = tenant;
      }
      return fetch(`${base}${path}`, { headers });
    };
    const pdf = (extra = 'x') => Buffer.from(`%PDF-1.4\n% bản scan giả lập ${extra}\n%%EOF`);
    const outsiders = async (path: string, expected: number) => {
      for (const who of [U.clerk2, U.outsider])
        expect((await api('GET', path, who)).status).toBe(expected);
      expect((await api('GET', path, U.otherTenantAdmin, undefined, T2)).status).toBe(expected);
      expect((await api('GET', path, null)).status).toBe(401);
    };

    it('shows MISA state and revoke proposals with their decisions, newest first', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/misa`;
      const fresh = await api('GET', url, U.thvB);
      expect(fresh.status).toBe(200);
      expect(fresh.json).toMatchObject({
        status: 'NOT_CONFIRMED',
        reference: null,
        revokeStatus: 'NONE',
        revokeProposals: [],
      });
      await api('PUT', `/vibang/cases/${c}/misa`, U.acc1, {
        status: 'CONFIRMED_FULL',
        reference: 'MISA-1',
      });
      const first = await api('POST', `/vibang/cases/${c}/misa/revoke-proposals`, U.acc1, {
        reason: 'sai kỳ',
      });
      expect(first.status).toBe(200);
      const pending = (await api('GET', url, U.clerk1)).json as Record<string, unknown>;
      expect(pending).toMatchObject({
        status: 'CONFIRMED_FULL',
        reference: 'MISA-1',
        confirmedBy: U.acc1,
        revokeStatus: 'PROPOSED',
        revokeReason: 'sai kỳ',
        revokeProposedBy: U.acc1,
      });
      expect(pending.revokeProposals).toMatchObject([
        {
          proposedBy: U.acc1,
          reason: 'sai kỳ',
          status: 'PENDING',
          decidedBy: null,
          decidedAt: null,
        },
      ]);
      expect(
        (await api('POST', `/vibang/cases/${c}/misa/revoke-decisions`, U.admin, { accept: false }))
          .status,
      ).toBe(200);
      await api('POST', `/vibang/cases/${c}/misa/revoke-proposals`, U.acc1, { reason: 'lần hai' });
      await api('POST', `/vibang/cases/${c}/misa/revoke-decisions`, U.admin, { accept: true });
      await api('POST', `/vibang/cases/${c}/misa/revoke-proposals`, U.acc1, { reason: 'x' });
      const after = (await api('GET', url, U.admin)).json as Record<string, unknown>;
      expect(after).toMatchObject({
        status: 'NOT_CONFIRMED',
        reference: null,
        revokeStatus: 'NONE',
      });
      const list = after.revokeProposals as Record<string, unknown>[];
      expect(list.map((r) => [r.reason, r.status, r.decidedBy])).toEqual([
        ['lần hai', 'ACCEPTED', U.admin],
        ['sai kỳ', 'REJECTED', U.admin],
      ]);
      expect(list[0]!.decidedAt).toBeTruthy();
      expect(JSON.stringify(after)).not.toMatch(/amount|price|total/i);
      await outsiders(url, 404);
      expect((await api('GET', `/vibang/cases/${id()}/misa`, U.admin)).status).toBe(404);
    });

    it('lists N-11 corrections with their application state', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/n11-corrections`;
      expect((await api('GET', url, U.thvA)).json).toEqual({ items: [] });
      await api('PUT', `/vibang/cases/${c}/misa`, U.acc1, {
        status: 'CONFIRMED_FULL',
        reference: 'MISA-2',
      });
      await api('POST', `/vibang/cases/${c}/number`, U.clerk1);
      await api('POST', `/vibang/cases/${c}/signature-confirmations`, U.thvA);
      expect(
        (await api('POST', `/vibang/cases/${c}/n11-corrections`, U.thvA, { reason: 'sai tên' }))
          .status,
      ).toBe(200);
      await api('POST', `/vibang/cases/${c}/n11-corrections`, U.admin, { reason: 'sai địa chỉ' });
      const one = (await api('GET', url, U.thvB)).json.items as Record<string, unknown>[];
      expect(one.map((i) => [i.reason, i.status, i.applied, i.correctionDocumentId])).toEqual([
        ['sai địa chỉ', 'PROPOSED', false, null],
        ['sai tên', 'PROPOSED', false, null],
      ]);
      const doc = await api('POST', `/vibang/cases/${c}/documents`, U.thvA, {
        kind: 'N11_CORRECTION',
        source: 'UPLOADED',
        objectKey: `t/${T}/vibang/${c}/n11/a.pdf`,
        sha256: 'a'.repeat(64),
        mime: 'application/pdf',
        sizeBytes: 10,
      });
      expect(doc.status).toBe(200);
      const docs = (await api('GET', `/vibang/cases/${c}/documents`, U.thvA)).json.items as {
        id: string;
        kind: string;
      }[];
      const docId = docs.find((d) => d.kind === 'N11_CORRECTION')!.id;
      const target = one.find((i) => i.reason === 'sai tên')!.id;
      expect(
        (
          await api('POST', `/vibang/n11-corrections/${target}/applications`, U.admin, {
            documentId: docId,
          })
        ).status,
      ).toBe(200);
      const done = (await api('GET', url, U.admin)).json.items as Record<string, unknown>[];
      const applied = done.find((i) => i.reason === 'sai tên')!;
      expect(applied).toMatchObject({
        status: 'APPLIED',
        applied: true,
        correctionDocumentId: docId,
        signatoryUserId: U.admin,
      });
      expect(applied.appliedAt).toBeTruthy();
      expect(done.find((i) => i.reason === 'sai địa chỉ')).toMatchObject({ applied: false });
      await outsiders(url, 404);
    });

    it('lists documents with signature/stamp confirmations and downloads the file', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/documents`;
      expect((await api('GET', url, U.thvB)).json).toMatchObject({
        items: [],
        signature: { confirmedBy: null, confirmedAt: null },
        stamp: { confirmedBy: null, confirmedAt: null },
        finalScan: { documentId: null, sha256: null, lockedAt: null },
      });
      await api('PUT', `/vibang/cases/${c}/misa`, U.acc1, {
        status: 'CONFIRMED_FULL',
        reference: 'MISA-3',
      });
      await api('POST', `/vibang/cases/${c}/number`, U.clerk1);
      await api('POST', `/vibang/cases/${c}/signature-confirmations`, U.thvA);
      await api('POST', `/vibang/cases/${c}/stamp-confirmations`, U.clerk1);
      const draft = pdf('nháp');
      const key = `t/${T}/vibang/${c}/draft/d.pdf`;
      await store.put(key, draft, 'application/pdf');
      await api('POST', `/vibang/cases/${c}/documents`, U.clerk1, {
        kind: 'DRAFT_N03',
        source: 'GENERATED',
        objectKey: key,
        sha256: createHash('sha256').update(draft).digest('hex'),
        mime: 'application/pdf',
        sizeBytes: draft.length,
      });
      const scan = pdf('scan');
      const up = await fetch(`${base}/vibang/cases/${c}/final-scan`, {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'x-synthetic-user': U.clerk1,
          'x-synthetic-tenant': T,
        },
        body: scan,
      });
      expect(up.status).toBe(200);
      const r = (await api('GET', url, U.thvA)).json as {
        items: Record<string, unknown>[];
        signature: Record<string, unknown>;
        stamp: Record<string, unknown>;
        finalScan: Record<string, unknown>;
      };
      expect(r.items.map((i) => i.kind)).toEqual(['FINAL_SCAN', 'DRAFT_N03']);
      expect(r.items[0]).toMatchObject({
        version: 1,
        source: 'UPLOADED',
        mime: 'application/pdf',
        sizeBytes: scan.length,
        sha256: createHash('sha256').update(scan).digest('hex'),
        createdBy: U.clerk1,
      });
      expect(JSON.stringify(r)).not.toContain('objectKey');
      expect(JSON.stringify(r)).not.toContain(`t/${T}/`);
      expect(r.signature).toMatchObject({ confirmedBy: U.thvA });
      expect(r.signature.confirmedAt).toBeTruthy();
      expect(r.stamp).toMatchObject({ confirmedBy: U.clerk1 });
      // Bản scan chỉ được khoá vào chứng cứ khi trả hồ sơ.
      expect(r.finalScan).toMatchObject({ documentId: null, sha256: null, lockedAt: null });
      expect((await api('POST', `/vibang/cases/${c}/return`, U.clerk1)).status).toBe(200);
      const locked = (await api('GET', url, U.thvA)).json as typeof r;
      expect(locked.finalScan).toMatchObject({
        documentId: r.items[0]!.id,
        sha256: r.items[0]!.sha256,
      });
      expect(locked.finalScan.lockedAt).toBeTruthy();
      await outsiders(url, 404);

      const fileUrl = `/vibang/cases/${c}/documents/${r.items[0]!.id}/file`;
      const ok = await getRaw(fileUrl, U.thvB);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('application/pdf');
      expect(Buffer.from(await ok.arrayBuffer())).toEqual(scan);
      for (const who of [U.clerk2, U.outsider])
        expect((await getRaw(fileUrl, who)).status).toBe(404);
      expect((await getRaw(fileUrl, U.otherTenantAdmin, T2)).status).toBe(404);
      expect((await getRaw(fileUrl, null)).status).toBe(401);
      expect((await getRaw(`/vibang/cases/${c}/documents/${id()}/file`, U.admin)).status).toBe(404);
      // Tài liệu của hồ sơ khác không tải được qua hồ sơ này.
      const other = await newCase();
      expect(
        (await getRaw(`/vibang/cases/${other}/documents/${r.items[0]!.id}/file`, U.admin)).status,
      ).toBe(404);
      const audit = await owner.query(
        `SELECT outcome, count(*)::int n FROM audit_log WHERE action = 'vb.document.download' GROUP BY outcome ORDER BY outcome`,
      );
      expect(audit.rows.find((x) => x.outcome === 'allow')?.n).toBeGreaterThanOrEqual(1);
      expect(audit.rows.find((x) => x.outcome === 'deny')?.n).toBeGreaterThanOrEqual(3);
    });

    it('returns 503 for a file download when no file store is configured', async () => {
      const stub = { end: async () => undefined } as unknown as pg.Pool;
      const bare = await NestFactory.create(
        AppModule.register({ pool: stub, resolver: new SyntheticHeaderResolver() }),
        { logger: false },
      );
      await bare.listen(0);
      const url = (await bare.getUrl()).replace('[::1]', 'localhost');
      const res = await fetch(`${url}/vibang/cases/${id()}/documents/${id()}/file`, {
        headers: { 'x-synthetic-user': U.admin, 'x-synthetic-tenant': T },
      });
      expect(res.status).toBe(503);
      await bare.close();
    });

    describe('enforcement transfers', () => {
      const makeCase = async () => {
        const r = await owner.query(
          `SELECT * FROM th_create_case($1,$2,$3,$4,$5,'HĐDV-giả-lập','QĐ-giả-lập')`,
          [T, U.admin, OFF, BR1, 'THA/' + id().slice(0, 8)],
        );
        const cs = r.rows[0].label as string;
        expect(r.rows[0].ok).toBe(true);
        await owner.query(`SELECT * FROM th_assign($1,$2,$3,$4)`, [T, U.admin, cs, U.thvA]);
        return cs;
      };
      const step = (t: string, s: string, who = U.admin) =>
        api('POST', `/enforcement/transfers/${t}/steps`, who, {
          step: s,
          evidenceKey: `as/${s}`,
          evidenceSha256: s.length.toString(16).padStart(64, 'c'),
        });

      it('shows steps, approval decisions and completion; scope follows th_list_cases', async () => {
        const cs = await makeCase();
        const empty = await api('GET', `/enforcement/cases/${cs}/transfers`, U.thvA);
        expect(empty.json).toEqual({ items: [] });
        const t = (
          await api('POST', `/enforcement/cases/${cs}/transfers`, U.thvA, { toUserId: U.thvB })
        ).json.label as string;
        const url = `/enforcement/transfers/${t}`;
        const fresh = await api('GET', url, U.thvA);
        expect(fresh.status).toBe(200);
        expect(fresh.json).toMatchObject({
          id: t,
          caseId: cs,
          toUserId: U.thvB,
          proposedBy: U.thvA,
          currentHandlerUserId: U.thvA,
          status: 'PROPOSED',
          approvalState: 'OPEN',
          completedAt: null,
          steps: [],
          decisions: [],
        });
        await step(t, 'APP_APPROVAL');
        await api('POST', `/approvals/transfers/${t}/decisions`, U.admin, {
          decision: 'RETURN',
          reason: 'bổ sung',
        });
        const mid = (await api('GET', url, U.secretary)).json as Record<string, unknown>;
        expect(mid.approvalState).toBe('APPROVAL_RETURNED');
        expect(mid.decisions).toMatchObject([
          { decision: 'RETURN', reason: 'bổ sung', actorUserId: U.admin },
        ]);
        await api('POST', `/approvals/transfers/${t}/decisions`, U.thvA, {
          decision: 'RESUBMIT',
          reason: 'đã bổ sung',
        });
        await step(t, 'LEGAL_DECISION');
        await step(t, 'HANDOVER_N08', U.secretary);
        expect((await api('POST', `${url}/completion`, U.admin)).status).toBe(200);
        const done = (await api('GET', url, U.admin)).json as Record<string, unknown>;
        expect(done).toMatchObject({
          status: 'COMPLETED',
          approvalState: 'OPEN',
          currentHandlerUserId: U.thvB,
        });
        expect(done.completedAt).toBeTruthy();
        const steps = done.steps as Record<string, unknown>[];
        expect(steps.map((s) => [s.step, s.actorUserId])).toEqual([
          ['APP_APPROVAL', U.admin],
          ['LEGAL_DECISION', U.admin],
          ['HANDOVER_N08', U.secretary],
        ]);
        expect(steps[0]).toMatchObject({ evidenceKey: 'as/APP_APPROVAL' });
        expect(steps[0]!.evidenceSha256).toMatch(/^c{64}$/);
        expect(steps[0]!.at).toBeTruthy();
        expect(
          (done.decisions as unknown[]).map((d) => (d as { decision: string }).decision),
        ).toEqual(['RETURN', 'RESUBMIT']);
        // Bàn giao thứ hai (mới nhất trước).
        const t2 = (
          await api('POST', `/enforcement/cases/${cs}/transfers`, U.admin, { toUserId: U.thvA })
        ).json.label as string;
        const list = (await api('GET', `/enforcement/cases/${cs}/transfers`, U.admin)).json
          .items as { id: string }[];
        expect(list.map((i) => i.id)).toEqual([t2, t]);
        // Phạm vi: THV không còn phụ trách (thvA, dù là bên nhận của t2), người ngoài, chi nhánh khác, tenant khác.
        for (const who of [U.outsider, U.clerk2]) {
          expect((await api('GET', `/enforcement/transfers/${t2}`, who)).status).toBe(404);
          expect((await api('GET', `/enforcement/cases/${cs}/transfers`, who)).json).toEqual({
            items: [],
          });
        }
        expect((await api('GET', `/enforcement/transfers/${t2}`, U.thvA)).status).toBe(404);
        expect((await api('GET', `/enforcement/transfers/${t2}`, U.clerk1)).status).toBe(200);
        expect(
          (await api('GET', `/enforcement/transfers/${t2}`, U.otherTenantAdmin, undefined, T2))
            .status,
        ).toBe(404);
        expect((await api('GET', `/enforcement/transfers/${id()}`, U.admin)).status).toBe(404);
        expect((await api('GET', url, null)).status).toBe(401);
      });
    });
  },
);
