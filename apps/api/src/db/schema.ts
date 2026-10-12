import {
  bigserial,
  boolean,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

export const offices = pgTable(
  'offices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
  },
  (t) => [unique('offices_id_tenant_uq').on(t.id, t.tenantId)],
);

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    officeId: uuid('office_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    unique('branches_id_tenant_uq').on(t.id, t.tenantId),
    foreignKey({
      name: 'branches_office_tenant_fk',
      columns: [t.officeId, t.tenantId],
      foreignColumns: [offices.id, offices.tenantId],
    }),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    externalRef: text('external_ref').notNull(),
  },
  (t) => [unique('users_id_tenant_uq').on(t.id, t.tenantId)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    officeId: uuid('office_id').notNull(),
    role: text('role').notNull(),
    legalSigner: boolean('legal_signer').notNull().default(false),
  },
  (t) => [
    unique('memberships_id_tenant_uq').on(t.id, t.tenantId),
    foreignKey({
      name: 'memberships_user_tenant_fk',
      columns: [t.userId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    foreignKey({
      name: 'memberships_office_tenant_fk',
      columns: [t.officeId, t.tenantId],
      foreignColumns: [offices.id, offices.tenantId],
    }),
  ],
);

export const branchGrants = pgTable(
  'branch_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    branchId: uuid('branch_id').notNull(),
  },
  (t) => [
    unique('branch_grants_membership_branch_uq').on(t.membershipId, t.branchId),
    foreignKey({
      name: 'branch_grants_membership_tenant_fk',
      columns: [t.membershipId, t.tenantId],
      foreignColumns: [memberships.id, memberships.tenantId],
    }),
    foreignKey({
      name: 'branch_grants_branch_tenant_fk',
      columns: [t.branchId, t.tenantId],
      foreignColumns: [branches.id, branches.tenantId],
    }),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  outcome: text('outcome').notNull(),
  reason: text('reason').notNull(),
  officeId: uuid('office_id'),
  branchId: uuid('branch_id'),
});
