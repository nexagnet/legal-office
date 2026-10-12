import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://app_user@127.0.0.1:54329/spike' } } });
const T = 't1', Y = 2026;
const alloc = (tx, tenant = T) =>
  tx.$queryRaw`INSERT INTO counters (tenant_id, scope, year, seq) VALUES (${tenant}, 'HS', ${Y}, 1)
    ON CONFLICT (tenant_id, scope, year) DO UPDATE SET seq = counters.seq + 1 RETURNING seq`.then((r) => r[0].seq);
const out = {};
let t0 = Date.now();
// 1. 100 concurrent, 20 of which roll back after allocating
const res = await Promise.allSettled(
  Array.from({ length: 100 }, (_, i) =>
    prisma.$transaction(async (tx) => {
      const n = await alloc(tx);
      if (i % 5 === 0) throw new Error('boom');
      return n;
    }),
  ),
);
const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value).sort((a, b) => a - b);
const final = (await prisma.counter.findFirst({ where: { tenantId: T } })).seq;
out.concurrency = { committed: ok.length, rolledBack: 100 - ok.length, unique: new Set(ok).size, gapless: ok.every((v, i) => v === i + 1), finalSeq: final, ms: Date.now() - t0 };
// 2. obligation + audit atomic; duplicate rolls back audit
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${T}, true)`;
  const o = await tx.obligation.create({ data: { tenantId: T, code: 'OB-1' } });
  await tx.audit.create({ data: { tenantId: T, action: 'obligation.create', refId: o.id } });
});
let dupFailed = false;
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${T}, true)`;
    await tx.audit.create({ data: { tenantId: T, action: 'obligation.create', refId: 'x-dup' } });
    await tx.obligation.create({ data: { tenantId: T, code: 'OB-1' } });
  });
} catch (e) { dupFailed = e.code; }
out.atomicAudit = { dupFailed, auditRows: await prisma.audit.count(), orphanAudit: await prisma.audit.count({ where: { refId: 'x-dup' } }) };
// 3. RLS: tenant isolation through set_config
const seen = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', 't2', true)`;
  return tx.obligation.count();
});
const noCtx = await prisma.obligation.count();
let crossWrite = null;
try { await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.tenant_id', 't2', true)`; await tx.obligation.create({ data: { tenantId: T, code: 'EVIL' } }); }); } catch (e) { crossWrite = 'blocked:' + (e.meta?.code ?? e.code); }
out.rls = { t2Sees: seen, noContextSees: noCtx, crossTenantWrite: crossWrite };
console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
