import { integer, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
export const counters = pgTable('counters', { tenantId: text('tenant_id').notNull(), scope: text('scope').notNull(), year: integer('year').notNull(), seq: integer('seq').notNull() }, (t) => [primaryKey({ columns: [t.tenantId, t.scope, t.year] })]);
export const obligations = pgTable('obligations', { id: uuid('id').primaryKey().defaultRandom(), tenantId: text('tenant_id').notNull(), code: text('code').notNull() }, (t) => [unique().on(t.tenantId, t.code)]);
export const audit = pgTable('audit_log', { id: uuid('id').primaryKey().defaultRandom(), tenantId: text('tenant_id').notNull(), action: text('action').notNull(), refId: text('ref_id').notNull() });
