import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, eq, count } from 'drizzle-orm';
import { counters, obligations, audit } from './drizzle/schema.mjs';
const pool = new pg.Pool({ connectionString: 'postgresql://app_user@127.0.0.1:54329/spike_d', max: 10 });
const db = drizzle(pool);
const T = 't1', Y = 2026;
const alloc = async (tx) => (await tx.execute(sql`INSERT INTO counters (tenant_id, scope, year, seq) VALUES (${T}, 'HS', ${Y}, 1)
    ON CONFLICT (tenant_id, scope, year) DO UPDATE SET seq = counters.seq + 1 RETURNING seq`)).rows[0].seq;
const out = {};
let t0 = Date.now();
const res = await Promise.allSettled(
  Array.from({ length: 100 }, (_, i) =>
    db.transaction(async (tx) => {
      const n = await alloc(tx);
      if (i % 5 === 0) throw new Error('boom');
      return n;
    }),
  ),
);
const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value).sort((a, b) => a - b);
const [{ seq }] = await db.select().from(counters).where(eq(counters.tenantId, T));
out.concurrency = { committed: ok.length, rolledBack: 100 - ok.length, unique: new Set(ok).size, gapless: ok.every((v, i) => v === i + 1), finalSeq: seq, ms: Date.now() - t0 };
const ctx = (tx, t) => tx.execute(sql`SELECT set_config('app.tenant_id', ${t}, true)`);
await db.transaction(async (tx) => {
  await ctx(tx, T);
  const [o] = await tx.insert(obligations).values({ tenantId: T, code: 'OB-1' }).returning();
  await tx.insert(audit).values({ tenantId: T, action: 'obligation.create', refId: o.id });
});
let dupFailed = false;
try {
  await db.transaction(async (tx) => {
    await ctx(tx, T);
    await tx.insert(audit).values({ tenantId: T, action: 'obligation.create', refId: 'x-dup' });
    await tx.insert(obligations).values({ tenantId: T, code: 'OB-1' });
  });
} catch (e) { dupFailed = e.cause?.code ?? e.code; }
const c = async (q) => (await q)[0].n;
out.atomicAudit = { dupFailed, auditRows: await c(db.select({ n: count() }).from(audit)), orphanAudit: await c(db.select({ n: count() }).from(audit).where(eq(audit.refId, 'x-dup'))) };
const seen = await db.transaction(async (tx) => { await ctx(tx, 't2'); return c(tx.select({ n: count() }).from(obligations)); });
const noCtx = await c(db.select({ n: count() }).from(obligations));
let crossWrite = null;
try { await db.transaction(async (tx) => { await ctx(tx, 't2'); await tx.insert(obligations).values({ tenantId: T, code: 'EVIL' }); }); } catch (e) { crossWrite = 'blocked:' + (e.cause?.code ?? e.code); }
out.rls = { t2Sees: seen, noContextSees: noCtx, crossTenantWrite: crossWrite };
console.log(JSON.stringify(out, null, 1));
await pool.end();
