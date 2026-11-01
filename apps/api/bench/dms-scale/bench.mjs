// Đo độ trễ các truy vấn DMS trên DB sinh bởi generate.sql, chạy bằng vai KHÔNG phải superuser (RLS thật), mỗi lần
// trong một transaction có app.tenant_id như PgService.withTenant.
//   node bench.mjs <scenarios.mjs> [--iters=40] [--only=regex] [--json=out.json]
//   DATABASE_URL=postgres://bench_app@localhost/lo_bench  (vai tạo bằng setup-role.sql)
import pg from 'pg';

const [file, ...flags] = process.argv.slice(2);
const opt = (k, d) => flags.find((f) => f.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const iters = Number(opt('iters', 40));
const only = new RegExp(opt('only', '.'));
const { scenarios } = await import(new URL(file, `file://${process.cwd()}/`));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = (sql, p) => pool.query(sql, p);
const ctx = { personas: {} };
{
  const su = new pg.Client({ connectionString: process.env.ADMIN_URL ?? process.env.DATABASE_URL });
  await su.connect();
  const c = (await su.query('SELECT tenant_id, office_id FROM bench_ctx')).rows[0];
  Object.assign(ctx, { tenantId: c.tenant_id, officeId: c.office_id });
  for (const [name, n] of [['admin', 1], ['vanthu', 2], ['thv', 3], ['staff', 10]])
    ctx.personas[name] = (await su.query('SELECT id FROM users WHERE external_ref = $1', [`user${n}@bench.invalid`])).rows[0].id;
  ctx.branches = (await su.query('SELECT id FROM branches ORDER BY name')).rows.map((r) => r.id);
  ctx.creators = (await su.query('SELECT id, full_name FROM users ORDER BY external_ref LIMIT 60')).rows;
  await su.end();
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const results = [];
for (const s of scenarios) {
  if (!only.test(s.name)) continue;
  const lat = [];
  let rows = 0;
  let err = null;
  for (let i = 0; i < iters + 3; i++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [ctx.tenantId]);
      if (s.statementTimeout !== 0) await client.query(`SET LOCAL statement_timeout = '${s.statementTimeout ?? 20000}ms'`);
      const t0 = performance.now();
      const r = await client.query(s.sql, s.params(ctx, i));
      const dt = performance.now() - t0;
      await client.query('COMMIT');
      if (i >= 3) lat.push(dt); // 3 lần đầu làm nóng cache
      rows = r.rowCount;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      err = e.message;
      break;
    } finally {
      client.release();
    }
  }
  lat.sort((a, b) => a - b);
  const row = err
    ? { name: s.name, err }
    : { name: s.name, rows, p50: +pct(lat, 50).toFixed(1), p95: +pct(lat, 95).toFixed(1), max: +lat[lat.length - 1].toFixed(1) };
  results.push(row);
  console.log(err ? `${s.name.padEnd(46)} ERROR ${err}` : `${s.name.padEnd(46)} rows=${String(rows).padStart(4)}  p50=${String(row.p50).padStart(8)}ms  p95=${String(row.p95).padStart(8)}ms  max=${String(row.max).padStart(8)}ms`);
}
const out = opt('json', '');
if (out) (await import('node:fs')).writeFileSync(out, JSON.stringify(results, null, 2));
await pool.end();
