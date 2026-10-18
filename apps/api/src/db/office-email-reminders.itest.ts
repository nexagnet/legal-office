import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MailMessage, Mailer } from '../reminders/mailer';
import { runRemindersForTenant } from '../reminders/run-reminders';

// Cần PostgreSQL tạm. DB thật + vai legal_app có RLS; thư gửi qua mailer giả. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_er_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Email nhắc hạn (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR1 = id();
  const BR2 = id();
  const U = { admin: id(), clerk1: id(), clerk2: id(), noLogin: id() };
  const EMAIL = {
    admin: 'admin@example.test',
    clerk1: 'clerk1@example.test',
    clerk2: 'clerk2@example.test',
  };

  const recorder = (failFor: string[] = []) => {
    const sent: MailMessage[] = [];
    const mailer: Mailer = {
      async send(m) {
        if (failFor.includes(m.to)) throw new Error('SMTP giả lập lỗi');
        sent.push(m);
      },
    };
    return { sent, mailer };
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
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
      [BR1, T, OFF, BR2],
    );
    const people: [string, string, string | null][] = [
      [U.admin, 'ADMIN', null],
      [U.clerk1, 'VAN_THU', BR1],
      [U.clerk2, 'VAN_THU', BR2],
      [U.noLogin, 'TRUONG_VP', null],
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
    for (const [uid, email] of [
      [U.admin, EMAIL.admin],
      [U.clerk1, EMAIL.clerk1],
      [U.clerk2, EMAIL.clerk2],
    ] as const) {
      await owner.query(
        `INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES ($1,$2,$3,'x')`,
        [T, uid, email],
      );
    }
    const rid = id();
    await owner.query(
      `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-ER',$5)`,
      [rid, T, OFF, BR1, U.admin],
    );
    await owner.query(
      `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at) VALUES
        ($1,$2,'Quá hạn CN1','đ', now() - interval '1 day'),
        ($1,$2,'Xa','đ', now() + interval '30 days')`,
      [T, rid],
    );
    await owner.query(
      `INSERT INTO of_correspondence (tenant_id, office_id, branch_id, direction, status, doc_type, counterparty, subject, received_on, due_at, created_by)
       VALUES ($1,$2,$3,'INBOUND','RECEIVED','CV','Sở','Công văn sắp đến hạn CN2', current_date, now() + interval '2 days', $4)`,
      [T, OFF, BR2, U.admin],
    );
  });

  afterAll(async () => {
    await owner?.end();
    await appPool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('gửi mỗi người một thư đúng phạm vi xem; người không có tài khoản đăng nhập không nhận; chạy lại không gửi lặp', async () => {
    const { sent, mailer } = recorder();
    const r = await runRemindersForTenant(appPool, T, mailer);
    expect(r).toEqual({ tenantId: T, sent: 3, failed: 0 });
    const by = (to: string) => sent.find((m) => m.to === to)!;
    expect(sent.map((m) => m.to).sort()).toEqual(Object.values(EMAIL).sort());
    expect(by(EMAIL.admin).text).toContain('Quá hạn CN1');
    expect(by(EMAIL.admin).text).toContain('Công văn sắp đến hạn CN2');
    expect(by(EMAIL.clerk1).text).toContain('Quá hạn CN1');
    expect(by(EMAIL.clerk1).text).not.toContain('CN2');
    expect(by(EMAIL.clerk2).text).toContain('Công văn sắp đến hạn CN2');
    expect(by(EMAIL.clerk2).text).not.toContain('Quá hạn CN1');
    expect(sent.some((m) => m.text.includes('Xa'))).toBe(false);
    const again = recorder();
    expect(await runRemindersForTenant(appPool, T, again.mailer)).toMatchObject({ sent: 0 });
    expect(again.sent).toEqual([]);
  });

  it('thư lỗi không bị ghi là đã gửi và được thử lại; người đã gửi thành công không bị gửi lại', async () => {
    const rid = id();
    await owner.query(
      `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-ER2',$5)`,
      [rid, T, OFF, BR1, U.admin],
    );
    await owner.query(
      `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at) VALUES ($1,$2,'Mới quá hạn','đ', now() - interval '2 hours')`,
      [T, rid],
    );
    const failing = recorder([EMAIL.clerk1]);
    expect(await runRemindersForTenant(appPool, T, failing.mailer)).toEqual({
      tenantId: T,
      sent: 1,
      failed: 1,
    });
    expect(failing.sent.map((m) => m.to)).toEqual([EMAIL.admin]);
    // Admin đã được ghi nhận nên lần sau không gửi lại; clerk1 chưa gửi được nên được thử lại.
    const retry = recorder();
    expect(await runRemindersForTenant(appPool, T, retry.mailer)).toMatchObject({ sent: 1 });
    expect(retry.sent.map((m) => m.to)).toEqual([EMAIL.clerk1]);
    expect(retry.sent[0]!.text).toContain('Mới quá hạn');
  });

  it('tenant khác không bị đụng tới', async () => {
    const { sent, mailer } = recorder();
    expect(await runRemindersForTenant(appPool, T2, mailer)).toEqual({
      tenantId: T2,
      sent: 0,
      failed: 0,
    });
    expect(sent).toEqual([]);
  });
});
