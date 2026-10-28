import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LEDGERS } from '../office/ledgers';

// Sổ theo dõi S-01/S-02/S-04/S-05 (Phụ lục I TT 08/2026/TT-BTP): HTTP thật + DB thật. Toàn bộ dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_led_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const HASH = 'b'.repeat(64);

// Thứ tự cột theo mẫu (số cột: 10 / 7 / 11 / 13).
const COLUMN_COUNT: Record<string, number> = { 's-01': 10, 's-02': 7, 's-04': 11, 's-05': 13 };

describe.skipIf(!ADMIN_URL)('sổ theo dõi S-01/S-02/S-04/S-05 (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const BR1 = id();
  const BR2 = id();
  const BR_T2 = id();
  const U = {
    admin: id(),
    head: id(),
    secretary: id(),
    clerk: id(),
    clerkOther: id(),
    thv: id(),
    thv2: id(),
    acc: id(),
    foreign: id(),
  };
  const ids = {
    doc1: id(),
    doc2: id(),
    docOther: id(),
    vb1: id(),
    vb2: id(),
    vx1: id(),
    vx2: id(),
    th1: id(),
    th2: id(),
  };

  const get = async (path: string, user: string, tenant = T) => {
    const res = await fetch(`${base}${path}`, {
      headers: { 'x-synthetic-user': user, 'x-synthetic-tenant': tenant },
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : {} };
  };
  const ledger = (code: string, user: string, qs = '', office = OFF, tenant = T) =>
    get(`/office/ledgers/${code}?officeId=${office}${qs}`, user, tenant);
  const rowsOf = async (code: string, user: string, qs = '') =>
    (await ledger(code, user, qs)).json.rows as Record<string, unknown>[];

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
      AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$4,'VP B')`,
      [OFF, T, OFF2, T2],
    );
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2'),($5,$6,$7,'CN-B')`,
      [BR1, T, OFF, BR2, BR_T2, T2, OFF2],
    );
    const people: [string, string, string, string, string | null][] = [
      [U.admin, T, OFF, 'ADMIN', null],
      [U.head, T, OFF, 'TRUONG_VP', null],
      [U.secretary, T, OFF, 'THU_KY', null],
      [U.clerk, T, OFF, 'VAN_THU', BR1],
      [U.clerkOther, T, OFF, 'VAN_THU', BR2],
      [U.thv, T, OFF, 'THV', null],
      [U.thv2, T, OFF, 'THV', null],
      [U.acc, T, OFF, 'KE_TOAN', BR1],
      [U.foreign, T2, OFF2, 'ADMIN', null],
    ];
    for (const [uid, tenant, office, role, branch] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        role,
      ]);
      const m = await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [tenant, uid, office, role],
      );
      if (branch) {
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [tenant, m.rows[0].id, branch],
        );
      }
    }

    // S-01: hai văn bản ở CN1 (một đã tống đạt, một bị niêm yết rồi không giao được), một ở CN2.
    const r1 = id();
    const r2 = id();
    await owner.query(
      `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'N-01/A',$5),($6,$2,$3,$7,'N-01/B',$5)`,
      [r1, T, OFF, BR1, U.admin, r2, BR2],
    );
    await owner.query(
      `INSERT INTO td_documents (id, tenant_id, request_id, recipient_name, address, deadline_at, handler_user_id, status, created_at)
       VALUES ($1,$2,$3,'Người nhận 1','Địa chỉ 1','2099-01-01',$4,'ASSIGNED','2026-03-01'),
              ($5,$2,$3,'Người nhận 2','Địa chỉ 2','2099-01-01',$4,'ASSIGNED','2026-03-02'),
              ($6,$2,$7,'Người nhận 3','Địa chỉ 3','2099-01-01',$8,'ASSIGNED','2026-03-03')`,
      [ids.doc1, T, r1, U.thv, ids.doc2, ids.docOther, r2, U.thv2],
    );
    await owner.query(
      `INSERT INTO td_attempts (tenant_id, document_id, seq, outcome, evidence_key, evidence_sha256, late, actor_user_id, at)
       VALUES ($1,$2,1,'SERVED','t/x.pdf',$3,false,$4,'2026-03-10 03:00+00')`,
      [T, ids.doc1, HASH, U.thv],
    );
    await owner.query(
      `INSERT INTO td_attempts (tenant_id, document_id, seq, outcome, statutory_basis_ref, late, actor_user_id, at)
       VALUES ($1,$2,1,'POSTED_NOTICE','Điều 25 (giả lập)',false,$3,'2026-03-11 03:00+00')`,
      [T, ids.doc2, U.thv],
    );
    await owner.query(
      `UPDATE td_documents SET status = 'DELIVERED' WHERE id = $1 AND tenant_id = $2`,
      [ids.doc1, T],
    );
    await owner.query(
      `UPDATE td_documents SET status = 'UNDELIVERABLE', undeliverable_reason = 'NO_RECIPIENT' WHERE id = $1 AND tenant_id = $2`,
      [ids.doc2, T],
    );

    // S-02: hai vi bằng đã có số (CN1, CN2) và một hồ sơ chưa có số (không vào sổ).
    const cust = id();
    await owner.query(
      `INSERT INTO customers (id, tenant_id, kind, external_ref, display_name, address) VALUES ($1,$2,'PERSON','c1','Nguyễn Văn A (giả lập)','12 Phố Giả, Hà Nội')`,
      [cust, T],
    );
    await owner.query(
      `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, status, responsible_thv_user_id, title, description, created_at)
       VALUES ($1,$2,$3,$4,$5,'INTAKE',NULL,'Ghi nhận hiện trạng','Ghi nhận hiện trạng công trình giả lập','2026-04-01'),
              ($6,$2,$3,$7,$5,'INTAKE',NULL,'Ghi nhận khác','Nội dung khác giả lập','2026-04-02'),
              ($8,$2,$3,$4,$5,'INTAKE',NULL,'Chưa có số','Chưa phát sinh','2026-04-03')`,
      [ids.vb1, T, OFF, BR1, cust, ids.vb2, BR2, id()],
    );
    await owner.query(
      `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $1 WHERE tenant_id = $2 AND id IN ($3,$4)`,
      [U.thv, T, ids.vb1, ids.vb2],
    );
    await owner.query(
      `INSERT INTO vibang_numbers (tenant_id, office_id, case_id, year, seq, label, allocated_by, allocated_at)
       VALUES ($1,$2,$3,2026,1,'001/2026/VB',$5,'2026-04-05 03:00+00'),($1,$2,$4,2026,2,'002/2026/VB',$5,'2026-04-06 03:00+00')`,
      [T, OFF, ids.vb1, ids.vb2, U.admin],
    );

    // S-04: hai hồ sơ xác minh (CN1, CN2); hồ sơ 1 có quyết định xác minh trong sổ quyết định và một vòng.
    await owner.query(
      `INSERT INTO vx_cases (id, tenant_id, office_id, branch_id, case_ref, status, handler_user_id, conclusion_text, created_by, created_at)
       VALUES ($1,$2,$3,$4,'XM-1','OPEN',$5,'Kết luận giả lập',$6,'2026-05-01'),($7,$2,$3,$8,'XM-2','OPEN',$5,NULL,$6,'2026-05-02')`,
      [ids.vx1, T, OFF, BR1, U.thv, U.admin, ids.vx2, BR2],
    );
    await owner.query(
      `INSERT INTO vx_rounds (tenant_id, case_id, seq, party_name, started_by) VALUES ($1,$2,1,'Bên liên quan giả lập',$3)`,
      [T, ids.vx1, U.thv],
    );
    await owner.query(
      `INSERT INTO of_decisions (tenant_id, office_id, branch_id, decision_no, doc_type, title, signer_user_id, signed_on, case_kind, case_id, evidence_key, evidence_sha256, recorded_by)
       VALUES ($1,$2,$3,'QD-XM-01','Quyết định xác minh','QĐ xác minh giả lập',$4,'2026-05-03','VERIFICATION',$5,'t/d.pdf',$6,$4),
              ($1,$2,$3,'QD-THA-01','Quyết định THA','QĐ THA giả lập',$4,'2026-06-03','ENFORCEMENT',$7,'t/e.pdf',$6,$4)`,
      [T, OFF, BR1, U.admin, ids.vx1, HASH, ids.th1],
    );

    // S-05: hai hồ sơ thi hành án (CN1, CN2); hồ sơ 1 có hai đương sự và hai nghĩa vụ.
    await owner.query(
      `INSERT INTO th_cases (id, tenant_id, office_id, branch_id, case_ref, agreement_ref, decision_ref, status, handler_user_id, created_by, created_at)
       VALUES ($1,$2,$3,$4,'THA-1','HD-DV-01','BA-01/2026','OPEN',$5,$6,'2026-06-01'),($7,$2,$3,$8,'THA-2','HD-DV-02','BA-02/2026','OPEN',$5,$6,'2026-06-02')`,
      [ids.th1, T, OFF, BR1, U.thv, U.admin, ids.th2, BR2],
    );
    const pDebtor = id();
    const pCreditor = id();
    await owner.query(
      `INSERT INTO th_parties (id, tenant_id, case_id, display_name, kind, role, added_by) VALUES
       ($1,$2,$3,'Bên A phải thi hành','PERSON','DEBTOR',$5),($4,$2,$3,'Bên B được thi hành','ORGANIZATION','CREDITOR',$5)`,
      [pDebtor, T, ids.th1, pCreditor, U.admin],
    );
    await owner.query(
      `INSERT INTO th_obligations (tenant_id, case_id, seq, description, obligor_party_id, created_by) VALUES
       ($1,$2,1,'Trả tài sản X',$3,$4),($1,$2,2,'Giao nhà Y',$3,$4)`,
      [T, ids.th1, pDebtor, U.admin],
    );
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('có đủ bốn sổ, số cột và thứ tự khoá khớp mẫu; S-03 không có, S-06 dựng từ hồ sơ lao động', async () => {
    expect(LEDGERS.map((l) => [l.code, l.columns.length])).toEqual([
      ['S-01', 10],
      ['S-02', 7],
      ['S-04', 11],
      ['S-05', 13],
    ]);
    for (const code of ['s-01', 's-02', 's-04', 's-05']) {
      const res = await ledger(code, U.admin);
      expect(res.status).toBe(200);
      const cols = res.json.columns as { no: number; key: string }[];
      expect(cols.map((c) => c.no)).toEqual(
        Array.from({ length: COLUMN_COUNT[code] ?? 0 }, (_, i) => i + 1),
      );
      const first = res.json.rows[0] as Record<string, unknown>;
      expect(Object.keys(first).slice(0, cols.length)).toEqual(cols.map((c) => c.key));
      expect(res.json.notice).toMatch(/không phải biểu mẫu chính thức/);
    }
    expect((await ledger('s-03', U.admin)).status).toBe(404);
    const s06 = await ledger('s-06', U.admin);
    expect(s06.status).toBe(200);
    expect((s06.json.columns as unknown[]).length).toBe(11);
    expect(await rowsOf('s-06', U.secretary)).toEqual([]);
  });

  it('S-01: dòng theo thứ tự, ngày tống đạt/hình thức/ghi chú có dữ liệu thật, cột thiếu nguồn là null', async () => {
    const rows = await rowsOf('s-01', U.admin);
    expect(rows.map((r) => r.stt)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({
      documentId: ids.doc1,
      requestRef: 'N-01/A',
      ngayTongDat: '10/03/2026',
      hinhThucTongDat: null,
      ghiChu: null,
      thvUserId: U.thv,
      status: 'DELIVERED',
      loaiVanBan: null,
      soNgayVanBan: null,
      coQuanToaAn: null,
      coQuanThiHanhAn: null,
      coQuanKiemSat: null,
      thuaHanhVienThucHien: null,
    });
    expect(rows[1]).toMatchObject({
      documentId: ids.doc2,
      ngayTongDat: null,
      hinhThucTongDat: 'Niêm yết',
      ghiChu: 'Không giao được: không có người nhận',
      status: 'UNDELIVERABLE',
    });
    expect((await rowsOf('s-01', U.admin, '&year=2025')).length).toBe(0);
    expect((await rowsOf('s-01', U.admin, '&year=2026&limit=1')).length).toBe(1);
  });

  it('S-02: chỉ vi bằng đã có số; người yêu cầu, nội dung, số/ngày, THV; địa chỉ nơi lập là null', async () => {
    const rows = await rowsOf('s-02', U.head);
    expect(rows.map((r) => r.vibangLabel)).toEqual(['001/2026/VB', '002/2026/VB']);
    expect(rows[0]).toMatchObject({
      stt: 1,
      nguoiYeuCau: 'Nguyễn Văn A (giả lập), 12 Phố Giả, Hà Nội',
      noiDungYeuCau: 'Ghi nhận hiện trạng công trình giả lập',
      soNgayViBang: '001/2026/VB, 05/04/2026',
      diaChiNoiLap: null,
      thuaHanhVienLap: null,
      thvUserId: U.thv,
      caseId: ids.vb1,
    });
    expect((await rowsOf('s-02', U.head, '&year=2027')).length).toBe(0);
  });

  it('S-04: quyết định xác minh từ sổ quyết định, kết quả, vòng xác minh; cột thiếu nguồn là null', async () => {
    const rows = await rowsOf('s-04', U.secretary);
    expect(rows.map((r) => r.caseRef)).toEqual(['XM-1', 'XM-2']);
    expect(rows[0]).toMatchObject({
      stt: 1,
      quyetDinhXacMinh: 'QD-XM-01, 03/05/2026',
      ketQuaXacMinh: 'Kết luận giả lập',
      hopDongDichVu: null,
      quyetDinhThiHanhAn: null,
      banAnQuyetDinhToaAn: null,
      nguoiYeuCauThiHanhAn: null,
      nguoiPhaiThiHanhAn: null,
      noiDungXacMinh: null,
      ghiChu: null,
    });
    expect(rows[0]?.rounds).toEqual([
      { seq: 1, partyName: 'Bên liên quan giả lập', status: 'IN_PROGRESS', result: null },
    ]);
    expect(rows[1]).toMatchObject({ quyetDinhXacMinh: null, ketQuaXacMinh: null, rounds: [] });
  });

  it('S-05: hợp đồng, quyết định THA, bên phải/được, các khoản, kết quả; cột thiếu nguồn là null', async () => {
    const rows = await rowsOf('s-05', U.admin);
    expect(rows.map((r) => r.caseRef)).toEqual(['THA-1', 'THA-2']);
    expect(rows[0]).toMatchObject({
      stt: 1,
      hopDongDichVu: 'HD-DV-01',
      soNgayQuyetDinhThiHanhAn: 'QD-THA-01, 03/06/2026',
      banAnQuyetDinhToaAn: 'BA-01/2026',
      benPhaiThiHanhAn: 'Bên A phải thi hành',
      benDuocThiHanhAn: 'Bên B được thi hành',
      cacKhoanPhaiThiHanhAn: '1. Trả tài sản X; 2. Giao nhà Y',
      ketQuaThiHanhAn: 'OPEN (0/2 nghĩa vụ hoàn tất)',
      quyetDinhVeThiHanhAn: null,
      suaDoiBoSungQuyetDinh: null,
      thuHoiQuyetDinh: null,
      thuaHanhVienThucHien: null,
      ghiChu: null,
    });
    expect(rows[1]).toMatchObject({
      benPhaiThiHanhAn: null,
      cacKhoanPhaiThiHanhAn: null,
      ketQuaThiHanhAn: 'OPEN (0/0 nghĩa vụ hoàn tất)',
    });
  });

  it('phạm vi: Admin/Trưởng VP/Thư ký thấy cả văn phòng, THV cả văn phòng chỉ ở S-02; Văn thư chỉ chi nhánh được cấp; Kế toán và tenant khác thì rỗng', async () => {
    for (const code of ['s-01', 's-02', 's-04', 's-05']) {
      const all = (await rowsOf(code, U.admin)).length;
      expect(all).toBeGreaterThanOrEqual(2);
      for (const u of [U.head, U.secretary]) expect((await rowsOf(code, u)).length).toBe(all);
      // THV: xem cả văn phòng chỉ ở S-02 (Vi bằng, quyết định 16/10/2026); S-01/S-04/S-05 chỉ hồ sơ mình phụ trách.
      for (const u of [U.thv, U.thv2]) {
        const mine = await rowsOf(code, u);
        if (code === 's-02') expect(mine.length).toBe(all);
        else expect(mine.every((r) => r.thvUserId === u)).toBe(true);
      }
      if (code !== 's-02') expect((await rowsOf(code, U.thv2)).length).toBeLessThan(all);
      // Văn thư CN1 chỉ thấy các dòng của CN1 (dòng CN2 bị lọc); STT đánh lại trong phạm vi được xem.
      const c1 = await rowsOf(code, U.clerk);
      expect(c1.length).toBe(all - 1);
      expect(c1.map((r) => r.stt)).toEqual(c1.map((_, i) => i + 1));
      const c2 = await rowsOf(code, U.clerkOther);
      expect(c2.length).toBe(1);
      expect(c2[0]?.branchId).toBe(BR2);
      // Kế toán không xem sổ nghiệp vụ pháp lý; người ngoài văn phòng cũng không.
      expect(await rowsOf(code, U.acc)).toEqual([]);
      expect((await ledger(code, U.foreign, '', OFF, T)).json.rows).toEqual([]);
      // Tenant khác: cùng officeId nhưng tenant B không thấy dữ liệu của tenant A.
      expect((await ledger(code, U.foreign, '', OFF, T2)).json.rows).toEqual([]);
      expect((await ledger(code, U.foreign, '', OFF2, T2)).json.rows).toEqual([]);
    }
  });

  it('mọi lần đọc đều được audit, kể cả bị từ chối', async () => {
    await ledger('s-01', U.acc);
    await ledger('s-01', U.admin);
    const { rows } = await owner.query(
      `SELECT outcome, reason FROM audit_log WHERE tenant_id = $1 AND action = 'of.ledger.s01.read' AND actor_id IN ($2,$3) ORDER BY id DESC LIMIT 2`,
      [T, U.acc, U.admin],
    );
    expect(rows).toEqual([
      { outcome: 'allow', reason: 'ALLOWED' },
      { outcome: 'deny', reason: 'ROLE_LACKS_PERMISSION' },
    ]);
  });

  it('tham số sai bị từ chối', async () => {
    expect((await get(`/office/ledgers/s-01?officeId=nope`, U.admin)).status).toBe(400);
    expect((await ledger('s-01', U.admin, '&year=abc')).status).toBe(400);
    expect((await ledger('s-01', U.admin, '&limit=0')).status).toBe(400);
  });
  it('THV: Admin nhập họ tên + số Thẻ thì cột "Thừa hành viên" của cả bốn sổ được điền; người khác không nhập được', async () => {
    const put = (user: string, body: unknown) =>
      fetch(`${base}/office/thv-cards`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-synthetic-user': user,
          'x-synthetic-tenant': T,
        },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    const card = {
      officeId: OFF,
      userId: U.thv,
      fullName: 'Trần Văn B (giả lập)',
      cardNo: 'GL-001',
    };
    expect((await put(U.head, card)).status).toBe(403);
    expect((await put(U.admin, { ...card, cardNo: '' })).status).toBe(422);
    expect((await put(U.admin, card)).status).toBe(200);
    const list = await get(`/office/thv-cards?officeId=${OFF}`, U.head);
    expect(list.json).toEqual([
      { userId: U.thv, fullName: 'Trần Văn B (giả lập)', cardNo: 'GL-001' },
    ]);
    const expected = 'Trần Văn B (giả lập), số Thẻ GL-001';
    expect((await rowsOf('s-01', U.admin))[0]).toMatchObject({ thuaHanhVienThucHien: expected });
    expect((await rowsOf('s-02', U.head))[0]).toMatchObject({ thuaHanhVienLap: expected });
    expect((await rowsOf('s-04', U.admin))[0]).toMatchObject({ thuaHanhVienThucHien: expected });
    expect((await rowsOf('s-05', U.admin))[0]).toMatchObject({ thuaHanhVienThucHien: expected });
    // THV khác chưa có thẻ thì giữ null
    const other = (await rowsOf('s-01', U.admin)).find((r) => r.thvUserId === U.thv2);
    expect(other?.thuaHanhVienThucHien).toBeNull();
    // Người ngoài văn phòng nhận danh sách rỗng; xoá bằng cách để trống cả hai
    expect((await get(`/office/thv-cards?officeId=${OFF}`, U.foreign, T2)).json).toEqual([]);
    expect((await put(U.admin, { ...card, fullName: '', cardNo: '' })).status).toBe(200);
    expect((await get(`/office/thv-cards?officeId=${OFF}`, U.head)).json).toEqual([]);
  });
});
